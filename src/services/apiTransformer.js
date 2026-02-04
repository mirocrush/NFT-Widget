/**
 * ============================================================================
 * API TRANSFORMATION LAYER
 * ============================================================================
 * Transforms new Dhali REST API responses to match current UI expectations
 * Maintains backward compatibility with existing code
 * ============================================================================
 */

/**
 * Transform NFT from new Dhali API format to UI-compatible format
 * @param {Object} nft - NFT from new Dhali API
 * @returns {Object} Transformed NFT for UI
 */
export const transformNFTToUIFormat = (nft) => {
  if (!nft) return null;

  return {
    // ===== Legacy PascalCase fields (for backward compatibility) =====
    NFTokenID: nft.nftokenID,
    Issuer: nft.issuer,
    NFTokenTaxon: nft.nftokenTaxon,
    URI: nft.uri,

    // ===== Modern camelCase fields =====
    nftokenID: nft.nftokenID,
    issuer: nft.issuer,
    nftokenTaxon: nft.nftokenTaxon,
    uri: nft.uri,
    url: nft.url,

    // ===== Primary image field (UI expects this) =====
    imageURI: nft.assets?.image || nft.assets?.preview || nft.metadata?.image || "",

    // ===== Metadata =====
    metadata: nft.metadata || {},
    name: nft.metadata?.name || "Unknown NFT",
    description: nft.metadata?.description || "",
    attributes: nft.metadata?.attributes || [],

    // ===== Assets (CDN URLs) =====
    assets: {
      image: nft.assets?.image || null,
      preview: nft.assets?.preview || null,
      thumbnail: nft.assets?.thumbnail || null
    },

    // ===== Collection Info =====
    collection: nft.collection || `${nft.issuer}:${nft.nftokenTaxon}`,
    collectionName: nft.metadata?.collection?.name ||
                    nft.metadata?.name ||
                    `Collection ${nft.nftokenTaxon}`,
    collectionInfo: nft.metadata?.collection ? {
      name: nft.metadata.collection.name,
      family: nft.metadata.collection.family
    } : null,

    // ===== Owner Info =====
    owner: nft.owner,
    ownerWallet: nft.owner,
    ownerDetails: nft.ownerDetails || { username: null, service: null },

    // ===== Timestamps =====
    issuedAt: nft.issuedAt,
    ownerChangedAt: nft.ownerChangedAt,
    deletedAt: nft.deletedAt,

    // ===== Additional Info =====
    mintedByMarketplace: nft.mintedByMarketplace,
    flags: nft.flags || {},
    transferFee: nft.transferFee,
    sequence: nft.sequence,
    nftSerial: nft.nftSerial,

    // ===== Issuer Details =====
    issuerDetails: nft.issuerDetails || { username: null, service: null },

    // ===== Type Info =====
    type: nft.type || "xls20",
    jsonMeta: nft.jsonMeta || false
  };
};

/**
 * Transform array of NFTs
 * @param {Array} nfts - Array of NFTs from new Dhali API
 * @returns {Array} Transformed NFTs
 */
export const transformNFTsToUIFormat = (nfts) => {
  if (!Array.isArray(nfts)) return [];
  return nfts.map(transformNFTToUIFormat).filter(Boolean);
};

/**
 * Transform offer from new Dhali API format to UI-compatible format
 * @param {Object} offer - Offer from new Dhali API
 * @returns {Object} Transformed offer for UI
 */
export const transformOfferToUIFormat = (offer) => {
  if (!offer) return null;

  return {
    offer: {
      offerId: offer.offerIndex,
      offerIndex: offer.offerIndex, // Keep both for compatibility
      amount: offer.amount,
      offerOwner: offer.account || offer.owner,
      account: offer.account || offer.owner,
      owner: offer.owner,
      nftId: offer.nftokenID,
      nftokenID: offer.nftokenID,
      isSell: offer.flags?.sellToken || false,
      destination: offer.destination,
      createdAt: offer.createdAt,
      createdLedgerIndex: offer.createdLedgerIndex,
      createdTxHash: offer.createdTxHash,
      expiration: offer.expiration,
      valid: true, // New API only returns valid offers
      flags: offer.flags
    },
    nft: {
      // Transform the nested nftoken object
      ...(offer.nftoken ? transformNFTToUIFormat(offer.nftoken) : {
        nftokenID: offer.nftokenID,
        NFTokenID: offer.nftokenID,
        metadata: { name: "Unknown NFT" },
        imageURI: null
      })
    }
  };
};

/**
 * Transform array of offers
 * @param {Array} offers - Array of offers from new Dhali API
 * @returns {Array} Transformed offers
 */
export const transformOffersToUIFormat = (offers) => {
  if (!Array.isArray(offers)) return [];
  return offers.map(transformOfferToUIFormat).filter(Boolean);
};

/**
 * Transform new Dhali API collection response
 * @param {Object} apiResponse - Response from /nfts endpoint
 * @returns {Object} Transformed response
 */
export const transformCollectionResponse = (apiResponse) => {
  if (!apiResponse) return { nfts: [], total: 0 };

  return {
    type: apiResponse.type,
    list: apiResponse.list,
    owner: apiResponse.owner,
    ownerDetails: apiResponse.ownerDetails,
    order: apiResponse.order,
    nfts: transformNFTsToUIFormat(apiResponse.nfts || []),
    limit: apiResponse.limit,
    marker: apiResponse.marker,
    total: apiResponse.nfts?.length || 0
  };
};

/**
 * Transform new Dhali API offers response
 * @param {Object} apiResponse - Response from /nft-offers endpoint
 * @returns {Object} Transformed response
 */
export const transformOffersResponse = (apiResponse) => {
  if (!apiResponse) return { nftOffers: [], total: 0 };

  return {
    owner: apiResponse.owner,
    list: apiResponse.list,
    ownerDetails: apiResponse.ownerDetails,
    nftOffers: transformOffersToUIFormat(apiResponse.nftOffers || []),
    total: apiResponse.nftOffers?.length || 0
  };
};

export default {
  transformNFTToUIFormat,
  transformNFTsToUIFormat,
  transformOfferToUIFormat,
  transformOffersToUIFormat,
  transformCollectionResponse,
  transformOffersResponse
};
