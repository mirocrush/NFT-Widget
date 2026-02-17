
---

## Transaction Endpoints

### 1. Create NFT Sell Offer / Transfer Offer

**Endpoint:** `POST /create-nft-offer`

**Description:** Creates a sell offer for an NFT or transfers NFT to another user (transfer is sell offer with amount "0")

**Request Payload:**
```json
{
  "nft": "000827104193C1C2C66296370099C0C1FD5D87EF89F67C7F00000001",
  "amount": "5.000012",           // XRP amount as string, or "0" for transfer
  "receiver": "rReceiverAddress", // XRPL address or "all" for public listing
  "sender": "rSenderAddress"      // Seller's XRPL address
}
```

**Alternative Amount Format (IOU/Token):**
```json
{
  "nft": "000827104193C1C2C66296370099C0C1FD5D87EF89F67C7F00000001",
  "amount": {
    "currency": "USD",
    "value": "100",
    "issuer": "rIssuerAddress"
  },
  "receiver": "rReceiverAddress",
  "sender": "rSenderAddress"
}
```

**Use Cases:**
- **Sell Offer (Private):** `receiver` = specific XRPL address, `amount` > 0
- **Sell Offer (Public):** `receiver` = "all", `amount` > 0
- **Transfer (Gift):** `receiver` = specific XRPL address, `amount` = "0"

**Response:** [Success Response](#1-success-response-direct-signing) or [QR Code Response](#2-qr-code-response-xumm-signing-required)

**XRPL Transaction Type:** `NFTokenCreateOffer` with `Flags: 1` (tfSellNFToken)

**mCredit Offer Types:**
- `create_sell_offer` - Paid sell offer
- `create_transfer_offer` - Free transfer (amount = "0")

---

### 2. Create NFT Buy Offer

**Endpoint:** `POST /create-nft-buy-offer`

**Description:** Creates a buy offer for an NFT owned by another user

**Request Payload:**
```json
{
  "nft": "000827104193C1C2C66296370099C0C1FD5D87EF89F67C7F00000001",
  "amount": "5.000012",        // XRP amount as string
  "account": "rBuyerAddress",  // Buyer's XRPL address
  "owner": "rOwnerAddress"     // Current NFT owner's XRPL address
}
```

**Alternative Amount Format (IOU/Token):**
```json
{
  "nft": "000827104193C1C2C66296370099C0C1FD5D87EF89F67C7F00000001",
  "amount": {
    "currency": "USD",
    "value": "100",
    "issuer": "rIssuerAddress"
  },
  "account": "rBuyerAddress",
  "owner": "rOwnerAddress"
}
```

**Response:** [Success Response](#1-success-response-direct-signing) or [QR Code Response](#2-qr-code-response-xumm-signing-required)

**XRPL Transaction Type:** `NFTokenCreateOffer` with `Flags: 0` (buy offer)

**mCredit Offer Type:** `create_buy_offer`

---

### 3. Accept Offer (Sell or Transfer)

**Endpoint:** `POST /accept-offer`

**Description:** Accepts an incoming sell offer or transfer offer using NFTokenAcceptOffer

**Request Payload:**
```json
{
  "address": "rAcceptorAddress",  // Address accepting the offer
  "OfferId": "A1B2C3D4E5F6...",   // XRPL offer index to accept
  "buyOrSell": 0                  // 0 = accepting sell offer, 1 = accepting buy offer
}
```

**Response:** [Success Response](#success-response) or [QR Code Response](#qr-code-response) or [Crossmark Response](#crossmark-unsigned-transaction-response)

**XRPL Transaction Type:** `NFTokenAcceptOffer`

**mCredit Offer Types:**
- `accept_sell_offer` - Accepting a sell offer
- `accept_transfer_offer` - Accepting a free transfer

**Notes:**
- When `buyOrSell = 0`, the acceptor is buying the NFT (accepting a sell offer)
- The acceptor pays the amount specified in the sell offer
- When user's wallet is Crossmark, returns unsigned tx instead of QR code

---

### 4. Broker Accept Offer (Match Buy & Sell)

**Endpoint:** `POST /broker-accept-offer`

**Description:** Matches a buy offer with a sell offer using brokered mode (NFTokenAcceptOffer with both offers)

**Request Payload:**
```json
{
  "owner": "rOwnerAddress",           // NFT owner's address
  "nftId": "000827104193C1C2C66...",  // NFT ID
  "buyOfferId": "BuyOfferIndex",      // Buy offer index
  "sellOfferId": "SellOfferIndex",    // Sell offer index
  "brokerFee": "5000"                 // Broker fee in drops (optional)
}
```

**Response:**
```json
{
  "result": {
    "meta": {
      "TransactionResult": "tesSUCCESS"
    },
    "hash": "TransactionHash",
    // ... full XRPL transaction result
  }
}
```

**XRPL Transaction Type:** `NFTokenAcceptOffer` with both `NFTokenBuyOffer` and `NFTokenSellOffer` fields

**mCredit Offer Type:** `broker_accept_offer`

**Notes:**
- This endpoint uses brokered mode to match pre-existing buy and sell offers
- The broker can optionally take a fee
- Transaction is submitted directly (no QR code flow)
- Owner must have a sell offer and buyer must have a buy offer for the same NFT

---

### 5. Cancel NFT Offer

**Endpoint:** `POST /cancel-nft-offer-with-sign`

**Description:** Cancels an existing NFT offer (sell, buy, or transfer)

**Request Payload:**
```json
{
  "address": "rCancellerAddress",    // Address that created the offer
  "NFTokenOffers": ["OfferIndex1"]   // Array of offer indices to cancel
}
```

**Response:** [Success Response](#1-success-response-direct-signing) or [QR Code Response](#2-qr-code-response-xumm-signing-required)

**XRPL Transaction Type:** `NFTokenCancelOffer`

**mCredit Offer Types:**
- `cancel_sell_offer` - Cancelling a sell offer
- `cancel_transfer_offer` - Cancelling a transfer offer
- `cancel_offer` - General offer cancellation

**Notes:**
- `NFTokenOffers` array can contain multiple offer indices to cancel in one transaction
- Only the offer creator can cancel their offers

---

## Credit Management

### Deduct mCredit

**Endpoint:** `POST /deduct-mCredit`

**Description:** Deducts mCredits from user account after successful transaction

**Request Payload:**
```json
{
  "account": "rUserAddress",
  "offerType": "create_buy_offer"
}
```

**Offer Types & Costs:**
```javascript
{
  "create_sell_offer": 100,         // Creating a sell offer
  "create_buy_offer": 100,          // Creating a buy offer
  "create_transfer_offer": 0,       // Free transfer (amount = "0")
  "accept_sell_offer": 50,          // Accepting a sell offer
  "accept_transfer_offer": 0,       // Accepting a free transfer
  "cancel_sell_offer": 25,          // Cancelling a sell offer
  "cancel_transfer_offer": 25,      // Cancelling a transfer offer
  "cancel_offer": 25,               // General offer cancellation
  "broker_accept_offer": 75,        // Brokered transaction
  "auto_create_sell_offer": 100     // Auto-created sell offer before accepting buy
}
```

**Response:**
```json
{
  "success": true,
  "newBalance": 450,
  "deducted": 100
}
```

**Notes:**
- This endpoint is called AFTER a transaction succeeds
- It's called from the client side after receiving success confirmation
- Transfer offers (amount = "0") are free and don't deduct credits

---

## WebSocket Protocol

When a QR Code response is returned, the client establishes a WebSocket connection to monitor transaction status.

### WebSocket URL
```
wss://xumm.app/sign/{UUID}
```

### WebSocket Messages

#### Success Message
```json
{
  "signed": true,
  "txid": "TransactionHash"
}
```

#### Rejection/Cancellation Message
```json
{
  "signed": false,
  "rejected": true,
  "reason": "User declined"
}
```

**Alternative Cancellation Formats:**
```json
"declined"
"rejected"
"cancelled"
"expired"
```

### Client WebSocket Handling

```javascript
const ws = new WebSocket(websocketUrl);

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.signed === true) {
    // Transaction signed successfully
    handleSuccess();
    deductMCredit(account, offerType);
  } else if (msg.signed === false || msg.rejected) {
    // Transaction rejected
    handleRejection(msg.reason);
  }
};

ws.onerror = () => {
  // Connection error
  handleError();
};

ws.onclose = () => {
  // Connection closed
};
```

---

## Error Handling

### Common Error Scenarios

#### 1. Insufficient Funds
```json
{
  "result": "Error",
  "error": "tecUNFUNDED_OFFER",
  "message": "Account does not have enough XRP to create offer"
}
```

#### 2. Invalid Offer ID
```json
{
  "result": "Error",
  "error": "tecOBJECT_NOT_FOUND",
  "message": "Offer not found or already accepted/cancelled"
}
```

#### 3. Not NFT Owner
```json
{
  "result": "Error",
  "error": "tecNO_PERMISSION",
  "message": "Account is not the owner of this NFT"
}
```

#### 4. Invalid Amount
```json
{
  "result": "Error",
  "error": "temBAD_AMOUNT",
  "message": "Invalid offer amount"
}
```

#### 5. Duplicate Offer
```json
{
  "result": "Error",
  "error": "tecDUPLICATE",
  "message": "Offer already exists"
}
```

---

## Request/Response Examples

### Example 1: Create Sell Offer (Public Listing)

**Request:**
```bash
POST /create-nft-offer
Content-Type: application/json

{
  "nft": "000827104193C1C2C66296370099C0C1FD5D87EF89F67C7F00000001",
  "amount": "10.000012",
  "receiver": "all",
  "sender": "rN7n7otQDd6FczFgLdlqtyMVrn3HMnkfVB"
}
```

**Response (QR Code Required):**
```json
{
  "refs": {
    "qr_png": "https://xumm.app/sign/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "websocket_status": "wss://xumm.app/sign/a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  },
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

---

### Example 2: Create Buy Offer

**Request:**
```bash
POST /create-nft-buy-offer
Content-Type: application/json

{
  "nft": "000827104193C1C2C66296370099C0C1FD5D87EF89F67C7F00000001",
  "amount": "8.000012",
  "account": "rBuyerN7n7otQDd6FczFgLdlqtyMVrn3HMnkfVB",
  "owner": "rOwnerN7n7otQDd6FczFgLdlqtyMVrn3HMnkfVB"
}
```

**Response (Success):**
```json
{
  "result": "Success",
  "message": "Buy offer created successfully",
  "txHash": "A1B2C3D4E5F6789012345678901234567890ABCDEF1234567890ABCD",
  "transaction": {
    "Account": "rBuyerN7n7otQDd6FczFgLdlqtyMVrn3HMnkfVB",
    "TransactionType": "NFTokenCreateOffer",
    "NFTokenID": "000827104193C1C2C66296370099C0C1FD5D87EF89F67C7F00000001",
    "Amount": "8000012",
    "Owner": "rOwnerN7n7otQDd6FczFgLdlqtyMVrn3HMnkfVB",
    "Fee": "12",
    "Sequence": 12345,
    "Flags": 0
  }
}
```

---

### Example 3: Transfer NFT (Free)

**Request:**
```bash
POST /create-nft-offer
Content-Type: application/json

{
  "nft": "000827104193C1C2C66296370099C0C1FD5D87EF89F67C7F00000001",
  "amount": "0",
  "receiver": "rReceiverN7n7otQDd6FczFgLdlqtyMVrn3HMnkfVB",
  "sender": "rSenderN7n7otQDd6FczFgLdlqtyMVrn3HMnkfVB"
}
```

**Response (QR Code):**
```json
{
  "refs": {
    "qr_png": "https://xumm.app/sign/transfer-uuid",
    "websocket_status": "wss://xumm.app/sign/transfer-uuid"
  },
  "uuid": "transfer-uuid"
}
```

**Note:** Transfer offers with `amount: "0"` do NOT deduct mCredits (free)

---

### Example 4: Accept Sell Offer

**Request:**
```bash
POST /accept-offer
Content-Type: application/json

{
  "address": "rBuyerN7n7otQDd6FczFgLdlqtyMVrn3HMnkfVB",
  "OfferId": "E6F7890123456789012345678901234567890ABCDEF1234567890ABCDE",
  "buyOrSell": 0
}
```

**Response (QR Code):**
```json
{
  "refs": {
    "qr_png": "https://xumm.app/sign/accept-uuid",
    "websocket_status": "wss://xumm.app/sign/accept-uuid"
  },
  "uuid": "accept-uuid"
}
```

---

### Example 5: Broker Match Buy & Sell

**Request:**
```bash
POST /broker-accept-offer
Content-Type: application/json

{
  "owner": "rOwnerN7n7otQDd6FczFgLdlqtyMVrn3HMnkfVB",
  "nftId": "000827104193C1C2C66296370099C0C1FD5D87EF89F67C7F00000001",
  "buyOfferId": "BuyOfferIndex123",
  "sellOfferId": "SellOfferIndex456",
  "brokerFee": "10000"
}
```

**Response (Direct Success):**
```json
{
  "result": {
    "meta": {
      "TransactionResult": "tesSUCCESS",
      "TransactionIndex": 5,
      "AffectedNodes": [...]
    },
    "hash": "BROKERTXHASH1234567890ABCDEF",
    "ledger_index": 85000000
  }
}
```

---

### Example 6: Cancel Offer

**Request:**
```bash
POST /cancel-nft-offer-with-sign
Content-Type: application/json

{
  "address": "rN7n7otQDd6FczFgLdlqtyMVrn3HMnkfVB",
  "NFTokenOffers": ["OfferIndexToCancel123"]
}
```

**Response (QR Code):**
```json
{
  "refs": {
    "qr_png": "https://xumm.app/sign/cancel-uuid",
    "websocket_status": "wss://xumm.app/sign/cancel-uuid"
  },
  "uuid": "cancel-uuid"
}
```

---

### Example 7: Insufficient mCredits

**Request:**
```bash
POST /create-nft-buy-offer
Content-Type: application/json

{
  "nft": "000827104193C1C2C66296370099C0C1FD5D87EF89F67C7F00000001",
  "amount": "5.000012",
  "account": "rN7n7otQDd6FczFgLdlqtyMVrn3HMnkfVB",
  "owner": "rOwnerAddress"
}
```

**Response:**
```json
{
  "result": "NotEnoughCredit",
  "message": "User does not have enough mCredits",
  "required": 100,
  "available": 25
}
```

---

## Implementation Notes

### Amount Formatting

**XRP Amounts:**
- Frontend sends: `"5.000012"` (string with 6 decimal places)
- Backend converts to drops: `5000012` (multiply by 1,000,000)
- Add 12 drops for transaction fee: `amount * 1000000 + 12`

**IOU/Token Amounts:**
```json
{
  "currency": "USD",
  "value": "100.50",
  "issuer": "rIssuerAddress"
}
```

### Offer Type Detection

```javascript
// Frontend logic for offer type:
if (amount === "0") {
  offerType = "create_transfer_offer";  // Free transfer
} else if (receiver !== "all" && isSellOffer) {
  offerType = "create_sell_offer";      // Private sell
} else if (receiver === "all") {
  offerType = "create_sell_offer";      // Public sell
} else {
  offerType = "create_buy_offer";       // Buy offer
}
```

### Transaction Flow Summary

```
1. Client sends transaction request to backend
2. Backend validates request
3. Backend checks user mCredits (if applicable)
4. Backend creates XRPL transaction
5A. Direct Signing Path:
   - Backend signs with hot wallet
   - Returns success with txHash
   - Client calls deduct-mCredit
5B. XUMM QR Path:
   - Backend creates XUMM payload
   - Returns QR code + WebSocket URL
   - Client shows QR code
   - User scans & signs in XUMM
   - WebSocket notifies client of result
   - Client calls deduct-mCredit on success
5C. Crossmark Path:
   - Backend prepares unsigned transaction
   - Returns { result: "Success", wallet_provider: "crossmark", transaction: {...}, operation_id: N }
   - Client detects wallet_provider === "crossmark"
   - Client calls window.crossmark.signAndSubmit(transaction)
   - Crossmark extension popup appears for user to approve
   - Crossmark signs and submits to XRPL ledger
   - Client receives txHash from Crossmark callback
   - Client calls deduct-mCredit on success
   - If failed/expired: backend refunds reserved credits via operation_id
```

---

### Crossmark Unsigned Transaction Response

When a user's wallet provider is Crossmark, ALL transaction endpoints return this format instead of QR code:

```json
{
  "result": "Success",
  "wallet_provider": "crossmark",
  "operation_id": 4,
  "transaction": {
    "TransactionType": "NFTokenAcceptOffer",
    "Account": "rUserAddress",
    "NFTokenSellOffer": "8FCE709B8379E44DAE6897527B843F9CF201F023A7D57BEE08C25F6CB705611E",
    "Memos": [
      {
        "Memo": {
          "MemoData": "50325020547261646520506F776572656420627920546578745250"
        }
      }
    ],
    "Flags": 0,
    "Sequence": 101981739,
    "Fee": "12",
    "LastLedgerSequence": 102308648
  },
  "expiry_seconds": 300,
  "last_ledger_sequence": 102308648,
  "message": "Please sign this transaction in your Crossmark wallet. Credits have been reserved and will be refunded if the transaction fails or expires."
}
```

**Key Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `result` | string | Always `"Success"` (means backend prepared OK, not that tx is done) |
| `wallet_provider` | string | `"crossmark"` — frontend uses this to detect Crossmark path |
| `operation_id` | number | Backend-assigned ID; used to refund credits if tx expires |
| `transaction` | object | **Unsigned** XRPL transaction — pass directly to Crossmark |
| `expiry_seconds` | number | Seconds before transaction expires on ledger (usually 300 = 5 min) |
| `last_ledger_sequence` | number | Transaction is invalid after this ledger closes |

**Frontend Handling:**
```javascript
// Detection
const isCrossmarkResponse = (data) =>
  data?.result === "Success" && data?.wallet_provider === "crossmark" && data?.transaction;

// Signing
window.xrpl.crossmark.signAndSubmit(data.transaction, (error, response) => {
  if (error) { handleError(error); return; }
  const txResult = response?.response?.data?.resp?.result;
  if (txResult?.meta?.TransactionResult === "tesSUCCESS") {
    handleSuccess(txResult.hash);
    deductMCredit(account, offerType);
  } else {
    handleError(txResult?.meta?.TransactionResult);
  }
});
```

**Important Notes:**
- `result: "Success"` means the backend **prepared** the transaction, NOT that it was submitted
- The transaction is only final after the user signs it in Crossmark AND it's included in a ledger
- If the user ignores the Crossmark popup or the ledger sequence expires, the backend will automatically refund reserved credits using `operation_id`
- The `LastLedgerSequence` in the transaction ensures it can't be submitted after expiry

---

## Security Considerations

1. **Validate all XRPL addresses** before creating transactions
2. **Check NFT ownership** before creating sell offers
3. **Verify offer existence** before accepting
4. **Rate limit** transaction endpoints to prevent spam
5. **Validate amounts** are positive and within acceptable ranges
6. **Check mCredit balance** BEFORE creating XUMM payload (avoid wasted QR scans)
7. **Implement idempotency** to prevent duplicate transactions
8. **Log all transactions** for auditing and debugging
9. **Handle WebSocket disconnections** gracefully
10. **Sanitize error messages** to avoid exposing sensitive information

---

## Testing Checklist

- [ ] Create sell offer (public)
- [ ] Create sell offer (private)
- [ ] Create buy offer
- [ ] Transfer NFT (amount = "0")
- [ ] Accept sell offer
- [ ] Accept transfer offer
- [ ] Broker match (buy + sell)
- [ ] Cancel sell offer
- [ ] Cancel buy offer
- [ ] Cancel transfer offer
- [ ] Insufficient mCredits handling
- [ ] Invalid NFT ID handling
- [ ] Invalid offer ID handling
- [ ] Not owner error handling
- [ ] XUMM QR flow (scan & sign)
- [ ] XUMM rejection flow
- [ ] WebSocket connection handling
- [ ] mCredit deduction after success
- [ ] Crossmark response detection (`wallet_provider === "crossmark"`)
- [ ] Crossmark signing popup appears
- [ ] Crossmark success → mCredit deducted
- [ ] Crossmark rejection → error shown
- [ ] Crossmark extension not installed → user-friendly error
- [ ] Crossmark tx expiry → backend refunds credits via operation_id

---

## Additional Resources

- **XRPL Documentation:** https://xrpl.org/nftoken.html
- **NFTokenCreateOffer:** https://xrpl.org/nftokenccreateoffer.html
- **NFTokenAcceptOffer:** https://xrpl.org/nftokenacceptoffer.html
- **NFTokenCancelOffer:** https://xrpl.org/nftokencanceloffer.html
- **XUMM API:** https://xumm.readme.io/

---

**Document Version:** 1.0
**Last Updated:** 2026-02-16
**Maintained By:** Frontend Development Team
