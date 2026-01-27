# 🚀 Quick Start Guide - Dhali Migration

## ⚡ 3-Step Setup

### Step 1: Get Your Dhali Payment Claim
1. Visit https://dhali.io
2. Sign up or log in
3. Copy your **Payment-Claim** token

### Step 2: Update `.env`
Open `e:\OLD\OctoProject\NFT-Widget\.env` and replace:
```env
REACT_APP_DHALI_PAYMENT_CLAIM=YOUR_DHALI_PAYMENT_CLAIM_HERE
```
with your actual token:
```env
REACT_APP_DHALI_PAYMENT_CLAIM=your_actual_token_here
```

### Step 3: Test the App
```bash
npm start
```

---

## 🎯 What Changed?

### ✅ New Files (3)
- `src/services/dhaliService.js` - Dhali API wrapper
- `src/services/metadataResolver.js` - IPFS/Arweave metadata resolver
- `src/services/nftCollectionService.js` - Collection grouping & caching

### ✏️ Updated Files (4)
- `src/services/xrplService.js` - Now uses Dhali for offers
- `src/components/MatrixClientProvider.jsx` - Now uses Dhali for NFTs
- `src/config.js` - Added Dhali config
- `.env` - Added Dhali payment claim

---

## 💰 Cost Savings

| **Before (Bithomp)** | **After (Dhali)** |
|---------------------|------------------|
| $50-100/month | ~$1-10/month |
| Fixed subscription | Pay-per-call |
| **SAVE 99%** 🎉 |

---

## 🧪 Quick Test Checklist

After starting the app, verify:

- [ ] **My NFTs** tab loads and displays collections
- [ ] NFT images load correctly
- [ ] **Offers** tab shows incoming/outgoing offers
- [ ] No console errors about authentication
- [ ] Load time is reasonable (<10s first load, <2s cached)

---

## ❗ Troubleshooting

### Error: "Dhali payment claim is not configured"
**Solution**: Make sure you set `REACT_APP_DHALI_PAYMENT_CLAIM` in `.env` and restart the app.

### Error: "Dhali API: 401 Unauthorized"
**Solution**: Your payment claim is invalid or expired. Get a new one from dhali.io.

### Slow Loading (>20 seconds)
**Cause**: IPFS metadata resolution on first load
**Solution**: Wait for cache to build. Subsequent loads will be fast.

### Images Not Loading
**Cause**: IPFS gateway timeout
**Solution**: The app tries 4 gateways automatically. Wait or refresh.

---

## 📞 Need Help?

1. Check console for error messages
2. Verify Dhali payment claim is valid
3. Review full documentation: `DHALI_MIGRATION_COMPLETE.md`

---

**Ready?** Add your Dhali payment claim to `.env` and run `npm start`! 🚀
