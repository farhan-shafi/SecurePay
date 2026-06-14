/** The currencies a wallet can hold — must match the backend's allowed set. */
export interface CurrencyMeta {
  code: string;
  symbol: string;
  name: string;
  flag: string;
}

export const CURRENCIES: CurrencyMeta[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', flag: '🇵🇰' },
];

export function currencyMeta(code: string): CurrencyMeta {
  return (
    CURRENCIES.find((c) => c.code === code) ?? {
      code,
      symbol: `${code} `,
      name: code,
      flag: '🏳️',
    }
  );
}
