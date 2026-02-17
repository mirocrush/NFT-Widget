import API_URLS from "../config";

/**
 * Standard transaction response validator
 * Checks if the response matches the expected success structure
 */
export const isSuccessResponse = (data) => {
  return (
    data?.result === "Success" &&
    data?.message &&
    data?.txHash &&
    data?.transaction
  );
};

/**
 * Standard QR/WebSocket response validator
 * Checks if the response contains QR code references
 */
export const isQRResponse = (data) => {
  return data?.refs?.qr_png && data?.refs?.websocket_status;
};

/**
 * Check if response is a Crossmark unsigned transaction
 * Backend returns unsigned tx that must be signed via Crossmark browser extension
 */
export const isCrossmarkResponse = (data) => {
  // Handle any casing: "crossmark", "Crossmark", "CROSSMARK"
  const provider = (data?.wallet_provider || data?.walletProvider || "").toLowerCase();
  const isCrossmark = provider === "crossmark";
  const hasUnsignedTx = !!data?.transaction && !data?.txHash; // has tx but no hash yet

  console.log("🔍 [isCrossmarkResponse] check:", {
    result: data?.result,
    wallet_provider: data?.wallet_provider,
    walletProvider: data?.walletProvider,
    providerNormalized: provider,
    isCrossmark,
    hasTransaction: !!data?.transaction,
    hasTxHash: !!data?.txHash,
    hasUnsignedTx,
    decision: data?.result === "Success" && isCrossmark && hasUnsignedTx,
  });

  return data?.result === "Success" && isCrossmark && hasUnsignedTx;
};

/**
 * Check if response indicates insufficient credits
 */
export const isInsufficientCredit = (data) => {
  return data?.result === "NotEnoughCredit";
};

/**
 * Sign and submit a transaction using the Crossmark browser extension
 *
 * @param {Object} transaction - Unsigned XRPL transaction object from backend
 * @returns {Promise<{ txHash: string }>} Resolved transaction hash
 * @throws {Error} If Crossmark is not installed, user rejects, or tx fails
 */
export const signWithCrossmark = async (transaction) => {
  console.log("🔐 [signWithCrossmark] Starting...");
  console.log("🔐 [signWithCrossmark] window.xrpl:", window.xrpl);
  console.log("🔐 [signWithCrossmark] window.xrpl?.crossmark:", window.xrpl?.crossmark);
  console.log("🔐 [signWithCrossmark] transaction:", transaction);

  // Check if Crossmark extension is installed
  if (!window.xrpl?.crossmark) {
    console.error("❌ [signWithCrossmark] Crossmark not found on window.xrpl.crossmark");
    throw new Error(
      "Crossmark wallet extension is not installed. Please install it from https://crossmark.io"
    );
  }

  console.log("✅ [signWithCrossmark] Crossmark found, calling signAndSubmit...");

  try {
    // Crossmark SDK uses Promise-based API (not callbacks)
    const response = await window.xrpl.crossmark.signAndSubmit(transaction);

    console.log("📦 [signWithCrossmark] Raw response from Crossmark:", response);
    console.log("📦 [signWithCrossmark] response.type:", response?.type);
    console.log("📦 [signWithCrossmark] response.response:", response?.response);
    console.log("📦 [signWithCrossmark] response.response?.data:", response?.response?.data);
    console.log("📦 [signWithCrossmark] response.response?.data?.resp:", response?.response?.data?.resp);

    // User rejected the transaction in the extension
    if (response?.type === "reject" || response?.cancelled || response?.response?.type === "reject") {
      console.warn("⚠️ [signWithCrossmark] Transaction rejected by user");
      throw new Error("Transaction was rejected in Crossmark wallet");
    }

    // Try multiple response paths Crossmark may use
    const resp = response?.response?.data?.resp;
    const txResult = resp?.result ?? resp;
    const txMeta = txResult?.meta ?? response?.response?.data?.meta;

    console.log("📦 [signWithCrossmark] txResult:", txResult);
    console.log("📦 [signWithCrossmark] txMeta:", txMeta);
    console.log("📦 [signWithCrossmark] TransactionResult:", txMeta?.TransactionResult);

    if (txMeta?.TransactionResult && txMeta.TransactionResult !== "tesSUCCESS") {
      console.error("❌ [signWithCrossmark] Transaction failed on ledger:", txMeta.TransactionResult);
      throw new Error(`Transaction failed on ledger: ${txMeta.TransactionResult}`);
    }

    // Extract hash from various possible locations
    const txHash =
      txResult?.hash ||
      txResult?.Hash ||
      response?.response?.data?.hash ||
      response?.hash;

    console.log("✅ [signWithCrossmark] Transaction successful! txHash:", txHash);
    return { txHash, response };

  } catch (error) {
    // Re-throw errors we threw ourselves
    if (error.message?.includes("rejected") || error.message?.includes("failed on ledger")) {
      throw error;
    }
    // Wrap unexpected errors
    console.error("❌ [signWithCrossmark] Unexpected error:", error);
    throw new Error(error?.message || "Crossmark signing failed");
  }
};

/**
 * Handle standard transaction API call with common response patterns
 *
 * @param {Object} options - Configuration options
 * @param {string} options.endpoint - API endpoint (e.g., '/create-nft-buy-offer')
 * @param {Object} options.payload - Request payload
 * @param {Function} options.onSuccess - Callback for successful transaction
 * @param {Function} options.onError - Callback for errors
 * @param {Function} options.onQRRequired - Callback when QR code is needed
 * @param {Function} options.onInsufficientCredit - Callback for insufficient credits
 * @param {Function} options.setLoading - Loading state setter
 * @returns {Promise<Object>} Response data
 */
export const handleTransactionRequest = async ({
  endpoint,
  payload,
  onSuccess,
  onError,
  onQRRequired,
  onCrossmarkRequired,
  onInsufficientCredit,
  setLoading,
}) => {
  try {
    setLoading?.(true);

    const response = await fetch(`${API_URLS.backendUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setLoading?.(false);

    // ── DEBUG: Log the full raw response ──────────────────────────────────────
    console.log("📡 [handleTransactionRequest] Raw backend response:", data);
    console.log("📡 [handleTransactionRequest] data.result:", data?.result);
    console.log("📡 [handleTransactionRequest] data.wallet_provider:", data?.wallet_provider);
    console.log("📡 [handleTransactionRequest] data.walletProvider:", data?.walletProvider);
    console.log("📡 [handleTransactionRequest] data.txHash:", data?.txHash);
    console.log("📡 [handleTransactionRequest] data.transaction:", !!data?.transaction);
    console.log("📡 [handleTransactionRequest] data.refs:", data?.refs);
    // ─────────────────────────────────────────────────────────────────────────

    // Check for Crossmark unsigned transaction (before general success check)
    console.log("🔎 [handleTransactionRequest] Testing isCrossmarkResponse...");
    if (isCrossmarkResponse(data)) {
      console.log("✅ [handleTransactionRequest] → Crossmark path triggered");
      onCrossmarkRequired?.({
        transaction: data.transaction,
        operationId: data.operation_id,
        expirySeconds: data.expiry_seconds,
        message: data.message,
        data,
      });
      return data;
    }

    // Check for success response with transaction details
    console.log("🔎 [handleTransactionRequest] Testing isSuccessResponse...", {
      hasResult: data?.result === "Success",
      hasMessage: !!data?.message,
      hasTxHash: !!data?.txHash,
      hasTransaction: !!data?.transaction,
    });
    if (isSuccessResponse(data)) {
      console.log("✅ [handleTransactionRequest] → Direct success path triggered");
      onSuccess?.({
        message: data.message,
        txHash: data.txHash,
        transaction: data.transaction,
        data,
      });
      return data;
    }

    // Check for insufficient credits
    console.log("🔎 [handleTransactionRequest] Testing isInsufficientCredit...", data?.result);
    if (isInsufficientCredit(data)) {
      console.log("✅ [handleTransactionRequest] → Insufficient credit path triggered");
      onInsufficientCredit?.();
      return data;
    }

    // Check for QR code response
    console.log("🔎 [handleTransactionRequest] Testing isQRResponse...", data?.refs);
    if (isQRResponse(data)) {
      console.log("✅ [handleTransactionRequest] → QR code path triggered");
      onQRRequired?.({
        qrCodeUrl: data.refs.qr_png,
        websocketUrl: data.refs.websocket_status,
        data,
      });
      return data;
    }

    // If none of the above, treat as error
    console.warn("⚠️ [handleTransactionRequest] No handler matched → falling to error:", data?.message || data?.error);
    onError?.(data?.message || data?.error || "Transaction failed. Please try again.");
    return data;

  } catch (error) {
    setLoading?.(false);
    onError?.(error?.message || "Error processing transaction. Please try again.");
    throw error;
  }
};

/**
 * Deduct mCredits after successful transaction
 *
 * @param {string} account - User wallet address
 * @param {string} offerType - Type of offer (e.g., 'create_buy_offer')
 * @returns {Promise<Object>} Response data
 */
export const deductMCredit = async (account, offerType) => {
  try {
    const response = await fetch(`${API_URLS.backendUrl}/deduct-mCredit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, offerType }),
    });
    return await response.json();
  } catch (error) {
    console.error("Error deducting mCredits:", error);
    return null;
  }
};

/**
 * Safe JSON parse with fallback
 */
export const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * Check if WebSocket message indicates cancellation
 */
export const isCancellationMessage = (msg) => {
  if (typeof msg === "string") {
    return /declin|reject|cancel|close|abort|deny|expire/i.test(msg);
  }
  return msg?.cancelled || msg?.canceled || msg?.expired;
};

/**
 * Check if WebSocket message indicates success
 */
export const isSuccessMessage = (msg) => {
  return msg?.signed === true;
};

/**
 * Check if WebSocket message indicates rejection
 */
export const isRejectionMessage = (msg) => {
  return msg?.signed === false || msg?.rejected;
};

/**
 * Get rejection reason from WebSocket message
 */
export const getRejectionReason = (msg) => {
  return (msg?.reason || "Declined").toString().toLowerCase();
};
