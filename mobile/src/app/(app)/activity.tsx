/**
 * Activity — the full transaction statement, newest first, with pull-to-refresh.
 * Uses a FlatList (not the shared Screen ScrollView) so a long history stays
 * smooth and we get a native RefreshControl.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TransactionRow } from '@/components/TransactionRow';
import { ApiError } from '@/lib/api';
import { useStatement } from '@/lib/queries';
import { colors, font, radius, shadow, spacing } from '@/theme/tokens';

export default function Activity() {
  const insets = useSafeAreaInsets();
  const statement = useStatement();
  const data = statement.data ?? [];

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
        ListHeaderComponent={<Text style={styles.title}>Activity</Text>}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        renderItem={({ item }) => (
          <View style={styles.rowWrap}>
            <TransactionRow entry={item} />
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
                  : 'Could not load activity.'}
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptySub}>
                Add money or send a transfer to get started.
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
  title: {
    fontFamily: font.family.bold,
    fontSize: font.size.xxxl,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: spacing.lg,
  },
  rowWrap: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
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
