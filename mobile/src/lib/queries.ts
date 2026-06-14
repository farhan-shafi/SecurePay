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
  type Beneficiary,
  type P2PPayload,
  type Quote,
  type StatementEntry,
  type Wallet,
} from './api';

export const keys = {
  me: ['me'] as const,
  wallet: ['wallet'] as const,
  statement: ['statement'] as const,
  beneficiaries: ['beneficiaries'] as const,
};

export function useProfile() {
  return useQuery({ queryKey: keys.me, queryFn: api.me });
}

export function useVerifyIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.verifyIdentity,
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
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
    mutationFn: (currency: string) => api.createWallet(currency),
    onSuccess: (wallet) => qc.setQueryData(keys.wallet, wallet),
  });
}

export function useBeneficiaries() {
  return useQuery<Beneficiary[]>({
    queryKey: keys.beneficiaries,
    queryFn: api.listBeneficiaries,
  });
}

export function useAddBeneficiary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ walletId, nickname }: { walletId: number; nickname?: string }) =>
      api.addBeneficiary(walletId, nickname),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.beneficiaries }),
  });
}

export function useDeleteBeneficiary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteBeneficiary(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.beneficiaries }),
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

/** Live preview of a (possibly cross-currency) transfer. `enabled` should be
 *  false until the amount is a valid positive number. */
export function useQuote(recipientWalletId: number, amount: string, enabled: boolean) {
  return useQuery<Quote>({
    queryKey: ['quote', recipientWalletId, amount],
    queryFn: () => api.getQuote(recipientWalletId, amount),
    enabled,
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
