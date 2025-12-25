# WalletConnect API Endpoints Reference

## Base URL

All endpoints are prefixed with:
```
https://backend-url/api
```

---

## Authentication

All endpoints (except health check) require Bearer token authentication:

```
Authorization: Bearer <matrix_access_token>
```

---

## Table of Contents

1. [Payment Endpoints](#payment-endpoints)
2. [Authentication Endpoints](#authentication-endpoints)
3. [Error Handling](#error-handling)
4. [Response Codes](#response-codes)

---

## Payment Endpoints

### 1. Request Transaction Signature

Request a transaction signature from the user's connected wallet.

**Endpoint:** `POST /payment/walletconnect/request-signature`

**Authentication:** Required (Bearer token)

**Request Body:**

```json
{
  "transaction": {
    "TransactionType": "Payment",
    "Account": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
    "Destination": "rDN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRT",
    "Amount": "1000000",
    "Fee": "12",
    "Sequence": 42,
    "LastLedgerSequence": 8820051
  },
  "userAddress": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
  "sessionId": "abcd1234ef5678...",
  "paymentId": 123
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| transaction | Object | Yes | XRPL transaction object |
| transaction.TransactionType | String | Yes | Type of transaction (e.g., "Payment", "TrustSet") |
| transaction.Account | String | Yes | Sending account address |
| transaction.Destination | String | Yes | Destination account address |
| transaction.Amount | String/Object | Yes | Amount to send (in drops for XRP, or issued currency object) |
| transaction.Fee | String | Yes | Transaction fee in drops |
| transaction.Sequence | Number | Yes | Account sequence number |
| transaction.LastLedgerSequence | Number | Yes | Maximum ledger index for transaction |
| userAddress | String | No* | XRPL wallet address of the user |
| sessionId | String | No* | WalletConnect session topic/ID |
| paymentId | Number | No | Database ID of the payment record |

*Either `userAddress` or `sessionId` must be provided.

**Example cURL:**

```bash
curl -X POST https://backend-url/api/payment/walletconnect/request-signature \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": {
      "TransactionType": "Payment",
      "Account": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
      "Destination": "rDN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRT",
      "Amount": "1000000",
      "Fee": "12",
      "Sequence": 42,
      "LastLedgerSequence": 8820051
    },
    "userAddress": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
    "paymentId": 123
  }'
```

**Success Response (200):**

```json
{
  "success": true,
  "signedTransaction": "1200002280000000240000002E61400000000F42400...",
  "txHash": "E1234567890ABCDEF...",
  "paymentId": 123
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": "User rejected signature"
}
```

**Error Response (401):**

```json
{
  "success": false,
  "error": "User not authenticated"
}
```

**Error Response (422):**

```json
{
  "success": false,
  "error": "Either userAddress or sessionId is required"
}
```

---

### 2. Confirm Transaction

Confirm that a transaction has been submitted to XRPL. This grants credits/subscriptions to the user.

**Endpoint:** `POST /payment/walletconnect/confirm-transaction`

**Authentication:** Required (Bearer token)

**Request Body:**

```json
{
  "paymentId": 123,
  "txHash": "E1234567890ABCDEF...",
  "ledgerIndex": 8820051,
  "status": "success"
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| paymentId | Number | Yes | Database ID of the payment record |
| txHash | String | Yes | Transaction hash from XRPL |
| ledgerIndex | Number | No | Ledger index where transaction was confirmed |
| status | String | No | Transaction status ("success" or "failed") |

**Example cURL:**

```bash
curl -X POST https://backend-url/api/payment/walletconnect/confirm-transaction \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentId": 123,
    "txHash": "E1234567890ABCDEF...",
    "ledgerIndex": 8820051,
    "status": "success"
  }'
```

**Success Response (200):**

```json
{
  "success": true,
  "paymentId": 123,
  "txHash": "E1234567890ABCDEF...",
  "creditGranted": 100,
  "newBalance": 500
}
```

**For Subscription Payments:**

```json
{
  "success": true,
  "paymentId": 456,
  "txHash": "E9876543210ABCDEF...",
  "subscriptionId": 2,
  "expiresAt": "2025-03-25T10:30:00.000Z"
}
```

**Error Response (404):**

```json
{
  "success": false,
  "error": "Payment 123 not found"
}
```

---

### 3. Get Transaction Status

Retrieve the current status of a transaction.

**Endpoint:** `GET /payment/walletconnect/transaction-status/:paymentId`

**Authentication:** Required (Bearer token)

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| paymentId | Number | Database ID of the payment record |

**Example cURL:**

```bash
curl -X GET https://backend-url/api/payment/walletconnect/transaction-status/123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Success Response (200):**

```json
{
  "success": true,
  "paymentId": 123,
  "status": "confirmed",
  "txHash": "E1234567890ABCDEF...",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "confirmedAt": "2025-01-15T10:35:00.000Z",
  "error": null
}
```

**Status Values:**

| Status | Description |
|--------|-------------|
| pending_signature | Waiting for user to sign transaction |
| pending_submission | Transaction signed, waiting to be submitted to XRPL |
| confirmed | Transaction confirmed on XRPL |
| failed | Transaction failed or was rejected |

**Error Response (404):**

```json
{
  "success": false,
  "error": "Payment 123 not found"
}
```

---

### 4. Get Active Sessions

Get all active WalletConnect sessions for the authenticated user.

**Endpoint:** `GET /payment/walletconnect/sessions`

**Authentication:** Required (Bearer token)

**Example cURL:**

```bash
curl -X GET https://backend-url/api/payment/walletconnect/sessions \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Success Response (200):**

```json
{
  "success": true,
  "sessions": [
    {
      "topic": "abcd1234ef5678...",
      "accounts": ["xrpl:0:rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH"],
      "chainId": "xrpl:0",
      "expiresAt": 1735689000000
    }
  ]
}
```

---

### 5. Health Check

Check if WalletConnect service is running and accessible.

**Endpoint:** `GET /payment/walletconnect/health`

**Authentication:** Not required

**Example cURL:**

```bash
curl -X GET https://backend-url/api/payment/walletconnect/health
```

**Success Response (200):**

```json
{
  "success": true,
  "healthy": true
}
```

**Error Response (500):**

```json
{
  "success": false,
  "error": "Health check failed"
}
```

---

## Authentication Endpoints

### 1. Verify WalletConnect Session

Verify a WalletConnect session and authenticate the user.

**Endpoint:** `POST /auth/walletconnect/verify-session`

**Authentication:** Not required (for initial login)

**Request Body:**

```json
{
  "sessionId": "abcd1234ef5678...",
  "userAddress": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH"
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sessionId | String | Yes | WalletConnect session topic |
| userAddress | String | Yes | XRPL wallet address |

**Example cURL:**

```bash
curl -X POST https://backend-url/api/auth/walletconnect/verify-session \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "abcd1234ef5678...",
    "userAddress": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH"
  }'
```

**Success Response (200):**

```json
{
  "success": true,
  "user": {
    "id": 42,
    "address": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
    "displayName": "User_rN7n7otQD"
  }
}
```

**Error Response (401):**

```json
{
  "success": false,
  "error": "Invalid or expired session"
}
```

---

## Error Handling

### Common Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK - Request succeeded | Transaction confirmed |
| 400 | Bad Request | Missing required field |
| 401 | Unauthorized | Invalid token or session expired |
| 404 | Not Found | Payment ID not found |
| 422 | Unprocessable | Validation error |
| 500 | Server Error | WalletConnect service unavailable |

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Session not found | User didn't connect wallet or session expired | Request user to reconnect wallet |
| User not authenticated | No valid auth token provided | Call verify-session first or login |
| Invalid transaction | Missing or malformed transaction object | Verify transaction structure |
| User rejected signature | User clicked "Reject" in wallet | Allow user to retry |
| WalletConnect service unavailable | Service is down or unreachable | Retry or fall back to Xumm |

---

## Response Codes Summary

### Success Codes (2xx)

- **200 OK**: Request successful
- **201 Created**: Resource created successfully

### Client Error Codes (4xx)

- **400 Bad Request**: Invalid request format or missing required fields
- **401 Unauthorized**: Authentication token missing, invalid, or expired
- **403 Forbidden**: User doesn't have permission for this action
- **404 Not Found**: Resource (payment, session) not found
- **422 Unprocessable Entity**: Request validation failed

### Server Error Codes (5xx)

- **500 Internal Server Error**: Unexpected server error
- **503 Service Unavailable**: WalletConnect service is down

---

## Best Practices

### 1. Error Handling in Frontend

```javascript
try {
  const response = await fetch('/api/payment/walletconnect/request-signature', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestData)
  })
  
  const result = await response.json()
  
  if (!result.success) {
    if (result.error.includes('rejected')) {
      // User rejected in wallet - allow retry
      showRetryButton()
    } else if (result.error.includes('Session')) {
      // Session expired - request reconnect
      redirectToWalletConnect()
    } else {
      // Other error
      showError(result.error)
    }
  }
} catch (error) {
  // Network error
  showError('Network error, please try again')
}
```

### 2. Transaction Status Polling

```javascript
async function pollTransactionStatus(paymentId) {
  const maxAttempts = 30 // 5 minutes with 10s interval
  let attempts = 0
  
  while (attempts < maxAttempts) {
    const response = await fetch(
      `/api/payment/walletconnect/transaction-status/${paymentId}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    )
    
    const result = await response.json()
    
    if (result.status === 'confirmed') {
      return result
    }
    
    if (result.status === 'failed') {
      throw new Error(result.error)
    }
    
    attempts++
    await delay(10000) // Wait 10 seconds
  }
  
  throw new Error('Transaction confirmation timeout')
}
```

### 3. Timeout Handling

```javascript
// Signature request has 2-minute timeout
const signaturePromise = fetch('/api/payment/walletconnect/request-signature', {
  // ... options
})

const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Signature request timeout')), 120000)
)

try {
  const result = await Promise.race([signaturePromise, timeoutPromise])
} catch (error) {
  if (error.message === 'Signature request timeout') {
    // User took too long to sign
    showMessage('Please sign faster next time')
  }
}
```

---

## Migration from Xumm to WalletConnect

### Detecting User's Wallet Provider

The user's wallet provider is available in the profile data (`auth_provider`):

- `xumm`: Use Xumm QR flow
- `walletconnect`: Use WalletConnect signing flow

### Frontend Detection

```javascript
// Get user profile
const response = await fetch('/api/users', {
  headers: { 'Authorization': `Bearer ${token}` }
})

const user = await response.json()

if (user.auth_provider === 'walletconnect') {
  // Use WalletConnect flow
  initiateWalletConnectSignature()
} else {
  // Use Xumm QR flow
  initiateXummPayment()
}
```

---

## Examples

### Complete Payment Flow (WalletConnect)

```javascript
// 1. Create payment record (backend)
const createPaymentResponse = await fetch('/api/payment/create', {
  method: 'POST',
  body: JSON.stringify({
    address: userAddress,
    credit: creditId,
    sessionId: walletConnectSessionId
  })
})
const payment = await createPaymentResponse.json()

// 2. Request signature
const signResponse = await fetch('/api/payment/walletconnect/request-signature', {
  method: 'POST',
  body: JSON.stringify({
    transaction: preparedTransaction,
    userAddress: userAddress,
    sessionId: walletConnectSessionId,
    paymentId: payment.id
  })
})
const signResult = await signResponse.json()

// 3. Submit to XRPL (backend does this)
// Backend receives signed transaction and submits

// 4. Confirm on completion
const confirmResponse = await fetch('/api/payment/walletconnect/confirm-transaction', {
  method: 'POST',
  body: JSON.stringify({
    paymentId: payment.id,
    txHash: result.hash,
    ledgerIndex: result.ledger_index
  })
})
const confirmResult = await confirmResponse.json()
// User now has credits!
```

---

## Troubleshooting

### Issue: "WalletConnect service not running"

**Solution:** 
- Verify `WALLETCONNECT_SERVICE_URL` environment variable is set
- Check that xrpl-wallet-connect service is running
- Verify network connectivity between backend and WalletConnect service

### Issue: "Session not found"

**Solution:**
- Ensure user completed WalletConnect login flow
- Check that session hasn't expired
- Call `/payment/walletconnect/sessions` to verify active sessions

### Issue: "Transaction signature timeout"

**Solution:**
- Increase timeout value on frontend (currently 120 seconds)
- Check user's wallet is responsive
- Retry the signature request

### Issue: "Invalid transaction"

**Solution:**
- Verify all required transaction fields are present
- Check sequence number is current
- Validate XRPL addresses format

---

## Support

For issues or questions:
1. Check error messages and response codes
2. Review this documentation
3. Check WalletConnect service logs
4. Contact backend team

