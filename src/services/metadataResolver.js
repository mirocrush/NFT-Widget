/**
 * ============================================================================
 * METADATA RESOLVER SERVICE
 * ============================================================================
 * Resolves NFT metadata from various sources (IPFS, Arweave, HTTP)
 * Handles URI decoding, IPFS gateway fallbacks, and caching
 * ============================================================================
 */

import axios from 'axios';

// IPFS Gateway fallback list (ordered by reliability)
const IPFS_GATEWAYS = [
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/'
];

// Arweave gateway
const ARWEAVE_GATEWAY = 'https://arweave.net/';

// In-memory cache for metadata
const metadataCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Convert hex string to UTF-8
 * @param {string} hex - Hex string
 * @returns {string} UTF-8 string
 */
export const hexToString = (hex) => {
  if (!hex || typeof hex !== 'string') {
    return '';
  }
  
  try {
    // Remove 0x prefix if present
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    
    // Convert hex to bytes
    const bytes = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes.push(parseInt(cleanHex.substr(i, 2), 16));
    }
    
    // Decode UTF-8
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch (error) {
    console.error('Error converting hex to string:', error);
    return hex;
  }
};

/**
 * Parse URI from NFT data
 * @param {string} uri - Raw URI (may be hex or string)
 * @returns {string} Decoded URI
 */
export const parseURI = (uri) => {
  if (!uri) return null;
  
  // If it's hex, decode it
  if (uri.match(/^[0-9A-Fa-f]+$/) && uri.length % 2 === 0) {
    return hexToString(uri);
  }
  
  return uri;
};

/**
 * Resolve IPFS URI to HTTP URL with fallback gateways
 * @param {string} ipfsUri - IPFS URI (ipfs://... or Qm... hash)
 * @returns {Promise<string>} Resolved HTTP URL
 */
export const resolveIPFS = async (ipfsUri) => {
  if (!ipfsUri) return null;
  
  // Extract hash from various IPFS formats
  let hash = ipfsUri;
  if (ipfsUri.startsWith('ipfs://')) {
    hash = ipfsUri.replace('ipfs://', '');
  } else if (ipfsUri.startsWith('ipfs/')) {
    hash = ipfsUri.replace('ipfs/', '');
  }
  
  // Remove any ipfs/ prefix if still present
  hash = hash.replace(/^ipfs\//, '');
  
  // Try each gateway in order until one succeeds
  for (const gateway of IPFS_GATEWAYS) {
    const url = `${gateway}${hash}`;
    try {
      const response = await axios.head(url, { timeout: 5000 });
      if (response.status === 200) {
        return url;
      }
    } catch (error) {
      // Continue to next gateway
      continue;
    }
  }
  
  // Return first gateway as fallback
  return `${IPFS_GATEWAYS[0]}${hash}`;
};

/**
 * Resolve Arweave URI to HTTP URL
 * @param {string} arweaveUri - Arweave URI (ar://... or transaction ID)
 * @returns {string} Resolved HTTP URL
 */
export const resolveArweave = (arweaveUri) => {
  if (!arweaveUri) return null;
  
  let txId = arweaveUri;
  if (arweaveUri.startsWith('ar://')) {
    txId = arweaveUri.replace('ar://', '');
  }
  
  return `${ARWEAVE_GATEWAY}${txId}`;
};

/**
 * Fetch metadata from URL with retry logic
 * @param {string} url - Metadata URL
 * @param {number} retries - Number of retries
 * @returns {Promise<Object>} Metadata JSON
 */
export const fetchMetadata = async (url, retries = 2) => {
  if (!url) return null;
  
  // Check cache first
  const cached = metadataCache.get(url);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }
  
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await axios.get(url, { 
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.data) {
        // Cache the result
        metadataCache.set(url, {
          data: response.data,
          timestamp: Date.now()
        });
        
        return response.data;
      }
    } catch (error) {
      if (i === retries) {
        console.error(`Failed to fetch metadata from ${url}:`, error.message);
        return null;
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  
  return null;
};

/**
 * Resolve complete metadata for an NFT
 * @param {Object} nft - NFT object from Dhali
 * @returns {Promise<Object>} Resolved metadata with image URLs
 */
export const resolveNFTMetadata = async (nft) => {
  if (!nft) return null;
  
  const result = {
    nftokenID: nft.NFTokenID,
    issuer: nft.Issuer,
    taxon: nft.NFTokenTaxon,
    uri: null,
    metadata: {},
    image: null,
    name: null,
    description: null,
    attributes: [],
    collection: null
  };
  
  // Parse URI
  if (nft.URI) {
    const decodedUri = parseURI(nft.URI);
    result.uri = decodedUri;
    
    if (decodedUri) {
      try {
        let metadataUrl = decodedUri;
        
        // Handle IPFS URIs
        if (decodedUri.startsWith('ipfs://') || decodedUri.match(/^Qm[1-9A-HJ-NP-Za-km-z]{44}/)) {
          metadataUrl = await resolveIPFS(decodedUri);
        }
        // Handle Arweave URIs
        else if (decodedUri.startsWith('ar://')) {
          metadataUrl = resolveArweave(decodedUri);
        }
        
        // Fetch metadata JSON
        if (metadataUrl) {
          const metadata = await fetchMetadata(metadataUrl);
          
          if (metadata) {
            result.metadata = metadata;
            result.name = metadata.name || metadata.title || null;
            result.description = metadata.description || null;
            result.attributes = metadata.attributes || metadata.properties || [];
            
            // Resolve image URL
            if (metadata.image) {
              let imageUrl = metadata.image;
              
              if (imageUrl.startsWith('ipfs://') || imageUrl.match(/^Qm[1-9A-HJ-NP-Za-km-z]{44}/)) {
                imageUrl = await resolveIPFS(imageUrl);
              } else if (imageUrl.startsWith('ar://')) {
                imageUrl = resolveArweave(imageUrl);
              }
              
              result.image = imageUrl;
            }
            
            // Check for collection info
            if (metadata.collection) {
              result.collection = {
                name: metadata.collection.name || metadata.collection,
                family: metadata.collection.family || null
              };
            }
          }
        }
      } catch (error) {
        console.error(`Error resolving metadata for ${nft.NFTokenID}:`, error);
      }
    }
  }
  
  return result;
};

/**
 * Resolve metadata for multiple NFTs in batches
 * @param {Array} nfts - Array of NFT objects
 * @param {number} batchSize - Number of NFTs to process in parallel
 * @returns {Promise<Array>} Array of resolved NFTs
 */
export const resolveNFTsBatch = async (nfts, batchSize = 5) => {
  if (!nfts || nfts.length === 0) return [];
  
  const results = [];
  
  // Process in batches to avoid overwhelming IPFS gateways
  for (let i = 0; i < nfts.length; i += batchSize) {
    const batch = nfts.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(nft => resolveNFTMetadata(nft))
    );
    results.push(...batchResults);
    
    // Small delay between batches to be respectful to gateways
    if (i + batchSize < nfts.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
};

/**
 * Clear metadata cache
 */
export const clearCache = () => {
  metadataCache.clear();
};

/**
 * Get cache statistics
 */
export const getCacheStats = () => {
  return {
    size: metadataCache.size,
    entries: Array.from(metadataCache.keys())
  };
};

export default {
  hexToString,
  parseURI,
  resolveIPFS,
  resolveArweave,
  fetchMetadata,
  resolveNFTMetadata,
  resolveNFTsBatch,
  clearCache,
  getCacheStats
};
