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
  api,
  type Beneficiary,
  type P2PPayload,
  type Quote,
  type StatementEntry,
  type Wallet,
} from './api';
import { useWalletSelection } from './wallet-context';

export const keys = {
  me: ['me'] as const,
  wallet: ['wallet'] as const,
  statement: ['statement'] as const,
  beneficiaries: ['beneficiaries'] as const,
  notifications: ['notifications'] as const,
  fraudLogs: ['fraudLogs'] as const,
};

export function useProfile() {
  return useQuery({ queryKey: keys.me, queryFn: api.me });
}

export function useStartVerification() {
  return useMutation({ mutationFn: api.startVerification });
}

export function useConfirmVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.confirmVerification(code),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
}

export function useNotifications() {
  return useQuery({ queryKey: keys.notifications, queryFn: api.getNotifications });
}

export function useFraudLogs() {
  return useQuery({ queryKey: keys.fraudLogs, queryFn: api.getFraudLogs });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => api.forgotPassword(email) });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (v: { email: string; code: string; password: string }) =>
      api.resetPassword(v.email, v.code, v.password),
  });
}

export function useChangeEmailStart() {
  return useMutation({ mutationFn: (email: string) => api.changeEmailStart(email) });
}

export function useChangeEmailConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.changeEmailConfirm(code),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
}

/** All of the user's wallets (one per currency), oldest first. */
export function useWallets() {
  return useQuery<Wallet[]>({ queryKey: keys.wallet, queryFn: api.getWallets });
}

/**
 * The ACTIVE wallet (the one the Home switcher selected; defaults to the
 * primary/oldest). Returns the wallets query with `data` narrowed to that one
 * wallet — `data` is undefined until the user has created any wallet — so the
 * many screens written against a single wallet keep working unchanged.
 */
export function useWallet() {
  const q = useWallets();
  const { selectedId } = useWalletSelection();
  const list = q.data ?? [];
  const data = list.find((w) => w.id === selectedId) ?? list[0];
  return { ...q, data };
}

export function useStatement() {
  const wallet = useWallet();
  const walletId = wallet.data?.id;
  return useQuery<StatementEntry[]>({
    queryKey: [...keys.statement, walletId],
    queryFn: () => api.getStatement(walletId),
    enabled: walletId != null,
  });
}

export function useCreateWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (currency: string) => api.createWallet(currency),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.wallet }),
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
  const wallet = useWallet();
  const walletId = wallet.data?.id;
  return useMutation({
    mutationFn: (amount: string) => api.deposit(amount, walletId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallet });
      qc.invalidateQueries({ queryKey: keys.statement });
    },
  });
}

/** Live preview of a (possibly cross-currency) transfer. `enabled` should be
 *  false until the amount is a valid positive number. */
export function useQuote(recipientWalletId: number, amount: string, enabled: boolean) {
  const wallet = useWallet();
  const senderId = wallet.data?.id;
  return useQuery<Quote>({
    queryKey: ['quote', recipientWalletId, amount, senderId],
    queryFn: () => api.getQuote(recipientWalletId, amount, senderId),
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

export function useBillers() {
  return useQuery({ queryKey: ['billers'] as const, queryFn: api.listBillers });
}

export function usePayBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      biller_id: number;
      reference: string;
      amount: string;
      sender_wallet_id?: number;
      idempotency_key?: string;
    }) => api.payBill(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallet });
      qc.invalidateQueries({ queryKey: keys.statement });
    },
  });
}
