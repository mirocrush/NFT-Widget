import {
    Client
} from 'xrpl';
import API_URLS from '../config.js';
import {
    getAllAccountNFTs,
    getAccountNFTOffers,
    getNFTOffers as getDhaliNFTOffers
} from './dhaliService.js';
import { resolveNFTMetadata, resolveMultipleNFTMetadata } from './metadataResolver.js';

const XRPL_NODE = 'wss://s.altnet.rippletest.net:51233'; // Using testnet, change to mainnet for production

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
 * Fetch NFT offers for a given address using Dhali API
 * @param {string} address - The XRPL address
 * @param {Object} options - Additional options for the API call
 * @returns {Promise<Object>} NFT offers data
 */
export const getNFTOffers = async (address, options = {}) => {
    try {
        const {
            list = null, // null (default), 'counterOffers', 'privatelyOfferedToAddress'
            nftoken = true, // Include NFT token data and metadata
            offersValidate = true, // Include validation status
            assets = true // Include asset URLs
        } = options;

        // Get all NFT offers created by this account
        const accountOffers = await getAccountNFTOffers(address);

        // Filter based on list type
        let filteredOffers = accountOffers;

        if (list === 'counterOffers') {
            // Counter offers are buy offers where the account is NOT the creator
            // We need to get NFTs owned by the address, then find buy offers on those NFTs
            // This is complex, so we'll return empty for now and handle it in getAllNFTOffers
            filteredOffers = [];
        } else if (list === 'privatelyOfferedToAddress') {
            // Private offers where Destination field equals the address
            filteredOffers = accountOffers.filter(offer => 
                offer.Destination === address
            );
        }

        // Transform to match Bithomp-like structure
        const nftOffers = await Promise.all(
            filteredOffers.map(async (offer) => {
                const isSellOffer = (offer.Flags & 1) === 1;
                
                // Fetch NFT metadata if requested
                let nftData = null;
                if (nftoken && offer.NFTokenID) {
                    try {
                        // Get basic NFT info (we don't have the full NFT object here)
                        // In a real scenario, you might need to call account_nfts to get the full NFT
                        nftData = {
                            NFTokenID: offer.NFTokenID,
                            nftokenID: offer.NFTokenID
                        };
                    } catch (error) {
                        console.warn(`Failed to fetch NFT data for ${offer.NFTokenID}`);
                    }
                }

                // Determine if offer is valid (basic validation)
                const valid = offer.Amount !== undefined && offer.Amount !== null;

                return {
                    offerIndex: offer.index,
                    flags: {
                        sellToken: isSellOffer
                    },
                    amount: offer.Amount,
                    account: offer.Owner,
                    owner: offer.Owner,
                    destination: offer.Destination || null,
                    nftokenID: offer.NFTokenID,
                    valid,
                    validationErrors: valid ? [] : ['Invalid offer amount'],
                    createdAt: null, // Not available in raw XRPL data
                    expiration: offer.Expiration || null,
                    nftoken: nftData
                };
            })
        );

        return {
            nftOffers,
            owner: address,
            ownerDetails: null
        };
    } catch (error) {
        console.error('Error fetching NFT offers from Dhali:', error);
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
        // Step 1: Get all offers created by the user
        const accountOffers = await getAccountNFTOffers(address);
        console.log('Account Offers (from account_objects):', accountOffers);

        // Step 2: Get all NFTs owned by the user
        const ownedNFTs = await getAllAccountNFTs(address);
        console.log('Owned NFTs:', ownedNFTs.length);

        // Step 3: For each owned NFT, get all offers (sell + buy)
        const counterOffersPromises = ownedNFTs.map(async (nft) => {
            try {
                const offers = await getDhaliNFTOffers(nft.NFTokenID);
                return {
                    nftokenID: nft.NFTokenID,
                    sellOffers: offers.sellOffers || [],
                    buyOffers: offers.buyOffers || []
                };
            } catch (error) {
                console.warn(`Failed to get offers for NFT ${nft.NFTokenID}`);
                return {
                    nftokenID: nft.NFTokenID,
                    sellOffers: [],
                    buyOffers: []
                };
            }
        });

        const nftOffersData = await Promise.all(counterOffersPromises);

        // Step 4: Process user created offers
        const userCreatedOffers = accountOffers.map((offer) => {
            const isSellOffer = (offer.Flags & 1) === 1;
            return {
                offerIndex: offer.index,
                flags: {
                    sellToken: isSellOffer
                },
                amount: offer.Amount,
                account: offer.Owner,
                owner: offer.Owner,
                destination: offer.Destination || null,
                nftokenID: offer.NFTokenID,
                valid: true,
                validationErrors: [],
                expiration: offer.Expiration || null,
                nftoken: {
                    NFTokenID: offer.NFTokenID,
                    nftokenID: offer.NFTokenID
                }
            };
        });

        // Step 5: Process counter offers (offers on NFTs owned by user, NOT created by user)
        const counterOffers = [];
        nftOffersData.forEach(({ nftokenID, buyOffers }) => {
            // Buy offers on user's NFTs where the user is NOT the creator
            buyOffers.forEach((offer) => {
                if (offer.owner !== address) {
                    counterOffers.push({
                        offerIndex: offer.nft_offer_index,
                        flags: {
                            sellToken: false // Buy offers are always false
                        },
                        amount: offer.amount,
                        account: offer.owner,
                        owner: offer.owner,
                        destination: offer.destination || null,
                        nftokenID: nftokenID,
                        valid: true,
                        validationErrors: [],
                        expiration: offer.expiration || null,
                        nftoken: {
                            NFTokenID: nftokenID,
                            nftokenID: nftokenID
                        }
                    });
                }
            });
        });

        // Step 6: Process private offers (sell offers with destination = user's address)
        const privateOffers = [];
        nftOffersData.forEach(({ nftokenID, sellOffers }) => {
            sellOffers.forEach((offer) => {
                if (offer.destination === address && offer.owner !== address) {
                    privateOffers.push({
                        offerIndex: offer.nft_offer_index,
                        flags: {
                            sellToken: true
                        },
                        amount: offer.amount,
                        account: offer.owner,
                        owner: offer.owner,
                        destination: offer.destination,
                        nftokenID: nftokenID,
                        valid: true,
                        validationErrors: [],
                        expiration: offer.expiration || null,
                        nftoken: {
                            NFTokenID: nftokenID,
                            nftokenID: nftokenID
                        }
                    });
                }
            });
        });

        // Also check account offers for private offers directed to user
        accountOffers.forEach((offer) => {
            if (offer.Destination === address) {
                const isSellOffer = (offer.Flags & 1) === 1;
                if (isSellOffer) {
                    // This is a sell offer directed to this address (already in userCreatedOffers, skip)
                } else {
                    // This shouldn't happen (buy offers can't have different owners), but handle it
                }
            }
        });

        return {
            userCreatedOffers: userCreatedOffers || [],
            counterOffers: counterOffers || [],
            privateOffers: privateOffers || [],
            summary: {
                totalUserCreated: userCreatedOffers?.length || 0,
                totalCounterOffers: counterOffers?.length || 0,
                totalPrivateOffers: privateOffers?.length || 0,
                totalOffers: (userCreatedOffers?.length || 0) +
                    (counterOffers?.length || 0) +
                    (privateOffers?.length || 0)
            },
            owner: address,
            ownerDetails: null
        };
    } catch (error) {
        console.error('Error fetching all NFT offers:', error);
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