/**
 * Home — the wallet dashboard.
 *  - greeting (tap to open Settings / account details)
 *  - the gradient balance card with eye toggle (or a "create wallet" prompt)
 *  - quick actions (Add money / Send / Statement)
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
import { initials } from '@/lib/format';
import { currencyMeta } from '@/lib/currencies';
import { useProfile, useStatement, useWallet, useWallets } from '@/lib/queries';
import { useWalletSelection } from '@/lib/wallet-context';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function Home() {
  const router = useRouter();

  const profile = useProfile();
  const wallets = useWallets();
  const wallet = useWallet();
  const statement = useStatement();
  const { select } = useWalletSelection();

  const [depositOpen, setDepositOpen] = useState(false);

  const verified = !!profile.data?.kyc_verified;
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
      {/* Greeting — tap to open Settings */}
      <Pressable style={styles.greetRow} onPress={() => router.push('/(app)/settings')}>
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
        <View style={styles.headerIcons}>
          <Pressable
            onPress={() => router.push('/(app)/notifications')}
            hitSlop={8}
            style={styles.iconBtn}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
          </View>
        </View>
      </Pressable>

      {/* Wallet switcher — one chip per currency, plus "add" */}
      {(wallets.data?.length ?? 0) > 0 ? (
        <View style={styles.switcher}>
          {(wallets.data ?? []).map((w) => {
            const active = w.id === wallet.data?.id;
            return (
              <Pressable
                key={w.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => select(w.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {currencyMeta(w.currency).flag} {w.currency}
                </Text>
              </Pressable>
            );
          })}
          {(wallets.data?.length ?? 0) < 4 ? (
            <Pressable
              style={styles.chip}
              onPress={() => router.push('/(app)/create-wallet')}
              accessibilityLabel="Add a wallet"
            >
              <Ionicons name="add" size={16} color={colors.brand} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

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
      ) : !verified ? (
        <Card style={styles.verifyCard}>
          <View style={styles.verifyIcon}>
            <Ionicons name="mail-unread-outline" size={30} color={colors.warning} />
          </View>
          <Text style={styles.createTitle}>Verify your email</Text>
          <Text style={styles.createText}>
            Your email isn't verified yet. Verify it to create a wallet and start
            sending money.
          </Text>
          <Button
            label="Verify email"
            onPress={() => router.push('/(app)/verify-identity')}
            style={styles.createBtn}
          />
        </Card>
      ) : (
        <Card style={styles.createCard}>
          <Ionicons name="wallet-outline" size={34} color={colors.brand} />
          <Text style={styles.createTitle}>Create your wallet</Text>
          <Text style={styles.createText}>
            You need a wallet before you can add or send money. Pick a currency to
            get started.
          </Text>
          <Button
            label="Create wallet"
            onPress={() => router.push('/(app)/create-wallet')}
            style={styles.createBtn}
          />
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
            onPress={() => router.push('/(app)/(tabs)/beneficiaries')}
          />
          <QuickAction
            icon={<Ionicons name="qr-code-outline" size={22} color={colors.brand} />}
            label="Receive"
            onPress={() => router.push('/(app)/receive')}
          />
          <QuickAction
            icon={<Ionicons name="receipt-outline" size={22} color={colors.brand} />}
            label="Bills"
            onPress={() => router.push('/(app)/pay-bills')}
          />
        </View>
      ) : null}

      {/* Recent activity */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        {recent.length > 0 && (
          <Pressable onPress={() => router.push('/(app)/(tabs)/statement')} hitSlop={8}>
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
              <TransactionRow
                entry={entry}
                currency={wallet.data?.currency}
                onPress={() => router.push(`/(app)/transaction/${entry.id}`)}
              />
            </View>
          ))
        )}
      </Card>

      <DepositSheet
        visible={depositOpen}
        onClose={() => setDepositOpen(false)}
        currency={wallet.data?.currency}
      />
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
  headerIcons: { flexDirection: 'row', gap: spacing.sm },
  switcher: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: {
    fontFamily: font.family.semibold,
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  chipTextActive: { color: colors.onBrand },
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
  verifyCard: {
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.warning,
  },
  verifyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
