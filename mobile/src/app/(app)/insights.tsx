/**
 * Spending insights — monthly money in vs money out, derived entirely from the
 * statement the app already has (no extra backend endpoint needed). Bars are
 * plain Views scaled against the biggest month, so no chart library.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { formatMoney } from '@/lib/format';
import { useStatement, useWallet } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthBucket {
  label: string;
  in: number;
  out: number;
}

function lastSixMonths(entries: { amount: string; direction: string; created_at: string }[]) {
  const buckets: MonthBucket[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ label: MONTHS[d.getMonth()], in: 0, out: 0 });
  }
  const startIndex = new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime();
  for (const e of entries) {
    const t = new Date(e.created_at);
    if (t.getTime() < startIndex) continue;
    const offset =
      (t.getFullYear() - new Date(startIndex).getFullYear()) * 12 +
      t.getMonth() -
      new Date(startIndex).getMonth();
    const bucket = buckets[offset];
    if (!bucket) continue;
    if (e.direction === 'credit') bucket.in += Number(e.amount);
    else bucket.out += Number(e.amount);
  }
  return buckets;
}

export default function Insights() {
  const statement = useStatement();
  const wallet = useWallet();
  const currency = wallet.data?.currency ?? 'USD';

  const buckets = lastSixMonths(statement.data ?? []);
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.in, b.out)));
  const thisMonth = buckets[buckets.length - 1];

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Insights" />
      <Screen edgeTop={false}>
        {/* This month at a glance */}
        <View style={styles.summaryRow}>
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>In · {thisMonth?.label}</Text>
            <Text style={[styles.summaryValue, { color: colors.success }]}>
              {formatMoney(thisMonth?.in ?? 0, currency)}
            </Text>
          </Card>
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Out · {thisMonth?.label}</Text>
            <Text style={[styles.summaryValue, { color: colors.danger }]}>
              {formatMoney(thisMonth?.out ?? 0, currency)}
            </Text>
          </Card>
        </View>

        {/* 6-month chart */}
        <Card style={styles.chartCard}>
          <Text style={styles.chartTitle}>Last 6 months</Text>
          <View style={styles.chart}>
            {buckets.map((b) => (
              <View key={b.label} style={styles.month}>
                <View style={styles.bars}>
                  <View
                    style={[
                      styles.bar,
                      { height: Math.max(3, (b.in / max) * 120), backgroundColor: colors.success },
                    ]}
                  />
                  <View
                    style={[
                      styles.bar,
                      { height: Math.max(3, (b.out / max) * 120), backgroundColor: colors.danger },
                    ]}
                  />
                </View>
                <Text style={styles.monthLabel}>{b.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Money in</Text>
            <View style={[styles.dot, { backgroundColor: colors.danger, marginLeft: spacing.lg }]} />
            <Text style={styles.legendText}>Money out</Text>
          </View>
        </Card>

        <Text style={styles.note}>
          Amounts are in your wallet currency ({currency}), from your statement.
        </Text>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  summaryRow: { flexDirection: 'row', gap: spacing.md },
  summaryCard: { flex: 1, gap: spacing.xs },
  summaryLabel: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  summaryValue: { fontFamily: font.family.bold, fontSize: font.size.xl },
  chartCard: { gap: spacing.lg },
  chartTitle: {
    fontFamily: font.family.semibold,
    fontSize: font.size.lg,
    color: colors.textPrimary,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 150,
  },
  month: { alignItems: 'center', gap: spacing.sm, flex: 1 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 120 },
  bar: { width: 12, borderRadius: radius.sm / 2 },
  monthLabel: {
    fontFamily: font.family.medium,
    fontSize: font.size.xs,
    color: colors.textMuted,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  note: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
