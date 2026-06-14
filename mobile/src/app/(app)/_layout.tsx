/**
 * Authenticated stack. Before showing the app we validate the session by
 * loading the profile:
 *   - a 401/404 means the token is dead (expired, or its user was removed) → we
 *     sign out and the guard sends the user to login.
 *   - a network error (backend unreachable) shows a Retry / Log out screen, so a
 *     dropped connection can never trap the user on a frozen, accountless screen.
 * The tab bar lives in (tabs); everything else is pushed on top of it.
 */
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Stack } from 'expo-router';
import { type ReactNode, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/queries';
import { colors, font, spacing } from '@/theme/tokens';

export default function AppLayout() {
  const { token, loading } = useAuth();

  if (loading) return null;
  if (!token) return <Redirect href="/(auth)/login" />;

  return (
    <SessionGate>
      <Stack screenOptions={{ headerShown: false }} />
    </SessionGate>
  );
}

function SessionGate({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const profile = useProfile();

  // A 401/404 means the session is no longer valid — sign out.
  useEffect(() => {
    if (
      profile.error instanceof ApiError &&
      (profile.error.status === 401 || profile.error.status === 404)
    ) {
      void signOut();
    }
  }, [profile.error, signOut]);

  // First load, nothing cached yet.
  if (profile.isLoading && !profile.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  // Couldn't reach the backend and have nothing cached — offer a way out.
  if (profile.isError && !profile.data) {
    const message =
      profile.error instanceof ApiError
        ? profile.error.message
        : 'Something went wrong.';
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
        <Text style={styles.title}>Can't load your account</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.buttons}>
          <Button label="Retry" onPress={() => profile.refetch()} />
          <Button label="Log out" variant="secondary" onPress={() => void signOut()} />
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: font.family.bold,
    fontSize: font.size.xl,
    color: colors.textPrimary,
  },
  message: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  buttons: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
});
