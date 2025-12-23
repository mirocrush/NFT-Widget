# NFT Transfer Workflow - Detailed Analysis

## Overview
The NFT transfer workflow in this P2P-NFT widget involves creating an NFT offer with zero amount (amount="0") to transfer NFT ownership from one user to another on the XRP Ledger.

---

## Complete Transfer Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER INITIATES TRANSFER                      │
│                                                                     │
│  1. Opens NFT Modal (clicks on NFT in "MyNFTs" page)              │
│  2. Clicks "Gift" or "Transfer" tab                               │
│  3. Selects recipient user from dropdown                          │
│  4. Clicks "Create Transfer Offer" button                         │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              FRONTEND: NFTModal Component (NFTModal/index.jsx)       │
│                                                                     │
│  handleTransfer() function executes:                              │
│  ├─ Validates selectedUser is not "all"                          │
│  ├─ Gets destination address from Matrix userId                  │
│  ├─ Converts @user:domain to wallet address                      │
│  └─ Extracts local part of MXID                                 │
│                                                                   │
│  Creates Payload:                                                 │
│  {                                                                │
│    nft: nft.nftokenID,        // NFT identifier                  │
│    amount: "0",               // 🔑 KEY: Zero amount = Transfer  │
│    receiver: destinationAddr, // Target user wallet              │
│    sender: myWalletAddress    // Sender's wallet                 │
│  }                                                                │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                  API CALL: /create-nft-offer                        │
│                (Backend Service)                                    │
│                                                                     │
│  Method: POST                                                      │
│  URL: ${API_URLS.backendUrl}/create-nft-offer                    │
│  Content-Type: application/json                                    │
│  Body: { nft, amount: "0", receiver, sender }                    │
│                                                                     │
│  Backend Actions:                                                  │
│  ├─ Validates sender wallet & NFT ownership                      │
│  ├─ Checks mCredit balance (requires credits)                    │
│  ├─ Creates XRPL NFTCreateOffer transaction:                     │
│  │   - Flags: 0 (for buy offer when amount="0")                 │
│  │   - TakerPays: NFT Token ID                                   │
│  │   - TakerGets: 0 (zero XRP = direct transfer)                │
│  │   - Destination: recipient wallet                            │
│  ├─ Generates XUMM QR code for signing                          │
│  └─ Creates WebSocket for real-time status updates              │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│             BACKEND RESPONSE (Success)                              │
│                                                                     │
│  {                                                                  │
│    result: "success",                                             │
│    refs: {                                                         │
│      qr_png: "https://qr.xrpl.ws/...",   // QR code image       │
│      websocket_status: "wss://..."        // WebSocket URL       │
│    }                                                               │
│  }                                                                  │
│                                                                     │
│  On Error:                                                         │
│  {                                                                  │
│    result: "NotEnoughCredit"  // Insufficient mCredits           │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│            FRONTEND: TransactionModal Shows QR Code                 │
│                                                                     │
│  Component: TransactionModal (TransactionModal/index.jsx)          │
│  ├─ Displays QR code image from qr_png URL                       │
│  ├─ Shows status: "Scan QR to Sign Transaction"                  │
│  ├─ Icon shows Loader (spinning) - waiting for signature          │
│  └─ User scans QR with XUMM wallet app                           │
│                                                                     │
│  State Management:                                                 │
│  ├─ qrCodeUrl: URL of QR image                                   │
│  ├─ websocketUrl: WebSocket endpoint                             │
│  ├─ transactionStatus: Current status message                    │
│  ├─ isQrModalVisible: Modal visibility                           │
│  └─ wsRef: WebSocket connection reference                        │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│           USER ACTION: Scans QR Code with XUMM Wallet              │
│                                                                     │
│  Flow:                                                              │
│  1. User opens XUMM wallet app on mobile                          │
│  2. Scans QR code displayed on screen                             │
│  3. XUMM retrieves transaction details                            │
│  4. User reviews transfer in XUMM app                             │
│  5. User confirms/signs transaction in XUMM                       │
│  6. Signed transaction sent to XRPL                               │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│          WEBSOCKET: Real-time Status Updates (WebSocket)            │
│                                                                     │
│  Connection: WebSocket listener in NFTModal/OutgoingOfferCard      │
│                                                                     │
│  Possible Messages:                                                 │
│  ├─ signed: true         → "Transaction signed" → Success ✅      │
│  ├─ rejected: true       → "Transaction declined" → Failed ❌     │
│  ├─ cancelled/expired    → "Transaction cancelled"                 │
│  └─ errors               → "Connection error"                      │
│                                                                     │
│  On Signature Received (signed=true):                              │
│  ├─ Close QR modal                                                 │
│  ├─ Show success toast: "Transaction completed successfully!"     │
│  ├─ Call /deduct-mCredit endpoint                                 │
│  ├─ Deduct mCredit balance from account                          │
│  └─ Ready for next action                                         │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              XRPL LEDGER: Transaction Confirmed                     │
│                                                                     │
│  Transaction Type: NFTCreateOffer                                  │
│  ├─ Account: Sender (original NFT owner)                          │
│  ├─ Destination: Receiver (new NFT owner)                         │
│  ├─ NFTokenID: <token_id>                                         │
│  ├─ Amount: 0 (drops - zero XRP)                                  │
│  ├─ Flags: 0 (buy offer)                                          │
│  └─ Status: Validated ✓                                           │
│                                                                     │
│  On Ledger:                                                         │
│  ├─ Offer created with offerIndex                                 │
│  ├─ Receiver can now accept offer                                │
│  ├─ Offer expires after 24 hours if not accepted                 │
│  └─ Transfer recorded on blockchain                               │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│        RECIPIENT: Incoming Transfer Appears in "Offers" Tab         │
│                                                                     │
│  Component: IncomingTransferToggle (IncomingTransferToggle/...)     │
│                                                                     │
│  Flow:                                                              │
│  1. Page/Offers fetches offers via Bithomp API                    │
│  2. getNFTOffers() called with list: 'privatelyOfferedToAddress' │
│  3. Filters for offers with amount="0"                            │
│  4. Displays in "Incoming Transfers" section                      │
│                                                                     │
│  Data Structure:                                                    │
│  {                                                                  │
│    offer: {                                                        │
│      offerId: "123456",                                           │
│      amount: "0",                    // 🔑 KEY identifier          │
│      offerOwner: "rXXX...",         // Sender wallet              │
│      offerOwnerName: "John",         // Sender name               │
│      nftokenID: "nft_id"             // NFT to receive            │
│    },                                                              │
│    nft: {                                                          │
│      metadata: {                                                   │
│        name: "Cool NFT",                                          │
│        image: "https://..."                                       │
│      }                                                             │
│    }                                                               │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│       RECIPIENT ACCEPTS: IncomingOfferCard Accept Button            │
│                                                                     │
│  Component: IncomingOfferCard (IncomingOfferCard/index.jsx)         │
│  Function: onAcceptTransfer()                                      │
│                                                                     │
│  Creates Request Body:                                             │
│  {                                                                  │
│    address: myWalletAddress,  // Recipient wallet                 │
│    OfferId: transfer.offer.offerId,  // Offer to accept          │
│    buyOrSell: 0               // 0 = buy offer (from XRPL side)   │
│  }                                                                  │
│                                                                     │
│  Backend Endpoint: /accept-offer                                   │
│  Method: POST                                                      │
│  Purpose: Create NFTCancelOffer or accept on XRPL                 │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              BACKEND: /accept-offer Processing                      │
│                                                                     │
│  Backend Actions:                                                  │
│  ├─ Validates recipient wallet & offer ID                         │
│  ├─ Checks mCredit balance                                        │
│  ├─ Creates XRPL NFTCreateOffer (counter offer):                 │
│  │   - Flags: 1 (sell offer)                                      │
│  │   - Amount: 0 (matches original)                               │
│  │   - Destination: Original sender                              │
│  │   - References: Original offer ID                             │
│  ├─ Generates XUMM QR code                                        │
│  └─ Returns WebSocket connection                                  │
│                                                                     │
│  Response Format:                                                   │
│  {                                                                  │
│    result: "success",                                             │
│    refs: {                                                         │
│      qr_png: "https://qr.xrpl.ws/...",                          │
│      websocket_status: "wss://..."                               │
│    }                                                               │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│       RECIPIENT SCANS QR & SIGNS with XUMM Wallet                  │
│                                                                     │
│  Same as Sender signing flow:                                      │
│  1. QR modal appears with new QR code                             │
│  2. User scans with XUMM wallet                                   │
│  3. XUMM shows transaction details                                │
│  4. User signs in XUMM app                                        │
│  5. Signed transaction sent to XRPL                               │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│           XRPL: Counter-Offer Acceptance & NFT Transfer            │
│                                                                     │
│  Ledger Operations:                                                │
│  ├─ Recipient's counter-offer matches original offer              │
│  ├─ XRPL automatically matches the two offers                     │
│  ├─ NFT ownership transferred to recipient                        │
│  ├─ Original offer removed from ledger                            │
│  ├─ Counter-offer removed from ledger                             │
│  └─ Transaction confirmed on blockchain ✓                         │
│                                                                     │
│  Result on XRPL:                                                   │
│  ├─ NFT owner changed from sender to recipient                    │
│  ├─ Both accounts charged minimal XRP for fees                    │
│  ├─ mCredit deducted from recipient account                       │
│  └─ Transaction recorded permanently                              │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│         UI: Transfer Completion & State Updates                     │
│                                                                     │
│  After WebSocket receives signed=true:                             │
│  ├─ IncomingOfferCard closes QR modal                             │
│  ├─ Shows success toast message                                   │
│  ├─ Calls /deduct-mCredit endpoint                                │
│  ├─ Refreshes offers list                                         │
│  ├─ Removed from "Incoming Transfers" section                     │
│  ├─ NFT now appears in recipient's "MyNFTs" page                  │
│  └─ Room message sent to Matrix (optional)                        │
│                                                                     │
│  Room Message:                                                      │
│  "🔔NFT Accept Transfer Offer Created                             │
│   [Recipient] accepted transfer offer from [Sender]                │
│   for [NFT Name]"                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Components in Transfer Workflow

### 1. **NFTModal Component** (`src/components/NFTModal/index.jsx`)
**Responsibility**: Transfer initiation UI

```javascript
handleTransfer = async () => {
  // ✓ Select recipient user
  // ✓ Build payload with amount="0"
  // ✓ Call /create-nft-offer backend endpoint
  // ✓ Display QR modal
}

Payload Structure:
{
  nft: nft.nftokenID,           // NFT to transfer
  amount: "0",                   // 🔑 Zero = Transfer (not sale)
  receiver: destinationAddr,     // Recipient wallet
  sender: myWalletAddress        // Your wallet
}
```

### 2. **IncomingTransferToggle** (`src/components/IncomingTransferToggle/index.jsx`)
**Responsibility**: Display incoming transfers

```javascript
// Filters offers with amount="0"
const filteredTransfers = incomingTransfers.filter(
  (transfer) => transfer.offer.amount === "0"
);

// Identifies as transfer (not sale) by the zero amount
```

### 3. **IncomingOfferCard** (`src/components/IncomingOfferCard/index.jsx`)
**Responsibility**: Accept/Reject incoming transfers

```javascript
onAcceptTransfer = async () => {
  // ✓ Create counter-offer
  // ✓ Call /accept-offer endpoint
  // ✓ Display QR for signing
  // ✓ Listen on WebSocket for confirmation
  // ✓ Deduct mCredits
}

Payload:
{
  address: myWalletAddress,      // Your wallet
  OfferId: offer.offerId,        // Original offer ID
  buyOrSell: 0                   // Accept as buyer
}
```

### 4. **OutgoingTransferToggle** (`src/components/OutgoingTransferToggle/index.jsx`)
**Responsibility**: Show pending outgoing transfers

```javascript
// Filters own offers with amount="0"
const filteredTransfers = outgoingTransfers.filter(
  (transfer) => transfer.offer.amount === "0"
);
```

### 5. **TransactionModal** (`src/components/TransactionModal/index.jsx`)
**Responsibility**: Display QR code for XUMM signing

```javascript
// Shows spinning loader while waiting
// Displays QR code from backend
// Waits for WebSocket confirmation
```

### 6. **OutgoingOfferCard** (`src/components/OutgoingOfferCard/index.jsx`)
**Responsibility**: Cancel/manage outgoing transfers

```javascript
onRejectTransfer = async () => {
  // Call /cancel-nft-offer-with-sign
  // Display QR for cancellation
}
```

---

## Data Flow: Offer Detection

### How Backend Identifies Transfer vs Sale

```javascript
// In Bithomp API / XRPL:
getAllNFTOffers(walletAddress) {
  // Get 3 types of offers:
  
  1. userCreatedOffers (default list)
  2. counterOffers (on user's NFTs)
  3. privateOffers (list: 'privatelyOfferedToAddress')
}

// In UI Components:
const isTRANSFER = offer.amount === "0"
const isMAKE_OFFER = offer.amount > "0"
```

### XRPL NFTCreateOffer Flags

| Amount | Flags | Type          | Direction    |
|--------|-------|---------------|--------------|
| 0      | 0     | Transfer      | Buy (Create) |
| 0      | 1     | Transfer      | Sell (Accept)|
| X      | 0     | Buy Offer     | -            |
| X      | 1     | Sell Offer    | -            |

---

## Sequence Diagram

```
Sender                Browser              Backend              XRPL              Receiver
  │                     │                    │                   │                  │
  │  Opens NFT Modal    │                    │                   │                  │
  │────────────────────>│                    │                   │                  │
  │                     │  Selects Recipient │                   │                  │
  │                     │  Clicks Transfer   │                   │                  │
  │                     │  Creates payload   │                   │                  │
  │                     │  (amount="0")      │                   │                  │
  │                     │                    │                   │                  │
  │                     │  POST /create-nft-offer                │                  │
  │                     │───────────────────>│                   │                  │
  │                     │                    │  Create NFT Offer │                  │
  │                     │                    │  Generate QR      │                  │
  │                     │                    │───────────────────>                  │
  │                     │<───── QR Code ─────│                   │                  │
  │                     │<───── WebSocket ───│                   │                  │
  │                     │                    │                   │                  │
  │  Scans QR w/XUMM    │ Displays QR Modal  │                   │                  │
  │<────────────────────│                    │                   │                  │
  │  Signs in XUMM      │                    │                   │                  │
  │──────────────────────────────────────────────────────────────>                  │
  │                     │                    │                   │  Ledger commits  │
  │                     │<──────── WebSocket confirmation ───────│                  │
  │                     │  signed=true       │                   │                  │
  │                     │                    │                   │                  │
  │                     │  Close QR Modal    │                   │                  │
  │                     │  Show Success      │                   │                  │
  │                     │  Call /deduct-mCredit                  │                  │
  │                     │───────────────────>│                   │                  │
  │                     │                    │                   │                  │
  │                     │                    │                   │  Fetch offers    │
  │                     │                    │                   │<────────────────│
  │                     │                    │                   │                  │
  │                     │                    │                   │  Transfer appears│
  │                     │                    │                   │  in Incoming     │
  │                     │                    │                   │  Transfers       │
  │                     │                    │                   │                  │
  │                     │                    │                   │  Scans QR        │
  │                     │                    │                   │  (Accept)        │
  │                     │                    │                   │<────────────────│
  │                     │                    │                   │                  │
  │                     │                    │                   │  Ledger: NFT    │
  │                     │                    │                   │  transferred ✓   │
  │                     │                    │                   │                  │
  └                     └                    └                   └                  └
```

---

## Critical Points

### 1. **Amount = "0" is the Transfer Identifier**
- Any offer with `amount="0"` on the XRPL is identified as a transfer
- Sales/trades have `amount > 0`
- UI filters offers based on this field

### 2. **mCredit System**
- Creating an offer requires mCredits (soft currency)
- Backend validates and deducts credits
- Users must buy mCredits if balance is insufficient
- Error: `"NotEnoughCredit"` returned if insufficient

### 3. **XUMM Wallet Integration**
- All XRPL transactions signed via XUMM mobile wallet
- QR code generated by backend (XUMM API)
- WebSocket tracks signing status in real-time
- User never shares private keys with web app

### 4. **Bidirectional Offer Exchange**
- **Sender creates offer** (flags=0, amount="0") - Buy offer
- **Recipient creates counter-offer** (flags=1, amount="0") - Sell offer
- When both exist, XRPL auto-matches them
- NFT transferred, both offers removed

### 5. **Matrix/Room Integration**
- Each transfer broadcasts notification to Matrix room
- Room message documents who transferred what to whom
- Searchable history in Matrix client
- Off-chain coordination of on-chain transfers

### 6. **Offer Lifecycle**
- Offers expire after 24 hours if not accepted
- Can be cancelled by offer creator anytime
- Cancellation also requires signature + mCredit
- Cancelled offers removed from ledger

---

## Error Handling

### Possible Error States

1. **NotEnoughCredit** → User needs to buy mCredits
2. **Invalid Wallet** → Address format incorrect
3. **WebSocket Error** → Connection lost during signing
4. **Transaction Rejected** → User rejected in XUMM
5. **User Not Found** → Selected recipient doesn't exist
6. **NFT Not Owned** → Sender doesn't own the NFT

### Recovery Flow

```
Error occurs
    ↓
Show error toast message
    ↓
Close QR modal (if open)
    ↓
Clear pending state
    ↓
Allow user to retry or cancel
    ↓
Return to original page
```

---

## State Management

### useState Variables in IncomingOfferCard

```javascript
const [qrCodeUrl, setQrCodeUrl]              // QR image URL
const [websocketUrl, setWebsocketUrl]        // WS connection
const [transactionStatus, setTransactionStatus]  // Status text
const [isQrModalVisible, setIsQrModalVisible]    // Show/hide QR
const [pendingOfferAction, setPendingOfferAction] // Current action
const [roomMessage, setRoomMessage]          // Matrix notification
const [sendRoomMsg, setSendRoomMsg]          // Trigger message send
const [isMessageBoxVisible, setIsMessageBoxVisible] // Error/success
const [messageBoxType, setMessageBoxType]    // error/success/info
const [messageBoxText, setMessageBoxText]    // Message content
```

### useRef for WebSocket

```javascript
const wsRef = useRef(null)  // Persistent WS connection handle
// Allows closing connection without re-renders
```

---

## Summary

The NFT transfer workflow is a elegant two-stage offer mechanism where:

1. **Sender** creates an offer with `amount="0"` targeting a specific recipient
2. **Recipient** accepts by creating a matching counter-offer
3. **XRPL** automatically matches and executes the swap
4. **Blockchain** records permanent ownership change

The entire process is secured by the XUMM wallet signing requirement and tracked via WebSocket for immediate feedback to the user.
