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
export const signWithCrossmark = async (transaction, expirySeconds = 300) => {
  console.log("🔐 [signWithCrossmark] Starting...");
  console.log("🔐 [signWithCrossmark] window.xrpl:", window.xrpl);
  console.log("🔐 [signWithCrossmark] Running in iframe?", window !== window.top);

  // Encode transaction into URL hash for the popup page
  const txEncoded = encodeURIComponent(JSON.stringify(transaction));
  const popupUrl = `${window.location.origin}/crossmark-sign.html#${txEncoded}`;

  console.log("🪟 [signWithCrossmark] Opening popup:", popupUrl);

  // Open a top-level popup window — extensions inject into top-level windows, not iframes
  const popup = window.open(
    popupUrl,
    "crossmark-sign",
    "width=420,height=300,top=100,left=100,resizable=no,scrollbars=no"
  );

  if (!popup || popup.closed) {
    throw new Error(
      "Popup was blocked. Please allow popups for this site to use Crossmark signing."
    );
  }

  console.log("🪟 [signWithCrossmark] Popup opened, waiting for message...");

  return new Promise((resolve, reject) => {
    const timeoutMs = (expirySeconds + 10) * 1000; // slight buffer over tx expiry

    // Timeout guard
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      if (!popup.closed) popup.close();
      reject(new Error("Transaction signing timed out. Please try again."));
    }, timeoutMs);

    function handleMessage(event) {
      // Only accept messages from our popup (same origin)
      if (event.source !== popup) return;

      console.log("📨 [signWithCrossmark] Message from popup:", event.data);

      if (event.data?.type === "CROSSMARK_SUCCESS") {
        clearTimeout(timeout);
        window.removeEventListener("message", handleMessage);
        console.log("✅ [signWithCrossmark] Success! txHash:", event.data.txHash);
        resolve({ txHash: event.data.txHash, response: event.data.response });
      }

      if (event.data?.type === "CROSSMARK_ERROR") {
        clearTimeout(timeout);
        window.removeEventListener("message", handleMessage);
        console.error("❌ [signWithCrossmark] Error from popup:", event.data.error);
        reject(new Error(event.data.error || "Crossmark signing failed"));
      }
    }

    window.addEventListener("message", handleMessage);

    // Also detect if user manually closed the popup
    const closedPoll = setInterval(() => {
      if (popup.closed) {
        clearInterval(closedPoll);
        clearTimeout(timeout);
        window.removeEventListener("message", handleMessage);
        reject(new Error("Signing cancelled: popup was closed."));
      }
    }, 500);
  });
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
