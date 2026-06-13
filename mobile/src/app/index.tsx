/**
 * Entry route. Decides where to send the user once auth has rehydrated:
 * logged-in → the app tabs, otherwise → the login screen. While the token is
 * still loading we show a centred spinner (very brief).
 */
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';
import { useAuth } from '@/lib/auth';

export default function Index() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return <Redirect href={token ? '/(app)' : '/(auth)/login'} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
