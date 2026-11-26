import Feather from '@expo/vector-icons/Feather';
import { Redirect } from 'expo-router';
import React, { type ComponentRef, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  isGoogleSignInConfigured,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '../services/auth';
import { useSession } from '../state/SessionContext';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';

export default function LoginScreen() {
  const { palette } = useTheme();
  const { configured, loading, session, householdContext } = useSession();

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const passwordInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);

  if (!configured) {
    return <Redirect href="/" />;
  }
  if (!loading && session) {
    return <Redirect href={householdContext ? '/shops' : '/link-household'} />;
  }

  const googleReady = isGoogleSignInConfigured();

  const handleGoogle = async () => {
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailAuth = async () => {
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      if (authMode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        const res = await signUpWithEmail(email, password);
        if (res.needsEmailConfirmation) {
          setInfoMessage(
            'Account created. Check your inbox to confirm your email before signing in.'
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {/* Calm product mark + ledger identity */}
          <View style={styles.brandBlock}>
            <View style={styles.logoRow}>
              <View style={[styles.logoTile, { backgroundColor: palette.primaryLight }]}>
                <Feather name="book-open" size={16} color={palette.primary} />
              </View>
              <Text style={[styles.wordmark, { color: palette.textPrimary }]}>Qelet</Text>
            </View>

            <Text style={[styles.title, { color: palette.textPrimary }]}>
              Shared household shop credit
            </Text>
            <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
              {googleReady
                ? 'Sign in with Google or email to sync your household shops and bills in ETB'
                : 'Sign in with email to track shop balances and settle together on days 24–26'}
            </Text>
          </View>

          {error ? (
            <View style={[styles.feedbackBox, { backgroundColor: palette.dangerLight }]}>
              <Feather name="alert-circle" size={16} color={palette.danger} />
              <Text style={[styles.feedbackText, { color: palette.danger }]}>{error}</Text>
            </View>
          ) : null}

          {infoMessage ? (
            <View style={[styles.feedbackBox, { backgroundColor: palette.primaryLight }]}>
              <Feather name="check-circle" size={16} color={palette.primary} />
              <Text style={[styles.feedbackText, { color: palette.primary }]}>{infoMessage}</Text>
            </View>
          ) : null}

          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            {googleReady ? (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.googleBtn,
                    {
                      borderColor: palette.borderStrong,
                      backgroundColor: palette.background,
                    },
                    submitting && styles.disabled,
                    pressed && { opacity: 0.85 },
                  ]}
                  disabled={submitting}
                  onPress={() => void handleGoogle()}
                >
                  {submitting ? (
                    <ActivityIndicator color={palette.textPrimary} />
                  ) : (
                    <Text style={[styles.googleBtnText, { color: palette.textPrimary }]}>
                      Continue with Google
                    </Text>
                  )}
                </Pressable>

                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: palette.border }]} />
                  <Text style={[styles.dividerText, { color: palette.textMuted }]}>or</Text>
                  <View style={[styles.dividerLine, { backgroundColor: palette.border }]} />
                </View>
              </>
            ) : null}

            <View style={[styles.modeRow, { backgroundColor: palette.surfaceMuted }]}>
              <Pressable
                style={[
                  styles.modeTab,
                  authMode === 'signin' && { backgroundColor: palette.surface },
                ]}
                disabled={submitting}
                onPress={() => {
                  setAuthMode('signin');
                  setError(null);
                }}
              >
                <Text
                  style={[
                    styles.modeTabText,
                    {
                      color:
                        authMode === 'signin' ? palette.textPrimary : palette.textSecondary,
                      fontFamily: authMode === 'signin' ? Fonts.sansMedium : Fonts.sans,
                    },
                  ]}
                >
                  Sign in
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modeTab,
                  authMode === 'signup' && { backgroundColor: palette.surface },
                ]}
                disabled={submitting}
                onPress={() => {
                  setAuthMode('signup');
                  setError(null);
                }}
              >
                <Text
                  style={[
                    styles.modeTabText,
                    {
                      color:
                        authMode === 'signup' ? palette.textPrimary : palette.textSecondary,
                      fontFamily: authMode === 'signup' ? Fonts.sansMedium : Fonts.sans,
                    },
                  ]}
                >
                  Create account
                </Text>
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: palette.textSecondary }]}>Email</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: palette.borderStrong,
                    color: palette.textPrimary,
                    backgroundColor: palette.background,
                  },
                ]}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={palette.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                editable={!submitting}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: palette.textSecondary }]}>Password</Text>
              <View
                style={[
                  styles.passwordWrap,
                  {
                    borderColor: palette.borderStrong,
                    backgroundColor: palette.background,
                  },
                ]}
              >
                <TextInput
                  ref={passwordInputRef}
                  style={[styles.passwordInput, { color: palette.textPrimary }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={palette.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={() => void handleEmailAuth()}
                  editable={!submitting}
                />
                <Pressable
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={8}
                >
                  <Feather
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={16}
                    color={palette.textMuted}
                  />
                </Pressable>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: palette.primaryButtonBg },
                submitting && styles.disabled,
                pressed && { opacity: 0.9 },
              ]}
              disabled={submitting}
              onPress={() => void handleEmailAuth()}
            >
              {submitting ? (
                <ActivityIndicator color={palette.primaryButtonText} />
              ) : (
                <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                  {authMode === 'signin' ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Calm receipt cycle footer note */}
          <View style={styles.cycleFooter}>
            <Feather name="calendar" size={14} color={palette.textMuted} />
            <Text style={[styles.cycleFooterText, { color: palette.textMuted }]}>
              ETB ledger · Monthly settlement window on days 24–26
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    padding: Space.s24,
    gap: Space.s20,
    flexGrow: 1,
    justifyContent: 'center',
  },
  brandBlock: {
    gap: Space.s8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    marginBottom: Space.s4,
  },
  logoTile: {
    width: 32,
    height: 32,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: Fonts.sansMedium,
    fontSize: 18,
    lineHeight: 24,
  },
  title: {
    fontFamily: Fonts.sansMedium,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: Radius.card,
    padding: Space.s20,
    borderWidth: 1,
    gap: Space.s16,
  },
  googleBtn: {
    height: 48,
    borderWidth: 1,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  modeRow: {
    flexDirection: 'row',
    borderRadius: Radius.control,
    padding: Space.s4,
    gap: Space.s4,
  },
  modeTab: {
    flex: 1,
    height: 36,
    borderRadius: Radius.tag,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabText: {
    fontSize: 14,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: Space.s8,
  },
  label: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  passwordWrap: {
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Space.s12,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  eyeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    height: 48,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.s4,
  },
  primaryBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
  },
  feedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    borderRadius: Radius.control,
    padding: Space.s12,
  },
  feedbackText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  cycleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  cycleFooterText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
  },
  disabled: {
    opacity: 0.6,
  },
});
