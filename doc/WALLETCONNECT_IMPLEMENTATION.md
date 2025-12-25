# WalletConnect Implementation Guide

## Overview

This document outlines the WalletConnect integration for XRPL-based transactions in the TextRP backend. WalletConnect enables users to sign transactions using their mobile wallet without storing private keys on the backend.

---

## 1. Architecture Comparison

### 1.1 Xumm/Xaman Flow (Current)

```
Frontend → Backend (creates payload) → Xumm SDK (generates QR) → Frontend (displays QR)
                                                                 ↓
                                                          User scans with Xaman
                                                                 ↓
User signs in Xaman ← Xumm Payload (awaits signature)
                                                                 ↓
        Xumm Webhook ← Backend (verifies signature)
                                                                 ↓
         Transaction Recorded
```

**Key Characteristics:**
- Backend creates a payload with transaction details
- Xumm generates a QR code and UUID
- User scans QR with Xaman wallet
- Wallet signs the transaction
- Webhook notifies backend of completion
- Backend verifies signature and records transaction

### 1.2 WalletConnect Flow (New)

```
Frontend ← WalletConnect Service (maintains active sessions)
    ↓
Frontend (user selects wallet, initiates signing)
    ↓
Backend (prepares transaction) → WalletConnect Service (requests signature)
    ↓
WalletConnect Service ← User's wallet (via web socket/bridge)
    ↓
User signs in wallet
    ↓
Signed transaction ← WalletConnect Service → Backend
    ↓
Backend submits to XRPL (no user interaction needed)
    ↓
Transaction Confirmed
```

**Key Characteristics:**
- WalletConnect service maintains persistent sessions
- Session established during login
- Backend directly requests signature from active session
- No QR code needed (session already established)
- Wallet signing happens in user's wallet app
- Backend directly submits signed transaction to XRPL

---

## 2. Transaction Types & Workflows

### 2.1 Buy/Purchase Transaction (Payment)

**What happens:**
1. Frontend shows payment modal with token/credit offer
2. User clicks "Buy with WalletConnect"
3. Frontend calls `/payment/create` with transaction details
4. Backend prepares payment transaction
5. Backend requests signature from WalletConnect service
6. User signs in wallet
7. Backend submits signed transaction to XRPL
8. Backend records transaction and grants credits

**Status:**
- ✅ Partially implemented in `PaymentController.processWalletConnectPayment()`
- ⚠️ Needs webhook/callback for transaction confirmation
- ⚠️ WalletConnect service signature endpoint needs implementation

### 2.2 Transfer Transaction

**What happens:**
1. User initiates transfer to another address
2. Frontend calls `/payment/transfer`
3. Backend builds payment transaction
4. Backend requests signature via WalletConnect
5. User signs in wallet
6. Backend submits and records transaction

**Status:**
- ❌ Not yet implemented
- Needs new endpoint: `POST /payment/transfer`

### 2.3 Sign-In Transaction (Authentication)

**What happens:**
1. User clicks "Sign in with WalletConnect"
2. Frontend establishes WalletConnect session
3. Backend validates session and creates user record
4. User authenticated to Matrix server

**Status:**
- ✅ Frontend handles session setup
- ⚠️ Backend endpoint needs implementation
- Endpoint needed: `POST /auth/walletconnect/verify-session`

---

## 3. API Endpoints

### 3.1 Existing Endpoints (Xumm-based)

#### POST `/accounts/makeTxn/:amount`
- Creates a payment transaction for credits
- Uses Xumm flow (generates QR)
- Response: `{ uuid, qr }` for displaying QR code

#### POST `/payment/submit-signed`
- Receives webhook from Xumm
- Verifies signature
- Records payment in database

### 3.2 New WalletConnect Endpoints

#### POST `/payment/walletconnect/request-signature`
**Purpose:** Request transaction signature from connected wallet

**Request Body:**
```json
{
  "transaction": {
    "TransactionType": "Payment",
    "Account": "rXXXXX...",
    "Destination": "rYYYYY...",
    "Amount": "1000000",
    "Fee": "12",
    "Sequence": 123
  },
  "userAddress": "rXXXXX...",
  "sessionId": "abcd1234...",
  "paymentId": 456
}
```

**Response:**
```json
{
  "success": true,
  "signedTransaction": "12AB3C...",
  "txHash": "E1234567..."
}
```

**Implementation Location:** `app/Controllers/Http/User/WalletConnectController.ts`
**Handler Method:** `requestSignature()`

---

#### POST `/payment/walletconnect/confirm-transaction`
**Purpose:** Confirm transaction after submission to XRPL

**Request Body:**
```json
{
  "paymentId": 456,
  "txHash": "E1234567...",
  "ledgerIndex": 12345,
  "status": "success"
}
```

**Response:**
```json
{
  "success": true,
  "creditGranted": 100,
  "balance": 500
}
```

**Implementation Location:** `app/Controllers/Http/User/WalletConnectController.ts`
**Handler Method:** `confirmTransaction()`

---

#### POST `/auth/walletconnect/verify-session`
**Purpose:** Verify WalletConnect session and authenticate user

**Request Body:**
```json
{
  "sessionId": "abcd1234...",
  "userAddress": "rXXXXX...",
  "chainId": "xrpl:0"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 123,
    "address": "rXXXXX...",
    "displayName": "User Name"
  },
  "authToken": "matrix_access_token"
}
```

**Implementation Location:** `app/Controllers/Http/AuthController.ts`
**Handler Method:** `verifyWalletConnectSession()`

---

#### POST `/payment/transfer`
**Purpose:** Create and sign transfer transaction

**Request Body:**
```json
{
  "destination": "rYYYYY...",
  "amount": "1.5",
  "currency": "XRP",
  "memos": [{"memo_data": "hex_string"}],
  "sessionId": "abcd1234..."
}
```

**Response:**
```json
{
  "success": true,
  "paymentId": 789,
  "txHash": "E1234567..."
}
```

**Implementation Location:** `app/Controllers/Http/User/PaymentController.ts`
**Handler Method:** `transferWithWalletConnect()`

---

#### GET `/payment/walletconnect/transaction-status/:paymentId`
**Purpose:** Check transaction status

**Response:**
```json
{
  "paymentId": 456,
  "status": "pending_signature|pending_submission|confirmed|failed",
  "txHash": "E1234567...",
  "error": null
}
```

**Implementation Location:** `app/Controllers/Http/User/WalletConnectController.ts`
**Handler Method:** `getTransactionStatus()`

---

## 4. Database Schema Changes

### 4.1 Payment Table Updates

Add columns to track WalletConnect transactions:

```sql
ALTER TABLE payments ADD COLUMN (
  status ENUM('pending_signature', 'pending_submission', 'confirmed', 'failed') DEFAULT 'pending_signature',
  tx_hash VARCHAR(255) NULL,
  signed_tx LONGTEXT NULL,
  wallet_connect_session_id VARCHAR(255) NULL,
  error_message TEXT NULL,
  submitted_at TIMESTAMP NULL,
  confirmed_at TIMESTAMP NULL
);

CREATE INDEX idx_payments_tx_hash ON payments(tx_hash);
CREATE INDEX idx_payments_status ON payments(status);
```

### 4.2 WalletConnect Sessions Table (Optional)

Store active WalletConnect sessions:

```sql
CREATE TABLE walletconnect_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  wallet_address VARCHAR(255) NOT NULL,
  chain_id VARCHAR(50) DEFAULT 'xrpl:0',
  session_data LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_session_id (session_id),
  INDEX idx_wallet_address (wallet_address)
);
```

---

## 5. Service Layer Implementation

### 5.1 WalletConnectService

**File:** `app/Services/WalletConnectService.ts`

```typescript
import HttpClient from '@ioc:Adonis/Core/HttpClient'
import Logger from '@ioc:Adonis/Core/Logger'
import Env from '@ioc:Adonis/Core/Env'

interface SignatureRequest {
  userAddress: string
  transaction: any
  sessionId?: string
  paymentId?: number
}

interface SignatureResponse {
  success: boolean
  signedTransaction?: string
  error?: string
  txHash?: string
}

class WalletConnectService {
  private wcServiceUrl: string

  constructor() {
    this.wcServiceUrl = Env.get('WALLETCONNECT_SERVICE_URL', 'http://localhost:3000')
  }

  /**
   * Request transaction signature from wallet
   */
  async requestSignature(request: SignatureRequest): Promise<SignatureResponse> {
    try {
      Logger.info(`Requesting signature from WalletConnect service for ${request.userAddress}`)
      
      const response = await HttpClient.post(
        `${this.wcServiceUrl}/api/walletconnect/sign-transaction`,
        request
      )

      if (!response.ok) {
        throw new Error(`WalletConnect service error: ${response.status}`)
      }

      const data = response.body as SignatureResponse
      Logger.info(`Signature received for transaction`)
      return data
    } catch (error) {
      Logger.error(error, 'WalletConnect signature request failed')
      throw error
    }
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessions(userAddress: string): Promise<any[]> {
    try {
      const response = await HttpClient.get(
        `${this.wcServiceUrl}/api/walletconnect/sessions?address=${userAddress}`
      )

      if (!response.ok) {
        return []
      }

      return response.body.sessions || []
    } catch (error) {
      Logger.warn('Failed to fetch active sessions', { userAddress })
      return []
    }
  }

  /**
   * Verify session validity
   */
  async verifySession(sessionId: string, userAddress: string): Promise<boolean> {
    try {
      const response = await HttpClient.post(
        `${this.wcServiceUrl}/api/walletconnect/verify-session`,
        { sessionId, userAddress }
      )

      return response.ok && response.body.valid === true
    } catch (error) {
      Logger.warn('Session verification failed', { sessionId })
      return false
    }
  }
}

export default new WalletConnectService()
```

### 5.2 XrplService Updates

Extend to handle WalletConnect transactions:

```typescript
/**
 * Prepare transaction for signing (without signing)
 */
async prepareTransaction(transaction: any): Promise<any> {
  const client = new xrpl.Client(this.networkUrl)
  await client.connect()
  
  try {
    const prepared = await client.autofill(transaction)
    return prepared
  } finally {
    await client.disconnect()
  }
}

/**
 * Submit pre-signed transaction to XRPL
 */
async submitSignedTransaction(signedTx: string): Promise<any> {
  const client = new xrpl.Client(this.networkUrl)
  await client.connect()
  
  try {
    const result = await client.submitAndWait(signedTx)
    return {
      txHash: result.result.hash,
      status: 'confirmed',
      ledgerIndex: result.result.ledger_index
    }
  } finally {
    await client.disconnect()
  }
}
```

---

## 6. Controller Implementation Details

### 6.1 WalletConnectController

**File:** `app/Controllers/Http/User/WalletConnectController.ts`

**Methods:**

#### `requestSignature()`
- Receives transaction from frontend
- Validates transaction structure
- Calls WalletConnectService
- Returns signed transaction or error

#### `confirmTransaction()`
- Receives transaction confirmation
- Updates payment record
- Grants credits/subscriptions
- Returns success response

#### `getTransactionStatus()`
- Queries payment record
- Returns current status
- Useful for polling on frontend

### 6.2 PaymentController Updates

**Update `processPaymentWallet()` method:**
- Route to `processWalletConnectPayment()` for WalletConnect users
- Route to `processXamanPaymentWallet()` for Xaman users

**Implement `transferWithWalletConnect()`:**
- Similar to payment but for user-to-user transfers
- No platform fee deduction
- Direct XRPL submission

---

## 7. Error Handling

### 7.1 Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Session not found | User didn't connect wallet | Frontend: show reconnect prompt |
| Session expired | Timeout between login and transaction | Frontend: request re-authentication |
| Invalid transaction | Bad transaction parameters | Backend: validate before sending to wallet |
| User denied signature | User rejected in wallet app | Frontend: allow retry |
| Submission failed | Network issue with XRPL | Retry logic with exponential backoff |

### 7.2 Recovery Flows

**Signature Request Timeout:**
```typescript
// Retry with exponential backoff
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const result = await walletConnectService.requestSignature(request)
    return result
  } catch (error) {
    if (attempt < 3) {
      await delay(1000 * Math.pow(2, attempt - 1))
    } else {
      throw error
    }
  }
}
```

**Transaction Submission Failure:**
```typescript
// Store failed transaction for manual retry
await Payment.updateOrCreate(
  { id: paymentId },
  {
    status: 'failed',
    error_message: error.message,
    signed_tx: signedTransaction // Keep for later retry
  }
)
```

---

## 8. Security Considerations

### 8.1 Authentication
- Verify session token before processing transactions
- Validate user ownership of wallet address
- Check session expiration timestamps

### 8.2 Authorization
- Verify user is authenticated to Matrix server
- Check authorization for payment types
- Validate amount limits per transaction

### 8.3 Data Validation
- Sanitize all transaction parameters
- Validate addresses (XRPL format)
- Verify amounts are positive numbers
- Check currency codes against whitelist

### 8.4 Rate Limiting
- Limit signature requests per user per minute
- Implement cooldown between transaction submissions
- Track failed attempts for fraud detection

```typescript
// Example rate limit middleware
const rateLimiter = {
  signatureRequests: new Map(), // userId -> { count, resetTime }
  
  canRequestSignature(userId: string): boolean {
    const limit = this.signatureRequests.get(userId)
    const now = Date.now()
    
    if (!limit || now > limit.resetTime) {
      this.signatureRequests.set(userId, { count: 1, resetTime: now + 60000 })
      return true
    }
    
    if (limit.count < 5) {
      limit.count++
      return true
    }
    
    return false
  }
}
```

---

## 9. Testing Checklist

### 9.1 Unit Tests
- [ ] Transaction preparation validates correctly
- [ ] Payment status transitions work as expected
- [ ] Credit/subscription allocation logic
- [ ] WalletConnect service error handling

### 9.2 Integration Tests
- [ ] End-to-end payment flow
- [ ] Session verification flow
- [ ] Transfer functionality
- [ ] Error recovery flows

### 9.3 Manual Tests
- [ ] Sign transaction with WalletConnect wallet
- [ ] Verify transaction appears on XRPL
- [ ] Check credits granted correctly
- [ ] Test session expiration handling
- [ ] Test invalid transaction rejection

---

## 10. Deployment Checklist

- [ ] Environment variables set:
  - `WALLETCONNECT_SERVICE_URL`
  - `XRPL_NETWORK_URL`
  - Database credentials
  
- [ ] Database migrations applied
  
- [ ] Payment table indexed for performance
  
- [ ] WalletConnect service running and accessible
  
- [ ] Error logging configured
  
- [ ] Rate limiting in place
  
- [ ] Monitoring alerts set up:
  - Failed signature requests
  - Transaction submission failures
  - Session expiration spikes

---

## 11. Monitoring & Observability

### 11.1 Key Metrics

```typescript
// Log transaction lifecycle
Logger.info('WalletConnect Transaction', {
  paymentId,
  userAddress,
  amount,
  currency,
  timestamp: new Date(),
  event: 'signature_requested'
})

// Log success
Logger.info('WalletConnect Transaction', {
  paymentId,
  txHash,
  event: 'confirmed',
  ledgerIndex
})

// Log failures
Logger.error('WalletConnect Transaction Failed', {
  paymentId,
  error: errorMessage,
  event: 'failed'
})
```

### 11.2 Dashboard Metrics
- Signature requests per hour
- Success rate of transactions
- Average response time
- Failed sessions count
- Transaction value distribution

---

## 12. Migration Path from Xumm to WalletConnect

### Phase 1: Parallel Support
- Both Xumm and WalletConnect work simultaneously
- Router detects wallet type from user's auth_provider
- No breaking changes

### Phase 2: Default to WalletConnect
- WalletConnect becomes default for new users
- Xumm still supported for existing users
- Gradual migration encouraged

### Phase 3: Xumm Deprecation
- Sunset Xumm flow after migration complete
- Keep fallback for 6+ months
- Remove after full migration

---

## 13. API Summary Table

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/payment/walletconnect/request-signature` | POST | Required | Request transaction signature |
| `/payment/walletconnect/confirm-transaction` | POST | Required | Confirm transaction completion |
| `/payment/walletconnect/transaction-status/:id` | GET | Required | Check transaction status |
| `/auth/walletconnect/verify-session` | POST | Optional | Verify and authenticate session |
| `/payment/transfer` | POST | Required | Create transfer transaction |

---

## References

- [WalletConnect Documentation](https://docs.walletconnect.com)
- [XRPL.js Guide](https://js.xrpl.org/)
- [Xaman/XUMM Docs](https://xumm.readme.io/)

