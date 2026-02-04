/**
 * ============================================================================
 * NFT COLLECTION SERVICE
 * ============================================================================
 * Handles NFT collection grouping and management
 * Uses new Dhali REST API with pre-resolved metadata and CDN assets
 * ============================================================================
 */

import { getAccountNFTs } from './dhaliService';
import { transformNFTsToUIFormat } from './apiTransformer';

// In-memory cache for collections
const collectionCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Group NFTs by collection (Issuer + Taxon)
 * @param {Array} nfts - Array of transformed NFTs
 * @returns {Object} Collections grouped by issuer-taxon key
 */
export const groupNFTsByCollection = (nfts) => {
  const collections = {};

  nfts.forEach(nft => {
    const issuer = nft.issuer || nft.Issuer;
    const taxon = nft.nftokenTaxon || nft.NFTokenTaxon;
    const collectionKey = `${issuer}-${taxon}`;

    if (!collections[collectionKey]) {
      // Get collection name from various sources
      let collectionName = nft.collectionName ||
                          nft.collection?.name ||
                          nft.metadata?.collection?.name ||
                          nft.metadata?.name ||
                          nft.name;

      // Fallback to issuer address format
      if (!collectionName) {
        const shortIssuer = `${issuer.substring(0, 6)}...${issuer.substring(issuer.length - 4)}`;
        collectionName = `${shortIssuer} (Taxon ${taxon})`;
      }

      collections[collectionKey] = {
        issuer,
        taxon,
        collectionName,
        nfts: [],
        count: 0,
        sampleImage: null,
        sampleNft: null
      };
    } else {
      // Update collection name if we find a better one
      const currentName = collections[collectionKey].collectionName;
      if (currentName.includes('Taxon')) {
        if (nft.collectionName && !nft.collectionName.includes('Taxon')) {
          collections[collectionKey].collectionName = nft.collectionName;
        } else if (nft.metadata?.collection?.name) {
          collections[collectionKey].collectionName = nft.metadata.collection.name;
        }
      }
    }

    collections[collectionKey].nfts.push(nft);
    collections[collectionKey].count++;

    // Use first image as sample
    if (!collections[collectionKey].sampleImage && nft.imageURI) {
      collections[collectionKey].sampleImage = nft.imageURI;
    }

    // Store first NFT as sample
    if (!collections[collectionKey].sampleNft) {
      collections[collectionKey].sampleNft = nft;
    }
  });

  return collections;
};

/**
 * Load all NFTs for a user (NEW API - metadata pre-resolved!)
 * @param {string} address - XRPL account address
 * @param {Object} options - Options for loading
 * @returns {Promise<Object>} Collections with NFTs
 */
export const loadUserCollections = async (address, options = {}) => {
  const { limit = 400, useCache = true } = options;

  // Check cache
  const cacheKey = `${address}-collections`;
  if (useCache) {
    const cached = collectionCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log('✅ Using cached collections for', address);
      return cached.data;
    }
  }

  try {
    console.log(`📦 Loading NFTs from new Dhali API for ${address}...`);

    // ✅ Fetch NFTs from new Dhali API (metadata already included!)
    const result = await getAccountNFTs(address, {
      limit,
      assets: true
    });

    const rawNFTs = result.nfts || result.account_nfts || [];
    console.log(`✅ Fetched ${rawNFTs.length} NFTs with pre-resolved metadata`);

    // ✅ Transform to UI-compatible format
    const transformedNFTs = transformNFTsToUIFormat(rawNFTs);
    console.log(`✅ Transformed ${transformedNFTs.length} NFTs`);

    // Group by collection
    const collections = groupNFTsByCollection(transformedNFTs);
    console.log(`✅ Grouped into ${Object.keys(collections).length} collections`);

    const resultData = {
      address,
      totalNFTs: transformedNFTs.length,
      collections,
      allNFTs: transformedNFTs,
      timestamp: Date.now()
    };

    // Cache the result
    collectionCache.set(cacheKey, {
      data: resultData,
      timestamp: Date.now()
    });

    return resultData;
  } catch (error) {
    console.error(`❌ Error loading collections for ${address}:`, error);
    throw error;
  }
};

/**
 * Load NFTs for a specific collection (Issuer + Taxon)
 * @param {string} address - XRPL account address
 * @param {string} issuer - NFT Issuer address
 * @param {number} taxon - NFT Taxon
 * @param {Object} options - Options
 * @returns {Promise<Array>} Array of NFTs in collection
 */
export const loadCollectionNFTs = async (address, issuer, taxon, options = {}) => {
  const { limit = 400 } = options;

  try {
    console.log(`📦 Loading collection ${issuer}-${taxon} for ${address}...`);

    // Fetch NFTs from new Dhali API
    const result = await getAccountNFTs(address, {
      limit,
      assets: true
    });

    const rawNFTs = result.nfts || result.account_nfts || [];

    // Transform to UI format
    const transformedNFTs = transformNFTsToUIFormat(rawNFTs);

    // Filter by issuer and taxon
    const collectionNFTs = transformedNFTs.filter(nft => {
      const nftIssuer = nft.issuer || nft.Issuer;
      const nftTaxon = nft.nftokenTaxon || nft.NFTokenTaxon;
      return nftIssuer === issuer && nftTaxon === taxon;
    });

    console.log(`✅ Found ${collectionNFTs.length} NFTs in collection`);

    return collectionNFTs;
  } catch (error) {
    console.error(`❌ Error loading collection NFTs:`, error);
    throw error;
  }
};

/**
 * Get single NFT with metadata (for compatibility)
 * @param {string} nftokenID - NFT Token ID
 * @param {string} ownerAddress - Owner address
 * @returns {Promise<Object>} NFT with metadata
 */
export const getNFTWithMetadata = async (nftokenID, ownerAddress) => {
  try {
    // Fetch all NFTs for owner (will be cached)
    const result = await getAccountNFTs(ownerAddress, { assets: true });
    const rawNFTs = result.nfts || result.account_nfts || [];

    // Transform to UI format
    const transformedNFTs = transformNFTsToUIFormat(rawNFTs);

    // Find specific NFT
    const nft = transformedNFTs.find(n =>
      (n.nftokenID || n.NFTokenID) === nftokenID
    );

    if (!nft) {
      throw new Error(`NFT ${nftokenID} not found in account ${ownerAddress}`);
    }

    return {
      nftokenID: nft.nftokenID,
      NFTokenID: nft.nftokenID,
      metadata: nft.metadata,
      assets: nft.assets,
      imageURI: nft.imageURI,
      collection: nft.collection,
      collectionName: nft.collectionName
    };
  } catch (error) {
    console.error(`❌ Error getting NFT metadata:`, error);
    throw error;
  }
};

/**
 * Transform NFT to Bithomp-compatible format (for legacy code)
 * @param {Object} nft - Transformed NFT object
 * @returns {Object} Bithomp-compatible NFT object
 */
export const toBithompFormat = (nft) => {
  return {
    nftokenID: nft.nftokenID || nft.NFTokenID,
    NFTokenID: nft.nftokenID || nft.NFTokenID,
    issuer: nft.issuer || nft.Issuer,
    taxon: nft.nftokenTaxon || nft.NFTokenTaxon,
    nftokenTaxon: nft.nftokenTaxon || nft.NFTokenTaxon,
    metadata: nft.metadata,
    assets: nft.assets,
    imageURI: nft.imageURI,
    collection: nft.collection || nft.collectionName,
    uri: nft.uri || nft.URI,
    url: nft.url,
    name: nft.name,
    description: nft.description,
    attributes: nft.attributes,
    flags: nft.flags,
    transferFee: nft.transferFee,
    owner: nft.owner,
    issuedAt: nft.issuedAt,
    ownerChangedAt: nft.ownerChangedAt,
    mintedByMarketplace: nft.mintedByMarketplace
  };
};

/**
 * Transform array of NFTs to Bithomp format
 * @param {Array} nfts - Array of transformed NFTs
 * @returns {Array} Array of Bithomp-compatible NFTs
 */
export const toBithompFormatBatch = (nfts) => {
  return nfts.map(nft => toBithompFormat(nft));
};

/**
 * Clear collection cache
 */
export const clearCache = () => {
  collectionCache.clear();
};

/**
 * Get cache statistics
 */
export const getCacheStats = () => {
  return {
    size: collectionCache.size,
    entries: Array.from(collectionCache.keys())
  };
};

export default {
  groupNFTsByCollection,
  loadUserCollections,
  loadCollectionNFTs,
  getNFTWithMetadata,
  toBithompFormat,
  toBithompFormatBatch,
  clearCache,
  getCacheStats
};
