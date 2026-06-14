/**
 * Find someone by email or wallet id, then either SAVE them as a payee or SEND
 * a one-time payment. We resolve their real name + wallet currency first (via
 * the lookup endpoint) so the user always sees who they're about to pay.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { ApiError, api, type Lookup } from '@/lib/api';
import { currencyMeta } from '@/lib/currencies';
import { useAddBeneficiary } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function AddBeneficiary() {
  const router = useRouter();
  const add = useAddBeneficiary();

  const [query, setQuery] = useState('');
  const [nickname, setNickname] = useState('');
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Lookup | null>(null);

  const onFind = async () => {
    setError(null);
    const q = query.trim();
    const isEmail = q.includes('@');
    const isId = /^\d+$/.test(q);
    if (!isEmail && !isId) {
      setError('Enter an email address or a numeric wallet id.');
      return;
    }
    setFinding(true);
    try {
      const result = await api.lookupPayee(
        isEmail ? { email: q } : { walletId: Number(q) },
      );
      setFound(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not find that person.');
    } finally {
      setFinding(false);
    }
  };

  const onSave = async () => {
    if (!found) return;
    setError(null);
    try {
      await add.mutateAsync({
        walletId: found.wallet_id,
        nickname: nickname.trim() || undefined,
      });
      Alert.alert('Payee added', `${found.name} is now in your payees.`);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add payee.');
    }
  };

  const onSendOnce = () => {
    if (!found) return;
    // Replace this screen with Send so "back" from Send returns to the Payees list.
    router.replace({
      pathname: '/(app)/send',
      params: {
        walletId: String(found.wallet_id),
        name: found.name,
        currency: found.currency,
      },
    });
  };

  const reset = () => {
    setFound(null);
    setNickname('');
    setError(null);
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="New recipient" />
      <Screen edgeTop={false}>
        {!found ? (
          <>
            <Text style={styles.lead}>
              Find someone by their email or wallet id. You can then save them as a
              payee or send a one-time payment.
            </Text>
            <Card style={styles.form}>
              <TextField
                label="Email or wallet id"
                value={query}
                onChangeText={setQuery}
                placeholder="name@example.com  or  2"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onSubmitEditing={onFind}
              />
              <Text style={styles.hint}>
                Enter the person's email, or their wallet id (e.g. 2).
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </Card>
            <Button label="Find" onPress={onFind} loading={finding} />
          </>
        ) : (
          <>
            {/* Resolved person + the two choices */}
            <Card style={styles.found}>
              <Avatar label={found.name.trim()[0]?.toUpperCase() ?? '?'} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={styles.foundName} numberOfLines={1}>
                  {found.name}
                </Text>
                <Text style={styles.foundSub}>
                  {currencyMeta(found.currency).flag} {found.currency} · wallet #
                  {found.wallet_id}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            </Card>

            <TextField
              label="Nickname (optional, for saving)"
              value={nickname}
              onChangeText={setNickname}
              placeholder="e.g. Mum, Rent, Work"
              maxLength={100}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label="Save as payee"
              onPress={onSave}
              loading={add.isPending}
            />
            <Button label="Send money" variant="secondary" onPress={onSendOnce} />
            <Button label="Search someone else" variant="ghost" onPress={reset} />
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  lead: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  form: { gap: spacing.sm },
  hint: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  found: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  foundName: {
    fontFamily: font.family.bold,
    fontSize: font.size.lg,
    color: colors.textPrimary,
  },
  foundSub: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  error: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.danger,
  },
});
