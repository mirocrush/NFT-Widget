import {
    Client
} from 'xrpl';
import API_URLS from '../config.js';
import { 
    getAccountNFTOffers, 
    getAllAccountNFTs, 
    getNFTSellOffers, 
    getNFTBuyOffers 
} from './dhaliService';
import { resolveNFTMetadata } from './metadataResolver';

const XRPL_NODE = 'wss://s.altnet.rippletest.net:51233'; // Using testnet, change to mainnet for production
const BITHOMP_API_BASE = 'https://bithomp.com/api/v2'; // Legacy - kept for reference

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
 * Transform Dhali offer to Bithomp-compatible format
 * @param {Object} offer - Raw Dhali offer object
 * @param {Object} nftMetadata - Resolved NFT metadata
 * @param {string} type - 'sell' or 'buy'
 * @returns {Object} Bithomp-compatible offer
 */
const transformOfferToBithompFormat = (offer, nftMetadata = null, type = 'sell') => {
    // Validate offer object
    if (!offer || typeof offer !== 'object') {
        console.warn('⚠️ Invalid offer object passed to transformOfferToBithompFormat');
        return null;
    }
    
    // Parse Flags to determine offer type - with null safety
    const isSellToken = (offer.Flags && (offer.Flags & 0x00000001) !== 0) || false; // lsfSellNFToken flag
    
    // Normalize amount: Dhali returns Amount field from XRPL
    // Try multiple field names for compatibility
    let normalizedAmount = "0";
    const amountValue = offer.Amount !== undefined ? offer.Amount : (offer.amount !== undefined ? offer.amount : "0");
    if (amountValue !== null && amountValue !== undefined && amountValue !== '') {
        try {
            normalizedAmount = typeof amountValue === 'string' ? amountValue : String(amountValue);
        } catch (e) {
            console.warn('⚠️ Error normalizing amount:', e);
            normalizedAmount = "0";
        }
    }
    
    // Get NFT ID - handle both capital and lowercase variants
    const nftTokenID = offer.NFTokenID || offer.nftokenID || offer.nft_token_id;
    if (!nftTokenID) {
        console.warn('⚠️ No NFToken ID found in offer object:', offer);
    }
    
    // Get offer index - handle multiple possible field names
    const offerId = offer.index || offer.nft_offer_index || offer.offerIndex || offer.offer_index;
    if (!offerId) {
        console.warn('⚠️ No offer index found in offer object:', offer);
    }
    
    // Get owner/account - handle both variants
    const ownerAddress = offer.Owner || offer.owner || offer.account || offer.Account;
    
    // Get destination - handle null/undefined
    const destination = offer.Destination || offer.destination || null;
    
    // Get expiration
    const expiration = offer.Expiration || offer.expiration || null;
    
    return {
        offerIndex: offerId,
        amount: normalizedAmount,
        flags: {
            sellToken: isSellToken
        },
        owner: ownerAddress,
        account: ownerAddress, // for backward compatibility with UI expectations
        destination: destination,
        expiration: expiration,
        nftokenID: nftTokenID,
        valid: true, // Dhali returns only valid on-ledger offers
        nftoken: nftMetadata ? {
            nftokenID: nftMetadata.nftokenID,
            metadata: nftMetadata.metadata,
            imageURI: nftMetadata.image, // for UI display
            name: nftMetadata.name,
            assets: {
                image: nftMetadata.image,
                preview: nftMetadata.image // UI expects assets.preview
            }
        } : null
    };
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
            offersValidate = true, // Include validation status (always true with Dhali)
            assets = true // Include asset URLs
        } = options;

        let nftOffers = [];

        if (list === null) {
            // Default: Get offers created BY the user (from account_objects)
            const offerObjects = await getAccountNFTOffers(address);
            
            // Resolve metadata if requested
            if (nftoken && offerObjects.length > 0) {
                const metadataPromises = offerObjects.map(async (offer) => {
                    try {
                        // Get NFT details for metadata
                        const nfts = await getAllAccountNFTs(address, 50);
                        const nft = nfts.find(n => n.NFTokenID === offer.NFTokenID);
                        
                        if (nft && assets) {
                            const metadata = await resolveNFTMetadata(nft);
                            return transformOfferToBithompFormat(offer, metadata, 'sell');
                        }
                        return transformOfferToBithompFormat(offer, null, 'sell');
                    } catch (error) {
                        console.warn(`Could not resolve metadata for ${offer.NFTokenID}:`, error);
                        return transformOfferToBithompFormat(offer, null, 'sell');
                    }
                });
                
                nftOffers = await Promise.all(metadataPromises);
            } else {
                nftOffers = offerObjects.map(o => transformOfferToBithompFormat(o, null, 'sell'));
            }

        } else if (list === 'counterOffers') {
            // Get offers ON user's NFTs (offers made by others)
            const userNFTs = await getAllAccountNFTs(address);
            console.log(`📦 Found ${userNFTs.length} NFTs owned by ${address}`);
            
            if (userNFTs.length === 0) {
                console.log("⚠️  No NFTs found for address, returning empty counter offers");
                return { nftOffers: [] };
            }
            
            const counterOfferPromises = userNFTs.map(async (nft) => {
                try {
                    console.log(`🔄 Fetching offers for NFT: ${nft.NFTokenID}`);
                    
                    const [sellOffers, buyOffers] = await Promise.all([
                        getNFTSellOffers(nft.NFTokenID),
                        getNFTBuyOffers(nft.NFTokenID)
                    ]);
                    
                    const sellCount = sellOffers.offers?.length || 0;
                    const buyCount = buyOffers.offers?.length || 0;
                    console.log(`🔍 NFT ${nft.NFTokenID}: ${sellCount} sell, ${buyCount} buy offers`);
                    
                    const allOffers = [
                        ...(sellOffers.offers || []),
                        ...(buyOffers.offers || [])
                    ];
                    
                    if (allOffers.length === 0) {
                        console.log(`ℹ️  No offers on NFT ${nft.NFTokenID}`);
                        return [];
                    }
                    
                    // Filter out user's own offers (Dhali uses Owner with capital O)
                    const otherOffers = allOffers.filter(o => {
                        const isOthers = o.Owner !== address;
                        if (!isOthers) {
                            console.log(`⏭️ Skipping own offer: ${o.index || o.nft_offer_index}`);
                        }
                        return isOthers;
                    });
                    
                    console.log(`✅ Found ${otherOffers.length} offers from others on NFT ${nft.NFTokenID}`);
                    
                    if (otherOffers.length === 0) {
                        return [];
                    }
                    
                    if (nftoken && assets) {
                        try {
                            const metadata = await resolveNFTMetadata(nft);
                            return otherOffers.map(o => {
                                const transformed = transformOfferToBithompFormat(o, metadata);
                                console.log(`  └─ Transformed offer: amount=${transformed.amount}, transfer=${transformed.amount === "0"}`);
                                return transformed;
                            });
                        } catch (metadataError) {
                            console.warn(`Could not resolve metadata for NFT ${nft.NFTokenID}:`, metadataError);
                            return otherOffers.map(o => transformOfferToBithompFormat(o, null));
                        }
                    }
                    
                    return otherOffers.map(o => transformOfferToBithompFormat(o, null));
                } catch (error) {
                    console.error(`❌ Error fetching counter offers for NFT ${nft.NFTokenID}:`, error);
                    return [];
                }
            });
            
            const allCounterOffers = await Promise.all(counterOfferPromises);
            nftOffers = allCounterOffers.flat();
            console.log(`📊 Total counter offers found: ${nftOffers.length}`);
            
            if (nftOffers.length > 0) {
                const transferOffers = nftOffers.filter(o => o.amount === "0");
                console.log(`📨 Transfer offers (amount=0): ${transferOffers.length}`);
            }

        } else if (list === 'privatelyOfferedToAddress') {
            // Get offers privately offered TO this address (Destination === address)
            // This includes transfer offers (amount = "0") sent to us
            const userNFTs = await getAllAccountNFTs(address);
            console.log(`📦 Found ${userNFTs.length} NFTs for checking private offers`);
            
            if (userNFTs.length === 0) {
                console.log("⚠️  No NFTs found, returning empty private offers");
                return { nftOffers: [] };
            }
            
            const privateOfferPromises = userNFTs.map(async (nft) => {
                try {
                    console.log(`🔄 Checking private offers for NFT: ${nft.NFTokenID}`);
                    
                    const [sellOffers, buyOffers] = await Promise.all([
                        getNFTSellOffers(nft.NFTokenID),
                        getNFTBuyOffers(nft.NFTokenID)
                    ]);
                    
                    const allOffers = [
                        ...(sellOffers.offers || []),
                        ...(buyOffers.offers || [])
                    ];
                    
                    console.log(`  └─ Found ${allOffers.length} total offers for NFT`);
                    
                    // Filter for offers with Destination === address (privately sent to us)
                    const privateOffers = allOffers.filter(o => {
                        const isPrivateToUs = o.Destination === address;
                        if (isPrivateToUs) {
                            console.log(`  ✓ Private offer found: ${o.index || o.nft_offer_index}, amount=${o.Amount || "0"}`);
                        }
                        return isPrivateToUs;
                    });
                    
                    console.log(`📨 Found ${privateOffers.length} private offers for NFT ${nft.NFTokenID}`);
                    
                    if (privateOffers.length === 0) {
                        return [];
                    }
                    
                    if (nftoken && assets) {
                        try {
                            const metadata = await resolveNFTMetadata(nft);
                            return privateOffers.map(o => {
                                const transformed = transformOfferToBithompFormat(o, metadata);
                                console.log(`  └─ Transformed private offer: amount=${transformed.amount}, transfer=${transformed.amount === "0"}`);
                                return transformed;
                            });
                        } catch (metadataError) {
                            console.warn(`Could not resolve metadata for NFT ${nft.NFTokenID}:`, metadataError);
                            return privateOffers.map(o => transformOfferToBithompFormat(o, null));
                        }
                    }
                    
                    return privateOffers.map(o => transformOfferToBithompFormat(o, null));
                } catch (error) {
                    console.error(`❌ Error fetching private offers for NFT ${nft.NFTokenID}:`, error);
                    return [];
                }
            });
            
            const allPrivateOffers = await Promise.all(privateOfferPromises);
            nftOffers = allPrivateOffers.flat();
            console.log(`📊 Total private offers found: ${nftOffers.length}`);
            
            if (nftOffers.length > 0) {
                const transferOffers = nftOffers.filter(o => o.amount === "0");
                console.log(`📨 Transfer offers in private (amount=0): ${transferOffers.length}`);
            }
        }

        return {
            nftOffers: nftOffers.filter(o => o.valid === true)
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
        console.log(`🔄 Fetching all NFT offers for address: ${address}`);
        
        // Fetch offers created by the user (default list)
        let userCreatedOffers = { nftOffers: [] };
        try {
            console.log('📤 Fetching user created offers...');
            userCreatedOffers = await getNFTOffers(address, {
                list: null, // Default - offers created by the user
                nftoken: true,
                offersValidate: true,
                assets: true
            });
            console.log('✅ User Created Offers:', userCreatedOffers);
        } catch (userCreatedError) {
            console.error('❌ Error fetching user created offers:', userCreatedError.message);
            // Continue with counter offers even if this fails
        }

        // Fetch counter offers (offers made on the user's NFTs)
        let counterOffers = { nftOffers: [] };
        try {
            console.log('📥 Fetching counter offers...');
            counterOffers = await getNFTOffers(address, {
                list: 'counterOffers',
                nftoken: true,
                offersValidate: true,
                assets: true
            });
            console.log('✅ Counter Offers:', counterOffers);
        } catch (counterOffersError) {
            console.error('❌ Error fetching counter offers:', counterOffersError.message);
            // Continue with private offers even if this fails
        }

        // Fetch privately offered to address (brokers, private offers, NFT transfers)
        let privateOffers = { nftOffers: [] };
        try {
            console.log('🔒 Fetching private offers...');
            privateOffers = await getNFTOffers(address, {
                list: 'privatelyOfferedToAddress',
                nftoken: true,
                offersValidate: true,
                assets: true
            });
            console.log('✅ Private Offers:', privateOffers);
        } catch (privateOffersError) {
            console.error('❌ Error fetching private offers:', privateOffersError.message);
            // Continue even if this fails
        }

        const result = {
            userCreatedOffers: userCreatedOffers.nftOffers || [],
            counterOffers: counterOffers.nftOffers || [],
            privateOffers: privateOffers.nftOffers || [],
            summary: {
                totalUserCreated: userCreatedOffers.nftOffers?.length || 0,
                totalCounterOffers: counterOffers.nftOffers?.length || 0,
                totalPrivateOffers: privateOffers.nftOffers?.length || 0,
                totalOffers: (userCreatedOffers.nftOffers?.length || 0) +
                    (counterOffers.nftOffers?.length || 0) +
                    (privateOffers.nftOffers?.length || 0)
            },
            owner: address,
            ownerDetails: userCreatedOffers.ownerDetails || null
        };
        
        console.log('📊 Final offer summary:', result.summary);
        return result;
    } catch (error) {
        console.error('❌ Critical error fetching all NFT offers:', error);
        // Return empty structure rather than throwing
        return {
            userCreatedOffers: [],
            counterOffers: [],
            privateOffers: [],
            summary: {
                totalUserCreated: 0,
                totalCounterOffers: 0,
                totalPrivateOffers: 0,
                totalOffers: 0
            },
            owner: address,
            ownerDetails: null,
            error: error.message
        };
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