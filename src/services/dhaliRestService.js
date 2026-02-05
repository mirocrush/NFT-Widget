/**
 * ============================================================================
 * DHALI REST API SERVICE (NEW CLUSTER)
 * ============================================================================
 * Uses the new Dhali REST API with pre-resolved metadata and CDN assets
 * Cluster: d995db530-7e57-46d1-ac8a-76324794e0c9
 *
 * API Features:
 * - Pre-resolved metadata (no IPFS calls needed!)
 * - CDN-hosted images (Bithomp CDN)
 * - Rich NFT data with all fields
 * - Offers with embedded NFT data
 * ============================================================================
 */

import axios from 'axios';

// New Dhali REST API Cluster
const DHALI_REST_CLUSTER = 'd995db530-7e57-46d1-ac8a-76324794e0c9';
const DHALI_REST_BASE = `https://run.api.dhali.io/${DHALI_REST_CLUSTER}`;

// Payment claim from environment variable
const getPaymentClaim = () => {
  const claim = process.env.REACT_APP_DHALI_PAYMENT_CLAIM;
  if (!claim) {
    console.error('❌ REACT_APP_DHALI_PAYMENT_CLAIM environment variable is not set');
  }
  return claim;
};

/**
 * Get NFTs for an account (with pre-resolved metadata and assets)
 * @param {string} address - XRPL account address
 * @param {Object} options - Query options
 * @returns {Promise<Object>} NFT data with metadata and CDN assets
 */
export const getNFTsByOwner = async (address, options = {}) => {
  const {
    assets = true,
    limit = 400,
    order = 'mintedOld'
  } = options;

  const paymentClaim = getPaymentClaim();
  if (!paymentClaim) {
    throw new Error('Dhali payment claim is not configured');
  }

  try {
    console.log(`📡 Fetching NFTs from Dhali REST API for: ${address}`);

    const response = await axios.get(
      `${DHALI_REST_BASE}/nfts`,
      {
        params: {
          owner: address,
          assets: assets,
          limit: limit,
          order: order
        },
        headers: {
          'Payment-Claim': paymentClaim,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Fetched ${response.data.nfts?.length || 0} NFTs from Dhali REST API`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 402) {
      console.error(`❌ Dhali API Error: 402 Payment Required`);
      throw new Error('Dhali: Payment claim insufficient or expired');
    }
    console.error(`❌ Error fetching NFTs for ${address}:`, error.message);
    throw error;
  }
};

/**
 * Get NFT offers for an account (with embedded NFT data)
 * @param {string} address - XRPL account address
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Offer data with embedded NFT metadata
 */
export const getNFTOffers = async (address, options = {}) => {
  const {
    nftoken = true,
    assets = true
  } = options;

  const paymentClaim = getPaymentClaim();
  if (!paymentClaim) {
    throw new Error('Dhali payment claim is not configured');
  }

  try {
    console.log(`📡 Fetching offers from Dhali REST API for: ${address}`);

    const response = await axios.get(
      `${DHALI_REST_BASE}/nft-offers/${address}`,
      {
        params: {
          nftoken: nftoken,
          assets: assets
        },
        headers: {
          'Payment-Claim': paymentClaim,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Fetched ${response.data.nftOffers?.length || 0} offers from Dhali REST API`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 402) {
      console.error(`❌ Dhali API Error: 402 Payment Required`);
      throw new Error('Dhali: Payment claim insufficient or expired');
    }
    console.error(`❌ Error fetching offers for ${address}:`, error.message);
    throw error;
  }
};

/**
 * Extract collection name from NFT name
 * Smart logic: "X-Shaman #2341" → "X-Shaman"
 * @param {string} nftName - Individual NFT name
 * @returns {string} Collection name
 */
const extractCollectionName = (nftName) => {
  if (!nftName) return null;

  // Split by "#" and take the first part
  const baseName = nftName.split('#')[0].trim();

  // If we got something meaningful, return it
  if (baseName && baseName.length > 0) {
    return baseName;
  }

  return null;
};

/**
 * Transform Dhali REST NFT response to match existing app structure
 * @param {Object} dhaliResponse - Response from Dhali REST API
 * @param {string} userName - User's display name
 * @param {string} userId - User's Matrix ID
 * @returns {Object} Transformed data matching app expectations
 */
export const transformNFTResponse = (dhaliResponse, userName, userId) => {
  if (!dhaliResponse || !dhaliResponse.nfts) {
    return { collections: [], nftsByKey: {} };
  }

  const allNfts = dhaliResponse.nfts;

  // Build nftsByKey: { "issuer-taxon": [nfts] }
  const nftsByKey = {};
  const collectionNames = {}; // Track collection name for each key

  allNfts.forEach(nft => {
    const key = `${nft.issuer}-${nft.nftokenTaxon}`;
    const imageURI = nft.assets?.image || nft.metadata?.image || "";
    const nftName = nft.metadata?.name || "Unnamed NFT";

    // Extract collection name from first NFT in collection
    if (!collectionNames[key]) {
      const extracted = extractCollectionName(nftName);
      collectionNames[key] = extracted || `Collection ${nft.nftokenTaxon}`;
    }

    if (!nftsByKey[key]) nftsByKey[key] = [];
    nftsByKey[key].push({
      nftokenID: nft.nftokenID,
      issuer: nft.issuer,
      nftokenTaxon: nft.nftokenTaxon,
      imageURI,
      metadata: nft.metadata,
      assets: nft.assets,
      collectionName: collectionNames[key], // Use extracted collection name
      name: nftName,
      description: nft.metadata?.description || "",
      uri: nft.url,
      owner: nft.owner,
      flags: nft.flags,
      transferFee: nft.transferFee,
      sequence: nft.sequence
    });
  });

  // Build collection summaries
  const collections = Object.entries(nftsByKey).map(([key, nfts]) => {
    const sample = nfts[0];
    return {
      name: collectionNames[key], // Use extracted collection name
      issuer: sample.issuer,
      nftokenTaxon: sample.nftokenTaxon,
      collectionKey: key,
      nftCount: nfts.length,
      sampleNft: sample,
      sampleImage: sample.imageURI,
    };
  });

  console.log(`✅ Transformed ${collections.length} collections`);
  return { collections, nftsByKey };
};

/**
 * Load user collections with Dhali REST API
 * Replaces the old loadUserCollections function
 */
export const loadUserCollections = async (walletAddress) => {
  try {
    console.log('📦 Loading collections from Dhali REST API for:', walletAddress);

    const dhaliResponse = await getNFTsByOwner(walletAddress, {
      assets: true,
      limit: 400
    });

    const { collections, nftsByKey } = transformNFTResponse(dhaliResponse);

    return { collections, nftsByKey };
  } catch (error) {
    console.error(`❌ Error loading collections for ${walletAddress}:`, error.message);
    return { collections: [], nftsByKey: {} };
  }
};

/**
 * Get all NFT offers for Offers page
 * Replaces the getAllNFTOffersFromXRPLData function
 * @param {string} address - XRPL account address
 * @returns {Promise<Object>} Complete offers data with embedded NFT metadata
 */
export const getAllNFTOffersForAddress = async (address) => {
  try {
    console.log(`📡 Fetching all offers from Dhali REST API for: ${address}`);

    const response = await getNFTOffers(address, {
      nftoken: true,
      assets: true
    });

    // Transform to match existing Offers page expectations
    // The new API returns offers with full NFT data embedded!
    const result = {
      owner: response.owner,
      userCreatedOffers: response.nftOffers || [],
      // The Offers page will filter these based on type
    };

    console.log(`✅ Fetched ${result.userCreatedOffers.length} total offers`);
    return result;
  } catch (error) {
    console.error(`❌ Error fetching offers:`, error.message);
    return {
      owner: address,
      userCreatedOffers: [],
    };
  }
};

export default {
  getNFTsByOwner,
  getNFTOffers,
  getAllNFTOffersForAddress,
  transformNFTResponse,
  loadUserCollections
};
