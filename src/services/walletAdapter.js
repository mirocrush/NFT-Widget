/**
 * Wallet Adapter Service
 * Handles detection and interaction with injected wallet providers (Joey, Atomic, etc.)
 */

/**
 * Get the available injected wallet provider
 * Priority: Joey > Atomic > others
 */
export const getInjectedWallet = () => {
  if (typeof window === 'undefined') return null;

  // Check for Joey wallet
  if (window.joeyWallet) {
    return { wallet: window.joeyWallet, name: 'joey' };
  }

  // Check for Atomic wallet
  if (window.atomicWallet) {
    return { wallet: window.atomicWallet, name: 'atomic' };
  }

  // Check for Bifrost wallet
  if (window.bifrostWallet) {
    return { wallet: window.bifrostWallet, name: 'bifrost' };
  }

  return null;
};

/**
 * Sign a transaction with the injected wallet
 * @param {Object} unsignedTransaction - Unsigned XRPL transaction
 * @returns {Promise<Object>} Signed transaction with TxnSignature
 */
export const signTransactionWithWallet = async (unsignedTransaction) => {
  const walletInfo = getInjectedWallet();

  if (!walletInfo) {
    throw new Error('No wallet found. Please install Joey, Atomic, or another supported wallet.');
  }

  const { wallet, name } = walletInfo;

  if (!wallet.signTransaction) {
    throw new Error(`${name} wallet does not support transaction signing.`);
  }

  try {
    console.log(`Signing transaction with ${name} wallet...`, unsignedTransaction);
    const signedTx = await wallet.signTransaction(unsignedTransaction);

    if (!signedTx) {
      throw new Error('Wallet returned empty signature response.');
    }

    if (!signedTx.TxnSignature) {
      throw new Error(`Wallet did not return a valid signature (TxnSignature missing).`);
    }

    console.log(`Transaction signed successfully by ${name}`, signedTx);
    return signedTx;
  } catch (error) {
    console.error(`Error signing with ${name}:`, error);
    throw error;
  }
};

/**
 * Submit a signed transaction to the backend
 * @param {Object} signedTransaction - Signed XRPL transaction
 * @param {string} transactionType - Type of transaction: 'sell' | 'buy' | 'accept' | 'cancel'
 * @param {string} sender - XRPL address of the signer
 * @param {string} backendUrl - Backend API base URL
 * @returns {Promise<Object>} Response: { success, txid, type }
 */
export const submitSignedTransaction = async (
  signedTransaction,
  transactionType,
  sender,
  backendUrl
) => {
  if (!['sell', 'buy', 'accept', 'cancel'].includes(transactionType)) {
    throw new Error(`Invalid transaction type: ${transactionType}`);
  }

  try {
    console.log(`Submitting signed ${transactionType} transaction...`);
    const response = await fetch(`${backendUrl}/nft/submit-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signedTransaction,
        transactionType,
        sender,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`Transaction submitted successfully:`, result);
    return result;
  } catch (error) {
    console.error(`Error submitting transaction:`, error);
    throw error;
  }
};

/**
 * Convert drops to XRP for display
 * @param {string|number} drops - Amount in drops
 * @returns {string} Amount in XRP as string
 */
export const dropsToXrpDisplay = (drops) => {
  if (!drops) return '0';
  const xrp = parseInt(drops) / 1000000;
  return xrp.toFixed(6);
};

export default {
  getInjectedWallet,
  signTransactionWithWallet,
  submitSignedTransaction,
  dropsToXrpDisplay,
};
