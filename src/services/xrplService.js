import {
    Client
} from 'xrpl';

const XRPL_NODE = 'wss://s.altnet.rippletest.net:51233'; // Using testnet, change to mainnet for production
const XRPLDATA_API_BASE = 'https://api.xrpldata.com/api/v1';

const isValidAmount = (amount) => {
    if (!amount) return false;
    if (typeof amount === 'string') return true; // XRP amount
    if (typeof amount === 'object') {
        return (
            amount.value &&
            amount.currency &&
            amount.issuer &&
            !isNaN(parseFloat(amount.value)) &&
            parseFloat(amount.value) > 0
        );
    }
    return false;
};

const isValidOffer = (offer) => {
    if (!offer) return false;

    // Check if the offer has valid amounts
    if (!isValidAmount(offer.taker_gets) || !isValidAmount(offer.taker_pays)) {
        return false;
    }

    // Check if the offer has a valid sequence number
    if (!offer.seq || typeof offer.seq !== 'number') {
        return false;
    }

    // Check if the offer has valid flags
    if (typeof offer.flags !== 'number') {
        return false;
    }

    // Check if the offer has a valid quality
    if (offer.quality && (isNaN(parseFloat(offer.quality)) || parseFloat(offer.quality) <= 0)) {
        return false;
    }

    return true;
};

export const getWalletOffers = async (walletAddress) => {
    try {
        // Create a new client
        const client = new Client(XRPL_NODE);

        // Connect to the XRPL
        await client.connect();

        // First, get the current ledger index
        const ledgerResponse = await client.request({
            command: 'ledger',
            ledger_index: 'validated'
        });

        const currentLedgerIndex = ledgerResponse.result.ledger_index;

        // Create the request with the current ledger index
        const request = {
            command: 'account_offers',
            account: walletAddress,
            ledger_index: currentLedgerIndex,
            limit: 400 // Adjust based on your needs
        };

        // Send the request
        const response = await client.request(request);

        // Disconnect from the client
        await client.disconnect();

        // Filter and process valid offers
        const validOffers = response.result.offers.filter(isValidOffer);

        // Process and return the offers
        return {
            buyOffers: validOffers.filter(offer => offer.flags === 0),
            sellOffers: validOffers.filter(offer => offer.flags === 1),
            rawOffers: validOffers,
            totalOffers: validOffers.length,
            invalidOffers: response.result.offers.length - validOffers.length,
            ledgerIndex: currentLedgerIndex
        };
    } catch (error) {
        console.error('Error fetching wallet offers:', error);
        throw error;
    }
};

/**
 * Fetch NFT offers for a given address from xrpldata.com API
 * @param {string} address - The XRPL address
 * @param {Object} options - Additional options for the API call
 * @returns {Promise<Object>} NFT offers data
 */
export const getNFTOffers = async (address, options = {}) => {
    try {
        const {
            list = null // null (default - user created), 'counterOffers', 'privatelyOfferedToAddress'
        } = options;

        let url;
        
        // Map list types to appropriate xrpldata.com endpoints
        if (list === 'counterOffers') {
            // Counter offers - offers made on the user's NFTs
            url = `${XRPLDATA_API_BASE}/xls20-nfts/offers/nftowner/${address}`;
        } else if (list === 'privatelyOfferedToAddress') {
            // Privately offered to address (including transfers and private sales)
            url = `${XRPLDATA_API_BASE}/xls20-nfts/offers/offerdestination/${address}`;
        } else {
            // Default - user created offers
            url = `${XRPLDATA_API_BASE}/xls20-nfts/offers/offerowner/${address}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`xrpldata.com API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // xrpldata.com returns offers directly as an array
        const offers = Array.isArray(data) ? data : [];

        return {
            nftOffers: offers,
            account: address,
            total: offers.length
        };

    } catch (error) {
        console.error('Error fetching NFT offers from xrpldata.com:', error);
        throw error;
    }
};

/**
 * Fetch all NFT offers for an address (both created by user and offers on user's NFTs)
 * @param {string} address - The XRPL address
 * @returns {Promise<Object>} Combined NFT offers data
 */
export const getAllNFTOffers = async (address) => {
    try {
        // Fetch offers created by the user (default list)
        let userCreatedOffers = { nftOffers: [] };
        try {
            userCreatedOffers = await getNFTOffers(address, {
                list: null // Default - offers created by the user
            });
            console.log('✅ User Created Offers:', userCreatedOffers);
        } catch (error) {
            console.warn('⚠️ Error fetching user created offers:', error.message);
        }

        // Fetch counter offers (offers made on the user's NFTs)
        let counterOffers = { nftOffers: [] };
        try {
            counterOffers = await getNFTOffers(address, {
                list: 'counterOffers'
            });
            console.log('✅ Counter Offers:', counterOffers);
        } catch (error) {
            console.warn('⚠️ Error fetching counter offers:', error.message);
        }

        // Fetch privately offered to address (transfers, private offers)
        let privateOffers = { nftOffers: [] };
        try {
            privateOffers = await getNFTOffers(address, {
                list: 'privatelyOfferedToAddress'
            });
            console.log('✅ Private Offers:', privateOffers);
        } catch (error) {
            console.warn('⚠️ Error fetching private offers:', error.message);
        }

        const userCreatedList = userCreatedOffers.nftOffers || [];
        const counterOffersList = counterOffers.nftOffers || [];
        const privateOffersList = privateOffers.nftOffers || [];

        return {
            userCreatedOffers: userCreatedList,
            counterOffers: counterOffersList,
            privateOffers: privateOffersList,
            summary: {
                totalUserCreated: userCreatedList.length,
                totalCounterOffers: counterOffersList.length,
                totalPrivateOffers: privateOffersList.length,
                totalOffers: userCreatedList.length + counterOffersList.length + privateOffersList.length
            },
            owner: address,
            ownerDetails: null
        };
    } catch (error) {
        console.error('❌ Error fetching all NFT offers:', error);
        throw error;
    }
};

/**
 * Helper function to filter valid NFT offers
 * @param {Array} offers - Array of NFT offers
 * @returns {Array} Valid offers only
 */
export const getValidNFTOffers = (offers) => {
    if (!Array.isArray(offers)) return [];
    return offers.filter(offer => offer.valid !== false);
};

/**
 * Helper function to filter invalid NFT offers
 * @param {Array} offers - Array of NFT offers
 * @returns {Array} Invalid offers only
 */
export const getInvalidNFTOffers = (offers) => {
    if (!Array.isArray(offers)) return [];
    return offers.filter(offer => offer.valid === false);
};

/**
 * Helper function to get offers by amount range
 * @param {Array} offers - Array of NFT offers
 * @param {string} minAmount - Minimum amount in drops
 * @param {string} maxAmount - Maximum amount in drops
 * @returns {Array} Filtered offers
 */
export const getOffersByAmountRange = (offers, minAmount, maxAmount) => {
    if (!Array.isArray(offers)) return [];
    return offers.filter(offer => {
        const amount = parseInt(offer.amount);
        const min = parseInt(minAmount);
        const max = parseInt(maxAmount);
        return amount >= min && amount <= max;
    });
};

/**
 * Helper function to convert XRP drops to XRP
 * @param {string} drops - Amount in drops
 * @returns {number} Amount in XRP
 */
export const dropsToXrp = (drops) => {
    return parseInt(drops) / 1000000;
};

/**
 * Get NFTs owned by a specific account using xrpldata.com
 * @param {string} address - The XRPL address
 * @returns {Promise<Array>} Array of NFTs owned by the account
 */
export const getNFTsByOwner = async (address) => {
    try {
        const url = `${XRPLDATA_API_BASE}/xls20-nfts/owner/${address}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`xrpldata.com API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const nfts = Array.isArray(data) ? data : [];

        console.log(`✅ Fetched ${nfts.length} NFTs for owner ${address}`);

        return nfts;
    } catch (error) {
        console.error('Error fetching NFTs by owner from xrpldata.com:', error);
        throw error;
    }
};

/**
 * Get details for a single NFT using xrpldata.com
 * @param {string} nftokenID - The NFT Token ID
 * @returns {Promise<Object>} NFT details
 */
export const getNFTDetails = async (nftokenID) => {
    try {
        const url = `${XRPLDATA_API_BASE}/xls20-nfts/nft/${nftokenID}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`xrpldata.com API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        console.log(`✅ Fetched details for NFT ${nftokenID}`);

        return data;
    } catch (error) {
        console.error('Error fetching NFT details from xrpldata.com:', error);
        throw error;
    }
};

/**
 * Get all offers for a specific NFT using xrpldata.com
 * @param {string} nftokenID - The NFT Token ID
 * @returns {Promise<Array>} Array of offers for the NFT
 */
export const getOffersForNFT = async (nftokenID) => {
    try {
        const url = `${XRPLDATA_API_BASE}/xls20-nfts/offers/nft/${nftokenID}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.log(`ℹ️ No offers found for NFT ${nftokenID}`);
                return [];
            }
            throw new Error(`xrpldata.com API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const offers = Array.isArray(data) ? data : [];

        console.log(`✅ Fetched ${offers.length} offers for NFT ${nftokenID}`);

        return offers;
    } catch (error) {
        console.error('Error fetching offers for NFT from xrpldata.com:', error);
        throw error;
    }
};

/**
 * Get all relevant offers for a specific account using xrpldata.com
 * (combines offers owned, offers on owned NFTs, and offers with account as destination)
 * @param {string} address - The XRPL address
 * @returns {Promise<Array>} Array of all relevant offers
 */
export const getAllRelevantOffersForAccount = async (address) => {
    try {
        const url = `${XRPLDATA_API_BASE}/xls20-nfts/offers/all/account/${address}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`xrpldata.com API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const offers = Array.isArray(data) ? data : [];

        console.log(`✅ Fetched ${offers.length} relevant offers for account ${address}`);

        return offers;
    } catch (error) {
        console.error('Error fetching all relevant offers from xrpldata.com:', error);
        throw error;
    }
};