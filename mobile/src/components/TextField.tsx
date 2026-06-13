/**
 * Labelled text input with a focus ring, optional error message, and a
 * show/hide toggle for passwords. Wrapping RN's TextInput here keeps every form
 * field visually identical and cuts boilerplate in the screens.
 */
import { type ComponentProps, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, font, radius, spacing } from '@/theme/tokens';

interface TextFieldProps extends ComponentProps<typeof TextInput> {
  label: string;
  error?: string | null;
  /** Render a leading "$" adornment (for amount inputs). */
  money?: boolean;
}

export function TextField({
  label,
  error,
  money,
  secureTextEntry,
  style,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          error && styles.fieldError,
        ]}
      >
        {money && <Text style={styles.adornment}>$</Text>}
        <TextInput
          {...rest}
          secureTextEntry={hidden}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, style]}
        />
        {secureTextEntry && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8}>
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        )}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: {
    fontFamily: font.family.medium,
    fontSize: font.size.sm,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  fieldFocused: {
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  fieldError: { borderColor: colors.danger },
  adornment: {
    fontFamily: font.family.semibold,
    fontSize: font.size.lg,
    color: colors.textSecondary,
  },
  input: {
    flex: 1,
    fontFamily: font.family.medium,
    fontSize: font.size.lg,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
  errorText: {
    fontFamily: font.family.medium,
    fontSize: font.size.xs,
    color: colors.danger,
    marginLeft: spacing.xs,
  },
});
