/**
 * Pay a bill: pick a biller, enter the reference number from the bill and the
 * amount. Under the hood it's the same money path as a P2P transfer (locking,
 * FX conversion into the biller's currency, fraud screening, idempotency).
 */
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { ApiError, type Biller } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useBillers, usePayBill, useWallet } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  electricity: 'flash-outline',
  internet: 'wifi-outline',
  gas: 'flame-outline',
  mobile: 'phone-portrait-outline',
};

function newIdempotencyKey() {
  return `bill-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function PayBills() {
  const router = useRouter();
  const billers = useBillers();
  const wallet = useWallet();
  const pay = usePayBill();

  const [biller, setBiller] = useState<Biller | null>(null);
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<string | null>(null);

  const myCurrency = wallet.data?.currency ?? 'USD';
  const amountNum = Number(amount);

  const onPay = async () => {
    if (!biller) return;
    setError(null);
    if (reference.trim().length < 3) {
      setError('Enter the reference / consumer number from your bill.');
      return;
    }
    if (!isFinite(amountNum) || amountNum <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    if (amountNum > Number(wallet.data?.balance ?? 0)) {
      setError("That's more than your balance.");
      return;
    }
    const enrolled =
      (await LocalAuthentication.hasHardwareAsync()) &&
      (await LocalAuthentication.isEnrolledAsync());
    if (enrolled) {
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: `Confirm paying ${biller.name}`,
      });
      if (!auth.success) {
        setError('Confirmation cancelled — nothing was paid.');
        return;
      }
    }
    try {
      await pay.mutateAsync({
        biller_id: biller.id,
        reference: reference.trim(),
        amount: amountNum.toFixed(2),
        idempotency_key: newIdempotencyKey(),
      });
      setPaid(amountNum.toFixed(2));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Payment failed. Try again.');
    }
  };

  if (paid && biller) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Paid" />
        <Screen scroll={false} edgeTop={false} contentStyle={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={48} color={colors.onBrand} />
          </View>
          <Text style={styles.successAmount}>{formatMoney(paid, myCurrency)}</Text>
          <Text style={styles.successText}>
            Paid to {biller.name}{'\n'}Reference: {reference.trim()}
          </Text>
          <View style={styles.successButtons}>
            <Button label="Done" onPress={() => router.back()} />
          </View>
        </Screen>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Pay bills" />
      <Screen edgeTop={false}>
        {!biller ? (
          <>
            <Text style={styles.lead}>Choose who you want to pay.</Text>
            {billers.isLoading ? (
              <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
            ) : (
              (billers.data ?? []).map((b) => (
                <Card key={b.id} style={styles.billerRow} onPress={() => setBiller(b)}>
                  <View style={styles.billerIcon}>
                    <Ionicons
                      name={CATEGORY_ICONS[b.category] ?? 'receipt-outline'}
                      size={20}
                      color={colors.brand}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.billerName}>{b.name}</Text>
                    <Text style={styles.billerSub}>
                      {b.category} · billed in {b.currency}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Card>
              ))
            )}
          </>
        ) : (
          <>
            <Pressable style={styles.picked} onPress={() => setBiller(null)}>
              <View style={styles.billerIcon}>
                <Ionicons
                  name={CATEGORY_ICONS[biller.category] ?? 'receipt-outline'}
                  size={20}
                  color={colors.brand}
                />
              </View>
              <Text style={styles.billerName}>{biller.name}</Text>
              <Text style={styles.change}>Change</Text>
            </Pressable>
            <Card style={styles.form}>
              <TextField
                label="Reference / consumer number"
                value={reference}
                onChangeText={setReference}
                placeholder="e.g. 0400012345678"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TextField
                label={`Amount (${myCurrency})`}
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
              {myCurrency !== biller.currency ? (
                <Text style={styles.fxNote}>
                  You pay in {myCurrency}; {biller.name} receives {biller.currency} at
                  the live rate.
                </Text>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </Card>
            <Button label="Pay bill" onPress={() => void onPay()} loading={pay.isPending} />
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
  billerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  billerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billerName: {
    fontFamily: font.family.semibold,
    fontSize: font.size.lg,
    color: colors.textPrimary,
  },
  billerSub: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  change: {
    marginLeft: 'auto',
    fontFamily: font.family.semibold,
    fontSize: font.size.sm,
    color: colors.brand,
  },
  form: { gap: spacing.md },
  fxNote: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textMuted,
  },
  error: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.danger,
  },
  successWrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
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
  },
  successText: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  successButtons: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.xl },
});
