/**
 * Full detail for one statement entry: who, how much, wallet numbers, dates,
 * status, and (for cross-currency) the conversion. Can be saved as a PDF
 * receipt. The entry is read from the cached statement, so no extra fetch.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { formatDateTime, formatMoney, humanize } from '@/lib/format';
import { buildReceiptHtml, presentPdf } from '@/lib/pdf';
import { useProfile, useStatement } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const statement = useStatement();
  const profile = useProfile();
  const [saving, setSaving] = useState(false);

  const entry = (statement.data ?? []).find((e) => e.id === Number(id));

  if (!entry) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Transaction" />
        <Screen edgeTop={false}>
          <Text style={styles.missing}>This transaction is no longer available.</Text>
        </Screen>
      </View>
    );
  }

  const credit = entry.direction === 'credit';
  const sign = credit ? '+' : '−';
  const crossCurrency =
    !!entry.from_currency && entry.from_currency !== entry.to_currency;

  const rows: { label: string; value: string }[] = [
    { label: 'Status', value: humanize(entry.status) },
    { label: 'Type', value: humanize(entry.transaction_type) },
  ];
  if (entry.counterparty_name)
    rows.push({ label: credit ? 'From' : 'To', value: entry.counterparty_name });
  if (entry.counterparty_wallet_id)
    rows.push({ label: 'Wallet number', value: `#${entry.counterparty_wallet_id}` });
  rows.push({ label: 'Reference', value: `TXN-${entry.id}` });
  rows.push({ label: 'Date', value: formatDateTime(entry.created_at) });
  if (entry.completed_at)
    rows.push({ label: 'Completed', value: formatDateTime(entry.completed_at) });
  if (entry.description) rows.push({ label: 'Note', value: entry.description });

  const onSave = async () => {
    setSaving(true);
    try {
      const result = await presentPdf(
        buildReceiptHtml(entry, profile.data),
        `receipt-TXN-${entry.id}.pdf`,
      );
      if (result === 'saved') {
        Alert.alert('Saved', 'The receipt PDF was saved to your selected folder.');
      }
    } catch {
      Alert.alert('Could not create PDF', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Transaction" />
      <Screen edgeTop={false}>
        {/* Hero amount */}
        <View style={styles.hero}>
          <View
            style={[
              styles.icon,
              { backgroundColor: credit ? colors.successSoft : colors.surfaceAlt },
            ]}
          >
            <Ionicons
              name={credit ? 'arrow-down' : 'arrow-up'}
              size={26}
              color={credit ? colors.success : colors.textSecondary}
            />
          </View>
          <Text style={styles.heroLabel}>{credit ? 'Received' : 'Sent'}</Text>
          <Text
            style={[
              styles.heroAmount,
              { color: credit ? colors.success : colors.textPrimary },
            ]}
          >
            {sign}
            {formatMoney(entry.amount, entry.currency)}
          </Text>
        </View>

        {/* Details */}
        <Card style={styles.detailCard}>
          {rows.map((r, i) => (
            <View key={r.label}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue}>{r.value}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Conversion */}
        {crossCurrency && entry.from_amount && entry.to_amount ? (
          <>
            <Text style={styles.sectionTitle}>Currency conversion</Text>
            <Card style={styles.detailCard}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Sent</Text>
                <Text style={styles.rowValue}>
                  {formatMoney(entry.from_amount, entry.from_currency!)}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Received</Text>
                <Text style={styles.rowValue}>
                  {formatMoney(entry.to_amount, entry.to_currency!)}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Exchange rate</Text>
                <Text style={styles.rowValue}>
                  1 {entry.from_currency} = {Number(entry.exchange_rate).toFixed(4)}{' '}
                  {entry.to_currency}
                </Text>
              </View>
            </Card>
          </>
        ) : null}

        <Button
          label="Save as PDF"
          onPress={onSave}
          loading={saving}
          icon={<Ionicons name="download-outline" size={20} color={colors.onBrand} />}
          style={styles.cta}
        />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  missing: {
    fontFamily: font.family.medium,
    fontSize: font.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.huge,
  },
  hero: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  heroLabel: {
    fontFamily: font.family.medium,
    fontSize: font.size.md,
    color: colors.textSecondary,
  },
  heroAmount: {
    fontFamily: font.family.bold,
    fontSize: font.size.display,
    letterSpacing: -1,
  },
  sectionTitle: {
    fontFamily: font.family.semibold,
    fontSize: font.size.sm,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: spacing.xs,
    marginBottom: -spacing.xs,
  },
  detailCard: { paddingVertical: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  rowLabel: {
    fontFamily: font.family.medium,
    fontSize: font.size.md,
    color: colors.textSecondary,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: font.family.semibold,
    fontSize: font.size.md,
    color: colors.textPrimary,
  },
  divider: { height: 1, backgroundColor: colors.border },
  cta: { marginTop: spacing.sm },
});
