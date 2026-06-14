/**
 * Auth stack. If a token already exists (returning user), bounce straight to
 * the app so the login screen never flashes.
 */
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function AuthLayout() {
  const { token, loading } = useAuth();

  if (loading) return null;
  if (token) return <Redirect href="/(app)/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
