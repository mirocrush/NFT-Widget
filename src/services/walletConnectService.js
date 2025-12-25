import API_URLS from "../config";

const BASE_URL = API_URLS.backendUrl;

const buildHeaders = (token) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
};

const toJson = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return data;
};

export const healthCheck = async () => {
  if (!BASE_URL) throw new Error("Missing backend URL for WalletConnect");
  const res = await fetch(`${BASE_URL}/payment/walletconnect/health`);
  return toJson(res);
};

export const getActiveSessions = async (token) => {
  if (!BASE_URL) throw new Error("Missing backend URL for WalletConnect");
  const res = await fetch(`${BASE_URL}/payment/walletconnect/sessions`, {
    method: "GET",
    headers: buildHeaders(token),
  });
  return toJson(res);
};

export const verifySession = async ({ sessionId, userAddress, token }) => {
  if (!BASE_URL) throw new Error("Missing backend URL for WalletConnect");
  const res = await fetch(`${BASE_URL}/auth/walletconnect/verify-session`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ sessionId, userAddress }),
  });
  return toJson(res);
};

export const requestSignature = async ({ transaction, userAddress, sessionId, paymentId, token }) => {
  if (!BASE_URL) throw new Error("Missing backend URL for WalletConnect");
  const res = await fetch(`${BASE_URL}/payment/walletconnect/request-signature`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ transaction, userAddress, sessionId, paymentId }),
  });
  return toJson(res);
};

export const confirmTransaction = async ({ paymentId, txHash, ledgerIndex, status = "success", token }) => {
  if (!BASE_URL) throw new Error("Missing backend URL for WalletConnect");
  const res = await fetch(`${BASE_URL}/payment/walletconnect/confirm-transaction`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ paymentId, txHash, ledgerIndex, status }),
  });
  return toJson(res);
};

export const getTransactionStatus = async (paymentId, token) => {
  if (!BASE_URL) throw new Error("Missing backend URL for WalletConnect");
  const res = await fetch(`${BASE_URL}/payment/walletconnect/transaction-status/${paymentId}`, {
    method: "GET",
    headers: buildHeaders(token),
  });
  return toJson(res);
};

export const extractSessionAddress = (session) => {
  if (!session) return null;
  const account = (session.accounts || session.account || [])[0];
  if (typeof account === "string") {
    const parts = account.split(":");
    return parts[parts.length - 1] || null;
  }
  return session.address || null;
};

export default {
  healthCheck,
  getActiveSessions,
  verifySession,
  requestSignature,
  confirmTransaction,
  getTransactionStatus,
  extractSessionAddress,
};
