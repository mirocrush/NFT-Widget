/**
 * ============================================================================
 * DHALI API SERVICE
 * ============================================================================
 * Handles all interactions with Dhali's XRPL nano-payment API
 * Uses standard XRPL JSON-RPC methods via Dhali's endpoint
 * ============================================================================
 */

import axios from 'axios';

// Dhali XRPL Cluster Endpoint
const DHALI_ENDPOINT = 'https://run.api.dhali.io/199fd80b-1776-4708-b1a1-4b2bb386435d/';

// xrpldata.com API Endpoint (no authentication required)
const XRPLDATA_API_BASE = 'https://api.xrpldata.com/api/v1';

// Payment claim from environment variable
const getPaymentClaim = () => {
  const claim = process.env.REACT_APP_DHALI_PAYMENT_CLAIM;
  if (!claim) {
    console.error('❌ REACT_APP_DHALI_PAYMENT_CLAIM environment variable is not set');
  }
  return claim;
};

/**
 * Core function to make Dhali API requests
 * @param {string} method - XRPL JSON-RPC method name
 * @param {Object} params - Parameters for the method
 * @returns {Promise<Object>} API response result
 */
export const callDhaliAPI = async (method, params) => {
  const paymentClaim = getPaymentClaim();
  if (!paymentClaim) {
    throw new Error('Dhali payment claim is not configured. Please set REACT_APP_DHALI_PAYMENT_CLAIM in your .env file');
  }

  try {
    console.log(`📡 Calling Dhali API: ${method}`);
    
    const response = await axios.post(
      DHALI_ENDPOINT,
      {
        method: method,
        params: [params]
      },
      {
        headers: {
          'Payment-Claim': paymentClaim,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.result) {
      console.log(`✅ ${method} returned result`);
      return response.data.result;
    } else if (response.data.error) {
      console.error(`❌ Dhali API Error (${method}):`, response.data.error);
      throw new Error(`Dhali API Error: ${response.data.error.message || JSON.stringify(response.data.error)}`);
    } else {
      console.log(`⚠️  ${method} returned non-standard response`);
      return response.data;
    }
  } catch (error) {
    // Handle 402 Payment Required specifically
    if (error.response?.status === 402) {
      console.error(`❌ Dhali API Error (${method}): 402 Payment Required`);
      console.error('Payment claim insufficient. Error details:', error.response?.data);
      const detail = error.response?.data?.detail || 'Payment claim insufficient';
      throw new Error(`Dhali: ${detail}`);
    }
    
    if (error.response?.data?.error) {
      console.error(`❌ Dhali API Error (${method}):`, error.response.data.error);
      throw new Error(`Dhali API: ${error.response.data.error.message || 'Unknown error'}`);
    } else if (error.response?.data?.detail) {
      console.error(`❌ Dhali API Error (${method}):`, error.response.data.detail);
      throw new Error(`Dhali: ${error.response.data.detail}`);
    } else {
      console.error(`❌ Dhali API Error (${method}):`, error.message);
      throw error;
    }
  }
};

/**
 * Get all NFTs owned by an account using xrpldata.com
 * @param {string} address - XRPL account address
 * @param {Object} options - Additional options (not used with xrpldata API)
 * @returns {Promise<Object>} Account NFTs data
 */
export const getAccountNFTs = async (address, options = {}) => {
  try {
    const url = `${XRPLDATA_API_BASE}/xls20-nfts/owner/${address}`;
    
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // xrpldata.com returns NFTs directly as an array
    const nfts = Array.isArray(response.data) ? response.data : [];
    
    console.log(`✅ Fetched ${nfts.length} NFTs for ${address}`);
    
    // Return in a format compatible with existing code
    return {
      account_nfts: nfts,
      account: address,
      ledger_index: null,
      validated: true
    };
  } catch (error) {
    console.error(`❌ Error fetching NFTs for ${address}:`, error);
    throw error;
  }
};

/**
 * Get all NFTs owned by an account (xrpldata.com returns all in one call)
 * @param {string} address - XRPL account address
 * @param {number} maxNFTs - Maximum number of NFTs to return
 * @returns {Promise<Array>} Array of all NFTs
 */
export const getAllAccountNFTs = async (address, maxNFTs = 400) => {
  try {
    const result = await getAccountNFTs(address);
    const nfts = result.account_nfts || [];
    
    console.log(`✅ Total NFTs fetched: ${nfts.length}`);
    
    // Return up to maxNFTs
    return nfts.slice(0, maxNFTs);
  } catch (error) {
    console.error('❌ Error fetching all account NFTs:', error);
    throw error;
  }
};

/**
 * Get sell offers for a specific NFT (includes transfers with amount 0) using xrpldata.com
 * @param {string} nftokenID - NFT Token ID
 * @returns {Promise<Object>} Sell offers data
 */
export const getNFTSellOffers = async (nftokenID) => {
  try {
    const url = `${XRPLDATA_API_BASE}/xls20-nfts/offers/nft/${nftokenID}`;
    
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // xrpldata.com returns all offers for NFT, filter for sell offers (Flags & 1 === 1)
    const allOffers = Array.isArray(response.data) ? response.data : [];
    const sellOffers = allOffers.filter(offer => (offer.Flags & 1) === 1);
    
    console.log(`✅ Fetched ${sellOffers.length} sell offers for NFT ${nftokenID}`);
    
    return {
      offers: sellOffers,
      nft_id: nftokenID
    };
  } catch (error) {
    // NFT might not have any sell offers
    if (error.response?.status === 404) {
      console.log(`ℹ️ No sell offers found for ${nftokenID}`);
      return { offers: [] };
    }
    console.error(`❌ Error getting sell offers for ${nftokenID}:`, error);
    throw error;
  }
};

/**
 * Get buy offers for a specific NFT (includes transfers with amount 0) using xrpldata.com
 * @param {string} nftokenID - NFT Token ID
 * @returns {Promise<Object>} Buy offers data
 */
export const getNFTBuyOffers = async (nftokenID) => {
  try {
    const url = `${XRPLDATA_API_BASE}/xls20-nfts/offers/nft/${nftokenID}`;
    
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // xrpldata.com returns all offers for NFT, filter for buy offers (Flags & 1 === 0)
    const allOffers = Array.isArray(response.data) ? response.data : [];
    const buyOffers = allOffers.filter(offer => (offer.Flags & 1) === 0);
    
    console.log(`✅ Fetched ${buyOffers.length} buy offers for NFT ${nftokenID}`);
    
    return {
      offers: buyOffers,
      nft_id: nftokenID
    };
  } catch (error) {
    // NFT might not have any buy offers
    if (error.response?.status === 404) {
      console.log(`ℹ️ No buy offers found for ${nftokenID}`);
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

  const params = {
    account: address,
    ledger_index: 'validated',
    ...(type && { type }),
    ...(limit && { limit }),
    ...(marker && { marker })
  };

  try {
    const result = await callDhaliAPI('account_objects', params);
    return result;
  } catch (error) {
    console.error(`❌ Error fetching account objects for ${address}:`, error);
    throw error;
  }
};

/**
 * Get all NFT offers created by an account using xrpldata.com
 * @param {string} address - XRPL account address
 * @returns {Promise<Array>} Array of NFT offer objects
 */
export const getAccountNFTOffers = async (address) => {
  try {
    const url = `${XRPLDATA_API_BASE}/xls20-nfts/offers/offerowner/${address}`;
    
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const offers = Array.isArray(response.data) ? response.data : [];
    
    console.log(`✅ Fetched ${offers.length} NFT offers created by ${address}`);
    
    return offers;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`ℹ️ No NFT offers found for ${address}`);
      return [];
    }
    console.error('❌ Error in offer fetching:', error);
    throw error;
  }
};

/**
 * Get account information
 * @param {string} address - XRPL account address
 * @returns {Promise<Object>} Account info
 */
export const getAccountInfo = async (address) => {
  try {
    const result = await callDhaliAPI('account_info', {
      account: address,
      ledger_index: 'validated'
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

  const params = {
    account: address,
    ...(limit && { limit }),
    ...(marker && { marker }),
    ...(minLedger && { ledger_index_min: minLedger }),
    ...(maxLedger && { ledger_index_max: maxLedger })
  };

  try {
    const result = await callDhaliAPI('account_tx', params);
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
    const result = await callDhaliAPI('ledger', {
      ledger_index: 'validated'
    });
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
