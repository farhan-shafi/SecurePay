/**
 * Top bar for pushed (non-tab) screens: a back chevron, a centered title, and
 * an optional right-hand slot. Handles the top safe-area inset itself, so the
 * Screen it sits above should use `edgeTop={false}`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, radius, spacing } from '@/theme/tokens';

export function ScreenHeader({
  title,
  right,
}: {
  title?: string;
  right?: ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.iconBtn}
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title ?? ''}
      </Text>
      <View style={styles.iconBtn}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.family.semibold,
    fontSize: font.size.lg,
    color: colors.textPrimary,
  },
});
