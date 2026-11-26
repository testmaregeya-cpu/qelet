import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBottomNav } from '../components/AppBottomNav';
import { LiveUpdateManager } from '../components/LiveUpdateManager';
import { isSuperAdmin } from '../lib/shopRules';
import {
  type AppLockConfig,
  canUseBiometrics,
  getAppLockConfig,
  setAppLockPin,
  setAppLockPreferences,
} from '../services/appLock';
import { signOutAll } from '../services/auth';
import { checkIsPlatformAdmin, isPlatformAdminEmail } from '../services/platformAdmin';
import { rotateInviteCode } from '../services/household';
import {
  fetchUserSettings,
  registerExpoPushTokenDetailed,
  sendTestLocalNotification,
  sendTestPartnerPush,
  syncDailyLocalReminder,
  upsertUserSettings,
} from '../services/notifications';
import { useSession } from '../state/SessionContext';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Hairline, Radius, Space } from '../theme/tokens';
import type { ThemeMode } from '../types/phase4to6';

const REMINDER_PRESETS = [
  { label: '7:30 PM', hour: 19, minute: 30 },
  { label: '8:00 PM', hour: 20, minute: 0 },
  { label: '9:00 PM', hour: 21, minute: 0 },
] as const;

export default function SettingsScreen() {
  const { palette, themeMode, setThemeMode } = useTheme();
  const { loading, session, householdContext, refreshHousehold } = useSession();

  const [dailyEnabled, setDailyEnabled] = useState(true);
  const [reminderHour, setReminderHour] = useState(20);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [skipIfLoggedToday, setSkipIfLoggedToday] = useState(false);
  const [windowOpenAlerts, setWindowOpenAlerts] = useState(true);
  const [overdueNudges, setOverdueNudges] = useState(true);
  const [partnerAlerts, setPartnerAlerts] = useState(true);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const [lockConfig, setLockConfig] = useState<AppLockConfig>({
    enabled: false,
    biometricEnabled: true,
    hasPin: false,
    timeoutSeconds: 60,
  });
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const userId = session?.user.id ?? null;
  const householdId = householdContext?.household.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let active = true;

    void Promise.all([
      fetchUserSettings(userId).catch(() => null),
      getAppLockConfig(),
      canUseBiometrics(),
      checkIsPlatformAdmin().catch(() => false),
    ]).then(([settings, lock, bioAvail, isPlatAdmin]) => {
      if (!active) return;
      setIsPlatformAdmin(Boolean(isPlatAdmin));
      if (settings) {
        setDailyEnabled(settings.daily_reminder_enabled);
        setReminderHour(settings.daily_reminder_hour);
        setReminderMinute(settings.daily_reminder_minute);
        setSkipIfLoggedToday(settings.skip_if_logged_today);
        setWindowOpenAlerts(settings.window_open_alerts);
        setOverdueNudges(settings.overdue_nudges);
        setPartnerAlerts(settings.partner_alerts);
        setPushToken(settings.expo_push_token);
      }
      setLockConfig(lock);
      setBiometricsAvailable(bioAvail);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }
  if (!loading && !householdContext) {
    return <Redirect href="/link-household" />;
  }
  if (!householdContext || !userId || !householdId) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </SafeAreaView>
    );
  }

  const { household, currentMember, members } = householdContext;
  const adminUser = isSuperAdmin(currentMember.role);

  const persistNotificationSettings = async (patch: {
    daily_reminder_enabled?: boolean;
    daily_reminder_hour?: number;
    daily_reminder_minute?: number;
    skip_if_logged_today?: boolean;
    window_open_alerts?: boolean;
    overdue_nudges?: boolean;
    partner_alerts?: boolean;
    theme_mode?: ThemeMode;
  }) => {
    setError(null);
    setStatusMessage(null);
    try {
      const nextDaily = patch.daily_reminder_enabled ?? dailyEnabled;
      const nextHour = patch.daily_reminder_hour ?? reminderHour;
      const nextMin = patch.daily_reminder_minute ?? reminderMinute;
      const nextSkip = patch.skip_if_logged_today ?? skipIfLoggedToday;

      await syncDailyLocalReminder({
        enabled: nextDaily,
        hour: nextHour,
        minute: nextMin,
        skipIfLoggedToday: nextSkip,
      });

      const saved = await upsertUserSettings({
        userId,
        householdId,
        ...patch,
      });
      setDailyEnabled(saved.daily_reminder_enabled);
      setReminderHour(saved.daily_reminder_hour);
      setReminderMinute(saved.daily_reminder_minute);
      setSkipIfLoggedToday(saved.skip_if_logged_today);
      setWindowOpenAlerts(saved.window_open_alerts);
      setOverdueNudges(saved.overdue_nudges);
      setPartnerAlerts(saved.partner_alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  const handleSavePinAndEnable = async () => {
    setError(null);
    setStatusMessage(null);
    try {
      await setAppLockPin(newPin);
      await setAppLockPreferences({ enabled: true });
      const updated = await getAppLockConfig();
      setLockConfig(updated);
      setNewPin('');
      setStatusMessage('4-digit PIN saved and App lock enabled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set PIN');
    }
  };

  const handleToggleLock = async (nextEnabled: boolean) => {
    setError(null);
    setStatusMessage(null);
    if (nextEnabled && !lockConfig.hasPin) {
      setError('Set a 4-digit PIN below before enabling App lock.');
      return;
    }
    await setAppLockPreferences({ enabled: nextEnabled });
    setLockConfig(await getAppLockConfig());
  };

  const handleRefreshPushToken = async () => {
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const reg = await registerExpoPushTokenDetailed();
      if (reg.token) {
        await upsertUserSettings({ userId, householdId, expo_push_token: reg.token });
        setPushToken(reg.token);
        setStatusMessage('Push token successfully registered with device!');
      } else if (reg.status === 'denied') {
        setError('Notification permission denied. Please allow notifications in Android App Settings.');
      } else if (reg.status === 'simulator') {
        setStatusMessage('Push notifications require a physical device.');
      } else if (reg.status === 'missing_fcm') {
        setStatusMessage(
          'Live alerts are active! Whenever your phone has the app open, you will receive instant banners and sound when your partner logs entries.'
        );
      } else {
        setError(`Push registration: ${reg.errorMessage ?? 'Unknown error'}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push registration failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSendTestPartnerPush = async () => {
    if (!householdId) return;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await sendTestPartnerPush(householdId);
      if (res.sent > 0) {
        setStatusMessage(`Sent test push alert to ${res.sent} partner device(s)!`);
      } else {
        setStatusMessage(`No partner device received the alert (${res.reason ?? 'check partner settings'}).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test partner push');
    } finally {
      setBusy(false);
    }
  };

  const switchTrack = {
    false: palette.surfaceMuted,
    true: palette.primary,
  };
  const thumbFor = (on: boolean) => (on ? palette.surface : palette.textMuted);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: palette.surface, borderBottomColor: palette.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>Settings</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={[styles.feedbackBox, { backgroundColor: palette.dangerLight }]}>
            <Feather name="alert-circle" size={16} color={palette.danger} />
            <Text style={[styles.feedbackText, { color: palette.danger }]}>{error}</Text>
          </View>
        ) : null}
        {statusMessage ? (
          <View style={[styles.feedbackBox, { backgroundColor: palette.primaryLight }]}>
            <Feather name="check-circle" size={16} color={palette.primary} />
            <Text style={[styles.feedbackText, { color: palette.primary }]}>{statusMessage}</Text>
          </View>
        ) : null}

        {/* Appearance */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>Appearance</Text>
          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={styles.row}>
              {(
                [
                  { mode: 'system', label: 'System', icon: 'smartphone' as const },
                  { mode: 'light', label: 'Light', icon: 'sun' as const },
                  { mode: 'dark', label: 'Dark', icon: 'moon' as const },
                ] as const
              ).map(({ mode, label, icon }) => {
                const active = themeMode === mode;
                return (
                  <Pressable
                    key={mode}
                    style={[
                      styles.choiceBtn,
                      {
                        borderColor: active ? palette.primary : palette.borderStrong,
                        backgroundColor: active ? palette.primaryLight : palette.background,
                      },
                    ]}
                    onPress={() => {
                      void setThemeMode(mode);
                      void persistNotificationSettings({ theme_mode: mode });
                    }}
                  >
                    <Feather
                      name={icon}
                      size={14}
                      color={active ? palette.primary : palette.textSecondary}
                    />
                    <Text
                      style={[
                        styles.choiceText,
                        { color: active ? palette.primary : palette.textPrimary },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Reminders */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>Reminders</Text>
          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={styles.switchRow}>
              <View style={{ flex: 1, gap: Space.s4 }}>
                <Text style={[styles.rowTitle, { color: palette.textPrimary }]}>
                  Daily evening prompt
                </Text>
                <Text style={[styles.rowSubMono, { color: palette.textMuted }]}>
                  {String(reminderHour).padStart(2, '0')}:{String(reminderMinute).padStart(2, '0')}
                </Text>
              </View>
              <Switch
                trackColor={switchTrack}
                thumbColor={thumbFor(dailyEnabled)}
                value={dailyEnabled}
                onValueChange={(val) => {
                  setDailyEnabled(val);
                  void persistNotificationSettings({ daily_reminder_enabled: val });
                }}
              />
            </View>

            <View style={styles.chipWrap}>
              {REMINDER_PRESETS.map((p) => {
                const active = reminderHour === p.hour && reminderMinute === p.minute;
                return (
                  <Pressable
                    key={p.label}
                    style={[
                      styles.chip,
                      {
                        borderColor: active ? palette.primary : palette.borderStrong,
                        backgroundColor: active ? palette.primaryLight : palette.background,
                      },
                    ]}
                    onPress={() => {
                      setReminderHour(p.hour);
                      setReminderMinute(p.minute);
                      void persistNotificationSettings({
                        daily_reminder_hour: p.hour,
                        daily_reminder_minute: p.minute,
                      });
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? palette.primary : palette.textPrimary },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.switchRow, styles.dividedRow, { borderTopColor: palette.border }]}>
              <Text style={[styles.rowTitle, { color: palette.textPrimary, flex: 1 }]}>
                Skip prompt if logged today
              </Text>
              <Switch
                trackColor={switchTrack}
                thumbColor={thumbFor(skipIfLoggedToday)}
                value={skipIfLoggedToday}
                onValueChange={(val) => {
                  setSkipIfLoggedToday(val);
                  void persistNotificationSettings({ skip_if_logged_today: val });
                }}
              />
            </View>

            <View style={[styles.switchRow, styles.dividedRow, { borderTopColor: palette.border }]}>
              <Text style={[styles.rowTitle, { color: palette.textPrimary, flex: 1 }]}>
                Day 24 settlement window opens
              </Text>
              <Switch
                trackColor={switchTrack}
                thumbColor={thumbFor(windowOpenAlerts)}
                value={windowOpenAlerts}
                onValueChange={(val) => {
                  setWindowOpenAlerts(val);
                  void persistNotificationSettings({ window_open_alerts: val });
                }}
              />
            </View>

            <View style={[styles.switchRow, styles.dividedRow, { borderTopColor: palette.border }]}>
              <Text style={[styles.rowTitle, { color: palette.textPrimary, flex: 1 }]}>
                Day 27+ unpaid balance nudge
              </Text>
              <Switch
                trackColor={switchTrack}
                thumbColor={thumbFor(overdueNudges)}
                value={overdueNudges}
                onValueChange={(val) => {
                  setOverdueNudges(val);
                  void persistNotificationSettings({ overdue_nudges: val });
                }}
              />
            </View>

            <View style={[styles.switchRow, styles.dividedRow, { borderTopColor: palette.border }]}>
              <Text style={[styles.rowTitle, { color: palette.textPrimary, flex: 1 }]}>
                Partner alert on new entry
              </Text>
              <Switch
                trackColor={switchTrack}
                thumbColor={thumbFor(partnerAlerts)}
                value={partnerAlerts}
                onValueChange={(val) => {
                  setPartnerAlerts(val);
                  void persistNotificationSettings({ partner_alerts: val });
                }}
              />
            </View>

            <View style={[styles.dividedRow, { borderTopColor: palette.border, paddingTop: Space.s12, gap: Space.s8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.rowTitle, { color: palette.textPrimary }]}>Device Push Alerts</Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: Radius.pill,
                    backgroundColor: palette.primaryLight,
                  }}
                >
                  <Feather
                    name={pushToken ? 'check-circle' : 'radio'}
                    size={12}
                    color={palette.primary}
                  />
                  <Text
                    style={{
                      fontFamily: Fonts.sansMedium,
                      fontSize: 11,
                      color: palette.primary,
                    }}
                  >
                    {pushToken ? 'Push + Live Active' : 'Live Alerts Active'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.rowSub, { color: palette.textMuted }]}>
                {pushToken
                  ? `Registered token: ${pushToken.slice(0, 20)}...`
                  : 'Instant banners and sound ring whenever your phone has the app open.'}
              </Text>

              <View style={[styles.row, { gap: Space.s8, marginTop: Space.s4 }]}>
                <Pressable
                  style={[
                    styles.secondaryBtn,
                    {
                      flex: 1,
                      borderColor: palette.borderStrong,
                      backgroundColor: palette.background,
                    },
                  ]}
                  onPress={() =>
                    void sendTestLocalNotification(
                      'Qelet reminder',
                      'Did you take anything on credit today?'
                    ).then((ok) =>
                      setStatusMessage(
                        ok
                          ? 'Test reminder scheduled for ~2 seconds.'
                          : 'Notification permission denied.'
                      )
                    )
                  }
                >
                  <Feather name="bell" size={13} color={palette.primary} />
                  <Text style={[styles.secondaryBtnText, { color: palette.primary, fontSize: 12 }]}>
                    Test local
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.secondaryBtn,
                    {
                      flex: 1,
                      borderColor: palette.borderStrong,
                      backgroundColor: palette.background,
                    },
                  ]}
                  disabled={busy}
                  onPress={() => void handleSendTestPartnerPush()}
                >
                  <Feather name="send" size={13} color={palette.primary} />
                  <Text style={[styles.secondaryBtnText, { color: palette.primary, fontSize: 12 }]}>
                    Test partner
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={[
                  styles.secondaryBtn,
                  {
                    borderColor: pushToken ? palette.borderStrong : palette.primary,
                    backgroundColor: pushToken ? palette.background : palette.primaryLight,
                    marginTop: Space.s4,
                  },
                ]}
                disabled={busy}
                onPress={() => void handleRefreshPushToken()}
              >
                <Feather
                  name={pushToken ? 'refresh-cw' : 'shield'}
                  size={13}
                  color={pushToken ? palette.textSecondary : palette.primary}
                />
                <Text
                  style={[
                    styles.secondaryBtnText,
                    { color: pushToken ? palette.textPrimary : palette.primary, fontSize: 12 },
                  ]}
                >
                  {pushToken ? 'Re-sync push token' : 'Register push on this phone'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* App Lock */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>App lock</Text>
          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={styles.switchRow}>
              <View style={{ flex: 1, gap: Space.s4 }}>
                <Text style={[styles.rowTitle, { color: palette.textPrimary }]}>Enable lock</Text>
                <Text style={[styles.rowSub, { color: palette.textMuted }]}>
                  {lockConfig.hasPin ? 'Fallback PIN configured' : 'Set a 4-digit PIN first'}
                </Text>
              </View>
              <Switch
                trackColor={switchTrack}
                thumbColor={thumbFor(lockConfig.enabled)}
                value={lockConfig.enabled}
                onValueChange={(v) => void handleToggleLock(v)}
              />
            </View>

            <View style={[styles.switchRow, styles.dividedRow, { borderTopColor: palette.border }]}>
              <View style={{ flex: 1, gap: Space.s4 }}>
                <Text style={[styles.rowTitle, { color: palette.textPrimary }]}>Fingerprint</Text>
                <Text style={[styles.rowSub, { color: palette.textMuted }]}>
                  {biometricsAvailable ? 'Ready on this device' : 'Unavailable (uses PIN)'}
                </Text>
              </View>
              <Switch
                trackColor={switchTrack}
                thumbColor={thumbFor(lockConfig.biometricEnabled)}
                value={lockConfig.biometricEnabled}
                onValueChange={(v) =>
                  void setAppLockPreferences({ biometricEnabled: v })
                    .then(getAppLockConfig)
                    .then(setLockConfig)
                }
              />
            </View>

            <View style={styles.chipWrap}>
              {[
                { label: 'Immediately', sec: 0 },
                { label: 'After 1 min', sec: 60 },
                { label: 'After 5 min', sec: 300 },
              ].map((opt) => {
                const active = lockConfig.timeoutSeconds === opt.sec;
                return (
                  <Pressable
                    key={opt.sec}
                    style={[
                      styles.chip,
                      {
                        borderColor: active ? palette.primary : palette.borderStrong,
                        backgroundColor: active ? palette.primaryLight : palette.background,
                      },
                    ]}
                    onPress={() =>
                      void setAppLockPreferences({ timeoutSeconds: opt.sec })
                        .then(getAppLockConfig)
                        .then(setLockConfig)
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? palette.primary : palette.textPrimary },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.row}>
              <TextInput
                style={[
                  styles.input,
                  styles.monoInput,
                  {
                    flex: 1,
                    borderColor: palette.borderStrong,
                    color: palette.textPrimary,
                    backgroundColor: palette.background,
                  },
                ]}
                value={newPin}
                onChangeText={setNewPin}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                placeholder={lockConfig.hasPin ? 'Change 4-digit PIN' : 'Set 4-digit PIN'}
                placeholderTextColor={palette.textMuted}
              />
              <Pressable
                style={[styles.primarySmallBtn, { backgroundColor: palette.primaryButtonBg }]}
                onPress={() => void handleSavePinAndEnable()}
              >
                <Text style={[styles.primarySmallText, { color: palette.primaryButtonText }]}>
                  Save PIN
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* System & Live Updates */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
            System & live updates
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <LiveUpdateManager />
          </View>
        </View>

        {/* Household & Account */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
            Household & account
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={{ gap: Space.s8 }}>
              <Text style={[styles.householdHeader, { color: palette.textPrimary }]}>
                {household.name} · {household.currency_code}
              </Text>
              {members.map((m) => (
                <View key={m.user_id} style={styles.memberRow}>
                  <View
                    style={[
                      styles.memberDot,
                      { backgroundColor: m.avatar_color ?? palette.primary },
                    ]}
                  />
                  <Text style={[styles.memberName, { color: palette.textPrimary }]}>
                    {m.display_name}
                  </Text>
                  <Text style={[styles.memberRole, { color: palette.textMuted }]}>
                    {m.role === 'super_admin' ? 'Owner' : 'Partner'}
                  </Text>
                </View>
              ))}
            </View>

            <View
              style={[
                styles.inviteRow,
                { backgroundColor: palette.background, borderColor: palette.border },
              ]}
            >
              <View style={{ flex: 1, gap: Space.s4 }}>
                <Text style={[styles.inviteLabel, { color: palette.textMuted }]}>Invite code</Text>
                <Text style={[styles.inviteCode, { color: palette.textPrimary }]}>
                  {household.invite_code}
                </Text>
              </View>
              <Pressable
                style={[styles.primarySmallBtn, { backgroundColor: palette.primaryButtonBg }]}
                onPress={() =>
                  void Share.share({
                    message: `Join our Qelet household "${household.name}" with invite code: ${household.invite_code}`,
                  })
                }
              >
                <Text style={[styles.primarySmallText, { color: palette.primaryButtonText }]}>
                  Share
                </Text>
              </Pressable>
              {adminUser ? (
                <Pressable
                  style={[styles.secondarySmallBtn, { borderColor: palette.borderStrong }]}
                  onPress={() =>
                    void rotateInviteCode(household.id).then(() => refreshHousehold())
                  }
                >
                  <Feather name="rotate-cw" size={14} color={palette.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={[
                styles.secondaryBtn,
                { borderColor: palette.danger, backgroundColor: palette.dangerLight },
              ]}
              onPress={() => void signOutAll()}
            >
              <Feather name="log-out" size={14} color={palette.danger} />
              <Text style={[styles.secondaryBtnText, { color: palette.danger }]}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        {/* Global Platform Super Admin Entry */}
        {isPlatformAdmin && isPlatformAdminEmail(session?.user?.email) ? (
          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionTitle, { color: palette.primary }]}>
              Global Administration
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: palette.surface, borderColor: palette.primary },
              ]}
            >
              <View style={styles.row}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: palette.primaryLight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="shield" size={18} color={palette.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.householdHeader, { color: palette.textPrimary }]}>
                    Platform Super Admin
                  </Text>
                  <Text style={[styles.memberRole, { color: palette.textSecondary }]}>
                    Multi-household governance & user suspension
                  </Text>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.primarySmallBtn,
                  { backgroundColor: palette.primaryButtonBg, height: 40, marginTop: Space.s4 },
                  pressed && { opacity: 0.9 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open Platform Console"
                onPress={() => router.push('/platform-console')}
              >
                <Feather name="command" size={15} color={palette.primaryButtonText} />
                <Text style={[styles.primarySmallText, { color: palette.primaryButtonText }]}>
                  Open Platform Console
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <AppBottomNav active="settings" isSuperAdmin={adminUser} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    height: 54,
    justifyContent: 'center',
    paddingHorizontal: Space.s16,
    borderBottomWidth: Hairline,
  },
  headerTitle: { fontFamily: Fonts.sansSemi, fontSize: 18, lineHeight: 24 },
  container: {
    paddingHorizontal: Space.s16,
    paddingTop: Space.s16,
    paddingBottom: Space.s32,
    gap: Space.s24,
  },
  sectionBlock: { gap: Space.s8 },
  sectionTitle: { fontFamily: Fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  card: {
    borderWidth: Hairline,
    borderRadius: Radius.card,
    padding: Space.s16,
    gap: Space.s12,
  },
  row: { flexDirection: 'row', gap: Space.s8, alignItems: 'center' },
  choiceBtn: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    gap: Space.s8,
    borderWidth: Hairline,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.s12,
  },
  dividedRow: {
    borderTopWidth: Hairline,
    paddingTop: Space.s12,
  },
  rowTitle: { fontFamily: Fonts.sansMedium, fontSize: 14, lineHeight: 20 },
  rowSub: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 16 },
  rowSubMono: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s8 },
  chip: {
    borderWidth: Hairline,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s8,
  },
  chipText: { fontFamily: Fonts.monoMedium, fontSize: 12, fontVariant: ['tabular-nums'] },
  input: {
    height: 44,
    borderWidth: Hairline,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  monoInput: {
    fontFamily: Fonts.mono,
    fontVariant: ['tabular-nums'],
  },
  primarySmallBtn: {
    height: 44,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySmallText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  secondarySmallBtn: {
    width: 44,
    height: 44,
    borderWidth: Hairline,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    height: 44,
    flexDirection: 'row',
    gap: Space.s8,
    borderWidth: Hairline,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  householdHeader: { fontFamily: Fonts.sansSemi, fontSize: 16, lineHeight: 20 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Space.s8 },
  memberDot: { width: 8, height: 8, borderRadius: 4 },
  memberName: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 14 },
  memberRole: { fontFamily: Fonts.mono, fontSize: 12 },
  inviteRow: {
    borderWidth: Hairline,
    borderRadius: Radius.innerCard,
    padding: Space.s12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  inviteLabel: { fontFamily: Fonts.sans, fontSize: 12 },
  inviteCode: {
    fontFamily: Fonts.monoMedium,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  feedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    borderRadius: Radius.control,
    padding: Space.s12,
  },
  feedbackText: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
});
