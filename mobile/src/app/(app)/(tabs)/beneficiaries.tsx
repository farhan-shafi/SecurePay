/**
 * Payees — the saved-beneficiary list (like a bank's payee list). Tap a payee
 * to send them money; "Add payee" opens the add screen; long-press to remove.
 * You can only send to someone you've saved here first.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

import { Avatar } from '@/components/Avatar';
import { type Beneficiary } from '@/lib/api';
import { currencyMeta } from '@/lib/currencies';
import { useBeneficiaries, useDeleteBeneficiary } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

function nameInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase() || '?';
}

export default function Beneficiaries() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const beneficiaries = useBeneficiaries();
  const remove = useDeleteBeneficiary();
  const data = beneficiaries.data ?? [];

  const openSend = (b: Beneficiary) => {
    router.push({
      pathname: '/(app)/send',
      params: {
        walletId: String(b.wallet_id),
        name: b.nickname || b.name,
        currency: b.currency,
      },
    });
  };

  const confirmRemove = (b: Beneficiary) => {
    Alert.alert('Remove payee', `Remove ${b.nickname || b.name} from your payees?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(b.id) },
    ]);
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
            refreshing={beneficiaries.isFetching && !beneficiaries.isLoading}
            onRefresh={() => beneficiaries.refetch()}
            tintColor={colors.brand}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Payees</Text>
            <Pressable
              style={styles.addBtn}
              onPress={() => router.push('/(app)/add-beneficiary')}
            >
              <Ionicons name="add" size={20} color={colors.onBrand} />
              <Text style={styles.addText}>Add payee</Text>
            </Pressable>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) => {
          const meta = currencyMeta(item.currency);
          return (
            <View style={styles.row}>
              <Pressable
                style={styles.rowMain}
                onPress={() => openSend(item)}
                onLongPress={() => confirmRemove(item)}
              >
                <Avatar label={nameInitials(item.nickname || item.name)} size={46} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.nickname || item.name}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.nickname ? `${item.name} · ` : ''}
                    {meta.flag} {item.currency} · wallet #{item.wallet_id}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => confirmRemove(item)}
                hitSlop={10}
                style={styles.deleteBtn}
                accessibilityLabel={`Remove ${item.nickname || item.name}`}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          beneficiaries.isLoading ? (
            <ActivityIndicator color={colors.brand} style={styles.loading} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={34} color={colors.textMuted} />
              <Text style={styles.emptyText}>No payees yet</Text>
              <Text style={styles.emptySub}>
                Add someone by their wallet id to send them money.
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: font.family.bold,
    fontSize: font.size.xxxl,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  addText: {
    fontFamily: font.family.semibold,
    fontSize: font.size.sm,
    color: colors.onBrand,
  },
  gap: { height: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.lg,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  rowText: { flex: 1 },
  deleteBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: {
    fontFamily: font.family.semibold,
    fontSize: font.size.lg,
    color: colors.textPrimary,
  },
  rowSub: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
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
