/**
 * Security center — the user's own fraud-screening events. Every transfer is
 * scored before money moves; anything that trips a rule lands here with its
 * score, the signals that fired, and what the system did about it.
 */
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card } from '@/components/Card';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useFraudLogs } from '@/lib/queries';
import { formatDateTime, humanize } from '@/lib/format';
import { colors, font, radius, spacing } from '@/theme/tokens';

const SIGNAL_LABELS: Record<string, string> = {
  high_velocity: 'Many transfers in a short time',
  unusual_amount: 'Much larger than your average',
  amount_zscore_anomaly: 'Far outside your normal pattern',
  new_large_recipient: 'Large payment to a new recipient',
};

function riskColors(action: string) {
  if (action === 'block') return { fg: colors.danger, bg: colors.dangerSoft };
  return { fg: colors.warning, bg: colors.warningSoft };
}

export default function Security() {
  const q = useFraudLogs();
  const items = q.data ?? [];

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Security" />
      {q.isLoading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={() => q.refetch()}
              tintColor={colors.brand}
            />
          }
          ListHeaderComponent={
            <Text style={styles.lead}>
              Every transfer is screened for fraud before any money moves. Events that
              looked unusual show up here.
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={36} color={colors.success} />
              <Text style={styles.emptyText}>
                All clear — none of your transfers have looked suspicious.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const c = riskColors(item.action_taken);
            return (
              <Card style={styles.row}>
                <View style={styles.top}>
                  <View style={[styles.badge, { backgroundColor: c.bg }]}>
                    <Ionicons
                      name={item.action_taken === 'block' ? 'hand-left-outline' : 'eye-outline'}
                      size={14}
                      color={c.fg}
                    />
                    <Text style={[styles.badgeText, { color: c.fg }]}>
                      {item.action_taken === 'block' ? 'Blocked' : 'Under review'}
                    </Text>
                  </View>
                  <Text style={styles.score}>
                    Risk {Number(item.fraud_score).toFixed(0)}/100 · {humanize(item.risk_level)}
                  </Text>
                </View>
                <View style={styles.signals}>
                  {item.detected_signals.map((s) => (
                    <Text key={s} style={styles.signal}>
                      • {SIGNAL_LABELS[s] ?? humanize(s)}
                    </Text>
                  ))}
                </View>
                <Text style={styles.meta}>{formatDateTime(item.created_at)}</Text>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.huge },
  lead: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  row: { gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  badgeText: { fontFamily: font.family.semibold, fontSize: font.size.sm },
  score: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  signals: { gap: 3 },
  signal: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textPrimary,
  },
  meta: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textMuted,
  },
  empty: { alignItems: 'center', gap: spacing.md, marginTop: spacing.huge },
  emptyText: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
