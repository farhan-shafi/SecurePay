/**
 * "Add money" bottom sheet (a mock top-up — the backend just credits the
 * wallet). Slides up from the bottom with an amount field plus quick-pick chips.
 * On success it closes; React Query refetches the balance automatically.
 */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './Button';
import { TextField } from './TextField';
import { ApiError } from '@/lib/api';
import { currencyMeta } from '@/lib/currencies';
import { useDeposit } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

const QUICK = ['50', '100', '500'];

export function DepositSheet({
  visible,
  onClose,
  currency = 'USD',
}: {
  visible: boolean;
  onClose: () => void;
  currency?: string;
}) {
  const symbol = currencyMeta(currency).symbol;
  const insets = useSafeAreaInsets();
  const deposit = useDeposit();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setAmount('');
    setError(null);
    deposit.reset();
  };

  const close = () => {
    reset();
    onClose();
  };

  const onConfirm = async () => {
    setError(null);
    const value = Number(amount);
    if (!isFinite(value) || value <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    try {
      await deposit.mutateAsync(value.toFixed(2));
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Deposit failed. Try again.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.anchor}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Add money</Text>
          <Text style={styles.subtitle}>Top up your wallet balance.</Text>

          <TextField
            label="Amount"
            money
            adornment={symbol}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            error={error}
          />

          <View style={styles.chips}>
            {QUICK.map((q) => (
              <Pressable
                key={q}
                style={styles.chip}
                onPress={() => {
                  setAmount(q);
                  setError(null);
                }}
              >
                <Text style={styles.chipText}>
                  {symbol}
                  {q}
                </Text>
              </Pressable>
            ))}
          </View>

          <Button
            label="Add money"
            onPress={onConfirm}
            loading={deposit.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(16,16,32,0.45)',
  },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: font.family.bold,
    fontSize: font.size.xxl,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
  },
  chips: { flexDirection: 'row', gap: spacing.md },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
  chipText: {
    fontFamily: font.family.semibold,
    fontSize: font.size.md,
    color: colors.brand,
  },
});
