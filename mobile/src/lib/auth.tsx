/**
 * Auth context.
 *
 * Holds the JWT access token and persists it in the device keychain via
 * expo-secure-store (NOT AsyncStorage — tokens are credentials and belong in
 * secure, OS-backed storage). On launch we rehydrate the token so a returning
 * user stays logged in. Whenever the token changes we also push it into the API
 * client (`setAuthToken`) so every request is authenticated.
 *
 * On every auth transition (sign in, sign up, sign out) we also wipe the React
 * Query cache. The cached wallet/statement/profile belong to whoever was logged
 * in; without clearing, a freshly logged-in account would briefly see the
 * previous user's data until refetches land.
 */
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  api,
  setAuthToken,
  setOnTokensRefreshed,
  setOnUnauthorized,
  setRefreshToken,
  type RegisterPayload,
  type TokenResponse,
} from './api';

const TOKEN_KEY = 'securepay.access_token';
const REFRESH_KEY = 'securepay.refresh_token';

interface AuthValue {
  token: string | null;
  /** True only while we're rehydrating the token on first launch. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: RegisterPayload) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate on mount.
  useEffect(() => {
    (async () => {
      try {
        const [stored, storedRefresh] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(REFRESH_KEY),
        ]);
        if (stored) {
          setAuthToken(stored);
          setRefreshToken(storedRefresh);
          setToken(stored);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persistTokens = useCallback(
    async (tokens: TokenResponse) => {
      // Drop any previous user's cached data before this account's screens mount.
      queryClient.clear();
      await Promise.all([
        SecureStore.setItemAsync(TOKEN_KEY, tokens.access_token),
        SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh_token),
      ]);
      setAuthToken(tokens.access_token);
      setRefreshToken(tokens.refresh_token);
      setToken(tokens.access_token);
    },
    [queryClient],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      await persistTokens(res);
    },
    [persistTokens],
  );

  const signUp = useCallback(
    async (payload: RegisterPayload) => {
      await api.register(payload);
      // Registration doesn't return a token, so log in straight away.
      const res = await api.login(payload.email, payload.password);
      await persistTokens(res);
    },
    [persistTokens],
  );

  const signOut = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
    ]);
    setAuthToken(null);
    setRefreshToken(null);
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  // When the api client silently refreshes an expired access token, persist the
  // new pair so the session survives an app restart too.
  useEffect(() => {
    setOnTokensRefreshed((tokens) => {
      void SecureStore.setItemAsync(TOKEN_KEY, tokens.access_token);
      void SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh_token);
    });
    return () => setOnTokensRefreshed(null);
  }, []);

  // Only reached when a 401 could NOT be fixed by a silent refresh — the
  // session is truly dead, so sign out.
  useEffect(() => {
    setOnUnauthorized(() => {
      void signOut();
    });
    return () => setOnUnauthorized(null);
  }, [signOut]);

  const value = useMemo(
    () => ({ token, loading, signIn, signUp, signOut }),
    [token, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
