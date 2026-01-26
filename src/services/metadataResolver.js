/**
 * ============================================================================
 * NFT METADATA RESOLVER
 * ============================================================================
 * Handles decoding NFT URIs and fetching metadata from various sources
 * (IPFS, Arweave, HTTP, on-chain hex data)
 * ============================================================================
 */

import axios from 'axios';

// IPFS Gateways (fallback order)
const IPFS_GATEWAYS = [
    'https://ipfs.io/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://gateway.ipfs.io/ipfs/'
];

// Arweave Gateway
const ARWEAVE_GATEWAY = 'https://arweave.net/';

// Cache for resolved metadata (in-memory, per session)
const metadataCache = new Map();

/**
 * Convert hex string to ASCII string
 * @param {string} hex - Hex string (with or without '0x' prefix)
 * @returns {string} ASCII string
 */
export const hexToString = (hex) => {
    if (!hex) return '';
    
    // Remove '0x' prefix if present
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    
    let str = '';
    for (let i = 0; i < cleanHex.length; i += 2) {
        const charCode = parseInt(cleanHex.substr(i, 2), 16);
        if (charCode) {
            str += String.fromCharCode(charCode);
        }
    }
    return str;
};

/**
 * Parse XRPL NFT URI to actual URL
 * @param {string} uri - Raw URI from XRPL (could be hex, IPFS, HTTP, etc.)
 * @returns {string|null} Resolved URL or null if invalid
 */
export const parseNFTUri = (uri) => {
    if (!uri) return null;

    try {
        // Case 1: Already a valid HTTP(S) URL
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
            return uri;
        }

        // Case 2: IPFS format (ipfs://...)
        if (uri.startsWith('ipfs://')) {
            const ipfsHash = uri.replace('ipfs://', '');
            return `${IPFS_GATEWAYS[0]}${ipfsHash}`;
        }

        // Case 3: Arweave format (ar://...)
        if (uri.startsWith('ar://')) {
            const arweaveId = uri.replace('ar://', '');
            return `${ARWEAVE_GATEWAY}${arweaveId}`;
        }

        // Case 4: Direct IPFS hash (Qm... or bafy...)
        if (uri.match(/^(Qm[a-zA-Z0-9]{44}|bafy[a-zA-Z0-9]+)$/)) {
            return `${IPFS_GATEWAYS[0]}${uri}`;
        }

        // Case 5: Hex-encoded data (common in XRPL)
        if (/^[0-9A-Fa-f]+$/.test(uri)) {
            const decoded = hexToString(uri);
            
            // Recursively parse the decoded string
            if (decoded && decoded !== uri) {
                return parseNFTUri(decoded);
            }
        }

        // Case 6: Try as-is (might be relative path or other format)
        return uri;
    } catch (error) {
        console.warn('Error parsing NFT URI:', uri, error);
        return null;
    }
};

/**
 * Fetch metadata from URL with timeout and retry logic
 * @param {string} url - Metadata URL
 * @param {number} timeoutMs - Request timeout in milliseconds
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<Object|null>} Metadata object or null
 */
export const fetchMetadataFromUrl = async (url, timeoutMs = 5000, retries = 2) => {
    if (!url) return null;

    // Check cache first
    if (metadataCache.has(url)) {
        return metadataCache.get(url);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await axios.get(url, {
                timeout: timeoutMs,
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.data && typeof response.data === 'object') {
                // Cache successful result
                metadataCache.set(url, response.data);
                return response.data;
            }
        } catch (error) {
            if (attempt === retries) {
                console.warn(`Failed to fetch metadata from ${url} after ${retries + 1} attempts:`, error.message);
            }
        }
    }

    return null;
};

/**
 * Fetch metadata from IPFS with gateway fallback
 * @param {string} ipfsHash - IPFS hash (with or without 'ipfs://' prefix)
 * @returns {Promise<Object|null>} Metadata object or null
 */
export const fetchMetadataFromIPFS = async (ipfsHash) => {
    const cleanHash = ipfsHash.replace('ipfs://', '');

    // Try each gateway until one succeeds
    for (const gateway of IPFS_GATEWAYS) {
        const url = `${gateway}${cleanHash}`;
        const metadata = await fetchMetadataFromUrl(url, 8000, 1);
        
        if (metadata) {
            return metadata;
        }
    }

    console.warn(`Failed to fetch metadata from all IPFS gateways for hash: ${cleanHash}`);
    return null;
};

/**
 * Resolve NFT image URL from URI
 * @param {string} uri - Raw URI from NFT
 * @returns {Promise<string|null>} Image URL or null
 */
export const resolveImageUrl = async (uri) => {
    const parsedUri = parseNFTUri(uri);
    if (!parsedUri) return null;

    // If it's already a direct image URL, return it
    if (parsedUri.match(/\.(jpg|jpeg|png|gif|svg|webp|bmp)$/i)) {
        return parsedUri;
    }

    // If it's a metadata URL, fetch and extract image
    try {
        const metadata = await fetchMetadataFromUrl(parsedUri, 5000, 1);
        if (metadata?.image) {
            // Recursively resolve the image URL from metadata
            return parseNFTUri(metadata.image);
        }
    } catch (error) {
        console.warn('Error resolving image from metadata:', error);
    }

    return parsedUri;
};

/**
 * Resolve complete NFT metadata from XRPL NFT object
 * @param {Object} nft - Raw NFT object from XRPL (account_nfts)
 * @returns {Promise<Object>} Enriched NFT with resolved metadata
 */
export const resolveNFTMetadata = async (nft) => {
    const {
        NFTokenID,
        URI: rawUri,
        Issuer,
        NFTokenTaxon,
        Flags,
        TransferFee,
        nft_serial
    } = nft;

    // Parse and resolve the URI
    const uri = parseNFTUri(rawUri);
    let metadata = null;
    let imageURI = null;
    let name = null;
    let description = null;
    let attributes = null;
    let collection = null;

    // Try to fetch metadata if URI exists
    if (uri) {
        try {
            if (uri.includes('ipfs')) {
                metadata = await fetchMetadataFromIPFS(uri);
            } else {
                metadata = await fetchMetadataFromUrl(uri, 5000, 1);
            }

            if (metadata) {
                // Extract image URL
                if (metadata.image) {
                    imageURI = parseNFTUri(metadata.image);
                }

                // Extract other fields
                name = metadata.name || metadata.title;
                description = metadata.description;
                attributes = metadata.attributes || metadata.properties;
                collection = metadata.collection?.name || metadata.collection;
            }
        } catch (error) {
            console.warn(`Error fetching metadata for NFT ${NFTokenID}:`, error);
        }
    }

    // Fallback: If no image found, try using URI directly as image
    if (!imageURI && uri) {
        imageURI = uri;
    }

    // Return enriched NFT object
    return {
        ...nft,
        nftokenID: NFTokenID, // Normalize field name
        NFTokenID,
        issuer: Issuer,
        nftokenTaxon: NFTokenTaxon,
        flags: Flags,
        transferFee: TransferFee,
        serial: nft_serial,
        URI: rawUri,
        uri,
        imageURI,
        metadata: metadata || {},
        name: name || `NFT #${nft_serial || NFTokenTaxon}`,
        description,
        attributes,
        collection: collection || `Collection ${NFTokenTaxon}`,
        collectionName: collection || `Collection ${NFTokenTaxon}`
    };
};

/**
 * Resolve metadata for multiple NFTs in parallel (with rate limiting)
 * @param {Array} nfts - Array of raw NFT objects
 * @param {number} batchSize - Number of NFTs to process in parallel
 * @returns {Promise<Array>} Array of enriched NFTs
 */
export const resolveMultipleNFTMetadata = async (nfts, batchSize = 5) => {
    const results = [];

    for (let i = 0; i < nfts.length; i += batchSize) {
        const batch = nfts.slice(i, i + batchSize);
        const resolvedBatch = await Promise.all(
            batch.map(nft => resolveNFTMetadata(nft))
        );
        results.push(...resolvedBatch);
    }

    return results;
};

/**
 * Clear metadata cache
 */
export const clearMetadataCache = () => {
    metadataCache.clear();
};

/**
 * Get cache size
 */
export const getCacheSize = () => {
    return metadataCache.size;
};

export default {
    hexToString,
    parseNFTUri,
    fetchMetadataFromUrl,
    fetchMetadataFromIPFS,
    resolveImageUrl,
    resolveNFTMetadata,
    resolveMultipleNFTMetadata,
    clearMetadataCache,
    getCacheSize
};
