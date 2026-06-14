/**
 * Add a payee by their wallet id. The backend resolves the real account holder's
 * name, so once added the payee shows up by name in the Payees list. An optional
 * nickname lets the user label them ("Mum", "Rent").
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { useAddBeneficiary } from '@/lib/queries';
import { colors, font, spacing } from '@/theme/tokens';

export default function AddBeneficiary() {
  const router = useRouter();
  const add = useAddBeneficiary();

  const [walletId, setWalletId] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onAdd = async () => {
    setError(null);
    const id = Number(walletId);
    if (!Number.isInteger(id) || id <= 0) {
      setError('Enter a valid wallet id (a number).');
      return;
    }
    try {
      const ben = await add.mutateAsync({
        walletId: id,
        nickname: nickname.trim() || undefined,
      });
      Alert.alert('Payee added', `${ben.name} is now in your payees.`);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add payee.');
    }
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Add payee" />
      <Screen edgeTop={false}>
        <Text style={styles.lead}>
          Enter the wallet id of the person you want to send money to. We'll pull
          up their name from their account.
        </Text>

        <Card style={styles.form}>
          <TextField
            label="Wallet id"
            value={walletId}
            onChangeText={setWalletId}
            placeholder="e.g. 2"
            keyboardType="number-pad"
          />
          <TextField
            label="Nickname (optional)"
            value={nickname}
            onChangeText={setNickname}
            placeholder="e.g. Mum, Rent, Work"
            maxLength={100}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>

        <Button label="Add payee" onPress={onAdd} loading={add.isPending} />
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
  form: { gap: spacing.lg },
  error: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.danger,
  },
});
