/** App logo: a gradient rounded-square with a shield glyph, optional wordmark. */
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { colors, font, radius, shadow, spacing } from '@/theme/tokens';

export function BrandMark({
  size = 56,
  withWordmark = false,
}: {
  size?: number;
  withWordmark?: boolean;
}) {
  return (
    <View style={styles.row}>
      <LinearGradient
        colors={colors.brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.mark,
          shadow.brand,
          { width: size, height: size, borderRadius: size * 0.3 },
        ]}
      >
        <Ionicons name="shield-checkmark" size={size * 0.5} color={colors.onBrand} />
      </LinearGradient>
      {withWordmark && <Text style={styles.wordmark}>SecurePay</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mark: { alignItems: 'center', justifyContent: 'center' },
  wordmark: {
    fontFamily: font.family.bold,
    fontSize: font.size.xxl,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
});
