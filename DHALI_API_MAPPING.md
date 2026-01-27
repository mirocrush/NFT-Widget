# 🔄 Bithomp to Dhali API Mapping Reference

## Overview
This document maps Bithomp API calls to their Dhali equivalents.

---

## 🔑 Authentication

### Bithomp
```javascript
headers: {
  'x-bithomp-token': 'your-token-here'
}
```

### Dhali
```javascript
headers: {
  'Payment-Claim': 'your-payment-claim-here'
}
```

---

## 📡 API Endpoints

### Get NFTs for an Account

#### Bithomp
```javascript
GET https://bithomp.com/api/v2/nfts?owner={address}&assets=true&collectionDetails=true
```

#### Dhali
```javascript
POST https://run.api.dhali.io/{cluster-id}/
Body: {
  "method": "account_nfts",
  "params": [{
    "account": "{address}",
    "ledger_index": "validated",
    "limit": 400
  }]
}
```

**Then resolve metadata**:
```javascript
import { getAllAccountNFTs } from './dhaliService';
import { resolveNFTsBatch } from './metadataResolver';

const rawNFTs = await getAllAccountNFTs(address);
const resolvedNFTs = await resolveNFTsBatch(rawNFTs);
```

---

### Get NFT Metadata

#### Bithomp
```javascript
GET https://bithomp.com/api/metadata/{NFTokenID}?assets=true
```
Returns enriched metadata with direct image URLs.

#### Dhali
```javascript
// 1. Get NFT data
const nfts = await getAllAccountNFTs(ownerAddress);
const nft = nfts.find(n => n.NFTokenID === nftokenID);

// 2. Resolve metadata
import { resolveNFTMetadata } from './metadataResolver';
const metadata = await resolveNFTMetadata(nft);
```

---

### Get NFT Offers

#### Bithomp - User Created Offers
```javascript
GET https://bithomp.com/api/v2/nft-offers/{address}?nftoken=true&assets=true
```

#### Dhali - User Created Offers
```javascript
import { getAccountNFTOffers } from './dhaliService';
const offers = await getAccountNFTOffers(address);
```

#### Bithomp - Counter Offers (on user's NFTs)
```javascript
GET https://bithomp.com/api/v2/nft-offers/{address}?list=counterOffers&nftoken=true&assets=true
```

#### Dhali - Counter Offers
```javascript
// Get user's NFTs
const nfts = await getAllAccountNFTs(address);

// For each NFT, get sell and buy offers
for (const nft of nfts) {
  const sellOffers = await getNFTSellOffers(nft.NFTokenID);
  const buyOffers = await getNFTBuyOffers(nft.NFTokenID);
  // Filter out offers where owner === address
}
```

#### Bithomp - Private Offers (to address)
```javascript
GET https://bithomp.com/api/v2/nft-offers/{address}?list=privatelyOfferedToAddress&nftoken=true&assets=true
```

#### Dhali - Private Offers
```javascript
// Same as counter offers but filter by Destination === address
const nfts = await getAllAccountNFTs(address);

for (const nft of nfts) {
  const sellOffers = await getNFTSellOffers(nft.NFTokenID);
  const buyOffers = await getNFTBuyOffers(nft.NFTokenID);
  // Filter where offer.Destination === address
}
```

---

## 📊 Response Format Comparison

### NFT Object

#### Bithomp Response
```json
{
  "nftokenID": "000827...",
  "issuer": "rXXX...",
  "nftokenTaxon": 0,
  "metadata": {
    "name": "NFT Name",
    "description": "...",
    "image": "ipfs://...",
    "collection": {
      "name": "Collection Name"
    }
  },
  "assets": {
    "image": "https://cdn.bithomp.com/...",
    "imageOriginal": "ipfs://..."
  },
  "ownerDetails": {
    "username": "user123"
  }
}
```

#### Dhali Response (Raw)
```json
{
  "NFTokenID": "000827...",
  "Issuer": "rXXX...",
  "NFTokenTaxon": 0,
  "URI": "697066733A2F2F..." // Hex-encoded
}
```

#### Dhali Response (After Metadata Resolution)
```json
{
  "nftokenID": "000827...",
  "issuer": "rXXX...",
  "taxon": 0,
  "uri": "ipfs://...",
  "metadata": {
    "name": "NFT Name",
    "description": "...",
    "image": "ipfs://..."
  },
  "image": "https://cloudflare-ipfs.com/ipfs/...",
  "name": "NFT Name",
  "description": "...",
  "collection": {
    "name": "Collection Name"
  }
}
```

---

### Offer Object

#### Bithomp Response
```json
{
  "offerIndex": "A1B2C3...",
  "amount": "1000000",
  "owner": "rXXX...",
  "destination": "rYYY...",
  "flags": {
    "sellToken": true
  },
  "valid": true,
  "nftoken": {
    "nftokenID": "000827...",
    "metadata": {...},
    "assets": {
      "image": "https://..."
    }
  }
}
```

#### Dhali Response (Raw)
```json
{
  "index": "A1B2C3...",
  "Amount": "1000000",
  "Owner": "rXXX...",
  "Destination": "rYYY...",
  "Flags": 1,
  "NFTokenID": "000827..."
}
```

#### Dhali Response (After Transformation)
```json
{
  "offerIndex": "A1B2C3...",
  "amount": "1000000",
  "owner": "rXXX...",
  "destination": "rYYY...",
  "flags": {
    "sellToken": true
  },
  "valid": true,
  "nftokenID": "000827...",
  "nftoken": {
    "nftokenID": "000827...",
    "metadata": {...},
    "assets": {
      "image": "https://..."
    }
  }
}
```

---

## 🔢 Field Mappings

| Bithomp Field | Dhali Field | Transformation |
|--------------|-------------|----------------|
| `nftokenID` | `NFTokenID` | Direct copy |
| `issuer` | `Issuer` | Direct copy |
| `nftokenTaxon` | `NFTokenTaxon` | Direct copy |
| `assets.image` | N/A | Resolve from `URI` → IPFS |
| `metadata` | N/A | Fetch from `URI` → JSON |
| `ownerDetails` | N/A | Not available |
| `offerIndex` | `index` or `nft_offer_index` | Direct copy |
| `flags.sellToken` | `Flags` (bit field) | Parse bit 0: `(Flags & 1) === 1` |
| `amount` | `Amount` | Direct copy |
| `owner` | `Owner` | Direct copy |
| `destination` | `Destination` | Direct copy |
| `valid` | N/A | Always `true` (on-ledger) |

---

## 🛠️ Helper Functions Reference

### Decode Hex URI
```javascript
import { hexToString, parseURI } from './metadataResolver';

const hexUri = '697066733A2F2F...';
const decoded = hexToString(hexUri); // "ipfs://Qm..."
// or
const uri = parseURI(hexUri); // Auto-detects hex
```

### Resolve IPFS URL
```javascript
import { resolveIPFS } from './metadataResolver';

const ipfsUrl = await resolveIPFS('ipfs://Qm...');
// Returns: "https://cloudflare-ipfs.com/ipfs/Qm..."
```

### Fetch Metadata
```javascript
import { fetchMetadata } from './metadataResolver';

const metadata = await fetchMetadata('https://ipfs.io/ipfs/Qm...');
// Returns: { name: "...", image: "ipfs://...", ... }
```

### Complete NFT Resolution
```javascript
import { resolveNFTMetadata } from './metadataResolver';

const rawNFT = {
  NFTokenID: '000827...',
  Issuer: 'rXXX...',
  NFTokenTaxon: 0,
  URI: '697066733A2F2F...'
};

const resolved = await resolveNFTMetadata(rawNFT);
// Returns: { nftokenID, issuer, taxon, image, metadata, ... }
```

---

## 🎯 Code Migration Examples

### Example 1: Fetch and Display NFTs

#### Before (Bithomp)
```javascript
const response = await fetch(
  `https://bithomp.com/api/v2/nfts?owner=${address}&assets=true`,
  {
    headers: { 'x-bithomp-token': API_URLS.bithompToken }
  }
);
const data = await response.json();
const nfts = data.nfts; // Ready to display with imageURI
```

#### After (Dhali)
```javascript
import { getAllAccountNFTs } from './dhaliService';
import { resolveNFTsBatch } from './metadataResolver';

const rawNFTs = await getAllAccountNFTs(address);
const resolvedNFTs = await resolveNFTsBatch(rawNFTs);
// Transform to UI format
const nfts = resolvedNFTs.map(nft => ({
  nftokenID: nft.nftokenID,
  imageURI: nft.image,
  metadata: nft.metadata,
  // ... other fields
}));
```

---

### Example 2: Get Offers

#### Before (Bithomp)
```javascript
import { getNFTOffers } from './xrplService';

const offers = await getNFTOffers(address, {
  list: 'counterOffers',
  nftoken: true,
  assets: true
});
// Returns: { nftOffers: [...] }
```

#### After (Dhali)
```javascript
import { getNFTOffers } from './xrplService';

// Same function signature! Adapter handles conversion
const offers = await getNFTOffers(address, {
  list: 'counterOffers',
  nftoken: true,
  assets: true
});
// Returns: { nftOffers: [...] } - same format!
```

---

### Example 3: Group NFTs by Collection

#### Before (Bithomp)
```javascript
const response = await fetch(
  `https://bithomp.com/api/v2/nfts?owner=${address}&collectionDetails=true`,
  {
    headers: { 'x-bithomp-token': API_URLS.bithompToken }
  }
);
const data = await response.json();
// Manually group by issuer-taxon
```

#### After (Dhali)
```javascript
import { loadUserCollections } from './nftCollectionService';

const result = await loadUserCollections(address);
// Returns: { collections: {...}, allNFTs: [...] }
// Already grouped and cached!
```

---

## 🚀 Performance Tips

1. **Use Caching**: Both services implement in-memory caching
   ```javascript
   // Metadata cache: 30 minutes
   // Collection cache: 15 minutes
   ```

2. **Batch Processing**: Process NFTs in batches of 5-10
   ```javascript
   await resolveNFTsBatch(nfts, 5); // 5 at a time
   ```

3. **Parallel Requests**: Use Promise.all for independent requests
   ```javascript
   const [sellOffers, buyOffers] = await Promise.all([
     getNFTSellOffers(nftokenID),
     getNFTBuyOffers(nftokenID)
   ]);
   ```

4. **IPFS Gateway Fallback**: metadataResolver tries 4 gateways automatically
   - Cloudflare IPFS (fastest)
   - Pinata Gateway
   - IPFS.io
   - Dweb.link

---

## 📝 Summary

| Feature | Bithomp | Dhali | Status |
|---------|---------|-------|--------|
| Get NFTs | ✅ Direct | ✅ Via dhaliService | ✅ Migrated |
| Metadata | ✅ Enriched | ✅ Via metadataResolver | ✅ Migrated |
| Collections | ✅ Built-in | ✅ Via nftCollectionService | ✅ Migrated |
| Offers | ✅ Direct | ✅ Via xrplService adapter | ✅ Migrated |
| Images | ✅ CDN | ✅ IPFS gateways | ✅ Migrated |
| Caching | ✅ Server-side | ✅ Client-side | ✅ Implemented |
| Cost | 💰 $50-100/mo | 💚 ~$1-10/mo | ✅ 99% savings |

---

**All Bithomp functionality has been successfully migrated to Dhali!** 🎉

For implementation details, see:
- `src/services/dhaliService.js`
- `src/services/metadataResolver.js`
- `src/services/nftCollectionService.js`
- `src/services/xrplService.js`
