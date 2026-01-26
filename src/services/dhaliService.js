/**
 * ============================================================================
 * DHALI API SERVICE
 * ============================================================================
 * Handles all interactions with Dhali's XRPL nano-payment API
 * ============================================================================
 */

import axios from 'axios';

// Dhali XRPL Cluster Endpoint
const DHALI_ENDPOINT = 'https://run.api.dhali.io/199fd80b-1776-4708-b1a1-4b2bb386435d/';

// Payment claim from environment variable
const PAYMENT_CLAIM = process.env.REACT_APP_DHALI_PAYMENT_CLAIM;

/**
 * Core function to make Dhali API requests
 * @param {string} method - XRPL JSON-RPC method name
 * @param {Object} params - Parameters for the method
 * @returns {Promise<Object>} API response result
 */
export const callDhaliAPI = async (method, params) => {
    if (!PAYMENT_CLAIM) {
        throw new Error('REACT_APP_DHALI_PAYMENT_CLAIM environment variable is not set');
    }

    try {
        const response = await axios.post(
            DHALI_ENDPOINT,
            {
                method: method,
                params: [params]
            },
            {
                headers: {
                    'Payment-Claim': PAYMENT_CLAIM,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.result;
    } catch (error) {
        console.error(`Dhali API Error (${method}):`, error.response?.data || error.message);
        throw error;
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
        marker = undefined
    } = options;

    const params = {
        account: address,
        ledger_index: 'validated',
        ...(limit && { limit }),
        ...(marker && { marker })
    };

    try {
        const result = await callDhaliAPI('account_nfts', params);
        return result;
    } catch (error) {
        console.error(`Error fetching NFTs for ${address}:`, error);
        throw error;
    }
};

/**
 * Get all NFTs with pagination support
 * @param {string} address - XRPL account address
 * @param {number} maxNFTs - Maximum number of NFTs to fetch (default: 400)
 * @returns {Promise<Array>} Array of all NFTs
 */
export const getAllAccountNFTs = async (address, maxNFTs = 400) => {
    let allNFTs = [];
    let marker = undefined;
    let hasMore = true;

    while (hasMore && allNFTs.length < maxNFTs) {
        const result = await getAccountNFTs(address, { limit: 400, marker });
        
        if (result.account_nfts && result.account_nfts.length > 0) {
            allNFTs = allNFTs.concat(result.account_nfts);
        }

        if (result.marker && allNFTs.length < maxNFTs) {
            marker = result.marker;
        } else {
            hasMore = false;
        }
    }

    return allNFTs.slice(0, maxNFTs);
};

/**
 * Get sell offers for a specific NFT
 * @param {string} nftokenID - NFT Token ID
 * @returns {Promise<Object>} Sell offers data
 */
export const getNFTSellOffers = async (nftokenID) => {
    try {
        const result = await callDhaliAPI('nft_sell_offers', {
            nft_id: nftokenID,
            ledger_index: 'validated'
        });
        return result;
    } catch (error) {
        // NFT might not have any sell offers
        if (error.response?.data?.error === 'objectNotFound') {
            return { offers: [] };
        }
        throw error;
    }
};

/**
 * Get buy offers for a specific NFT
 * @param {string} nftokenID - NFT Token ID
 * @returns {Promise<Object>} Buy offers data
 */
export const getNFTBuyOffers = async (nftokenID) => {
    try {
        const result = await callDhaliAPI('nft_buy_offers', {
            nft_id: nftokenID,
            ledger_index: 'validated'
        });
        return result;
    } catch (error) {
        // NFT might not have any buy offers
        if (error.response?.data?.error === 'objectNotFound') {
            return { offers: [] };
        }
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
        const [sellOffers, buyOffers] = await Promise.all([
            getNFTSellOffers(nftokenID),
            getNFTBuyOffers(nftokenID)
        ]);

        return {
            nftokenID,
            sellOffers: sellOffers.offers || [],
            buyOffers: buyOffers.offers || [],
            totalOffers: (sellOffers.offers?.length || 0) + (buyOffers.offers?.length || 0)
        };
    } catch (error) {
        console.error(`Error fetching offers for NFT ${nftokenID}:`, error);
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
        console.error(`Error fetching account objects for ${address}:`, error);
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
        const result = await callDhaliAPI('account_info', {
            account: address,
            ledger_index: 'validated'
        });
        return result;
    } catch (error) {
        console.error(`Error fetching account info for ${address}:`, error);
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
        console.error(`Error fetching transactions for ${address}:`, error);
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
        console.error('Error fetching ledger info:', error);
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
