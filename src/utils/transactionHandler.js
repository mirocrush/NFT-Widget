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
  return data?.result === "Success" && data?.wallet_provider === "crossmark" && data?.transaction;
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
  // Check if Crossmark extension is installed
  if (!window.xrpl?.crossmark) {
    throw new Error(
      "Crossmark wallet extension is not installed. Please install it from https://crossmark.io"
    );
  }

  return new Promise((resolve, reject) => {
    // Crossmark SDK: signAndSubmit sends tx to extension popup for user to sign
    window.xrpl.crossmark.signAndSubmit(transaction, (error, response) => {
      if (error) {
        reject(new Error(error?.message || "Crossmark signing failed"));
        return;
      }

      // User rejected the transaction in the extension
      if (response?.type === "reject" || response?.cancelled) {
        reject(new Error("Transaction was rejected in Crossmark wallet"));
        return;
      }

      // Extract tx result from response
      const txResult = response?.response?.data?.resp?.result;
      const txMeta = txResult?.meta;

      if (txMeta?.TransactionResult !== "tesSUCCESS") {
        reject(
          new Error(
            `Transaction failed on ledger: ${txMeta?.TransactionResult || "Unknown error"}`
          )
        );
        return;
      }

      const txHash = txResult?.hash || response?.response?.data?.resp?.result?.hash;
      resolve({ txHash });
    });
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

    // Check for Crossmark unsigned transaction (before general success check)
    if (isCrossmarkResponse(data)) {
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
    if (isSuccessResponse(data)) {
      onSuccess?.({
        message: data.message,
        txHash: data.txHash,
        transaction: data.transaction,
        data,
      });
      return data;
    }

    // Check for insufficient credits
    if (isInsufficientCredit(data)) {
      onInsufficientCredit?.();
      return data;
    }

    // Check for QR code response
    if (isQRResponse(data)) {
      onQRRequired?.({
        qrCodeUrl: data.refs.qr_png,
        websocketUrl: data.refs.websocket_status,
        data,
      });
      return data;
    }

    // If none of the above, treat as error
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
