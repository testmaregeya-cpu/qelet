import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Fonts, Radius, Space } from '../../theme/tokens';

interface ExportTabProps {
  busy: boolean;
  onExportJson: () => void;
  onExportCsv: () => void;
}

export function ExportTab({ busy, onExportJson, onExportCsv }: ExportTabProps) {
  const { palette } = useTheme();

  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
        Export household data
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.mutedBody, { color: palette.textSecondary }]}>
          Creates a complete backup of shops, entries, item lines, disputes, saved items, and audit log.
        </Text>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: palette.primaryButtonBg }]}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Export full JSON backup"
          onPress={onExportJson}
        >
          <Feather name="download" size={16} color={palette.primaryButtonText} />
          <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
            Export full backup (JSON)
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.secondaryBtn,
            { borderColor: palette.borderStrong, backgroundColor: palette.surfaceMuted },
          ]}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Export entries as CSV"
          onPress={onExportCsv}
        >
          <Feather name="file-text" size={16} color={palette.textPrimary} />
          <Text style={[styles.secondaryBtnText, { color: palette.textPrimary }]}>
            Export entries (CSV)
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionBlock: { gap: Space.s8 },
  sectionTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Space.s16,
    gap: Space.s12,
  },
  mutedBody: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 20 },
  primaryBtn: {
    height: 44,
    flexDirection: 'row',
    gap: Space.s8,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  secondaryBtn: {
    height: 44,
    flexDirection: 'row',
    gap: Space.s8,
    borderWidth: 1,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
});
