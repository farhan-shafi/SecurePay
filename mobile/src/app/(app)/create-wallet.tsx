/**
 * Pick a currency and open a wallet. The currency can't be changed later (the
 * balance is held in it), so we let the user choose deliberately up front.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ApiError } from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';
import { useCreateWallet } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function CreateWallet() {
  const router = useRouter();
  const create = useCreateWallet();
  const [selected, setSelected] = useState('USD');
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    setError(null);
    try {
      await create.mutateAsync(selected);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create wallet.');
    }
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Create wallet" />
      <Screen edgeTop={false}>
        <Text style={styles.lead}>
          Choose the currency your wallet will hold. You can send to people with
          other currencies — we'll convert at the live rate.
        </Text>

        <View style={styles.list}>
          {CURRENCIES.map((c) => {
            const active = c.code === selected;
            return (
              <Pressable
                key={c.code}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => setSelected(c.code)}
              >
                <Text style={styles.flag}>{c.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.code}>{c.code}</Text>
                  <Text style={styles.name}>{c.name}</Text>
                </View>
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={active ? colors.brand : colors.textMuted}
                />
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={`Create ${selected} wallet`}
          onPress={onCreate}
          loading={create.isPending}
          style={styles.cta}
        />
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
  list: { gap: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  optionActive: {
    borderColor: colors.brand,
    backgroundColor: colors.surfaceAlt,
  },
  flag: { fontSize: 28 },
  code: {
    fontFamily: font.family.semibold,
    fontSize: font.size.lg,
    color: colors.textPrimary,
  },
  name: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  error: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.danger,
  },
  cta: { marginTop: spacing.sm },
});
