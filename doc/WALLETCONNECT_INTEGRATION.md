# WalletConnect Backend Integration Guide

## Table of Contents

1. [Setup Instructions](#setup-instructions)
2. [Environment Configuration](#environment-configuration)
3. [Database Migrations](#database-migrations)
4. [File Structure](#file-structure)
5. [Route Registration](#route-registration)
6. [Testing Instructions](#testing-instructions)
7. [Debugging](#debugging)

---

## Setup Instructions

### Step 1: Install Dependencies

```bash
npm install axios moment
```

### Step 2: Copy Service Files

The following files have been created/updated:

- `app/Services/WalletConnectService.ts` - WalletConnect service layer
- `app/Controllers/Http/User/WalletConnectController.ts` - API endpoints
- `WALLETCONNECT_IMPLEMENTATION.md` - Implementation details
- `WALLETCONNECT_API_ENDPOINTS.md` - API reference

### Step 3: Update Routes

Register the WalletConnect routes in `start/routes.ts`:

```typescript
// Add near the payment routes section
Route.group(() => {
  // Request transaction signature
  Route.post('/walletconnect/request-signature', 'User/WalletConnectController.requestSignature')
    .middleware('auth:web')

  // Confirm transaction after submission
  Route.post('/walletconnect/confirm-transaction', 'User/WalletConnectController.confirmTransaction')
    .middleware('auth:web')

  // Get transaction status
  Route.get(
    '/walletconnect/transaction-status/:paymentId',
    'User/WalletConnectController.getTransactionStatus'
  )
    .middleware('auth:web')

  // Get active WalletConnect sessions
  Route.get('/walletconnect/sessions', 'User/WalletConnectController.getSessions')
    .middleware('auth:web')

  // Health check
  Route.get('/walletconnect/health', 'User/WalletConnectController.health')
}).prefix('/api/payment')

// Authentication routes
Route.group(() => {
  Route.post('/walletconnect/verify-session', 'AuthController.verifyWalletConnectSession')
}).prefix('/api/auth')
```

### Step 4: Add AuthController Method

Add this method to `app/Controllers/Http/AuthController.ts`:

```typescript
public async verifyWalletConnectSession({ request, response }: HttpContextContract) {
  try {
    const verifySchema = schema.create({
      sessionId: schema.string([rules.required()]),
      userAddress: schema.string([rules.required()]),
    })

    const data = await request.validate({ schema: verifySchema })

    Logger.info(`Verifying WalletConnect session for ${data.userAddress}`)

    // Verify session with WalletConnect service
    const isValid = await WalletConnectService.verifySession(data.sessionId, data.userAddress)

    if (!isValid) {
      return response.status(401).json({
        success: false,
        error: 'Invalid or expired session',
      })
    }

    // Find or create user
    const user = await User.firstOrCreate(
      { address: data.userAddress },
      {
        address: data.userAddress,
        displayName: `User_${data.userAddress.substring(0, 8)}`,
      }
    )

    // Ensure user external ID exists
    await UserExternalId.firstOrCreate(
      { externalId: data.userAddress },
      {
        userId: user.address,
        externalId: data.userAddress,
        authProvider: 'xrpl-jwt-walletconnect',
      }
    )

    Logger.info(`Session verified for user ${user.id}`)

    return response.json({
      success: true,
      user: {
        id: user.id,
        address: user.address,
        displayName: user.displayName,
      },
    })
  } catch (error) {
    Logger.error('Verify session error', error)
    return response.status(500).json({
      success: false,
      error: 'Internal server error',
    })
  }
}
```

---

## Environment Configuration

### Required Environment Variables

Add these to your `.env` file:

```bash
# WalletConnect Service Configuration
WALLETCONNECT_SERVICE_URL=http://localhost:3000

# XRPL Network Configuration
XRPL_NETWORK_URL=https://xrpl.ws/
# or for testnet:
XRPL_NETWORK_URL=wss://s.altnet.rippletest.net:51233

# Existing configurations (keep these)
XUMM_APIKEY=your_xumm_api_key
XUMM_APISECRET=your_xumm_api_secret
```

### Optional Configuration

```bash
# WalletConnect Service Timeouts (in ms)
WALLETCONNECT_REQUEST_TIMEOUT=120000  # 2 minutes for signature requests
WALLETCONNECT_SESSION_TIMEOUT=604800000  # 7 days

# Retry Configuration
WALLETCONNECT_MAX_RETRIES=3
WALLETCONNECT_RETRY_DELAY=1000  # milliseconds, uses exponential backoff

# Logging
LOG_LEVEL=debug
```

---

## Database Migrations

### Migration File: Update Payment Table

Create migration file: `database/migrations/[timestamp]_add_walletconnect_columns_to_payments.ts`

```typescript
import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'payments'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Add WalletConnect-specific columns
      table.enum('status', ['pending_signature', 'pending_submission', 'confirmed', 'failed']).defaultTo('pending_signature')
      table.string('tx_hash', 255).nullable()
      table.text('signed_tx').nullable()
      table.string('wallet_connect_session_id', 255).nullable()
      table.text('error_message').nullable()
      table.timestamp('submitted_at').nullable()
      table.timestamp('confirmed_at').nullable()

      // Indexes for performance
      table.index('tx_hash')
      table.index('status')
      table.index('wallet_connect_session_id')
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('status')
      table.dropColumn('tx_hash')
      table.dropColumn('signed_tx')
      table.dropColumn('wallet_connect_session_id')
      table.dropColumn('error_message')
      table.dropColumn('submitted_at')
      table.dropColumn('confirmed_at')
    })
  }
}
```

### Run Migration

```bash
node ace migration:run
```

### Optional: WalletConnect Sessions Table

Create migration file: `database/migrations/[timestamp]_create_walletconnect_sessions.ts`

```typescript
import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'walletconnect_sessions'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('user_id').unsigned().references('users.id').onDelete('CASCADE')
      table.string('session_id', 255).unique()
      table.string('wallet_address', 255)
      table.string('chain_id', 50).defaultTo('xrpl:0')
      table.text('session_data').nullable()
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('expires_at', { useTz: true }).nullable()
      table.timestamp('last_activity', { useTz: true }).defaultTo(this.now())

      // Indexes
      table.index('user_id')
      table.index('session_id')
      table.index('wallet_address')
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

---

## File Structure

### New/Modified Files

```
TextRP-backend/
├── app/
│   ├── Controllers/
│   │   └── Http/
│   │       └── User/
│   │           └── WalletConnectController.ts         [NEW]
│   ├── Services/
│   │   ├── WalletConnectService.ts                    [NEW]
│   │   └── XummService.ts                             [UNCHANGED]
│   └── Models/
│       ├── Payment.ts                                 [MODIFIED - added status columns]
│       ├── User.ts                                    [UNCHANGED]
│       └── UserExternalId.ts                          [UNCHANGED]
├── database/
│   └── migrations/
│       └── [timestamp]_add_walletconnect_columns_to_payments.ts [NEW]
├── start/
│   └── routes.ts                                      [MODIFIED - add WC routes]
├── WALLETCONNECT_IMPLEMENTATION.md                    [NEW]
├── WALLETCONNECT_API_ENDPOINTS.md                     [NEW]
├── WALLETCONNECT_INTEGRATION.md                       [THIS FILE]
└── .env                                               [MODIFIED - add WC variables]
```

---

## Route Registration

### Complete Routes Block for `start/routes.ts`

```typescript
import Route from '@ioc:Adonis/Core/Route'

// ... existing routes ...

Route.group(() => {
  // Payment routes
  Route.post('/subscriptionPayment/:subscription', 'User/PaymentController.subscriptionPayment').middleware('auth:web')
  Route.post('/createSubscription/:subscription', 'User/PaymentController.createSubscription').middleware('auth:web')
  Route.post('/create/:credit', 'User/PaymentController.createPayment').middleware('auth:web')
  
  // ... existing payment routes ...

  // WalletConnect Payment Routes
  Route.post('/walletconnect/request-signature', 'User/WalletConnectController.requestSignature')
    .middleware('auth:web')
    .as('walletconnect.requestSignature')

  Route.post('/walletconnect/confirm-transaction', 'User/WalletConnectController.confirmTransaction')
    .middleware('auth:web')
    .as('walletconnect.confirmTransaction')

  Route.get(
    '/walletconnect/transaction-status/:paymentId',
    'User/WalletConnectController.getTransactionStatus'
  )
    .middleware('auth:web')
    .as('walletconnect.getStatus')

  Route.get('/walletconnect/sessions', 'User/WalletConnectController.getSessions')
    .middleware('auth:web')
    .as('walletconnect.getSessions')

  Route.get('/walletconnect/health', 'User/WalletConnectController.health')
    .as('walletconnect.health')

}).prefix('/api/payment')

// Authentication routes
Route.group(() => {
  Route.post('/login', 'AuthController.login')
  Route.post('/webhook', 'AuthController.webhook').csrf()
  
  // WalletConnect Auth Routes
  Route.post('/walletconnect/verify-session', 'AuthController.verifyWalletConnectSession')
    .as('auth.verifyWalletConnectSession')

}).prefix('/api/auth')
```

---

## Testing Instructions

### 1. Unit Tests

Create file: `tests/unit/walletconnect.spec.ts`

```typescript
import { test } from '@japa/runner'
import WalletConnectService from 'App/Services/WalletConnectService'

test.group('WalletConnect Service', () => {
  test('should handle missing userAddress and sessionId', async (assert) => {
    const result = await WalletConnectService.requestSignature({
      transaction: {},
      // Missing both userAddress and sessionId
    } as any)

    assert.isFalse(result.success)
    assert.include(result.error, 'Either userAddress or sessionId')
  })

  test('should validate transaction structure', async (assert) => {
    const result = await WalletConnectService.requestSignature({
      // Missing transaction
      userAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
    } as any)

    assert.isFalse(result.success)
    assert.include(result.error, 'Transaction')
  })
})
```

### 2. Integration Tests

```bash
# Test signature request
curl -X POST http://localhost:3333/api/payment/walletconnect/request-signature \
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
    "userAddress": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH"
  }'

# Check health
curl http://localhost:3333/api/payment/walletconnect/health

# Verify session
curl -X POST http://localhost:3333/api/auth/walletconnect/verify-session \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "abc123def456...",
    "userAddress": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH"
  }'
```

### 3. Manual Testing Checklist

- [ ] WalletConnect service is running and accessible
- [ ] Environment variables are set correctly
- [ ] Database migrations have been applied
- [ ] Routes are registered in `start/routes.ts`
- [ ] Health check endpoint returns `healthy: true`
- [ ] Can request signature with valid transaction
- [ ] Can confirm transaction after signing
- [ ] Payment status updates correctly
- [ ] Credits are granted after confirmation
- [ ] Error messages are helpful and accurate

---

## Debugging

### Enable Debug Logging

In `app/Services/WalletConnectService.ts`, logs are written with different levels:

```typescript
Logger.info('...')   // Info level
Logger.warn('...')   // Warning level
Logger.error('...', error)  // Error with exception
```

Check logs with:

```bash
# View all logs
tail -f storage/logs/app.log

# View only WalletConnect logs
grep -i walletconnect storage/logs/app.log

# View recent errors
grep -i error storage/logs/app.log | tail -20
```

### Debug WalletConnect Service Connection

Add this test route to verify connectivity:

```typescript
// In start/routes.ts
Route.get('/debug/walletconnect-health', async ({ response }) => {
  try {
    const isHealthy = await WalletConnectService.healthCheck()
    return response.json({
      service: 'WalletConnect',
      healthy: isHealthy,
      timestamp: new Date(),
    })
  } catch (error) {
    return response.status(500).json({
      service: 'WalletConnect',
      healthy: false,
      error: error.message,
    })
  }
})
```

### Common Issues and Solutions

#### Issue 1: Service Connection Failed

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:3000
```

**Solution:**
- Verify WalletConnect service is running: `pm2 status | grep wallet`
- Check `WALLETCONNECT_SERVICE_URL` is correct
- Verify network connectivity: `curl http://localhost:3000/api/health`

#### Issue 2: Session Not Found

**Symptom:**
```json
{
  "success": false,
  "error": "WalletConnect session not found or expired"
}
```

**Solution:**
- Ensure user completed WalletConnect login
- Check session hasn't expired (usually 7 days)
- Verify session ID is correct format (hexadecimal string)

#### Issue 3: Signature Timeout

**Symptom:**
```
Error: timeout of 120000ms exceeded
```

**Solution:**
- Increase `WALLETCONNECT_REQUEST_TIMEOUT` in .env
- Check user's wallet is responsive
- Verify network connectivity to wallet service

#### Issue 4: Transaction Validation Failed

**Symptom:**
```json
{
  "success": false,
  "error": "Invalid transaction"
}
```

**Solution:**
- Verify all required fields in transaction:
  - TransactionType
  - Account
  - Destination
  - Amount
  - Fee
  - Sequence
  - LastLedgerSequence
- Check XRPL address format (starts with 'r', 25-34 chars)
- Verify amounts are strings (not numbers)

### Enable Request/Response Logging

Add middleware to `start/routes.ts`:

```typescript
Route.middleware('auth:web').group(() => {
  // WalletConnect routes
  Route.post('/payment/walletconnect/request-signature', 'User/WalletConnectController.requestSignature')
    .middleware((ctx, next) => {
      console.log('📤 Request:', {
        method: ctx.request.method(),
        url: ctx.request.url(),
        body: ctx.request.all(),
      })
      return next()
    })
})
```

---

## Performance Optimization

### Database Query Optimization

Add indexes to Payment table:

```sql
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_tx_hash ON payments(tx_hash);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);
```

### Caching

Consider caching active sessions:

```typescript
import Cache from '@ioc:Adonis/Cache'

async getActiveSessions(userAddress: string) {
  const cacheKey = `sessions:${userAddress}`
  
  // Try cache first
  let sessions = await Cache.get(cacheKey)
  
  if (!sessions) {
    // Fetch from service
    sessions = await WalletConnectService.getActiveSessions(userAddress)
    
    // Cache for 5 minutes
    await Cache.put(cacheKey, sessions, 300)
  }
  
  return sessions
}
```

---

## Monitoring & Alerts

### Key Metrics to Monitor

```typescript
// Log success rate
const successRate = (successCount / totalCount) * 100
Logger.info(`WalletConnect Success Rate: ${successRate}%`)

// Log response time
const startTime = Date.now()
// ... make request ...
const responseTime = Date.now() - startTime
Logger.info(`WalletConnect Response Time: ${responseTime}ms`)

// Log failed sessions
Logger.error('Session Verification Failed', {
  userAddress,
  timestamp: new Date(),
})
```

### Alert Triggers

- Signature request failure rate > 10%
- Average response time > 30 seconds
- Service health check fails
- Session expiration spike

---

## Next Steps

1. **Apply database migrations:**
   ```bash
   node ace migration:run
   ```

2. **Restart backend service:**
   ```bash
   npm run build
   pm2 restart textrp-backend
   ```

3. **Verify setup:**
   ```bash
   curl http://localhost:3333/api/payment/walletconnect/health
   ```

4. **Test with frontend:**
   - Ensure frontend is updated to call WalletConnect endpoints
   - Test complete payment flow
   - Monitor logs for errors

5. **Deploy:**
   - Update production environment variables
   - Run migrations on production database
   - Monitor for errors in first 24 hours

