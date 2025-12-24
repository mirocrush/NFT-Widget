import React, { useState } from 'react';
import { Modal, Box } from '@mui/material';
import { Loader2, Send, AlertCircle, CheckCircle, Wallet } from 'lucide-react';
import {
  signTransactionWithWallet,
  submitSignedTransaction,
  dropsToXrpDisplay,
} from '../../services/walletAdapter';

const WalletConnectTransactionModal = ({
  isOpen,
  onClose,
  unsignedTransaction,
  transactionType,
  sender,
  backendUrl,
  onSuccess,
}) => {
  const [status, setStatus] = useState('preview'); // 'preview' | 'signing' | 'submitting' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [txid, setTxid] = useState('');

  const handleSignAndSubmit = async () => {
    setStatus('signing');
    setErrorMessage('');

    try {
      // Step 1: Get wallet and sign
      const signedTx = await signTransactionWithWallet(unsignedTransaction);

      // Step 2: Submit to backend
      setStatus('submitting');
      const result = await submitSignedTransaction(
        signedTx,
        transactionType,
        sender,
        backendUrl
      );

      // Step 3: Success
      if (result.success) {
        setTxid(result.txid);
        setStatus('success');
        setTimeout(() => {
          onSuccess?.(result.txid);
          onClose();
        }, 1500);
      } else {
        throw new Error(result.error || 'Transaction submission failed');
      }
    } catch (error) {
      console.error('Transaction error:', error);
      setErrorMessage(error.message || 'An error occurred during transaction signing/submission.');
      setStatus('error');
    }
  };

  const getStatusIcon = () => {
    if (status === 'success') {
      return <CheckCircle className="w-6 h-6 text-green-500" />;
    }
    if (status === 'error') {
      return <AlertCircle className="w-6 h-6 text-red-500" />;
    }
    if (status === 'signing' || status === 'submitting') {
      return <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />;
    }
    return <Wallet className="w-6 h-6 text-blue-500" />;
  };

  const getStatusText = () => {
    if (status === 'success') return 'Transaction Completed';
    if (status === 'error') return 'Transaction Failed';
    if (status === 'signing') return 'Signing Transaction...';
    if (status === 'submitting') return 'Submitting to Blockchain...';
    return 'Confirm Transaction';
  };

  const transactionTypeLabel = {
    sell: 'Create Sell Offer',
    buy: 'Create Buy Offer',
    accept: 'Accept Offer',
    cancel: 'Cancel Offer',
  }[transactionType] || transactionType;

  return (
    <Modal open={isOpen} onClose={onClose}>
      <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
        <Box className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md text-gray-900 dark:text-white rounded-2xl p-8 shadow-2xl w-full max-w-lg mx-auto border border-gray-200/50 dark:border-gray-700/50">
          {/* Header */}
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center shadow-md">
              {getStatusIcon()}
            </div>
          </div>

          <h2 className="text-xl font-semibold text-center mb-2 text-gray-900 dark:text-white">
            {getStatusText()}
          </h2>

          {/* Preview Section */}
          {status === 'preview' && unsignedTransaction && (
            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
                {/* Transaction Type */}
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Type
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {transactionTypeLabel}
                  </span>
                </div>

                {/* NFT ID (if applicable) */}
                {unsignedTransaction.NFTokenID && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      NFT ID
                    </span>
                    <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate max-w-xs">
                      {unsignedTransaction.NFTokenID}
                    </span>
                  </div>
                )}

                {/* Amount (if applicable) */}
                {unsignedTransaction.Amount && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Amount
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {dropsToXrpDisplay(unsignedTransaction.Amount)} XRP
                    </span>
                  </div>
                )}

                {/* Destination (if applicable) */}
                {unsignedTransaction.Destination && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Destination
                    </span>
                    <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate max-w-xs">
                      {unsignedTransaction.Destination}
                    </span>
                  </div>
                )}

                {/* Offer ID (for accept/cancel) */}
                {(unsignedTransaction.NFTokenSellOffer ||
                  unsignedTransaction.NFTokenBuyOffer) && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Offer ID
                    </span>
                    <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate max-w-xs">
                      {unsignedTransaction.NFTokenSellOffer ||
                        unsignedTransaction.NFTokenBuyOffer}
                    </span>
                  </div>
                )}

                {/* Fee */}
                <div className="flex justify-between pt-2 border-t border-gray-300 dark:border-gray-600">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Network Fee
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {dropsToXrpDisplay(unsignedTransaction.Fee)} XRP
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
                Review the transaction details and sign with your wallet.
              </p>
            </div>
          )}

          {/* Error Message */}
          {status === 'error' && errorMessage && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
            </div>
          )}

          {/* Success Message */}
          {status === 'success' && txid && (
            <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-2">
                Transaction submitted successfully!
              </p>
              <p className="text-xs font-mono text-green-600 dark:text-green-400 truncate">
                TxID: {txid}
              </p>
            </div>
          )}

          {/* Status Text */}
          {(status === 'signing' || status === 'submitting') && (
            <div className="mb-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {status === 'signing'
                  ? 'Please sign the transaction in your wallet app...'
                  : 'Submitting to blockchain...'}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {status === 'preview' && (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignAndSubmit}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Sign & Submit
                </button>
              </>
            )}

            {status === 'error' && (
              <button
                onClick={() => setStatus('preview')}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
              >
                Try Again
              </button>
            )}

            {status === 'success' && (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
              >
                Done
              </button>
            )}

            {(status === 'signing' || status === 'submitting') && (
              <button
                disabled
                className="flex-1 px-4 py-2 bg-gray-400 text-white rounded-lg font-medium cursor-not-allowed opacity-75"
              >
                Processing...
              </button>
            )}
          </div>
        </Box>
      </div>
    </Modal>
  );
};

export default WalletConnectTransactionModal;
