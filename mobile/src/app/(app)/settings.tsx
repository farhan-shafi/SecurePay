/**
 * Account / settings — reached by tapping the greeting on Home. Shows the
 * user's profile and wallet details, and is where Sign out lives.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { currencyMeta } from '@/lib/currencies';
import { formatDateTime, initials } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useProfile, useWallet } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function Settings() {
  const router = useRouter();
  const { signOut } = useAuth();
  const profile = useProfile();
  const wallet = useWallet();
  const u = profile.data;

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Account" />
      <Screen edgeTop={false}>
        {!u ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />
        ) : (
          <>
            {/* Profile header */}
            <Card style={styles.profile}>
              <Avatar label={initials(u.first_name, u.last_name)} size={64} />
              <Text style={styles.name}>
                {u.first_name} {u.last_name}
              </Text>
              <Text style={styles.email}>{u.email}</Text>
            </Card>

            {/* Account details */}
            <Text style={styles.sectionTitle}>Details</Text>
            <Card style={styles.detailCard}>
              <DetailRow icon="mail-outline" label="Email" value={u.email} />
              <Divider />
              <Pressable
                style={styles.row}
                onPress={() => router.push('/(app)/change-email')}
              >
                <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
                <Text style={[styles.rowLabel, styles.grow]}>Change email</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
              <Divider />
              <Pressable
                style={styles.row}
                onPress={() => router.push('/(app)/security')}
              >
                <Ionicons name="shield-half-outline" size={20} color={colors.textSecondary} />
                <Text style={[styles.rowLabel, styles.grow]}>Security & fraud events</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
              <Divider />
              <DetailRow icon="call-outline" label="Phone" value={u.phone_number} />
              <Divider />
              {/* Identity — tappable "Verify now" when not yet verified */}
              <View style={styles.row}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color={colors.textSecondary}
                />
                <Text style={[styles.rowLabel, styles.grow]}>Email verified</Text>
                {u.kyc_verified ? (
                  <Text style={[styles.rowValueStatic, { color: colors.success }]}>
                    Verified
                  </Text>
                ) : (
                  <Pressable
                    onPress={() => router.push('/(app)/verify-identity')}
                    style={styles.verifyBtn}
                  >
                    <Text style={styles.verifyText}>Verify now</Text>
                  </Pressable>
                )}
              </View>
              <Divider />
              <DetailRow
                icon="calendar-outline"
                label="Member since"
                value={formatDateTime(u.created_at)}
              />
            </Card>

            {/* Wallet details */}
            {wallet.data ? (
              <>
                <Text style={styles.sectionTitle}>Wallet</Text>
                <Card style={styles.detailCard}>
                  <DetailRow
                    icon="wallet-outline"
                    label="Wallet id"
                    value={`#${wallet.data.id}`}
                  />
                  <Divider />
                  <DetailRow
                    icon="cash-outline"
                    label="Currency"
                    value={`${currencyMeta(wallet.data.currency).flag}  ${wallet.data.currency} · ${currencyMeta(wallet.data.currency).name}`}
                  />
                </Card>
              </>
            ) : null}

            {/* Sign out */}
            <Pressable style={styles.signOut} onPress={signOut}>
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </>
        )}
      </Screen>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.textSecondary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  profile: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  name: {
    fontFamily: font.family.bold,
    fontSize: font.size.xl,
    color: colors.textPrimary,
  },
  email: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
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
    gap: spacing.md,
    paddingVertical: spacing.md,
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
  rowValueStatic: {
    fontFamily: font.family.semibold,
    fontSize: font.size.md,
    color: colors.textPrimary,
  },
  grow: { flex: 1 },
  divider: { height: 1, backgroundColor: colors.border },
  verifyBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    minWidth: 92,
    alignItems: 'center',
  },
  verifyText: {
    fontFamily: font.family.semibold,
    fontSize: font.size.sm,
    color: colors.onBrand,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  signOutText: {
    fontFamily: font.family.semibold,
    fontSize: font.size.md,
    color: colors.danger,
  },
});
