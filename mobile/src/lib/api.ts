/**
 * Typed client for the SecurePay backend.
 *
 * Everything goes through the public API gateway (`/api/<service>/<path>`),
 * which is the only thing exposed outside the Docker network. We keep a single
 * `request()` helper that:
 *   - prefixes the base URL,
 *   - attaches the JWT bearer token (once a user is logged in),
 *   - parses JSON, and
 *   - turns non-2xx responses into a typed `ApiError` carrying the backend's
 *     `detail` message so screens can show something useful.
 */
import { API_BASE_URL } from './config';

// --- Token handling ---------------------------------------------------------
// The auth layer sets this after login; request() reads it for every call.
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

// --- Error type -------------------------------------------------------------
export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only rejects on network failure (server down, wrong IP, no wifi).
    throw new ApiError(
      0,
      null,
      "Can't reach the server. Is the backend running and on the same network?",
    );
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail ?? data;
    const message =
      typeof detail === 'string' ? detail : `Request failed (${res.status})`;
    throw new ApiError(res.status, detail, message);
  }
  return data as T;
}

// --- Wire types (mirror the backend Pydantic schemas) -----------------------
// Money fields arrive as strings (Decimal) — we coerce with Number() only at
// format time, so we never lose precision passing values around.

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: number;
  email: string;
  phone_number: string;
  first_name: string;
  last_name: string;
  kyc_verified: boolean;
  created_at: string;
}

export interface Wallet {
  id: number;
  user_id: number;
  balance: string;
  currency: string;
  is_active: boolean;
  created_at: string;
}

export interface StatementEntry {
  id: number;
  transaction_type: string;
  amount: string;
  direction: 'credit' | 'debit';
  status: string;
  description: string | null;
  created_at: string;
}

export interface TransactionOut {
  id: number;
  wallet_id: number;
  transaction_type: string;
  amount: string;
  recipient_wallet_id: number | null;
  recipient_amount: string | null;
  exchange_rate: string | null;
  status: string;
  description: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Beneficiary {
  id: number;
  wallet_id: number;
  name: string;
  nickname: string | null;
  currency: string;
  created_at: string;
}

export interface Quote {
  amount: string;
  currency: string;
  recipient_amount: string;
  recipient_currency: string;
  exchange_rate: string;
  same_currency: boolean;
}

export interface Lookup {
  wallet_id: number;
  name: string;
  currency: string;
}

export interface RegisterPayload {
  email: string;
  phone_number: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface P2PPayload {
  recipient_wallet_id: number;
  amount: string;
  description?: string;
  idempotency_key?: string;
}

// --- Endpoints --------------------------------------------------------------
export const api = {
  register: (body: RegisterPayload) =>
    request<User>('POST', '/api/users/register', body),

  login: (email: string, password: string) =>
    request<TokenResponse>('POST', '/api/users/login', { email, password }),

  me: () => request<User>('GET', '/api/users/me'),

  verifyIdentity: () => request<User>('POST', '/api/users/me/verify'),

  createWallet: (currency: string) =>
    request<Wallet>('POST', '/api/wallets/create', { currency }),

  getWallet: () => request<Wallet>('GET', '/api/wallets/me'),

  deposit: (amount: string) =>
    request<Wallet>('POST', '/api/wallets/me/deposit', { amount }),

  getStatement: () =>
    request<StatementEntry[]>('GET', '/api/wallets/me/statement'),

  sendP2P: (body: P2PPayload) =>
    request<TransactionOut>('POST', '/api/transactions/p2p', body),

  // Resolve a person by email or wallet id (before saving / sending).
  lookupPayee: (query: { email?: string; walletId?: number }) => {
    const qs = query.email
      ? `email=${encodeURIComponent(query.email)}`
      : `wallet_id=${query.walletId}`;
    return request<Lookup>('GET', `/api/wallets/lookup?${qs}`);
  },

  // Beneficiaries (saved payees)
  listBeneficiaries: () =>
    request<Beneficiary[]>('GET', '/api/wallets/me/beneficiaries'),

  addBeneficiary: (wallet_id: number, nickname?: string) =>
    request<Beneficiary>('POST', '/api/wallets/me/beneficiaries', {
      wallet_id,
      nickname,
    }),

  deleteBeneficiary: (id: number) =>
    request<null>('DELETE', `/api/wallets/me/beneficiaries/${id}`),

  // Preview a (possibly cross-currency) transfer before sending.
  getQuote: (recipientWalletId: number, amount: string) =>
    request<Quote>(
      'GET',
      `/api/transactions/quote?recipient_wallet_id=${recipientWalletId}&amount=${encodeURIComponent(amount)}`,
    ),
};
