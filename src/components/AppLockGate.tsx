import Feather from '@expo/vector-icons/Feather';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { triggerHaptic } from '../lib/haptics';
import {
  attemptAppLockPinUnlock,
  getAppLockConfig,
  getRemainingPinLockoutSeconds,
  promptBiometricUnlock,
} from '../services/appLock';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { palette } = useTheme();
  const [locked, setLocked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const backgroundAtRef = useRef<number | null>(null);

  const applyLockIfEnabled = useCallback(
    async (cfg: Awaited<ReturnType<typeof getAppLockConfig>>) => {
      setHasPin(cfg.hasPin);
      setBioEnabled(cfg.biometricEnabled);
      if (!cfg.enabled) {
        setLocked(false);
        return;
      }
      setLocked(true);
      setPinInput('');
      setPinError(null);
      setLockoutSeconds(await getRemainingPinLockoutSeconds());
      if (cfg.biometricEnabled) {
        const ok = await promptBiometricUnlock();
        if (ok) {
          setLocked(false);
          setLockoutSeconds(0);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  useEffect(() => {
    let active = true;
    void getAppLockConfig().then((cfg) => {
      if (active) {
        void applyLockIfEnabled(cfg);
      }
    });

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (backgroundAtRef.current === null) {
          backgroundAtRef.current = Date.now();
        }
      } else if (nextState === 'active') {
        const wentBgAt = backgroundAtRef.current;
        backgroundAtRef.current = null;
        if (wentBgAt !== null) {
          void getAppLockConfig().then((cfg) => {
            if (!cfg.enabled) return;
            const elapsedSec = (Date.now() - wentBgAt) / 1000;
            if (elapsedSec >= cfg.timeoutSeconds) {
              void applyLockIfEnabled(cfg);
            }
          });
        }
      }
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, [applyLockIfEnabled]);

  const handleUnlockPin = async () => {
    setPinError(null);
    const result = await attemptAppLockPinUnlock(pinInput);
    if (result.unlocked) {
      triggerHaptic('success');
      setPinInput('');
      setLockoutSeconds(0);
      setLocked(false);
      return;
    }

    triggerHaptic('error');
    if (result.lockedOutSeconds > 0) {
      setLockoutSeconds(result.lockedOutSeconds);
      setPinError(`Too many wrong PINs. Wait ${result.lockedOutSeconds}s or use fingerprint.`);
    } else {
      setPinError(`Incorrect PIN (${result.remainingAttempts} left before cooldown)`);
    }
  };

  const handleBiometric = async () => {
    setPinError(null);
    const ok = await promptBiometricUnlock();
    if (ok) {
      triggerHaptic('success');
      setLockoutSeconds(0);
      setLocked(false);
    } else {
      triggerHaptic('error');
      setPinError('Fingerprint check did not match');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked ? (
        <SafeAreaView style={[styles.overlay, { backgroundColor: palette.background }]}>
          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={styles.headingRow}>
              <View style={[styles.iconBox, { backgroundColor: palette.surfaceMuted }]}>
                <Feather name="lock" size={18} color={palette.textPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kicker, { color: palette.textMuted }]}>Qelet</Text>
                <Text style={[styles.title, { color: palette.textPrimary }]}>
                  Ledger locked
                </Text>
              </View>
            </View>

            {pinError ? (
              <View style={[styles.errorBox, { backgroundColor: palette.dangerLight }]}>
                <Text style={[styles.errorText, { color: palette.danger }]}>{pinError}</Text>
              </View>
            ) : null}

            {bioEnabled ? (
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: palette.primaryButtonBg },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => void handleBiometric()}
              >
                <Feather name="unlock" size={16} color={palette.primaryButtonText} />
                <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                  Unlock with fingerprint
                </Text>
              </Pressable>
            ) : null}

            {hasPin ? (
              <View style={[styles.pinBox, { borderTopColor: palette.border }]}>
                <Text style={[styles.label, { color: palette.textSecondary }]}>
                  Enter 4-digit PIN
                </Text>
                <TextInput
                  style={[
                    styles.pinInput,
                    {
                      borderColor: palette.borderStrong,
                      color: palette.textPrimary,
                      backgroundColor: palette.background,
                    },
                  ]}
                  value={pinInput}
                  onChangeText={setPinInput}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                  editable={lockoutSeconds === 0}
                  accessibilityLabel="4-digit app unlock PIN"
                  placeholder="••••"
                  placeholderTextColor={palette.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleUnlockPin()}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    {
                      borderColor: palette.borderStrong,
                      backgroundColor: palette.surfaceMuted,
                    },
                    lockoutSeconds > 0 && { opacity: 0.5 },
                    pressed && { opacity: 0.85 },
                  ]}
                  disabled={lockoutSeconds > 0}
                  accessibilityRole="button"
                  accessibilityLabel="Unlock with PIN"
                  onPress={() => void handleUnlockPin()}
                >
                  <Text style={[styles.secondaryBtnText, { color: palette.textPrimary }]}>
                    {lockoutSeconds > 0 ? `Wait ${lockoutSeconds}s` : 'Unlock with PIN'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 999,
    justifyContent: 'center',
    padding: Space.s24,
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Space.s24,
    gap: Space.s16,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  title: {
    fontFamily: Fonts.sansMedium,
    fontSize: 20,
    lineHeight: 24,
  },
  errorBox: {
    borderRadius: Radius.control,
    padding: Space.s12,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    height: 48,
    flexDirection: 'row',
    gap: Space.s8,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
  },
  pinBox: {
    borderTopWidth: 1,
    paddingTop: Space.s16,
    gap: Space.s12,
  },
  label: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  pinInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s16,
    fontFamily: Fonts.monoMedium,
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: 8,
    fontVariant: ['tabular-nums'],
  },
  secondaryBtn: {
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
});
