/**
 * Authenticated stack. The tab bar lives in (tabs); everything else
 * (settings, add-beneficiary, send, create-wallet) is pushed on top of it as a
 * full-screen card with its own back button. Guards on the token so a deep link
 * can't bypass login.
 */
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function AppLayout() {
  const { token, loading } = useAuth();

  if (loading) return null;
  if (!token) return <Redirect href="/(auth)/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
