import { useState, useRef, useEffect } from "react";
import {
  handleTransactionRequest,
  deductMCredit,
  safeParse,
  isCancellationMessage,
  isSuccessMessage,
  isRejectionMessage,
  getRejectionReason,
} from "../utils/transactionHandler";

/**
 * Custom hook for managing transaction states and WebSocket connections
 *
 * @param {Object} options - Configuration options
 * @param {string} options.myWalletAddress - User's wallet address
 * @param {Function} options.onTransactionComplete - Callback when transaction completes
 * @returns {Object} Transaction handler methods and states
 */
export const useTransactionHandler = ({
  myWalletAddress,
  onTransactionComplete,
} = {}) => {
  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // QR Modal state
  const [isQrModalVisible, setIsQrModalVisible] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [websocketUrl, setWebsocketUrl] = useState("");
  const [transactionStatus, setTransactionStatus] = useState("");

  // Message Box state
  const [isMessageBoxVisible, setIsMessageBoxVisible] = useState(false);
  const [messageBoxType, setMessageBoxType] = useState("success");
  const [messageBoxText, setMessageBoxText] = useState("");

  // Offer type tracking
  const [createdOfferType, setCreatedOfferType] = useState("");

  // WebSocket ref
  const wsRef = useRef(null);

  /**
   * Close QR modal and show message
   */
  const closeQrModal = (statusText, toastText, toastType = "error") => {
    setTransactionStatus(statusText || "");
    setIsQrModalVisible(false);
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    if (toastText) {
      setMessageBoxType(toastType);
      setMessageBoxText(toastText);
      setIsMessageBoxVisible(true);
    }
  };

  /**
   * Show message box
   */
  const showMessage = (type, text) => {
    setMessageBoxType(type);
    setMessageBoxText(text);
    setIsMessageBoxVisible(true);
  };

  /**
   * Handle WebSocket message
   */
  const handleWebSocketMessage = (event, offerType) => {
    const msg = safeParse(event.data || "");
    console.log("WebSocket message received:", msg);

    // Check for cancellation
    if (isCancellationMessage(msg)) {
      closeQrModal("Transaction cancelled", "Transaction was cancelled/declined.");
      return;
    }

    // Check for success
    if (isSuccessMessage(msg)) {
      closeQrModal(
        "Transaction signed",
        "Transaction completed successfully!",
        "success"
      );

      // Deduct mCredits
      if (myWalletAddress && offerType) {
        deductMCredit(myWalletAddress, offerType).then((response) => {
          console.log("mCredit deduction result:", response);
        });
      }

      // Call completion callback
      onTransactionComplete?.();
      return;
    }

    // Check for rejection
    if (isRejectionMessage(msg)) {
      const reason = getRejectionReason(msg);
      closeQrModal("Transaction declined", `Transaction was ${reason}.`);
      return;
    }
  };

  /**
   * WebSocket effect
   */
  useEffect(() => {
    if (!websocketUrl) return;

    // Close any previous socket
    try {
      wsRef.current?.close();
    } catch {}

    const ws = new WebSocket(websocketUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => handleWebSocketMessage(event, createdOfferType);

    ws.onerror = () => {
      closeQrModal("Connection error", "");
    };

    ws.onclose = () => {
      if (isQrModalVisible) {
        closeQrModal("Connection closed", "");
      }
    };

    return () => {
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
  }, [websocketUrl, isQrModalVisible, createdOfferType]);

  /**
   * Execute transaction with common handling
   */
  const executeTransaction = async ({
    endpoint,
    payload,
    offerType,
    successMessage,
    errorMessage = "Operation failed. Please try again.",
    insufficientCreditMessage = "You don't have enough mCredits for this operation.",
  }) => {
    setCreatedOfferType(offerType || "");

    return handleTransactionRequest({
      endpoint,
      payload,
      setLoading: setIsLoading,
      onSuccess: ({ message, txHash }) => {
        showMessage("success", successMessage || `${message}\nTransaction Hash: ${txHash}`);
        onTransactionComplete?.();
      },
      onError: (error) => {
        showMessage("error", error || errorMessage);
      },
      onQRRequired: ({ qrCodeUrl, websocketUrl }) => {
        setQrCodeUrl(qrCodeUrl);
        setWebsocketUrl(websocketUrl);
        setIsQrModalVisible(true);
      },
      onInsufficientCredit: () => {
        showMessage("error", insufficientCreditMessage);
      },
    });
  };

  return {
    // States
    isLoading,
    isQrModalVisible,
    qrCodeUrl,
    websocketUrl,
    transactionStatus,
    isMessageBoxVisible,
    messageBoxType,
    messageBoxText,
    createdOfferType,

    // Setters (for advanced use)
    setIsLoading,
    setIsQrModalVisible,
    setQrCodeUrl,
    setWebsocketUrl,
    setTransactionStatus,
    setIsMessageBoxVisible,
    setMessageBoxType,
    setMessageBoxText,
    setCreatedOfferType,

    // Methods
    executeTransaction,
    closeQrModal,
    showMessage,
  };
};
