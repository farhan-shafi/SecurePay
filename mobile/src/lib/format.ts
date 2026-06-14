/**
 * Small formatting helpers. Implemented by hand (no Intl) so they behave
 * identically on every device/JS engine — Hermes' Intl support varies by
 * version and we don't want money rendering differently on someone's phone.
 */

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  PKR: '₨',
};

/** 1234.5 -> "$1,234.50" */
export function formatMoney(value: string | number, currency = 'USD'): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!isFinite(n)) return '—';

  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const sign = n < 0 ? '-' : '';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${symbol}${grouped}.${dec}`;
}

/** Split a formatted amount into the part before/after the decimal point so we
 *  can render the cents smaller on the balance card. */
export function splitMoney(value: string | number, currency = 'USD') {
  const full = formatMoney(value, currency);
  const dot = full.lastIndexOf('.');
  if (dot === -1) return { whole: full, cents: '' };
  return { whole: full.slice(0, dot), cents: full.slice(dot) };
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** ISO timestamp -> "Jun 13, 2:45 PM" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
}

/** Capitalise + de-snake a backend enum, e.g. "p2p" -> "P2P", "in_review" -> "In review". */
export function humanize(value: string): string {
  if (value.toLowerCase() === 'p2p') return 'P2P';
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Initials for an avatar, e.g. ("Alice","Smith") -> "AS". */
export function initials(first: string, last: string): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?';
}

/** A human title for a statement entry: who it was to/from, or the note. */
export function statementTitle(e: {
  transaction_type: string;
  direction: 'credit' | 'debit';
  description: string | null;
  counterparty_name: string | null;
}): string {
  if (e.transaction_type === 'deposit') return e.description?.trim() || 'Top-up';
  const who = e.counterparty_name?.trim();
  if (who) return e.direction === 'credit' ? `From ${who}` : `To ${who}`;
  return e.description?.trim() || humanize(e.transaction_type);
}
