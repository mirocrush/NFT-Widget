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
 * Fetch all NFT offers for a given address and categorize them
 * Uses the comprehensive endpoint that returns all offer types
 * @param {string} address - The XRPL address
 * @returns {Promise<Object>} Categorized NFT offers data
 */
export const getAllNFTOffers = async (address) => {
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

        const responseData = await response.json();
        const data = responseData?.data || {};
        const ledgerInfo = responseData?.info || null;

        // Initialize categorized arrays
        const madeOffers = [];
        const receivedOffers = [];
        const incomingTransfers = [];
        const outgoingTransfers = [];

        // Helper function to check if amount is zero (transfer)
        const isTransferAmount = (amount) => {
            if (amount === "0" || amount === 0) return true;
            if (amount === null || amount === undefined || amount === '') return true;
            try {
                return parseFloat(String(amount)) === 0;
            } catch {
                return false;
            }
        };

        // Process offers_owned (offers you created)
        const offersOwned = data.offers_owned || [];
        offersOwned.forEach(offer => {
            const amount = offer.Amount || offer.amount;
            
            if (isTransferAmount(amount)) {
                // Outgoing transfer (you created, amount=0)
                outgoingTransfers.push(offer);
            } else {
                // Made offer (you created, amount>0)
                madeOffers.push(offer);
            }
        });

        // Process offers_for_own_nfts (offers on NFTs you own)
        const offersForOwnNfts = data.offers_for_own_nfts || [];
        const flattenedCounterOffers = [];
        
        offersForOwnNfts.forEach(nftGroup => {
            const nftId = nftGroup.NFTokenID;
            const nftOwner = nftGroup.NFTokenOwner;
            const uri = nftGroup.URI;
            
            // Add buy offers
            if (nftGroup.buy && Array.isArray(nftGroup.buy)) {
                nftGroup.buy.forEach(offer => {
                    flattenedCounterOffers.push({
                        ...offer,
                        NFTokenOwner: nftOwner,
                        URI: uri,
                        offerType: 'buy'
                    });
                });
            }
            
            // Add sell offers
            if (nftGroup.sell && Array.isArray(nftGroup.sell)) {
                nftGroup.sell.forEach(offer => {
                    flattenedCounterOffers.push({
                        ...offer,
                        NFTokenOwner: nftOwner,
                        URI: uri,
                        offerType: 'sell'
                    });
                });
            }
        });

        // All offers on NFTs you own go to receivedOffers (amount > 0)
        flattenedCounterOffers.forEach(offer => {
            const amount = offer.Amount || offer.amount;
            if (!isTransferAmount(amount)) {
                receivedOffers.push(offer);
            }
        });

        // Process offers_as_destination (offers where you are the destination)
        const offersAsDestination = data.offers_as_destination || [];
        offersAsDestination.forEach(offer => {
            const amount = offer.Amount || offer.amount;
            
            if (isTransferAmount(amount)) {
                // Incoming transfer (destination=you, amount=0)
                incomingTransfers.push(offer);
            } else {
                // Received offer (destination=you, amount>0)
                receivedOffers.push(offer);
            }
        });

        console.log('✅ NFT Offers Categorized:');
        console.log('  📨 Incoming Transfers:', incomingTransfers.length);
        console.log('  📤 Outgoing Transfers:', outgoingTransfers.length);
        console.log('  📥 Offers Received:', receivedOffers.length);
        console.log('  💼 Offers Made:', madeOffers.length);

        return {
            madeOffers: madeOffers,
            receivedOffers: receivedOffers,
            incomingTransfers: incomingTransfers,
            outgoingTransfers: outgoingTransfers,
            summary: {
                totalMadeOffers: madeOffers.length,
                totalReceivedOffers: receivedOffers.length,
                totalIncomingTransfers: incomingTransfers.length,
                totalOutgoingTransfers: outgoingTransfers.length,
                totalOffers: madeOffers.length + receivedOffers.length + incomingTransfers.length + outgoingTransfers.length
            },
            owner: address,
            ledgerInfo: ledgerInfo
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