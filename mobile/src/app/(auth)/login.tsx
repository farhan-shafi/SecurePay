/** Sign-in screen. */
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { BrandMark } from '@/components/BrandMark';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, font, spacing } from '@/theme/tokens';

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace('/(app)/(tabs)');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Something went wrong. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <BrandMark size={60} />
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to your SecurePay wallet</Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="Sign in" onPress={onSubmit} loading={busy} style={styles.cta} />

        <Link href="/(auth)/forgot-password" style={[styles.link, styles.forgot]}>
          Forgot password?
        </Link>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>New to SecurePay? </Text>
        <Link href="/(auth)/register" style={styles.link}>
          Create an account
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, marginTop: spacing.xxxl, marginBottom: spacing.lg },
  title: {
    fontFamily: font.family.bold,
    fontSize: font.size.xxxl,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
  },
  form: { gap: spacing.lg },
  cta: { marginTop: spacing.sm },
  error: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  footerText: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
  },
  link: {
    fontFamily: font.family.semibold,
    fontSize: font.size.md,
    color: colors.brand,
  },
  forgot: { textAlign: 'center', marginTop: spacing.sm },
});
