import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  getAddisAbabaDateString,
  shiftCalendarDays,
  validateDateString,
} from '../domain/billing';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';

interface DateStepperInputProps {
  value: string;
  onChangeDate: (nextDate: string) => void;
  editable?: boolean;
}

export function DateStepperInput({
  value,
  onChangeDate,
  editable = true,
}: DateStepperInputProps) {
  const { palette } = useTheme();

  const stepByDays = (deltaDays: number) => {
    let baseDate: string;
    try {
      baseDate = validateDateString(value);
    } catch {
      baseDate = getAddisAbabaDateString();
    }
    onChangeDate(shiftCalendarDays(baseDate, deltaDays));
  };

  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [
          styles.stepBtn,
          {
            borderColor: palette.borderStrong,
            backgroundColor: palette.background,
          },
          !editable && styles.disabled,
          pressed && { opacity: 0.75 },
        ]}
        disabled={!editable}
        onPress={() => stepByDays(-1)}
        accessibilityRole="button"
        accessibilityLabel="Previous day"
      >
        <Feather name="chevron-left" size={16} color={palette.textPrimary} />
      </Pressable>

      <TextInput
        style={[
          styles.input,
          {
            borderColor: palette.borderStrong,
            color: palette.textPrimary,
            backgroundColor: palette.background,
          },
        ]}
        value={value}
        onChangeText={onChangeDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={palette.textMuted}
        maxLength={10}
        editable={editable}
      />

      <Pressable
        style={({ pressed }) => [
          styles.stepBtn,
          {
            borderColor: palette.borderStrong,
            backgroundColor: palette.background,
          },
          !editable && styles.disabled,
          pressed && { opacity: 0.75 },
        ]}
        disabled={!editable}
        onPress={() => stepByDays(1)}
        accessibilityRole="button"
        accessibilityLabel="Next day"
      >
        <Feather name="chevron-right" size={16} color={palette.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.mono,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
