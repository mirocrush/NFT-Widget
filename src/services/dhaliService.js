/**
 * ============================================================================
 * DHALI API SERVICE
 * ============================================================================
 * Handles all interactions with Dhali's XRPL nano-payment API
 * Uses standard XRPL JSON-RPC methods via Dhali's endpoint
 * ============================================================================
 */

import axios from 'axios';

// Dhali XRPL Cluster Endpoint (New REST API)
const DHALI_ENDPOINT = 'https://run.api.dhali.io/d995db530-7e57-46d1-ac8a-76324794e0c9';
// Payment claim from environment variable
const getPaymentClaim = () => {
  const claim = process.env.REACT_APP_DHALI_PAYMENT_CLAIM;
  if (!claim) {
    console.error('❌ REACT_APP_DHALI_PAYMENT_CLAIM environment variable is not set');
  }
  return claim;
};

/**
 * Core function to make Dhali API requests (REST-style)
 * @param {string} endpoint - API endpoint path (e.g., '/nfts', '/nft-offers')
 * @param {Object} queryParams - Query parameters for the request
 * @returns {Promise<Object>} API response data
 */
export const callDhaliAPI = async (endpoint, queryParams = {}) => {
  const paymentClaim = getPaymentClaim();
  if (!paymentClaim) {
    throw new Error('Dhali payment claim is not configured. Please set REACT_APP_DHALI_PAYMENT_CLAIM in your .env file');
  }

  try {
    console.log(`📡 Calling Dhali API: ${endpoint}`);

    // Build query string
    const queryString = Object.keys(queryParams)
      .filter(key => queryParams[key] !== undefined && queryParams[key] !== null)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
      .join('&');

    const url = `${DHALI_ENDPOINT}${endpoint}${queryString ? `?${queryString}` : ''}`;

    const response = await axios.get(url, {
      headers: {
        'Payment-Claim': paymentClaim,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ ${endpoint} returned result`);
    return response.data;
  } catch (error) {
    // Handle 402 Payment Required specifically
    if (error.response?.status === 402) {
      console.error(`❌ Dhali API Error (${endpoint}): 402 Payment Required`);
      console.error('Payment claim insufficient. Error details:', error.response?.data);
      const detail = error.response?.data?.detail || 'Payment claim insufficient';
      throw new Error(`Dhali: ${detail}`);
    }

    if (error.response?.data?.error) {
      console.error(`❌ Dhali API Error (${endpoint}):`, error.response.data.error);
      throw new Error(`Dhali API: ${error.response.data.error.message || 'Unknown error'}`);
    } else if (error.response?.data?.detail) {
      console.error(`❌ Dhali API Error (${endpoint}):`, error.response.data.detail);
      throw new Error(`Dhali: ${error.response.data.detail}`);
    } else {
      console.error(`❌ Dhali API Error (${endpoint}):`, error.message);
      throw error;
    }
  }
};

/**
 * Get all NFTs owned by an account
 * @param {string} address - XRPL account address
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Account NFTs data
 */
export const getAccountNFTs = async (address, options = {}) => {
  const {
    limit = 400,
    marker = undefined,
    assets = true
  } = options;

  const queryParams = {
    owner: address,
    assets: assets,
    ...(limit && { limit }),
    ...(marker && { marker })
  };

  try {
    const result = await callDhaliAPI('/nfts', queryParams);
    // Transform to match old format if needed
    return {
      account: address,
      account_nfts: result.nfts || result,
      ...(result.marker && { marker: result.marker })
    };
  } catch (error) {
    console.error(`❌ Error fetching NFTs for ${address}:`, error);
    throw error;
  }
};

/**
 * Get all NFTs with pagination support
 * @param {string} address - XRPL account address
 * @param {number} maxNFTs - Maximum number of NFTs to fetch
 * @returns {Promise<Array>} Array of all NFTs
 */
export const getAllAccountNFTs = async (address, maxNFTs = 400) => {
  let allNFTs = [];
  let marker = undefined;
  let hasMore = true;

  while (hasMore && allNFTs.length < maxNFTs) {
    try {
      const result = await getAccountNFTs(address, { limit: 400, marker });

      if (result.account_nfts && result.account_nfts.length > 0) {
        allNFTs = allNFTs.concat(result.account_nfts);
      }

      if (result.marker && allNFTs.length < maxNFTs) {
        marker = result.marker;
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error('Error in pagination:', error);
      hasMore = false;
    }
  }

  return allNFTs.slice(0, maxNFTs);
};

/**
 * Get sell offers for a specific NFT (includes transfers with amount 0)
 * @param {string} nftokenID - NFT Token ID
 * @returns {Promise<Object>} Sell offers data
 */
export const getNFTSellOffers = async (nftokenID) => {
  try {
    const result = await callDhaliAPI('/nft-sell-offers', {
      nft_id: nftokenID
    });

    // Ensure offers array exists
    if (result && !result.offers) {
      result.offers = result.sell_offers || [];
    }

    return result;
  } catch (error) {
    // NFT might not have any sell offers
    if (error.message?.includes('objectNotFound') || error.message?.includes('not found') || error.response?.status === 404) {
      return { offers: [] };
    }
    console.error(`❌ Error getting sell offers for ${nftokenID}:`, error);
    throw error;
  }
};

/**
 * Get buy offers for a specific NFT (includes transfers with amount 0)
 * @param {string} nftokenID - NFT Token ID
 * @returns {Promise<Object>} Buy offers data
 */
export const getNFTBuyOffers = async (nftokenID) => {
  try {
    const result = await callDhaliAPI('/nft-buy-offers', {
      nft_id: nftokenID
    });

    // Ensure offers array exists
    if (result && !result.offers) {
      result.offers = result.buy_offers || [];
    }

    return result;
  } catch (error) {
    // NFT might not have any buy offers
    if (error.message?.includes('objectNotFound') || error.message?.includes('not found') || error.response?.status === 404) {
      return { offers: [] };
    }
    console.error(`❌ Error getting buy offers for ${nftokenID}:`, error);
    throw error;
  }
};

/**
 * Get both sell and buy offers for a specific NFT
 * @param {string} nftokenID - NFT Token ID
 * @returns {Promise<Object>} Combined offers data
 */
export const getNFTOffers = async (nftokenID) => {
  try {
    const [sellResult, buyResult] = await Promise.all([
      getNFTSellOffers(nftokenID),
      getNFTBuyOffers(nftokenID)
    ]);

    return {
      nftokenID,
      sellOffers: sellResult.offers || [],
      buyOffers: buyResult.offers || [],
      totalOffers: (sellResult.offers?.length || 0) + (buyResult.offers?.length || 0)
    };
  } catch (error) {
    console.error(`❌ Error fetching offers for NFT ${nftokenID}:`, error);
    return {
      nftokenID,
      sellOffers: [],
      buyOffers: [],
      totalOffers: 0
    };
  }
};

/**
 * Get all account objects (includes NFT offers created by the account)
 * @param {string} address - XRPL account address
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Account objects data
 */
export const getAccountObjects = async (address, options = {}) => {
  const {
    type = undefined, // 'nft_offer', 'offer', etc.
    limit = 400,
    marker = undefined
  } = options;

  const queryParams = {
    account: address,
    ...(type && { type }),
    ...(limit && { limit }),
    ...(marker && { marker })
  };

  try {
    const result = await callDhaliAPI('/account-objects', queryParams);
    return result;
  } catch (error) {
    console.error(`❌ Error fetching account objects for ${address}:`, error);
    throw error;
  }
};

/**
 * Get all NFT offers created by an account (with pagination)
 * @param {string} address - XRPL account address
 * @returns {Promise<Array>} Array of NFT offer objects
 */
export const getAccountNFTOffers = async (address) => {
  let allOffers = [];
  let marker = undefined;
  let hasMore = true;

  while (hasMore) {
    try {
      const result = await getAccountObjects(address, {
        type: 'nft_offer',
        limit: 400,
        marker
      });

      if (result.account_objects && result.account_objects.length > 0) {
        allOffers = allOffers.concat(result.account_objects);
      }

      if (result.marker) {
        marker = result.marker;
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error('Error in offer pagination:', error);
      hasMore = false;
    }
  }

  return allOffers;
};

/**
 * Get account information
 * @param {string} address - XRPL account address
 * @returns {Promise<Object>} Account info
 */
export const getAccountInfo = async (address) => {
  try {
    const result = await callDhaliAPI('/account-info', {
      account: address
    });
    return result;
  } catch (error) {
    console.error(`❌ Error fetching account info for ${address}:`, error);
    throw error;
  }
};

/**
 * Get account transactions
 * @param {string} address - XRPL account address
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Account transactions
 */
export const getAccountTransactions = async (address, options = {}) => {
  const {
    limit = 10,
    marker = undefined,
    minLedger = undefined,
    maxLedger = undefined
  } = options;

  const queryParams = {
    account: address,
    ...(limit && { limit }),
    ...(marker && { marker }),
    ...(minLedger && { ledger_index_min: minLedger }),
    ...(maxLedger && { ledger_index_max: maxLedger })
  };

  try {
    const result = await callDhaliAPI('/account-transactions', queryParams);
    return result;
  } catch (error) {
    console.error(`❌ Error fetching transactions for ${address}:`, error);
    throw error;
  }
};

/**
 * Get current ledger information
 * @returns {Promise<Object>} Ledger info
 */
export const getLedgerInfo = async () => {
  try {
    const result = await callDhaliAPI('/ledger', {});
    return result;
  } catch (error) {
    console.error('❌ Error fetching ledger info:', error);
    throw error;
  }
};

export default {
  callDhaliAPI,
  getAccountNFTs,
  getAllAccountNFTs,
  getNFTSellOffers,
  getNFTBuyOffers,
  getNFTOffers,
  getAccountObjects,
  getAccountNFTOffers,
  getAccountInfo,
  getAccountTransactions,
  getLedgerInfo
};
