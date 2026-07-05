/**
 * Forgot password. Two steps: enter your email (we email a 6-digit code), then
 * enter the code plus a new password. The backend's response is identical
 * whether or not the email exists, so the screen can't leak which emails are
 * registered.
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
import { useForgotPassword, useResetPassword } from '@/lib/queries';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function ForgotPassword() {
  const router = useRouter();
  const start = useForgotPassword();
  const reset = useResetPassword();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
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
        setDevCode(d.dev_code);
        setCode('');
        setStep('code');
      },
      onError: (e) =>
        setError(e instanceof ApiError ? e.message : 'Could not send a code.'),
    });
  };

  const onReset = () => {
    setError(null);
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    if (password.length < 8) {
      setError('The new password must be at least 8 characters.');
      return;
    }
    reset.mutate(
      { email: email.trim().toLowerCase(), code: code.trim(), password },
      {
        onSuccess: () => {
          Alert.alert('Password updated', 'You can sign in with your new password now.');
          router.back();
        },
        onError: (e) =>
          setError(e instanceof ApiError ? e.message : 'Reset failed. Try again.'),
      },
    );
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Reset password" />
      <Screen edgeTop={false}>
        {step === 'email' ? (
          <>
            <Text style={styles.lead}>
              Enter your account email and we'll send a 6-digit code to reset your
              password.
            </Text>
            <Card style={styles.form}>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
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
              If that email has an account, a code is on its way. Enter it below with
              your new password.
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
              <TextField
                label="New password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                autoCapitalize="none"
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
            <Button label="Set new password" onPress={onReset} loading={reset.isPending} />
            <Button
              label="Use a different email"
              variant="ghost"
              onPress={() => {
                setStep('email');
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
