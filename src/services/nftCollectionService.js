/**
 * ============================================================================
 * NFT COLLECTION SERVICE
 * ============================================================================
 * Handles NFT collection grouping and management
 * Provides compatibility layer for Bithomp-style collection data
 * ============================================================================
 */

import { getAllAccountNFTs } from './dhaliService';
import { resolveNFTsBatch } from './metadataResolver';

// In-memory cache for collections
const collectionCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Group NFTs by collection (Issuer + Taxon)
 * @param {Array} resolvedNFTs - Array of NFTs with resolved metadata
 * @returns {Object} Collections grouped by issuer-taxon key
 */
export const groupNFTsByCollection = (resolvedNFTs) => {
  const collections = {};

  resolvedNFTs.forEach(nft => {
    const collectionKey = `${nft.issuer}-${nft.taxon}`;

    if (!collections[collectionKey]) {
      // Try to get collection name from various sources
      let collectionName = nft.collection?.name || nft.collection?.family;

      // If no collection name, try to derive from NFT metadata
      if (!collectionName && nft.metadata) {
        if (nft.metadata.collection?.name) {
          collectionName = nft.metadata.collection.name;
        } else if (nft.metadata.name) {
          // Use the NFT's name as collection name (will be refined as more NFTs are added)
          collectionName = nft.metadata.name;
        } else if (nft.name) {
          collectionName = nft.name;
        }
      }

      // Fallback to issuer address format (more informative than just taxon)
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
        sampleImage: null
      };
    } else {
      // Update collection name if we find a better one
      const currentName = collections[collectionKey].collectionName;
      if (currentName.includes('Taxon') && nft.collection?.name) {
        collections[collectionKey].collectionName = nft.collection.name;
      } else if (currentName.includes('Taxon') && nft.metadata?.collection?.name) {
        collections[collectionKey].collectionName = nft.metadata.collection.name;
      }
    }

    collections[collectionKey].nfts.push(nft);
    collections[collectionKey].count++;

    // Use first image as sample
    if (!collections[collectionKey].sampleImage && nft.image) {
      collections[collectionKey].sampleImage = nft.image;
    }
  });

  return collections;
};

/**
 * Load all NFTs for a user with metadata resolution
 * @param {string} address - XRPL account address
 * @param {Object} options - Options for loading
 * @returns {Promise<Object>} Collections with resolved NFTs
 */
export const loadUserCollections = async (address, options = {}) => {
  const {
    maxNFTs = 400,
    batchSize = 5,
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

    // Fetch raw NFTs from Dhali
    const rawNFTs = await getAllAccountNFTs(address, maxNFTs);
    console.log(`✅ Fetched ${rawNFTs.length} NFTs from Dhali`);

    // Resolve metadata in batches
    console.log(`🔍 Resolving metadata...`);
    const resolvedNFTs = await resolveNFTsBatch(rawNFTs, batchSize);
    console.log(`✅ Resolved metadata for ${resolvedNFTs.length} NFTs`);

    // Group by collection
    const collections = groupNFTsByCollection(resolvedNFTs);
    console.log(`✅ Grouped into ${Object.keys(collections).length} collections`);

    const result = {
      address,
      totalNFTs: resolvedNFTs.length,
      collections,
      allNFTs: resolvedNFTs,
      timestamp: Date.now()
    };

    // Cache the result
    collectionCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return result;
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
 * @returns {Promise<Array>} Array of resolved NFTs in collection
 */
export const loadCollectionNFTs = async (address, issuer, taxon, options = {}) => {
  const {
    maxNFTs = 400,
    batchSize = 5
  } = options;

  try {
    console.log(`📦 Loading collection ${issuer}-${taxon} for ${address}...`);

    // Fetch raw NFTs from Dhali
    const rawNFTs = await getAllAccountNFTs(address, maxNFTs);

    // Filter by issuer and taxon
    const collectionNFTs = rawNFTs.filter(nft =>
      nft.Issuer === issuer && nft.NFTokenTaxon === taxon
    );

    console.log(`✅ Found ${collectionNFTs.length} NFTs in collection`);

    // Resolve metadata
    const resolvedNFTs = await resolveNFTsBatch(collectionNFTs, batchSize);
    console.log(`✅ Resolved metadata for collection NFTs`);

    return resolvedNFTs;
  } catch (error) {
    console.error(`❌ Error loading collection NFTs:`, error);
    throw error;
  }
};

/**
 * Get single NFT with metadata (for compatibility)
 * @param {string} nftokenID - NFT Token ID
 * @param {string} ownerAddress - Owner address
 * @returns {Promise<Object>} Resolved NFT with Bithomp-compatible structure
 */
export const getNFTWithMetadata = async (nftokenID, ownerAddress) => {
  try {
    // Fetch all NFTs for owner (will be cached)
    const rawNFTs = await getAllAccountNFTs(ownerAddress);

    // Find specific NFT
    const nft = rawNFTs.find(n => n.NFTokenID === nftokenID);

    if (!nft) {
      throw new Error(`NFT ${nftokenID} not found in account ${ownerAddress}`);
    }

    // Resolve metadata
    const resolvedNFT = await resolveNFTsBatch([nft], 1);

    // Return in Bithomp-compatible format
    return {
      nftokenID: resolvedNFT[0].nftokenID,
      metadata: resolvedNFT[0].metadata,
      assets: {
        image: resolvedNFT[0].image
      },
      collection: resolvedNFT[0].collection
    };
  } catch (error) {
    console.error(`❌ Error getting NFT metadata:`, error);
    throw error;
  }
};

/**
 * Transform resolved NFT to Bithomp-compatible format
 * @param {Object} resolvedNFT - NFT with resolved metadata
 * @returns {Object} Bithomp-compatible NFT object
 */
export const toBithompFormat = (resolvedNFT) => {
  return {
    nftokenID: resolvedNFT.nftokenID,
    issuer: resolvedNFT.issuer,
    taxon: resolvedNFT.taxon,
    metadata: resolvedNFT.metadata,
    assets: {
      image: resolvedNFT.image,
      imageOriginal: resolvedNFT.image
    },
    collection: resolvedNFT.collection || {
      name: `Collection ${resolvedNFT.taxon}`
    },
    uri: resolvedNFT.uri,
    // Additional fields for compatibility
    name: resolvedNFT.name,
    description: resolvedNFT.description,
    attributes: resolvedNFT.attributes
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
