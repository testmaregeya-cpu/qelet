import Feather from '@expo/vector-icons/Feather';
import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeyboardAwareScroll } from '../lib/useKeyboardInset';
import { signOutAll } from '../services/auth';
import { createHousehold, joinHouseholdByCode } from '../services/household';
import { useSession } from '../state/SessionContext';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';

export default function LinkHouseholdScreen() {
  const { palette } = useTheme();
  const { loading, session, householdContext, setHouseholdContextDirect } = useSession();

  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [householdName, setHouseholdName] = useState('Our Shop Tab');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { scrollRef, handleInputFocus, scrollViewHandlers } = useKeyboardAwareScroll();

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }
  if (!loading && householdContext) {
    return <Redirect href="/shops" />;
  }

  const handleCreate = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const ctx = await createHousehold({
        householdName,
        displayName: displayName.trim() || 'Tensay',
      });
      setHouseholdContextDirect(ctx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create household');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const ctx = await joinHouseholdByCode({
        inviteCode,
        displayName,
      });
      setHouseholdContextDirect(ctx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join household');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          {...scrollViewHandlers}
        >
          <View style={styles.headerBlock}>
            <Text style={[styles.kicker, { color: palette.primary }]}>Step 2 of 2</Text>
            <Text style={[styles.title, { color: palette.textPrimary }]}>
              Link your household
            </Text>
            <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
              Signed in as {session?.user.email ?? 'your account'}. Each household connects two phones in ETB.
            </Text>
          </View>

          <View style={[styles.tabRow, { backgroundColor: palette.surfaceMuted }]}>
            <Pressable
              style={[styles.tab, mode === 'create' && { backgroundColor: palette.surface }]}
              onPress={() => {
                setMode('create');
                setError(null);
              }}
              disabled={submitting}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: mode === 'create' ? palette.textPrimary : palette.textSecondary,
                    fontFamily: mode === 'create' ? Fonts.sansMedium : Fonts.sans,
                  },
                ]}
              >
                Create household
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, mode === 'join' && { backgroundColor: palette.surface }]}
              onPress={() => {
                setMode('join');
                setError(null);
              }}
              disabled={submitting}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: mode === 'join' ? palette.textPrimary : palette.textSecondary,
                    fontFamily: mode === 'join' ? Fonts.sansMedium : Fonts.sans,
                  },
                ]}
              >
                Join with code
              </Text>
            </Pressable>
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: palette.dangerLight }]}>
              <Feather name="alert-circle" size={16} color={palette.danger} />
              <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
            </View>
          ) : null}

          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            {mode === 'create' ? (
              <>
                <Text style={[styles.helperCopy, { color: palette.textSecondary }]}>
                  Creates the shared ledger as owner and generates a 6-character code for your partner.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: palette.textSecondary }]}>
                    Household name
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: palette.borderStrong,
                        color: palette.textPrimary,
                        backgroundColor: palette.background,
                      },
                    ]}
                    value={householdName}
                    onFocus={(e) => handleInputFocus(e.currentTarget)}
                    onChangeText={setHouseholdName}
                    placeholder="Our Shop Tab"
                    placeholderTextColor={palette.textMuted}
                    editable={!submitting}
                    maxLength={80}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: palette.textSecondary }]}>Your name</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: palette.borderStrong,
                        color: palette.textPrimary,
                        backgroundColor: palette.background,
                      },
                    ]}
                    value={displayName}
                    onFocus={(e) => handleInputFocus(e.currentTarget)}
                    onChangeText={setDisplayName}
                    placeholder="Tensay"
                    placeholderTextColor={palette.textMuted}
                    editable={!submitting}
                    maxLength={50}
                  />
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: palette.primaryButtonBg },
                    submitting && styles.disabled,
                    pressed && { opacity: 0.9 },
                  ]}
                  disabled={submitting}
                  onPress={() => void handleCreate()}
                >
                  {submitting ? (
                    <ActivityIndicator color={palette.primaryButtonText} />
                  ) : (
                    <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                      Create household
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.helperCopy, { color: palette.textSecondary }]}>
                  Enter the 6-character invite code shown on your partner’s phone.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: palette.textSecondary }]}>
                    Invite code
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.codeInput,
                      {
                        borderColor: palette.borderStrong,
                        color: palette.textPrimary,
                        backgroundColor: palette.background,
                      },
                    ]}
                    value={inviteCode}
                    onFocus={(e) => handleInputFocus(e.currentTarget)}
                    onChangeText={(text) => setInviteCode(text.toUpperCase())}
                    placeholder="A2B3C4"
                    placeholderTextColor={palette.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={6}
                    editable={!submitting}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: palette.textSecondary }]}>Your name</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: palette.borderStrong,
                        color: palette.textPrimary,
                        backgroundColor: palette.background,
                      },
                    ]}
                    value={displayName}
                    onFocus={(e) => handleInputFocus(e.currentTarget)}
                    onChangeText={setDisplayName}
                    placeholder="Your first name"
                    placeholderTextColor={palette.textMuted}
                    editable={!submitting}
                    maxLength={50}
                  />
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: palette.primaryButtonBg },
                    submitting && styles.disabled,
                    pressed && { opacity: 0.9 },
                  ]}
                  disabled={submitting}
                  onPress={() => void handleJoin()}
                >
                  {submitting ? (
                    <ActivityIndicator color={palette.primaryButtonText} />
                  ) : (
                    <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                      Join household
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>

          <Pressable
            style={styles.signOutBtn}
            disabled={submitting}
            onPress={() => void signOutAll()}
          >
            <Feather name="log-out" size={14} color={palette.textSecondary} />
            <Text style={[styles.signOutText, { color: palette.textSecondary }]}>
              Switch account
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: Space.s24, gap: Space.s16, flexGrow: 1, justifyContent: 'center' },
  headerBlock: { gap: Space.s8 },
  kicker: { fontFamily: Fonts.monoMedium, fontSize: 12, lineHeight: 16 },
  title: { fontFamily: Fonts.sansMedium, fontSize: 28, lineHeight: 32, letterSpacing: -0.3 },
  subtitle: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 20 },
  tabRow: {
    flexDirection: 'row',
    borderRadius: Radius.control,
    padding: Space.s4,
    gap: Space.s4,
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: Radius.tag,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: { fontSize: 13, lineHeight: 18 },
  card: {
    borderRadius: Radius.card,
    padding: Space.s20,
    borderWidth: 1,
    gap: Space.s16,
  },
  helperCopy: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
  },
  fieldGroup: { gap: Space.s8 },
  label: { fontFamily: Fonts.sansMedium, fontSize: 13, lineHeight: 16 },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  codeInput: {
    height: 52,
    fontFamily: Fonts.monoMedium,
    fontSize: 22,
    letterSpacing: 6,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  primaryBtn: {
    height: 48,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.s4,
  },
  primaryBtnText: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    borderRadius: Radius.control,
    padding: Space.s12,
  },
  errorText: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
    paddingVertical: Space.s12,
  },
  signOutText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  disabled: { opacity: 0.6 },
});
