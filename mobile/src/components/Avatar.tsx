/** Circular initials avatar (no profile photos in the MVP). */
import { StyleSheet, Text, View } from 'react-native';

import { colors, font } from '@/theme/tokens';

export function Avatar({
  label,
  size = 44,
}: {
  label: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: font.family.bold,
    color: colors.brand,
  },
});
