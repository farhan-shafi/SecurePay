/**
 * One line in the activity list. A coloured arrow icon shows direction, the
 * amount is green (+) for credits and dark (−) for debits, and the status pill
 * surfaces anything that isn't a plain completed transfer.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, font, radius, spacing } from '@/theme/tokens';
import { formatDateTime, formatMoney, statementTitle } from '@/lib/format';
import type { StatementEntry } from '@/lib/api';
import { StatusPill } from './StatusPill';

export function TransactionRow({
  entry,
  currency = 'USD',
  onPress,
}: {
  entry: StatementEntry;
  currency?: string;
  onPress?: () => void;
}) {
  const credit = entry.direction === 'credit';
  const sign = credit ? '+' : '−';
  const title = statementTitle(entry);

  const Container = onPress ? Pressable : View;

  return (
    <Container style={styles.row} onPress={onPress}>
      <View
        style={[
          styles.icon,
          { backgroundColor: credit ? colors.successSoft : colors.surfaceAlt },
        ]}
      >
        <Ionicons
          name={credit ? 'arrow-down' : 'arrow-up'}
          size={20}
          color={credit ? colors.success : colors.textSecondary}
        />
      </View>

      <View style={styles.middle}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.date}>{formatDateTime(entry.created_at)}</Text>
      </View>

      <View style={styles.right}>
        <Text
          style={[
            styles.amount,
            { color: credit ? colors.success : colors.textPrimary },
          ]}
        >
          {sign}
          {formatMoney(entry.amount, currency)}
        </Text>
        {entry.status.toLowerCase() !== 'completed' && (
          <StatusPill status={entry.status} />
        )}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, gap: 2 },
  title: {
    fontFamily: font.family.semibold,
    fontSize: font.size.md,
    color: colors.textPrimary,
  },
  date: {
    fontFamily: font.family.regular,
    fontSize: font.size.xs,
    color: colors.textMuted,
  },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: {
    fontFamily: font.family.bold,
    fontSize: font.size.md,
  },
});
