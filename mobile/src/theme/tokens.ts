/**
 * Design tokens — the single source of truth for the app's look.
 *
 * Keeping colours, spacing, type and shadows in one place (instead of
 * hard-coding hex values in every component) is what lets the whole app feel
 * consistent and "designed". Change a value here and it ripples everywhere.
 */

export const colors = {
  // Brand — a royal indigo→violet that reads as trustworthy + premium.
  brand: '#5A4FF3',
  brandDark: '#3F32D6',
  brandGradient: ['#7B61FF', '#5A4FF3'] as const,
  brandGradientDeep: ['#6E56F8', '#4B32E0'] as const,

  // Surfaces — cool off-white background with pure-white cards on top.
  bg: '#F4F5FB',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F1F8',

  // Text
  textPrimary: '#16162E',
  textSecondary: '#6B6E86',
  textMuted: '#9A9DB5',

  border: '#E8E9F3',

  // Semantic — money in (credit) vs money out (debit) and states.
  success: '#0FB985',
  successSoft: '#E3F7F0',
  danger: '#F2516B',
  dangerSoft: '#FDE7EC',
  warning: '#F5A623',
  warningSoft: '#FDF1DD',

  // On-brand (text/icons placed over the gradient card).
  onBrand: '#FFFFFF',
  onBrandDim: 'rgba(255,255,255,0.72)',
  onBrandFaint: 'rgba(255,255,255,0.16)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const font = {
  family: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  size: {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 30,
    display: 40,
  },
} as const;

// iOS uses shadow*, Android uses elevation — we set both so cards lift on both.
export const shadow = {
  card: {
    shadowColor: '#1B1B3A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  brand: {
    shadowColor: '#5A4FF3',
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  floating: {
    shadowColor: '#1B1B3A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
} as const;
