/**
 * Statement — the full transaction history, newest first. Rows are tappable
 * (→ transaction detail), filterable by date range, and the visible range can
 * be downloaded as a PDF. Uses a FlatList for smooth scrolling + RefreshControl.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TransactionRow } from '@/components/TransactionRow';
import { ApiError } from '@/lib/api';
import { buildStatementHtml, savePdf } from '@/lib/pdf';
import { useProfile, useStatement, useWallet } from '@/lib/queries';
import { colors, font, radius, shadow, spacing } from '@/theme/tokens';

const RANGES = [
  { key: 'all', label: 'All', days: null as number | null },
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
];

export default function Statement() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const statement = useStatement();
  const wallet = useWallet();
  const profile = useProfile();

  const [rangeKey, setRangeKey] = useState('all');
  const [downloading, setDownloading] = useState(false);

  const range = RANGES.find((r) => r.key === rangeKey)!;
  const cutoff = range.days ? Date.now() - range.days * 86_400_000 : 0;
  const data = (statement.data ?? []).filter(
    (e) => new Date(e.created_at).getTime() >= cutoff,
  );
  const rangeLabel = range.days ? `Last ${range.days} days` : 'All time';

  const onDownload = async () => {
    if (data.length === 0) {
      Alert.alert('Nothing to download', 'No transactions in this range.');
      return;
    }
    setDownloading(true);
    try {
      const result = await savePdf(
        buildStatementHtml(data, profile.data, wallet.data ?? undefined, rangeLabel),
        'securepay-statement.pdf',
      );
      if (result === 'saved') {
        Alert.alert('Saved', 'Your statement PDF was saved to your selected folder.');
      }
    } catch {
      Alert.alert('Could not create PDF', 'Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={statement.isFetching && !statement.isLoading}
            onRefresh={() => statement.refetch()}
            tintColor={colors.brand}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Statement</Text>
              <Pressable
                style={styles.downloadBtn}
                onPress={onDownload}
                disabled={downloading}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={16} color={colors.brand} />
                    <Text style={styles.downloadText}>PDF</Text>
                  </>
                )}
              </Pressable>
            </View>
            <View style={styles.filters}>
              {RANGES.map((r) => {
                const active = r.key === rangeKey;
                return (
                  <Pressable
                    key={r.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setRangeKey(r.key)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        renderItem={({ item }) => (
          <View style={styles.rowWrap}>
            <TransactionRow
              entry={item}
              currency={wallet.data?.currency}
              onPress={() => router.push(`/(app)/transaction/${item.id}`)}
            />
          </View>
        )}
        ListEmptyComponent={
          statement.isLoading ? (
            <ActivityIndicator color={colors.brand} style={styles.loading} />
          ) : statement.isError ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {statement.error instanceof ApiError
                  ? statement.error.message
                  : 'Could not load statement.'}
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No transactions in this range</Text>
              <Text style={styles.emptySub}>
                Try a wider date range, or add money / send a transfer.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { marginBottom: spacing.lg, gap: spacing.lg },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: font.family.bold,
    fontSize: font.size.xxxl,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 64,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    ...shadow.card,
  },
  downloadText: {
    fontFamily: font.family.semibold,
    fontSize: font.size.sm,
    color: colors.brand,
  },
  filters: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brand },
  chipText: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  chipTextActive: { color: colors.onBrand },
  rowWrap: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  loading: { marginTop: spacing.huge },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.huge,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    fontFamily: font.family.semibold,
    fontSize: font.size.lg,
    color: colors.textSecondary,
  },
  emptySub: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
