/**
 * Which of the user's wallets is currently active. A user can hold one wallet
 * per currency; the Home switcher sets this, and every wallet-scoped hook
 * (balance, statement, deposit, send) reads it. Null = the primary (oldest)
 * wallet — so single-wallet users never notice this layer exists.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface WalletSelection {
  selectedId: number | null;
  select: (id: number | null) => void;
}

const Ctx = createContext<WalletSelection | null>(null);

export function WalletSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const value = useMemo(
    () => ({ selectedId, select: setSelectedId }),
    [selectedId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWalletSelection(): WalletSelection {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useWalletSelection must be used inside <WalletSelectionProvider>');
  }
  return ctx;
}
