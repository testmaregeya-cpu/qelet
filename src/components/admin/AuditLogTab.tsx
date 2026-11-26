import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { findMember } from '../../lib/shopRules';
import { useTheme } from '../../theme/ThemeContext';
import { Fonts, Radius, Space } from '../../theme/tokens';
import type { Member } from '../../types/phase1';
import type { AuditLogRow } from '../../types/phase4to6';

interface AuditLogTabProps {
  auditRows: readonly AuditLogRow[];
  members: readonly Member[];
  hasMoreAudit: boolean;
  loadingMoreAudit: boolean;
  onLoadMoreAudit: () => void;
}

export function AuditLogTab({
  auditRows,
  members,
  hasMoreAudit,
  loadingMoreAudit,
  onLoadMoreAudit,
}: AuditLogTabProps) {
  const { palette } = useTheme();

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.headerBetween}>
        <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>Audit trail</Text>
        <Text style={[styles.metaMono, { color: palette.textMuted }]}>
          {auditRows.length} loaded
        </Text>
      </View>
      <View style={{ gap: Space.s8 }}>
        {auditRows.map((row) => {
          const actor = row.actor_id ? findMember(members, row.actor_id) : undefined;
          return (
            <View
              key={row.id}
              style={[
                styles.auditCard,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              <View style={styles.headerBetween}>
                <Text style={[styles.rowTitle, { color: palette.textPrimary }]}>
                  {row.action}
                </Text>
                <Text style={[styles.actionLink, { color: palette.primary }]}>
                  {actor?.display_name ?? 'System'}
                </Text>
              </View>
              <Text style={[styles.metaMono, { color: palette.textMuted }]}>
                {row.object_type} · {new Date(row.at).toLocaleString()}
              </Text>
            </View>
          );
        })}

        {hasMoreAudit ? (
          <Pressable
            style={[
              styles.loadMoreBtn,
              { borderColor: palette.borderStrong, backgroundColor: palette.surface },
            ]}
            disabled={loadingMoreAudit}
            accessibilityRole="button"
            accessibilityLabel="Load older audit events"
            onPress={onLoadMoreAudit}
          >
            {loadingMoreAudit ? (
              <ActivityIndicator size="small" color={palette.primary} />
            ) : (
              <Text style={[styles.actionLink, { color: palette.primary }]}>
                Load older events
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionBlock: { gap: Space.s8 },
  headerBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  auditCard: {
    borderWidth: 1,
    borderRadius: Radius.innerCard,
    padding: Space.s12,
    gap: Space.s4,
  },
  rowTitle: { fontFamily: Fonts.sansMedium, fontSize: 15, lineHeight: 20 },
  actionLink: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  metaMono: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  loadMoreBtn: {
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.s4,
  },
});
