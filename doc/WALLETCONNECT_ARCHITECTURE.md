# WalletConnect Architecture & System Design

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (TextRP-Client)                            │
│                                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │
│  │ Profile Store  │  │ Payment Modal  │  │ Widget Manager │               │
│  │                │  │                │  │                │               │
│  │ Detects:       │  │ Shows options: │  │ Passes params: │               │
│  │ auth_provider  │  │ - Xumm         │  │ - authProvider │               │
│  │ = walletconnect│  │ - WalletConnect│  │ - sessionId    │               │
│  └────────────────┘  └────────────────┘  └────────────────┘               │
│         │                    │                     │                        │
│         └────────┬───────────┴─────────────────────┘                        │
│                  │                                                          │
│         Routes requests based on auth_provider                             │
└─────────────────────────────────────────────────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────▼───────┐ ┌────▼──────┐  ┌───▼──────────┐
     │ Xumm Flow    │ │ WC Flow   │  │ Widget API   │
     │ (existing)   │ │ (new)     │  │ Pass params  │
     └──────────────┘ └────┬──────┘  └──────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│          BACKEND (TextRP-backend) - API Layer                              │
│                                                                             │
│  POST /payment/walletconnect/request-signature                             │
│  POST /payment/walletconnect/confirm-transaction                           │
│  GET  /payment/walletconnect/transaction-status/:id                        │
│  GET  /payment/walletconnect/sessions                                      │
│  GET  /payment/walletconnect/health                                        │
│  POST /auth/walletconnect/verify-session                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│       BACKEND SERVICE LAYER (WalletConnectService)                         │
│                                                                             │
│  ┌─────────────────────────────────────┐                                  │
│  │ requestSignature(transaction, user) │                                  │
│  │  - Validates transaction            │                                  │
│  │  - Calls WalletConnect service      │                                  │
│  │  - Handles retries                  │                                  │
│  └─────────────────────────────────────┘                                  │
│                                                                             │
│  ┌─────────────────────────────────────┐                                  │
│  │ verifySession(sessionId, address)   │                                  │
│  │  - Checks session validity          │                                  │
│  │  - Verifies address ownership       │                                  │
│  └─────────────────────────────────────┘                                  │
│                                                                             │
│  ┌─────────────────────────────────────┐                                  │
│  │ getActiveSessions(userAddress)      │                                  │
│  │  - Fetches connected wallets        │                                  │
│  │  - Lists session details            │                                  │
│  └─────────────────────────────────────┘                                  │
│                                                                             │
│  ┌─────────────────────────────────────┐                                  │
│  │ healthCheck()                       │                                  │
│  │  - Verifies service connectivity    │                                  │
│  └─────────────────────────────────────┘                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTP/Rest Calls
┌─────────────────────────────────────────────────────────────────────────────┐
│      WALLETCONNECT SERVICE (xrpl-wallet-connect) - Port 3000              │
│                                                                             │
│  /api/walletconnect/sign-transaction                                       │
│  /api/walletconnect/sessions                                               │
│  /api/walletconnect/verify-session                                         │
│  /api/walletconnect/disconnect                                             │
│  /api/health                                                               │
│                                                                             │
│  ┌────────────────────────────────────┐                                   │
│  │  Global SignClient Instance        │                                   │
│  │  (maintains active sessions)       │                                   │
│  └────────────────────────────────────┘                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼ WebSocket/Bridge
┌─────────────────────────────────────────────────────────────────────────────┐
│                    USER'S WALLET (Mobile/Desktop)                           │
│                                                                             │
│  - Xaman                                                                    │
│  - Ledger                                                                   │
│  - Trust Wallet                                                             │
│  - Other WalletConnect-compatible wallets                                   │
│                                                                             │
│  Receives: Transaction to sign                                             │
│  Returns: Signed transaction (tx_blob)                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                           ▲
                           │ Signed Transaction
                           │
┌─────────────────────────────────────────────────────────────────────────────┐
│  XRPL Blockchain                                                            │
│                                                                             │
│  Backend submits signed transaction via xrpl.js client                     │
│  XRPL validates and confirms transaction                                   │
│  Returns: tx_hash, ledger_index, status                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Sequence Diagram

### Complete WalletConnect Payment Flow

```
┌─────────┐              ┌──────────┐             ┌────────────┐              ┌────────┐
│Frontend │              │ Backend  │             │ WalletConn │              │ Wallet │
└────┬────┘              └────┬─────┘             │  Service   │              └───┬────┘
     │                        │                   └────┬───────┘                  │
     │                        │                        │                         │
     │─── POST /payment/create ────────────────────────▶                        │
     │                        │                        │                        │
     │◀─── { paymentId: 123 } ────────────────────────│                        │
     │                        │                        │                        │
     │                        │ (Frontend has now:     │                        │
     │                        │  - paymentId           │                        │
     │                        │  - signed transaction) │                        │
     │                        │                        │                        │
     │─── POST /request-signature ────────────────────▶                        │
     │     {                  │                        │                        │
     │      transaction: {...}│                        │                        │
     │      userAddress: "r..." │                      │                        │
     │      paymentId: 123    │                        │                        │
     │     }                  │                        │                        │
     │                        │                        │                        │
     │                        │─── POST /sign-transaction ──────────────────────▶
     │                        │     {transaction, userAddress} │               │
     │                        │                        │                        │
     │                        │                        ├─ Find session for address
     │                        │                        │                        │
     │                        │                        ├─ Send to wallet via bridge
     │                        │                        │                        │
     │                        │                        │◀─ WAIT for user to sign ─┤
     │                        │                        │                        │
     │                        │                        │   (User sees request)   │
     │                        │                        │   (User clicks approve) │
     │                        │                        │                        │
     │                        │◀─ {signedTx, txHash} ──────────────────────────│
     │                        │                        │                        │
     │◀─ {signedTx, txHash} ───────────────────────────────────────────────────│
     │     paymentId: 123     │                        │                        │
     │                        │                        │                        │
     │─── Submit to XRPL ─────────────────────────────────────────────────────▶
     │     (Frontend code)    │                        │                        │
     │                        │                        │                        │
     │                        │                        │                   XRPL validates
     │                        │                        │                   Confirms txn
     │                        │                        │                        │
     │─── POST /confirm-transaction ──────────────────▶                       │
     │     {                  │                        │                        │
     │      paymentId: 123    │                        │                        │
     │      txHash: "E12..." │                        │                        │
     │     }                  │                        │                        │
     │                        │                        │                        │
     │                        ├─ Update payment status                          │
     │                        ├─ Grant credits                                  │
     │                        │                        │                        │
     │◀─ {success: true} ──────────────────────────────────────────────────────│
     │    {creditGranted: 100}│                        │                        │
     │    {balance: 500}      │                        │                        │
     │                        │                        │                        │
     ├─ Show success message  │                        │                        │
     │    "Credits awarded!"  │                        │                        │
     │                        │                        │                        │
```

---

## Component Interaction Details

### 1. Frontend to Backend Flow

```
Frontend                          Backend
  │                                 │
  │─── detect auth_provider ───────▶│
  │    (from profile store)         │
  │                                 │
  ├─ if 'walletconnect':           │
  │    │                            │
  │    └─ route to WC flow          │
  │       └─ call /request-signature│
  │          └─ pass transaction ────▶ [ROUTE TO: WalletConnectController]
  │                                 │
  │                        Backend processes
  │                                 │
  │◀─ return signed tx ─────────────│
  │                                 │
```

### 2. Backend to WalletConnect Service Flow

```
Backend                    WalletConnect Service
  │                              │
  ├─ Prepare transaction         │
  │                              │
  │─ POST /sign-transaction ────▶│
  │   {                          │
  │    userAddress: "r..."       │
  │    transaction: {...}        │
  │   }                          │
  │                              │
  │                    Service processes:
  │                    1. Find session by address
  │                    2. Get SignClient instance
  │                    3. Send request to wallet
  │                              │
  │                        Wallet receives:
  │                        Shows signing UI
  │                              │
  │◀─ (wait for signature) ──────│
  │                              │
  │◀─ { signedTx, txHash } ──────│
  │                              │
```

### 3. Transaction State Transitions

```
INITIAL STATE: pending_signature
  │
  ├─ User signs in wallet
  │  │
  ▼
pending_submission
  │
  ├─ Transaction submitted to XRPL
  │  │
  ▼
confirmed ───────────── (Success!)
  │
  ├─ Credits/subscription granted
  │
  └─ Payment record updated

OR

ALTERNATIVE: failed
  │
  ├─ User rejects in wallet
  │  OR
  │  Network error
  │  OR
  │  Transaction invalid
  │
  └─ Error message logged
```

---

## Database Schema Relationships

```
┌─────────────────────┐
│      users          │
│─────────────────────│
│ id (PK)             │
│ address             │
│ displayName         │
│ created_at          │
└─────────────────────┘
        │ 1
        │
        │ *
        ▼
┌─────────────────────────────┐
│  user_external_ids          │
│─────────────────────────────│
│ user_id (FK→users)          │
│ external_id                 │
│ auth_provider ◀─ KEY FIELD  │
│ created_at                  │
└─────────────────────────────┘
        │ 1
        │
        │ *
        ▼
┌──────────────────────────────────────────┐
│         payments                         │
│──────────────────────────────────────────│
│ id (PK)                                  │
│ userId (FK→users)                        │
│ uuid                                     │
│ payload (JSON)                           │
│ signed_tx ◀─ WalletConnect new           │
│ tx_hash ◀─ WalletConnect new             │
│ status ◀─ WalletConnect new              │
│ wallet_connect_session_id ◀─ new         │
│ error_message ◀─ new                     │
│ submitted_at ◀─ new                      │
│ confirmed_at ◀─ new                      │
│ paymenttableId                           │
│ paymenttableType (CREDIT/SUBSCRIPTION)   │
│ created_at                               │
└──────────────────────────────────────────┘
        │ *
        │
        ├─────────────┬──────────────┐
        │             │              │
        ▼ 1           ▼ 1            ▼ 1
┌──────────┐  ┌──────────────┐  ┌──────────────┐
│ credits  │  │subscriptions │  │   other...   │
│──────────│  │──────────────│  └──────────────┘
│ id       │  │ id           │
│ name     │  │ name         │
│ price    │  │ price        │
│ credits  │  │ duration     │
└──────────┘  └──────────────┘

        grants
        ▼
┌──────────────────┐
│  user_credits    │
│──────────────────│
│ userId (FK)      │
│ balance          │
│ updated_at       │
└──────────────────┘

        grants
        ▼
┌──────────────────────┐
│  user_subscriptions  │
│──────────────────────│
│ userId (FK)          │
│ subscriptionId (FK)  │
│ expiresAt            │
│ created_at           │
└──────────────────────┘
```

---

## Error Handling Flow

```
User initiates signature
       │
       ▼
Frontend: POST /request-signature
       │
       ▼
Backend: Validate request
       │
       ├─ Missing fields? ────────────────────────▶ 422 Unprocessable Entity
       │
       ├─ Auth token invalid? ─────────────────────▶ 401 Unauthorized
       │
       └─ Valid? ──────────────────────────────────────▶
               │
               ▼
       Call WalletConnectService.requestSignature()
               │
               ├─ Service unavailable? ───────────────▶ 500 Service Unavailable
               │
               ├─ Session not found? ──────────────────▶ 404 Not Found
               │
               ├─ User rejected? ──────────────────────▶ 400 Bad Request
               │
               ├─ Network timeout? ────────────────────▶ Retry with backoff
               │                          (3 attempts max)
               │
               └─ Success! ────────────────────────────▶ 200 OK
                                      {signedTx, txHash}
```

---

## Performance & Scalability

### Request Timeline

```
T+0s   ───────────────────────────────────────────────────────
       │
T+1s   ├─ Request received at backend
       │
T+2s   ├─ Validated & forwarded to WalletConnect service
       │  │
T+3s   │  ├─ Service finds session
       │  │
T+4s   │  ├─ Request sent to wallet via bridge
       │  │
T+5s   ├────────────────────────────────────────────────────
       │  │ (User sees request in wallet)
       │  │
T+30s  │  ├─ (User signs)
       │  │
T+31s  ├─────────────────────────────────────────────────────
       │  ├─ Signature received by service
       │  │
T+32s  ├─────────────────────────────────────────────────────
       │  ├─ Signature returned to backend
       │  │
T+33s  ├─ Response sent to frontend
       │
       ← Timeout: 120 seconds (if no signature received)
```

### Concurrent Request Handling

```
Multiple users can request signatures simultaneously:

User A                User B                User C
   │                    │                    │
   ├─ /request-sig ────▶│                    │
   │                    ├─ /request-sig ────▶│
   │                    │                    ├─ /request-sig ───▶
   │                    │                    │
   │                    │                    │ (All processed in parallel)
   │                    │                    │
   │◀─ sig received ────│                    │
   │                    │◀─ sig received ────│
   │                    │                    │◀─ sig received ────
   │                    │                    │

No bottlenecks - each request is independent
```

---

## Security Layers

```
┌───────────────────────────────────────────────┐
│ Layer 1: Transport Security                   │
│ - HTTPS/TLS encryption                        │
│ - Secure WebSocket for wallet bridge          │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Layer 2: Authentication                       │
│ - Bearer token validation                     │
│ - Session verification                        │
│ - Wallet address confirmation                 │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Layer 3: Authorization                        │
│ - User owns payment record                    │
│ - User owns wallet address                    │
│ - User allowed to make transactions           │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Layer 4: Input Validation                     │
│ - Transaction structure validated             │
│ - XRPL addresses checked                      │
│ - Amounts verified                            │
│ - Fee limits enforced                         │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Layer 5: Rate Limiting                        │
│ - Max 5 signatures per user per minute        │
│ - Max 10 transactions per user per hour       │
│ - Cooldown periods enforced                   │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Layer 6: Wallet Security                      │
│ - Private keys never sent to backend          │
│ - Signing happens in user's wallet            │
│ - Transaction data encrypted in transit       │
└───────────────────────────────────────────────┘
```

---

## Monitoring Architecture

```
Backend Logs                      Monitoring System
    │                                    │
    ├─ Request/Response logs            │
    ├─ Error logs                ───────▶ Log Aggregator
    ├─ Performance metrics              │
    ├─ Transaction lifecycle            │
    │                                   ▼
    │                            Dashboard
    │                            (view logs, metrics)
    │
    ├─ Success rate tracking ────────────▶ Alerts
    │  (target: > 95%)
    │
    ├─ Response time monitoring ────────▶ Alerts
    │  (target: < 5 seconds)
    │
    ├─ Error rate monitoring ──────────▶ Alerts
    │  (target: < 5%)
    │
    └─ Service health checks ──────────▶ Alerts
       (WalletConnect service connectivity)
```

---

## Deployment Architecture

```
┌──────────────────────────────────────────────────┐
│           Production Environment                  │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  Load Balancer (nginx)                   │   │
│  │  - Routes to multiple backend instances  │   │
│  └──────────────┬───────────────────────────┘   │
│                 │                               │
│        ┌────────┼────────┐                      │
│        │        │        │                      │
│        ▼        ▼        ▼                      │
│  ┌─────────┐┌─────────┐┌─────────┐             │
│  │Backend-1││Backend-2││Backend-3│             │
│  │Instance ││Instance ││Instance │             │
│  └────┬────┘└────┬────┘└────┬────┘             │
│       │         │          │                   │
│       └─────────┼──────────┘                   │
│               │                                │
│        ┌──────▼──────┐                        │
│        │   Database  │                        │
│        │  (primary + │                        │
│        │  replicas)  │                        │
│        └─────────────┘                        │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ WalletConnect Service (external)         │ │
│  │ Port 3000                                │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ XRPL Nodes (distributed network)         │ │
│  └──────────────────────────────────────────┘ │
│                                                │
└──────────────────────────────────────────────┘
```

---

This architecture ensures:
- ✅ High availability (multiple backend instances)
- ✅ Scalability (load balancing)
- ✅ Security (TLS, authentication, rate limiting)
- ✅ Reliability (error handling, retries)
- ✅ Observability (logging, monitoring)
- ✅ Performance (caching, indexing)

