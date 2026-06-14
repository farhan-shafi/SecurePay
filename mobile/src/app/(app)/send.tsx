/**
 * Send money to a saved payee (reached by tapping one in the Payees list).
 * Shows your balance, what you'll have left, and — when the payee holds a
 * different currency — a live conversion of what they'll actually receive.
 * A fresh idempotency key per attempt makes an accidental double-tap safe.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { currencyMeta } from '@/lib/currencies';
import { formatMoney } from '@/lib/format';
import { useQuote, useSendMoney, useWallet } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

function newIdempotencyKey() {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function Send() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    walletId: string;
    name: string;
    currency: string;
  }>();
  const recipientWalletId = Number(params.walletId);
  const payeeName = params.name ?? 'Payee';
  const payeeCurrency = params.currency ?? 'USD';

  const wallet = useWallet();
  const send = useSendMoney();

  const [amount, setAmount] = useState('');
  const [debounced, setDebounced] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ amount: string; recipient: string | null } | null>(
    null,
  );

  const myCurrency = wallet.data?.currency ?? 'USD';
  const crossCurrency = !!wallet.data && myCurrency !== payeeCurrency;
  const balance = Number(wallet.data?.balance ?? 0);
  const amountNum = Number(amount);
  const amountValid = isFinite(amountNum) && amountNum > 0;
  const leftAfter = balance - (amountValid ? amountNum : 0);

  // Debounce the amount before asking the backend for a conversion quote.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 400);
    return () => clearTimeout(t);
  }, [amount]);

  const debNum = Number(debounced);
  const quote = useQuote(
    recipientWalletId,
    isFinite(debNum) ? debNum.toFixed(2) : '0',
    crossCurrency && isFinite(debNum) && debNum > 0,
  );

  const onSend = async () => {
    setError(null);
    if (!amountValid) {
      setError('Enter an amount greater than 0.');
      return;
    }
    if (amountNum > balance) {
      setError("That's more than your balance.");
      return;
    }
    try {
      const tx = await send.mutateAsync({
        recipient_wallet_id: recipientWalletId,
        amount: amountNum.toFixed(2),
        description: note.trim() || undefined,
        idempotency_key: newIdempotencyKey(),
      });
      setSent({ amount: amountNum.toFixed(2), recipient: tx.recipient_amount });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Transfer failed. Try again.');
    }
  };

  // --- Success state ---
  if (sent) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Sent" />
        <Screen scroll={false} edgeTop={false} contentStyle={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={48} color={colors.onBrand} />
          </View>
          <Text style={styles.successAmount}>{formatMoney(sent.amount, myCurrency)}</Text>
          <Text style={styles.successText}>
            Sent to {payeeName}
            {crossCurrency && sent.recipient
              ? `\nThey received ${formatMoney(sent.recipient, payeeCurrency)}`
              : ''}
          </Text>
          <View style={styles.successButtons}>
            <Button
              label="View statement"
              variant="secondary"
              onPress={() => router.replace('/(app)/(tabs)/statement')}
            />
            <Button label="Done" onPress={() => router.back()} />
          </View>
        </Screen>
      </View>
    );
  }

  const payeeMeta = currencyMeta(payeeCurrency);

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Send money" />
      <Screen edgeTop={false}>
        {/* Payee */}
        <Card style={styles.payee}>
          <Avatar label={payeeName.trim()[0]?.toUpperCase() ?? '?'} size={46} />
          <View style={{ flex: 1 }}>
            <Text style={styles.payeeName} numberOfLines={1}>
              {payeeName}
            </Text>
            <Text style={styles.payeeSub}>
              {payeeMeta.flag} {payeeCurrency} · wallet #{recipientWalletId}
            </Text>
          </View>
        </Card>

        {/* Balance */}
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>Your balance</Text>
          <Text style={styles.balanceValue}>
            {wallet.data ? formatMoney(wallet.data.balance, myCurrency) : '—'}
          </Text>
        </View>

        <TextField
          label={`Amount (${myCurrency})`}
          money
          adornment={currencyMeta(myCurrency).symbol}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        {/* Left-after + conversion */}
        {amountValid ? (
          <Card style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>You'll have left</Text>
              <Text
                style={[
                  styles.summaryValue,
                  leftAfter < 0 && { color: colors.danger },
                ]}
              >
                {formatMoney(leftAfter, myCurrency)}
              </Text>
            </View>

            {crossCurrency ? (
              <>
                <View style={styles.summaryDivider} />
                {quote.isFetching ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Getting live rate…</Text>
                    <ActivityIndicator color={colors.brand} size="small" />
                  </View>
                ) : quote.data ? (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{payeeName} receives</Text>
                      <Text style={[styles.summaryValue, { color: colors.success }]}>
                        ≈ {formatMoney(quote.data.recipient_amount, payeeCurrency)}
                      </Text>
                    </View>
                    <Text style={styles.rateNote}>
                      1 {myCurrency} = {Number(quote.data.exchange_rate).toFixed(4)}{' '}
                      {payeeCurrency} · live rate
                    </Text>
                  </>
                ) : null}
              </>
            ) : null}
          </Card>
        ) : null}

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
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },

  payee: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  payeeName: {
    fontFamily: font.family.semibold,
    fontSize: font.size.lg,
    color: colors.textPrimary,
  },
  payeeSub: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },

  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  balanceLabel: {
    fontFamily: font.family.medium,
    fontSize: font.size.md,
    color: colors.textSecondary,
  },
  balanceValue: {
    fontFamily: font.family.bold,
    fontSize: font.size.lg,
    color: colors.textPrimary,
  },

  summary: { gap: spacing.sm },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontFamily: font.family.medium,
    fontSize: font.size.md,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontFamily: font.family.semibold,
    fontSize: font.size.md,
    color: colors.textPrimary,
  },
  summaryDivider: { height: 1, backgroundColor: colors.border },
  rateNote: {
    fontFamily: font.family.regular,
    fontSize: font.size.xs,
    color: colors.textMuted,
  },

  cta: { marginTop: spacing.sm },
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
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
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
  successButtons: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.xl },
});
