/**
 * React Query hooks — the screens' window onto the backend.
 *
 * Why React Query: it gives us caching, loading/error state, automatic refetch
 * on focus, and painless invalidation after mutations (send money / deposit),
 * so the balance and activity list stay in sync without manual plumbing.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  ApiError,
  api,
  type P2PPayload,
  type StatementEntry,
  type Wallet,
} from './api';

export const keys = {
  me: ['me'] as const,
  wallet: ['wallet'] as const,
  statement: ['statement'] as const,
};

export function useProfile() {
  return useQuery({ queryKey: keys.me, queryFn: api.me });
}

/**
 * The wallet, or `null` if the user hasn't created one yet (the backend 404s on
 * /wallets/me until then — we treat that as "no wallet", not an error).
 */
export function useWallet() {
  return useQuery<Wallet | null>({
    queryKey: keys.wallet,
    queryFn: async () => {
      try {
        return await api.getWallet();
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function useStatement() {
  return useQuery<StatementEntry[]>({
    queryKey: keys.statement,
    queryFn: api.getStatement,
  });
}

export function useCreateWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createWallet,
    onSuccess: (wallet) => qc.setQueryData(keys.wallet, wallet),
  });
}

export function useDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount: string) => api.deposit(amount),
    onSuccess: (wallet) => {
      qc.setQueryData(keys.wallet, wallet);
      qc.invalidateQueries({ queryKey: keys.statement });
    },
  });
}

export function useSendMoney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: P2PPayload) => api.sendP2P(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallet });
      qc.invalidateQueries({ queryKey: keys.statement });
    },
  });
}
