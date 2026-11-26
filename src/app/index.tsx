import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../state/SessionContext';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';

export default function IndexGateScreen() {
  const { palette } = useTheme();
  const { configured, loading, session, householdContext, error } = useSession();

  if (!configured) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
        <ScrollView contentContainerStyle={styles.container}>
          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={[styles.badge, { backgroundColor: palette.amberLight }]}>
              <Text style={[styles.badgeText, { color: palette.amber }]}>Setup required</Text>
            </View>
            <Text style={[styles.title, { color: palette.textPrimary }]}>
              Connect your backend
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              This build is missing Supabase configuration values in the environment.
            </Text>
            <View style={[styles.codeBlock, { backgroundColor: palette.surfaceMuted }]}>
              <Text style={[styles.codeLine, { color: palette.textPrimary }]}>
                EXPO_PUBLIC_SUPABASE_URL
              </Text>
              <Text style={[styles.codeLine, { color: palette.textPrimary }]}>
                EXPO_PUBLIC_SUPABASE_ANON_KEY
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.background }]}>
        <Text style={[styles.wordmark, { color: palette.textPrimary }]}>Qelet</Text>
        <ActivityIndicator size="small" color={palette.primary} />
        <Text style={[styles.loadingText, { color: palette.textSecondary }]}>
          Opening household ledger
        </Text>
        {error ? (
          <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
        ) : null}
      </SafeAreaView>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (!householdContext) {
    return <Redirect href="/link-household" />;
  }

  return <Redirect href="/shops" />;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: Space.s20, justifyContent: 'center', flexGrow: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.s24,
    gap: Space.s12,
  },
  wordmark: {
    fontFamily: Fonts.sansMedium,
    fontSize: 28,
    lineHeight: 32,
  },
  loadingText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    textAlign: 'center',
  },
  card: {
    borderRadius: Radius.card,
    padding: Space.s20,
    borderWidth: 1,
    gap: Space.s12,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Space.s8,
    paddingVertical: Space.s4,
    borderRadius: Radius.tag,
  },
  badgeText: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  title: {
    fontFamily: Fonts.sansMedium,
    fontSize: 20,
    lineHeight: 24,
  },
  body: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  codeBlock: {
    borderRadius: Radius.control,
    padding: Space.s12,
    gap: Space.s4,
  },
  codeLine: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
  },
});
