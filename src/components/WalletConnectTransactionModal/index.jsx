import React, { useEffect, useState } from "react";
import { Modal, Button } from "@mui/material";
import { Wallet2, Loader2, XCircle, ShieldCheck } from "lucide-react";

const WalletConnectTransactionModal = ({
  isOpen,
  onClose,
  onSignIn,
  status,
  title = "WalletConnect",
  subtitle = "Connect your wallet to review and sign the transaction.",
}) => {
  const [localStatus, setLocalStatus] = useState(status || "Ready to connect");
  const [isSigning, setIsSigning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalStatus(status || "Ready to connect");
      setIsSigning(false);
    }
  }, [status, isOpen]);

  const handleSignIn = async () => {
    setIsSigning(true);
    setLocalStatus("Opening your wallet…");
    try {
      if (onSignIn) await onSignIn();
      setLocalStatus("Waiting for signature in your wallet…");
    } catch (err) {
      setLocalStatus(err?.message || "Failed to start WalletConnect session.");
      setIsSigning(false);
    }
  };

  const statusIcon = () => {
    if (isSigning) return <Loader2 className="animate-spin text-blue-500 w-5 h-5" />;
    if (/fail|error|reject|cancel/i.test(localStatus || "")) {
      return <XCircle className="text-red-500 w-5 h-5" />;
    }
    if (/wait|sign|connect/i.test(localStatus || "")) {
      return <Loader2 className="animate-spin text-blue-500 w-5 h-5" />;
    }
    return <ShieldCheck className="text-green-500 w-5 h-5" />;
  };

  return (
    <Modal open={isOpen} onClose={onClose}>
      <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md text-gray-900 dark:text-white rounded-2xl p-8 shadow-2xl w-full max-w-md mx-auto border border-gray-200/50 dark:border-gray-700/50">
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center shadow-md">
              <Wallet2 className="text-white w-6 h-6" />
            </div>
          </div>

          <h2 className="text-xl font-semibold text-center mb-2 text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="text-center text-sm text-gray-600 dark:text-gray-300 mb-6">
            {subtitle}
          </p>

          <div className="flex flex-col gap-3">
            <Button
              variant="contained"
              color="primary"
              size="large"
              disabled={isSigning}
              onClick={handleSignIn}
              sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2 }}
            >
              {isSigning ? "Waiting for wallet…" : "Sign in with wallet"}
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              size="large"
              onClick={onClose}
              sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2 }}
            >
              Cancel
            </Button>
          </div>

          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 px-4 py-3 rounded-xl">
              {statusIcon()}
              <span className="font-medium text-gray-900 dark:text-white">
                {localStatus || "Ready to connect"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default WalletConnectTransactionModal;
