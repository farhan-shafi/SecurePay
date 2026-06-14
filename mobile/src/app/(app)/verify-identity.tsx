/**
 * Identity verification by phone OTP. On open we ask the backend to "send" a
 * 6-digit code to the user's number; they enter it to verify. (No real SMS
 * provider is wired up, so the backend returns the code as a demo shortcut,
 * shown here clearly labelled.)
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { useConfirmVerification, useStartVerification } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function VerifyIdentity() {
  const router = useRouter();
  const start = useStartVerification();
  const confirm = useConfirmVerification();

  const [code, setCode] = useState('');
  const [destination, setDestination] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendCode = () => {
    setError(null);
    setCode('');
    start.mutate(undefined, {
      onSuccess: (d) => {
        setDestination(d.masked_destination);
        setDevCode(d.dev_code);
      },
      onError: (e) =>
        setError(e instanceof ApiError ? e.message : 'Could not send a code.'),
    });
  };

  // Send a code as soon as the screen opens.
  useEffect(() => {
    sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onVerify = () => {
    setError(null);
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    confirm.mutate(code.trim(), {
      onSuccess: () => {
        Alert.alert('Email verified', 'Now choose a currency to open your wallet.');
        // Go straight to creating the wallet — a natural next step that also
        // avoids the home screen briefly showing the create card behind this one.
        router.replace('/(app)/create-wallet');
      },
      onError: (e) =>
        setError(e instanceof ApiError ? e.message : 'Verification failed.'),
    });
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Verify identity" />
      <Screen edgeTop={false}>
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={34} color={colors.brand} />
          </View>
          <Text style={styles.title}>Confirm it's you</Text>
          <Text style={styles.subtitle}>
            {start.isPending && !destination
              ? 'Emailing a code to you…'
              : `Enter the 6-digit code we emailed to ${destination || 'your email'}.`}
          </Text>
        </View>

        <Card style={styles.form}>
          <TextField
            label="Verification code"
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
          />

          {devCode ? (
            <View style={styles.demo}>
              <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
              <Text style={styles.demoText}>
                Demo: your code is {devCode} (normally delivered by SMS).
              </Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>

        <Button label="Verify" onPress={onVerify} loading={confirm.isPending} />

        <Pressable onPress={sendCode} disabled={start.isPending} style={styles.resend}>
          <Text style={styles.resendText}>
            {start.isPending ? 'Sending…' : "Didn't get it? Resend code"}
          </Text>
        </Pressable>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  hero: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
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
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  form: { gap: spacing.md, marginTop: spacing.lg },
  demo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  demoText: {
    flex: 1,
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  error: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.danger,
  },
  resend: { alignItems: 'center', paddingVertical: spacing.md },
  resendText: {
    fontFamily: font.family.semibold,
    fontSize: font.size.md,
    color: colors.brand,
  },
});
