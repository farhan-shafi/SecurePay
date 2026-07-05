/**
 * Root layout — wraps the whole app in its providers and gates on first paint:
 *   1. React Query  → server-state caching for every screen.
 *   2. AuthProvider → rehydrates the saved JWT from secure storage.
 *   3. Inter fonts  → we hold the splash screen until they (and the token) load,
 *      so the UI never flashes in a fallback system font.
 * The actual auth routing decision lives in app/index.tsx and the group layouts.
 */
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/lib/auth';
import { WalletSelectionProvider } from '@/lib/wallet-context';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 10_000 },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WalletSelectionProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
          </WalletSelectionProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
