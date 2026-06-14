/**
 * Change the account email. For safety we send a code to the NEW address and
 * only switch the email once that code is confirmed — so you can't move your
 * account to an address you don't actually own.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { useChangeEmailConfirm, useChangeEmailStart } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function ChangeEmail() {
  const router = useRouter();
  const start = useChangeEmailStart();
  const confirm = useChangeEmailConfirm();

  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [destination, setDestination] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendCode = () => {
    setError(null);
    const value = email.trim().toLowerCase();
    if (!value.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    start.mutate(value, {
      onSuccess: (d) => {
        setDestination(d.masked_destination);
        setDevCode(d.dev_code);
        setCode('');
        setStep('code');
      },
      onError: (e) =>
        setError(e instanceof ApiError ? e.message : 'Could not send a code.'),
    });
  };

  const onConfirm = () => {
    setError(null);
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    confirm.mutate(code.trim(), {
      onSuccess: () => {
        Alert.alert('Email updated', `Your email is now ${email.trim().toLowerCase()}.`);
        router.back();
      },
      onError: (e) =>
        setError(e instanceof ApiError ? e.message : 'Verification failed.'),
    });
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Change email" />
      <Screen edgeTop={false}>
        {step === 'enter' ? (
          <>
            <Text style={styles.lead}>
              Enter your new email address. We'll send a 6-digit code to it to make
              sure it's really yours.
            </Text>
            <Card style={styles.form}>
              <TextField
                label="New email"
                value={email}
                onChangeText={setEmail}
                placeholder="new@example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onSubmitEditing={sendCode}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </Card>
            <Button label="Send code" onPress={sendCode} loading={start.isPending} />
          </>
        ) : (
          <>
            <Text style={styles.lead}>
              Enter the 6-digit code we emailed to {destination}.
            </Text>
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
                    Demo: your code is {devCode} (normally only emailed).
                  </Text>
                </View>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </Card>
            <Button label="Confirm new email" onPress={onConfirm} loading={confirm.isPending} />
            <Button
              label="Use a different email"
              variant="ghost"
              onPress={() => {
                setStep('enter');
                setError(null);
              }}
            />
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
  form: { gap: spacing.md },
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
});
