/**
 * Send money (P2P). Enter a recipient wallet id, amount and optional note, then
 * transfer. We generate a fresh idempotency key per attempt so an accidental
 * double-tap can't double-send, while a deliberate second transfer still works.
 * A 403 here is the fraud service blocking the transfer — we surface its reason.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useSendMoney, useWallet } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

function newIdempotencyKey() {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function Send() {
  const router = useRouter();
  const wallet = useWallet();
  const send = useSendMoney();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentAmount, setSentAmount] = useState<string | null>(null);

  const reset = () => {
    setRecipient('');
    setAmount('');
    setNote('');
    setError(null);
    setSentAmount(null);
    send.reset();
  };

  const onSend = async () => {
    setError(null);
    const id = Number(recipient);
    const value = Number(amount);
    if (!Number.isInteger(id) || id <= 0) {
      setError('Enter a valid recipient wallet id.');
      return;
    }
    if (!isFinite(value) || value <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    try {
      await send.mutateAsync({
        recipient_wallet_id: id,
        amount: value.toFixed(2),
        description: note.trim() || undefined,
        idempotency_key: newIdempotencyKey(),
      });
      setSentAmount(value.toFixed(2));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Transfer failed. Try again.',
      );
    }
  };

  // Success state
  if (sentAmount) {
    return (
      <Screen scroll={false} contentStyle={styles.successWrap}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={48} color={colors.onBrand} />
        </View>
        <Text style={styles.successAmount}>{formatMoney(sentAmount)}</Text>
        <Text style={styles.successText}>
          Sent to wallet #{recipient}
          {note.trim() ? `\n“${note.trim()}”` : ''}
        </Text>
        <View style={styles.successButtons}>
          <Button
            label="View activity"
            variant="secondary"
            onPress={() => {
              reset();
              router.push('/(app)/activity');
            }}
          />
          <Button label="Send again" onPress={reset} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Send money</Text>

      <Card style={styles.balanceChip}>
        <Text style={styles.balanceLabel}>Your balance</Text>
        <Text style={styles.balanceValue}>
          {wallet.data ? formatMoney(wallet.data.balance, wallet.data.currency) : '—'}
        </Text>
      </Card>

      <View style={styles.form}>
        <TextField
          label="Recipient wallet id"
          value={recipient}
          onChangeText={setRecipient}
          placeholder="e.g. 2"
          keyboardType="number-pad"
        />
        <TextField
          label="Amount"
          money
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
        <TextField
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="What's it for?"
          maxLength={500}
        />

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button
          label="Send money"
          onPress={onSend}
          loading={send.isPending}
          disabled={!wallet.data}
          style={styles.cta}
        />
        {!wallet.data ? (
          <Text style={styles.hint}>Create a wallet on the Home tab first.</Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: font.family.bold,
    fontSize: font.size.xxxl,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginTop: spacing.sm,
  },
  balanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  balanceLabel: {
    fontFamily: font.family.medium,
    fontSize: font.size.md,
    color: colors.textSecondary,
  },
  balanceValue: {
    fontFamily: font.family.bold,
    fontSize: font.size.xl,
    color: colors.textPrimary,
  },
  form: { gap: spacing.lg },
  cta: { marginTop: spacing.sm },
  hint: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: {
    flex: 1,
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.danger,
  },

  // success
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successAmount: {
    fontFamily: font.family.bold,
    fontSize: font.size.display,
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  successText: {
    fontFamily: font.family.regular,
    fontSize: font.size.lg,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  successButtons: {
    alignSelf: 'stretch',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});
