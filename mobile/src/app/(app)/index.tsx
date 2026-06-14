/**
 * Home — the wallet dashboard.
 *  - greeting + sign-out
 *  - the gradient balance card (or a "create wallet" prompt for new users)
 *  - quick actions (Add money / Send / Activity)
 *  - a preview of recent transactions
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { BalanceCard } from '@/components/BalanceCard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DepositSheet } from '@/components/DepositSheet';
import { Screen } from '@/components/Screen';
import { TransactionRow } from '@/components/TransactionRow';
import { ApiError } from '@/lib/api';
import { initials } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useCreateWallet, useProfile, useStatement, useWallet } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function Home() {
  const router = useRouter();
  const { signOut } = useAuth();

  const profile = useProfile();
  const wallet = useWallet();
  const statement = useStatement();
  const createWallet = useCreateWallet();

  const [depositOpen, setDepositOpen] = useState(false);

  const recent = (statement.data ?? []).slice(0, 4);

  // Pull-to-refresh: pull everything on the dashboard at once.
  const onRefresh = () => {
    profile.refetch();
    wallet.refetch();
    statement.refetch();
  };
  const refreshing =
    profile.isRefetching || wallet.isRefetching || statement.isRefetching;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {/* Greeting */}
      <View style={styles.greetRow}>
        <View style={styles.greetLeft}>
          <Avatar
            label={
              profile.data
                ? initials(profile.data.first_name, profile.data.last_name)
                : '…'
            }
          />
          <View>
            <Text style={styles.greetHello}>Welcome back</Text>
            <Text style={styles.greetName}>
              {profile.data ? profile.data.first_name : ' '}
            </Text>
          </View>
        </View>
        <Pressable onPress={signOut} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Balance / create-wallet */}
      {wallet.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : wallet.data ? (
        <BalanceCard
          balance={wallet.data.balance}
          currency={wallet.data.currency}
          walletId={wallet.data.id}
        />
      ) : (
        <Card style={styles.createCard}>
          <Ionicons name="wallet-outline" size={34} color={colors.brand} />
          <Text style={styles.createTitle}>Create your wallet</Text>
          <Text style={styles.createText}>
            You need a wallet before you can add or send money. It only takes a tap.
          </Text>
          <Button
            label="Create wallet"
            loading={createWallet.isPending}
            onPress={() => createWallet.mutate()}
            style={styles.createBtn}
          />
          {createWallet.error ? (
            <Text style={styles.errorText}>
              {createWallet.error instanceof ApiError
                ? createWallet.error.message
                : 'Could not create wallet.'}
            </Text>
          ) : null}
        </Card>
      )}

      {/* Quick actions — only meaningful once a wallet exists */}
      {wallet.data ? (
        <View style={styles.actions}>
          <QuickAction
            icon={<Ionicons name="add" size={24} color={colors.brand} />}
            label="Add money"
            onPress={() => setDepositOpen(true)}
          />
          <QuickAction
            icon={<Ionicons name="paper-plane-outline" size={22} color={colors.brand} />}
            label="Send"
            onPress={() => router.push('/(app)/send')}
          />
          <QuickAction
            icon={<Ionicons name="time-outline" size={23} color={colors.brand} />}
            label="Activity"
            onPress={() => router.push('/(app)/activity')}
          />
        </View>
      ) : null}

      {/* Recent activity */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        {recent.length > 0 && (
          <Pressable onPress={() => router.push('/(app)/activity')} hitSlop={8}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        )}
      </View>

      <Card style={styles.activityCard}>
        {statement.isLoading ? (
          <ActivityIndicator color={colors.brand} style={styles.activityLoading} />
        ) : recent.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        ) : (
          recent.map((entry, i) => (
            <View key={entry.id}>
              {i > 0 && <View style={styles.divider} />}
              <TransactionRow entry={entry} />
            </View>
          ))
        )}
      </Card>

      <DepositSheet visible={depositOpen} onClose={() => setDepositOpen(false)} />
    </Screen>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      <View style={styles.actionIcon}>{icon}</View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  greetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greetLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  greetHello: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  greetName: {
    fontFamily: font.family.bold,
    fontSize: font.size.xl,
    color: colors.textPrimary,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: { height: 188, alignItems: 'center', justifyContent: 'center' },

  createCard: { alignItems: 'center', gap: spacing.md },
  createTitle: {
    fontFamily: font.family.bold,
    fontSize: font.size.xl,
    color: colors.textPrimary,
  },
  createText: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  createBtn: { alignSelf: 'stretch', marginTop: spacing.sm },
  errorText: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.danger,
  },

  actions: { flexDirection: 'row', gap: spacing.md },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.textPrimary,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontFamily: font.family.bold,
    fontSize: font.size.lg,
    color: colors.textPrimary,
  },
  seeAll: {
    fontFamily: font.family.semibold,
    fontSize: font.size.sm,
    color: colors.brand,
  },
  activityCard: { paddingVertical: spacing.sm },
  activityLoading: { marginVertical: spacing.xl },
  divider: { height: 1, backgroundColor: colors.border },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: {
    fontFamily: font.family.medium,
    fontSize: font.size.md,
    color: colors.textMuted,
  },
});
