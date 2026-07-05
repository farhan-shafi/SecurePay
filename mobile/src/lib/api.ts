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
// The auth layer sets these after login; request() reads them for every call.
// Access tokens are short-lived (15 min): when one expires we silently exchange
// the refresh token for a new pair and retry, so the user never notices.
let authToken: string | null = null;
let refreshToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
export function setRefreshToken(token: string | null) {
  refreshToken = token;
}

// The auth layer registers this to persist a refreshed token pair.
let onTokensRefreshed: ((tokens: TokenResponse) => void) | null = null;
export function setOnTokensRefreshed(cb: ((tokens: TokenResponse) => void) | null) {
  onTokensRefreshed = cb;
}

// Called when the session is truly dead (refresh failed too). The auth layer
// signs the user out, so a stale token can never leave the app stuck.
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: (() => void) | null) {
  onUnauthorized = cb;
}

// Single-flight: if several requests hit 401 at once, only one refresh runs.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const tokens = (await res.json()) as TokenResponse;
      authToken = tokens.access_token;
      refreshToken = tokens.refresh_token;
      onTokensRefreshed?.(tokens);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
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

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  isRetry = false,
): Promise<T> {
  let res: Response;
  // Abort the request if it hangs, so the UI fails fast instead of spinning
  // forever when the backend isn't reachable (e.g. phone not on the LAN).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // localtunnel shows an interstitial page unless this header is present;
        // it's harmless for any other backend (just an ignored header).
        'Bypass-Tunnel-Reminder': 'true',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    // Rejects on network failure or the 20s timeout above (server down, wrong
    // IP, phone not on the same network as the backend).
    throw new ApiError(
      0,
      null,
      "Can't reach the server. Check your connection, or set EXPO_PUBLIC_API_URL.",
    );
  } finally {
    clearTimeout(timer);
  }

  let data: unknown = null;
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    // The body wasn't JSON — almost always a tunnel interstitial / HTML error
    // page rather than our API. Surface a clear message instead of crashing.
    throw new ApiError(
      res.status || 0,
      null,
      'Unexpected response from the server. Is the backend reachable?',
    );
  }

  if (!res.ok) {
    // A 401 on a request we *sent a token with* usually just means the access
    // token expired. Silently refresh and retry once; only if THAT fails is the
    // session truly dead, and we sign the user out.
    if (res.status === 401 && authToken && !isRetry) {
      if (await tryRefresh()) {
        return request<T>(method, path, body, true);
      }
      onUnauthorized?.();
    } else if (res.status === 401 && authToken && isRetry) {
      onUnauthorized?.();
    }
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
  currency: string;
  direction: 'credit' | 'debit';
  status: string;
  description: string | null;
  created_at: string;
  completed_at: string | null;
  counterparty_name: string | null;
  counterparty_wallet_id: number | null;
  from_amount: string | null;
  from_currency: string | null;
  to_amount: string | null;
  to_currency: string | null;
  exchange_rate: string | null;
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

export interface VerifyStart {
  masked_destination: string; // masked email we sent the code to
  channel: string; // "email"
  expires_in: number;
  dev_code: string | null; // set only when no real email could be sent
}

export interface EmailChangeStart {
  masked_destination: string; // the NEW email, masked
  expires_in: number;
  dev_code: string | null;
}

export interface ForgotPasswordOut {
  message: string;
  dev_code: string | null;
}

export interface NotificationItem {
  id: number;
  channel: string;
  message: string;
  transaction_id: number | null;
  status: string;
  created_at: string;
}

export interface FraudLogItem {
  id: number;
  transaction_id: number | null;
  wallet_id: number;
  fraud_score: string;
  risk_level: string;
  detected_signals: string[];
  action_taken: string;
  created_at: string;
}

export interface Biller {
  id: number;
  name: string;
  category: string;
  currency: string; // of the biller's receiving wallet
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
  sender_wallet_id?: number;
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

  // Forgot / reset password (code emailed to the account address)
  forgotPassword: (email: string) =>
    request<ForgotPasswordOut>('POST', '/api/users/password/forgot', { email }),

  resetPassword: (email: string, code: string, new_password: string) =>
    request<ForgotPasswordOut>('POST', '/api/users/password/reset', {
      email,
      code,
      new_password,
    }),

  // Notification feed (same rows the email worker records)
  getNotifications: () =>
    request<NotificationItem[]>('GET', '/api/users/me/notifications'),

  // The user's own fraud events (security center)
  getFraudLogs: () => request<FraudLogItem[]>('GET', '/api/fraud/me/logs'),

  // Identity verification (phone OTP)
  startVerification: () =>
    request<VerifyStart>('POST', '/api/users/me/verify/start'),

  confirmVerification: (code: string) =>
    request<User>('POST', '/api/users/me/verify/confirm', { code }),

  // Change email (a code is sent to the NEW address to prove ownership)
  changeEmailStart: (new_email: string) =>
    request<EmailChangeStart>('POST', '/api/users/me/email/change/start', {
      new_email,
    }),

  changeEmailConfirm: (code: string) =>
    request<User>('POST', '/api/users/me/email/change/confirm', { code }),

  createWallet: (currency: string) =>
    request<Wallet>('POST', '/api/wallets/create', { currency }),

  getWallet: () => request<Wallet>('GET', '/api/wallets/me'),

  // All of the user's wallets (one per currency), oldest first.
  getWallets: () => request<Wallet[]>('GET', '/api/wallets/mine'),

  deposit: (amount: string, wallet_id?: number) =>
    request<Wallet>('POST', '/api/wallets/me/deposit', { amount, wallet_id }),

  getStatement: (walletId?: number) =>
    request<StatementEntry[]>(
      'GET',
      `/api/wallets/me/statement${walletId ? `?wallet_id=${walletId}` : ''}`,
    ),

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

  // Bill payments
  listBillers: () => request<Biller[]>('GET', '/api/transactions/billers'),

  payBill: (body: {
    biller_id: number;
    reference: string;
    amount: string;
    sender_wallet_id?: number;
    idempotency_key?: string;
  }) => request<TransactionOut>('POST', '/api/transactions/bill', body),

  // Preview a (possibly cross-currency) transfer before sending.
  getQuote: (recipientWalletId: number, amount: string, senderWalletId?: number) =>
    request<Quote>(
      'GET',
      `/api/transactions/quote?recipient_wallet_id=${recipientWalletId}&amount=${encodeURIComponent(amount)}` +
        (senderWalletId ? `&sender_wallet_id=${senderWalletId}` : ''),
    ),
};
