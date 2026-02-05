# 🎯 Detailed Migration Plan: Old API → New Dhali API

## 📊 Executive Summary

This document provides a comprehensive migration plan to transition from the **old API structure** to the **new Dhali REST API** tested with payment claim.

**API Tested:**
```
https://run.api.dhali.io/d995db530-7e57-46d1-ac8a-76324794e0c9/nfts?owner={address}&assets=true
```

**Test Results:** ✅ **API Working Perfectly**
- Pre-resolved metadata ✅
- CDN-hosted assets ✅
- Rich additional data ✅

---

## 🔬 API Response Analysis

### **Test 1: NFTs Endpoint**

**Request:**
```bash
GET /nfts?owner=rhnJFje9AvnRHB5aG8QPTgsuPS1gkZWSqG&assets=true&limit=5
Headers: Payment-Claim: {token}
```

**Response Structure:**
```typescript
{
  type: "xls20",
  list: "nfts",
  owner: "rhnJFje9AvnRHB5aG8QPTgsuPS1gkZWSqG",
  ownerDetails: {
    username: null,
    service: null
  },
  order: "mintedOld",
  nfts: [
    {
      type: "xls20",
      flags: {
        burnable: boolean,
        onlyXRP: boolean,
        trustLine: boolean,
        transferable: boolean,
        mutable: boolean
      },
      issuer: "rhqqMgMYtUu8qMnxMrZ216ZeuRFrmonYdJ",
      nftokenID: "000827102A24B5A29CB415BF89A68FC2C44E148DB61D10A6A4DA1192050231F6",
      nftokenTaxon: 3,
      transferFee: 10000,
      sequence: 84029942,
      owner: "rhnJFje9AvnRHB5aG8QPTgsuPS1gkZWSqG",
      uri: "697066733A2F2F...",  // Hex encoded
      nftSerial: 84029942,
      issuedAt: 1718630960,
      ownerChangedAt: 1769652912,
      deletedAt: null,
      mintedByMarketplace: "xrp.cafe",
      collection: "rhqqMgMYtUu8qMnxMrZ216ZeuRFrmonYdJ:3",
      url: "https://ipfs.io/ipfs/bafybeianofnkltuk7qyhq43rltpqr235dfdy4jn64i3rk5rcxjl5kxhiem/2341.json",
      metadata: {
        name: "X-Shaman #2341",
        description: "...",
        image: "ipfs://bafybeic2q2m6c3lym3fmalgjrui7kpk54r6rvtuyxesv4m2fh67udqfksy/2341.png",
        edition: 2341,
        attributes: [
          {
            trait_type: "Primary Theme",
            value: "Pink"
          }
        ]
      },
      jsonMeta: true,
      assets: {
        image: "https://cdn.bithomp.com/image/bafybeic2q2m6c3lym3fmalgjrui7kpk54r6rvtuyxesv4m2fh67udqfksy%2F2341.png",
        preview: "https://cdn.bithomp.com/preview/bafybeic2q2m6c3lym3fmalgjrui7kpk54r6rvtuyxesv4m2fh67udqfksy%2F2341.png",
        thumbnail: "https://cdn.bithomp.com/thumbnail/bafybeic2q2m6c3lym3fmalgjrui7kpk54r6rvtuyxesv4m2fh67udqfksy%2F2341.png"
      },
      issuerDetails: {
        username: null,
        service: null
      },
      ownerDetails: {
        username: null,
        service: null
      }
    }
  ],
  limit: 5
}
```

### **Test 2: Offers Endpoint**

**Request:**
```bash
GET /nft-offers/{address}?nftoken=true&assets=true
Headers: Payment-Claim: {token}
```

**Response Structure:**
```typescript
{
  owner: "rhnJFje9AvnRHB5aG8QPTgsuPS1gkZWSqG",
  list: "offers",
  ownerDetails: {
    username: null,
    service: null
  },
  nftOffers: [
    {
      type: "xls20",
      nftokenID: "0008271005ECDB63C36C15BAAF49634CA2D7C65D9ADDD1DD864A4F3B05A2CF96",
      offerIndex: "853E7EEA2CC975FAC2770147DBA3C4CAF437316D915D86910EA5E86FC08DC99A",
      createdAt: 1769657371,
      createdLedgerIndex: 101879290,
      createdTxHash: "BAAE1009A128366DEB9E7726C90ACCC5B73DA552CBEA364C1B899BF08C198E39",
      account: "rhnJFje9AvnRHB5aG8QPTgsuPS1gkZWSqG",
      owner: "rhnJFje9AvnRHB5aG8QPTgsuPS1gkZWSqG",
      destination: "r9ukPqsBE5B3Sdf3asPnXWLUYVpGihJTYc",
      expiration: null,
      amount: "1012",
      flags: {
        sellToken: true
      },
      // ⭐ FULL NFT DATA INCLUDED!
      nftoken: {
        type: "xls20",
        flags: {...},
        issuer: "rYL3n9Ufc3W6ZHarPKEPZaF9gZruhRZkw",
        nftokenID: "0008271005ECDB63C36C15BAAF49634CA2D7C65D9ADDD1DD864A4F3B05A2CF96",
        nftokenTaxon: 10,
        transferFee: 10000,
        sequence: 94556054,
        owner: "rhnJFje9AvnRHB5aG8QPTgsuPS1gkZWSqG",
        uri: "697066733A2F2F...",
        metadata: {
          name: "XDawg2875",
          description: "...",
          image: "ipfs://...",
          attributes: [...]
        },
        assets: {
          image: "https://cdn.bithomp.com/image/...",
          preview: "https://cdn.bithomp.com/preview/...",
          thumbnail: "https://cdn.bithomp.com/thumbnail/..."
        },
        collection: "rYL3n9Ufc3W6ZHarPKEPZaF9gZruhRZkw:10",
        mintedByMarketplace: "xrp.cafe"
      },
      accountDetails: {...},
      ownerDetails: {...},
      destinationDetails: {...}
    }
  ]
}