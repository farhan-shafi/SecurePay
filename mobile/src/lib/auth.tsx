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
  setOnUnauthorized,
  type RegisterPayload,
} from './api';

const TOKEN_KEY = 'securepay.access_token';

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
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (stored) {
          setAuthToken(stored);
          setToken(stored);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persistToken = useCallback(
    async (value: string) => {
      // Drop any previous user's cached data before this account's screens mount.
      queryClient.clear();
      await SecureStore.setItemAsync(TOKEN_KEY, value);
      setAuthToken(value);
      setToken(value);
    },
    [queryClient],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      await persistToken(res.access_token);
    },
    [persistToken],
  );

  const signUp = useCallback(
    async (payload: RegisterPayload) => {
      await api.register(payload);
      // Registration doesn't return a token, so log in straight away.
      const res = await api.login(payload.email, payload.password);
      await persistToken(res.access_token);
    },
    [persistToken],
  );

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setAuthToken(null);
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  // If any authenticated request gets a 401 (stale/expired token), sign out.
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
