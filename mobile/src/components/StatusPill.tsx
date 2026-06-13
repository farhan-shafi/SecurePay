/** Tiny coloured badge for a transaction status (completed / pending / failed). */
import { StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '@/theme/tokens';
import { humanize } from '@/lib/format';

const TONE: Record<string, { bg: string; fg: string }> = {
  completed: { bg: colors.successSoft, fg: colors.success },
  pending: { bg: colors.warningSoft, fg: colors.warning },
  failed: { bg: colors.dangerSoft, fg: colors.danger },
  blocked: { bg: colors.dangerSoft, fg: colors.danger },
};

export function StatusPill({ status }: { status: string }) {
  const tone = TONE[status.toLowerCase()] ?? {
    bg: colors.surfaceAlt,
    fg: colors.textSecondary,
  };
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{humanize(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: font.family.semibold,
    fontSize: font.size.xs,
  },
});
