/**
 * The hero of the home screen: a gradient "card" that shows the available
 * balance. The oversized whole number with smaller cents, the faint decorative
 * circles, and the soft coloured shadow are what give the app its premium feel.
 * An eye button hides/shows the amount for privacy in public.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, font, radius, shadow, spacing } from '@/theme/tokens';
import { splitMoney } from '@/lib/format';
import { currencyMeta } from '@/lib/currencies';

export function BalanceCard({
  balance,
  currency,
  walletId,
}: {
  balance: string;
  currency: string;
  walletId: number;
}) {
  const [hidden, setHidden] = useState(false);
  const { whole, cents } = splitMoney(balance, currency);
  const meta = currencyMeta(currency);

  return (
    <LinearGradient
      colors={colors.brandGradientDeep}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, shadow.brand]}
    >
      {/* Decorative translucent circles for depth. */}
      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />

      <View style={styles.labelRow}>
        <Text style={styles.label}>Available balance</Text>
        <Pressable
          onPress={() => setHidden((h) => !h)}
          hitSlop={12}
          style={styles.eye}
          accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}
        >
          <Ionicons
            name={hidden ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={colors.onBrandDim}
          />
        </Pressable>
      </View>

      <View style={styles.amountRow}>
        {hidden ? (
          <Text style={styles.whole}>{meta.symbol}••••••</Text>
        ) : (
          <>
            <Text style={styles.whole}>{whole}</Text>
            <Text style={styles.cents}>{cents}</Text>
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.meta}>
          {meta.flag} {currency} wallet
        </Text>
        <View style={styles.chip}>
          <Text style={styles.chipText}>#{walletId}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.xxl,
    overflow: 'hidden',
    minHeight: 188,
    justifyContent: 'space-between',
  },
  blob: {
    position: 'absolute',
    backgroundColor: colors.onBrandFaint,
    borderRadius: 999,
  },
  blobTop: {
    width: 160,
    height: 160,
    top: -70,
    right: -40,
  },
  blobBottom: {
    width: 120,
    height: 120,
    bottom: -50,
    left: -30,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.onBrandDim,
    letterSpacing: 0.4,
  },
  eye: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -4,
    marginTop: -4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.sm,
  },
  whole: {
    fontFamily: font.family.bold,
    fontSize: font.size.display,
    color: colors.onBrand,
    letterSpacing: -1,
  },
  cents: {
    fontFamily: font.family.semibold,
    fontSize: font.size.xl,
    color: colors.onBrandDim,
    marginBottom: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  meta: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.onBrandDim,
  },
  chip: {
    backgroundColor: colors.onBrandFaint,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  chipText: {
    fontFamily: font.family.semibold,
    fontSize: font.size.xs,
    color: colors.onBrand,
  },
});
