/**
 * ============================================================================
 * NFT COLLECTION SERVICE
 * ============================================================================
 * Handles NFT collection grouping and management
 * Uses new Dhali REST API with pre-resolved metadata and CDN assets
 * ============================================================================
 */

import { getAccountNFTs } from './dhaliService';

// In-memory cache for collections
const collectionCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Transform raw NFT from new API to standardized format
 * @param {Object} nft - Raw NFT from new Dhali API
 * @returns {Object} Standardized NFT object
 */
const transformNFT = (nft) => {
  return {
    nftokenID: nft.nftokenID,
    issuer: nft.issuer,
    taxon: nft.nftokenTaxon,
    image: nft.assets?.image || nft.assets?.preview,
    imageURI: nft.assets?.image || nft.assets?.preview,
    thumbnail: nft.assets?.thumbnail,
    metadata: nft.metadata || {},
    collection: nft.metadata?.collection?.name || nft.collection,
    collectionInfo: nft.metadata?.collection,
    uri: nft.url || nft.uri,
    name: nft.metadata?.name,
    description: nft.metadata?.description,
    attributes: nft.metadata?.attributes || [],
    flags: nft.flags,
    transferFee: nft.transferFee,
    sequence: nft.sequence,
    owner: nft.owner,
    issuedAt: nft.issuedAt,
    ownerChangedAt: nft.ownerChangedAt,
    mintedByMarketplace: nft.mintedByMarketplace
  };
};

/**
 * Group NFTs by collection (Issuer + Taxon)
 * @param {Array} nfts - Array of NFTs from new API
 * @returns {Object} Collections grouped by issuer-taxon key
 */
export const groupNFTsByCollection = (nfts) => {
  const collections = {};

  nfts.forEach(nft => {
    const collectionKey = `${nft.issuer}-${nft.taxon}`;

    if (!collections[collectionKey]) {
      // Try to get collection name from various sources
      let collectionName = nft.collection || nft.collectionInfo?.name;

      // If no collection name, try to derive from NFT metadata
      if (!collectionName && nft.metadata) {
        if (nft.metadata.collection?.name) {
          collectionName = nft.metadata.collection.name;
        } else if (nft.metadata.name) {
          collectionName = nft.metadata.name;
        } else if (nft.name) {
          collectionName = nft.name;
        }
      }

      // Fallback to issuer address format
      if (!collectionName) {
        const shortIssuer = `${nft.issuer.substring(0, 6)}...${nft.issuer.substring(nft.issuer.length - 4)}`;
        collectionName = `${shortIssuer} (Taxon ${nft.taxon})`;
      }

      collections[collectionKey] = {
        issuer: nft.issuer,
        taxon: nft.taxon,
        collectionName: collectionName,
        nfts: [],
        count: 0,
        sampleImage: null,
        sampleNft: null
      };
    } else {
      // Update collection name if we find a better one
      const currentName = collections[collectionKey].collectionName;
      if (currentName.includes('Taxon')) {
        if (nft.collection) {
          collections[collectionKey].collectionName = nft.collection;
        } else if (nft.metadata?.collection?.name) {
          collections[collectionKey].collectionName = nft.metadata.collection.name;
        }
      }
    }

    collections[collectionKey].nfts.push(nft);
    collections[collectionKey].count++;

    // Use first image as sample
    if (!collections[collectionKey].sampleImage && nft.image) {
      collections[collectionKey].sampleImage = nft.image;
    }

    // Store first NFT as sample for collection info
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
  const {
    limit = 400,
    useCache = true
  } = options;

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
    console.log(`📦 Loading NFTs for ${address}...`);

    // Fetch NFTs from new Dhali API (metadata already included!)
    const result = await getAccountNFTs(address, {
      limit,
      assets: true
    });

    const rawNFTs = result.nfts || [];
    console.log(`✅ Fetched ${rawNFTs.length} NFTs with metadata from Dhali`);

    // Transform NFTs to standardized format
    const transformedNFTs = rawNFTs.map(transformNFT);
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

    const rawNFTs = result.nfts || [];

    // Filter by issuer and taxon
    const collectionNFTs = rawNFTs.filter(nft =>
      nft.issuer === issuer && nft.nftokenTaxon === taxon
    );

    console.log(`✅ Found ${collectionNFTs.length} NFTs in collection`);

    // Transform to standardized format
    const transformedNFTs = collectionNFTs.map(transformNFT);

    return transformedNFTs;
  } catch (error) {
    console.error(`❌ Error loading collection NFTs:`, error);
    throw error;
  }
};

/**
 * Get single NFT with metadata (for compatibility)
 * @param {string} nftokenID - NFT Token ID
 * @param {string} ownerAddress - Owner address
 * @returns {Promise<Object>} NFT with Bithomp-compatible structure
 */
export const getNFTWithMetadata = async (nftokenID, ownerAddress) => {
  try {
    // Fetch all NFTs for owner (will be cached)
    const result = await getAccountNFTs(ownerAddress, { assets: true });
    const nfts = result.nfts || [];

    // Find specific NFT
    const nft = nfts.find(n => n.nftokenID === nftokenID);

    if (!nft) {
      throw new Error(`NFT ${nftokenID} not found in account ${ownerAddress}`);
    }

    // Transform and return in Bithomp-compatible format
    const transformed = transformNFT(nft);

    return {
      nftokenID: transformed.nftokenID,
      metadata: transformed.metadata,
      assets: {
        image: transformed.image,
        preview: transformed.assets?.preview,
        thumbnail: transformed.thumbnail
      },
      collection: transformed.collection
    };
  } catch (error) {
    console.error(`❌ Error getting NFT metadata:`, error);
    throw error;
  }
};

/**
 * Transform NFT to Bithomp-compatible format (already compatible!)
 * @param {Object} nft - Transformed NFT object
 * @returns {Object} Bithomp-compatible NFT object
 */
export const toBithompFormat = (nft) => {
  return {
    nftokenID: nft.nftokenID,
    issuer: nft.issuer,
    taxon: nft.taxon,
    nftokenTaxon: nft.taxon,
    metadata: nft.metadata,
    assets: {
      image: nft.image,
      imageOriginal: nft.image,
      preview: nft.thumbnail,
      thumbnail: nft.thumbnail
    },
    collection: nft.collection || {
      name: `Collection ${nft.taxon}`
    },
    uri: nft.uri,
    url: nft.uri,
    // Additional fields for compatibility
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
 * Transform array of resolved NFTs to Bithomp format
 * @param {Array} resolvedNFTs - Array of resolved NFTs
 * @returns {Array} Array of Bithomp-compatible NFTs
 */
export const toBithompFormatBatch = (resolvedNFTs) => {
  return resolvedNFTs.map(nft => toBithompFormat(nft));
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
