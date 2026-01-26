/**
 * ============================================================================
 * NFT COLLECTION SERVICE (Using Dhali)
 * ============================================================================
 * Handles fetching and grouping NFTs by collection
 * Replaces Bithomp's collection API calls
 * ============================================================================
 */

import { getAllAccountNFTs } from './dhaliService';
import { resolveMultipleNFTMetadata } from './metadataResolver';

/**
 * Load user's NFT collections using Dhali API
 * @param {string} walletAddress - XRPL wallet address
 * @returns {Promise<Object>} Collections and NFTs grouped by collection
 */
export const loadUserCollections = async (walletAddress) => {
    try {
        console.log(`📡 Fetching NFTs from Dhali for: ${walletAddress}`);
        
        // Step 1: Get all NFTs from Dhali
        const rawNFTs = await getAllAccountNFTs(walletAddress);
        
        if (!rawNFTs || rawNFTs.length === 0) {
            console.log(`📭 No NFTs found for ${walletAddress}`);
            return { collections: [], nftsByKey: {} };
        }

        console.log(`✅ Found ${rawNFTs.length} NFTs, resolving metadata...`);

        // Step 2: Resolve metadata for all NFTs (in batches to avoid overwhelming)
        const enrichedNFTs = await resolveMultipleNFTMetadata(rawNFTs, 10);

        // Step 3: Group NFTs by collection (issuer + taxon)
        const nftsByKey = {};
        
        enrichedNFTs.forEach((nft) => {
            const key = `${nft.issuer}-${nft.nftokenTaxon}`;
            
            if (!nftsByKey[key]) {
                nftsByKey[key] = [];
            }
            
            nftsByKey[key].push({
                ...nft,
                collectionName: nft.collectionName || nft.collection
            });
        });

        // Step 4: Build collection summaries
        const collections = Object.entries(nftsByKey).map(([collectionKey, nfts]) => {
            const sample = nfts.find((n) => n.imageURI) || nfts[0];
            
            const name = 
                sample?.metadata?.collection?.name ||
                sample?.collectionName ||
                sample?.collection ||
                `Collection ${sample?.nftokenTaxon ?? 'Unknown'}`;
                
            const sampleImage = sample?.imageURI || null;

            return {
                name,
                issuer: sample.issuer,
                nftokenTaxon: sample.nftokenTaxon,
                collectionKey,
                nftCount: nfts.length,
                sampleNft: sample,
                sampleImage
            };
        });

        console.log(`✅ Grouped into ${collections.length} collections`);

        return { collections, nftsByKey };
    } catch (error) {
        console.error(`❌ Error loading collections for ${walletAddress}:`, error);
        return { collections: [], nftsByKey: {} };
    }
};

/**
 * Load NFTs for a specific collection (for lazy loading)
 * @param {string} walletAddress - XRPL wallet address
 * @param {string} collectionName - Collection name
 * @param {string} userName - User's display name
 * @param {string} userId - User's Matrix ID
 * @param {string} issuer - NFT issuer address
 * @param {number} nftokenTaxon - NFT taxon
 * @returns {Promise<Array>} Array of NFTs in the collection
 */
export const loadCollectionNFTs = async (
    walletAddress,
    collectionName,
    userName,
    userId,
    issuer = null,
    nftokenTaxon = null
) => {
    try {
        console.log(`📡 Fetching collection NFTs for ${walletAddress}...`);
        
        // Get all NFTs (we'll filter by collection)
        const rawNFTs = await getAllAccountNFTs(walletAddress);
        
        // Filter by issuer and taxon if provided
        let filteredNFTs = rawNFTs;
        if (issuer && nftokenTaxon !== null) {
            filteredNFTs = rawNFTs.filter(
                (nft) => nft.Issuer === issuer && nft.NFTokenTaxon === nftokenTaxon
            );
        }

        if (filteredNFTs.length === 0) {
            return [];
        }

        // Resolve metadata for filtered NFTs
        const enrichedNFTs = await resolveMultipleNFTMetadata(filteredNFTs, 10);

        // Add user info to each NFT
        const nftsWithUserInfo = enrichedNFTs.map((nft) => ({
            ...nft,
            userName,
            userId,
            collectionName: nft.collectionName || collectionName
        }));

        console.log(`✅ Loaded ${nftsWithUserInfo.length} NFTs for collection`);

        return nftsWithUserInfo;
    } catch (error) {
        console.error(`❌ Error loading collection NFTs:`, error);
        return [];
    }
};

export default {
    loadUserCollections,
    loadCollectionNFTs
};
