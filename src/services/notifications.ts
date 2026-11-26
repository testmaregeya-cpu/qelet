import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { Platform } from 'react-native';
import { getAddisAbabaDateString, shiftCalendarDays } from '../domain/billing';
import { getSupabaseClient } from '../lib/supabase';
import type { ThemeMode, UserSettings } from '../types/phase4to6';

const DEFAULT_NOTIFICATION_CHANNEL_ID = 'default';
const DAILY_REMINDER_CHANNEL_ID = 'qelet-reminders';
const DAILY_REMINDER_KIND = 'daily_evening_prompt';
const REMINDER_PREFS_CACHE_KEY = 'qelet_daily_reminder_prefs_v1';
const LAST_LOGGED_DATE_KEY = 'qelet_last_logged_date_v1';
const ADDIS_OFFSET_MS = 3 * 60 * 60 * 1000;
const FALLBACK_EAS_PROJECT_ID = 'bb69d992-7e15-4cbd-a40f-dcd7224511f4';

let handlerConfigured = false;

interface CachedReminderPrefs {
  enabled: boolean;
  hour: number;
  minute: number;
  skipIfLoggedToday: boolean;
}

function buildAddisTriggerDate(dateStr: string, hour: number, minute: number): Date {
  const [y, m, d] = dateStr.split('-').map((n) => Number.parseInt(n, 10));
  const utcMs = Date.UTC(y, m - 1, d, hour, minute, 0) - ADDIS_OFFSET_MS;
  return new Date(utcMs);
}

async function readCachedPrefs(): Promise<CachedReminderPrefs | null> {
  const raw = await AsyncStorage.getItem(REMINDER_PREFS_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedReminderPrefs;
  } catch {
    return null;
  }
}

export function configureNotifications(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(DEFAULT_NOTIFICATION_CHANNEL_ID, {
      name: 'Default',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#146C43',
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync(DAILY_REMINDER_CHANNEL_ID, {
      name: 'Qelet Credit Reminders',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: '#146C43',
    });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  await ensureAndroidChannels();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') {
    return true;
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function syncDailyLocalReminder(params: {
  enabled: boolean;
  hour: number;
  minute: number;
  skipIfLoggedToday?: boolean;
  lastLoggedDate?: string | null;
  now?: Date;
}): Promise<boolean> {
  configureNotifications();

  const existingPrefs = await readCachedPrefs();
  const skipIfLoggedToday =
    params.skipIfLoggedToday ?? existingPrefs?.skipIfLoggedToday ?? false;

  await AsyncStorage.setItem(
    REMINDER_PREFS_CACHE_KEY,
    JSON.stringify({
      enabled: params.enabled,
      hour: params.hour,
      minute: params.minute,
      skipIfLoggedToday,
    } satisfies CachedReminderPrefs)
  );

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of scheduled) {
    if (item.content.data?.kind === DAILY_REMINDER_KIND) {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }

  if (!params.enabled) {
    return true;
  }

  const granted = await requestNotificationPermission();
  if (!granted) {
    return false;
  }

  const now = params.now ?? new Date();
  const todayAddis = getAddisAbabaDateString(now);
  const storedLastLogged =
    params.lastLoggedDate !== undefined
      ? params.lastLoggedDate
      : await AsyncStorage.getItem(LAST_LOGGED_DATE_KEY);

  if (skipIfLoggedToday && storedLastLogged === todayAddis) {
    const tomorrowAddis = shiftCalendarDays(todayAddis, 1);
    const tomorrowDate = buildAddisTriggerDate(tomorrowAddis, params.hour, params.minute);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Qelet · Daily Check-In',
        body: 'Did you take anything on credit today?',
        sound: true,
        data: { kind: DAILY_REMINDER_KIND, href: '/add-charge' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: tomorrowDate,
        channelId: DAILY_REMINDER_CHANNEL_ID,
      },
    });
    return true;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Qelet · Daily Check-In',
      body: 'Did you take anything on credit today?',
      sound: true,
      data: { kind: DAILY_REMINDER_KIND, href: '/add-charge' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: params.hour,
      minute: params.minute,
      channelId: DAILY_REMINDER_CHANNEL_ID,
    },
  });

  return true;
}

/**
 * Records today's entry date locally and defers tonight's local prompt when `skip_if_logged_today` is enabled.
 */
export async function markEntryLoggedTodayAndSyncReminder(
  entryDate: string = getAddisAbabaDateString(),
  now: Date = new Date()
): Promise<void> {
  const todayAddis = getAddisAbabaDateString(now);
  if (entryDate === todayAddis) {
    await AsyncStorage.setItem(LAST_LOGGED_DATE_KEY, todayAddis);
  }

  const prefs = await readCachedPrefs();
  if (!prefs || !prefs.enabled) {
    return;
  }

  await syncDailyLocalReminder({
    enabled: prefs.enabled,
    hour: prefs.hour,
    minute: prefs.minute,
    skipIfLoggedToday: prefs.skipIfLoggedToday,
    now,
  });
}

export async function refreshDailyLocalReminderFromCache(now: Date = new Date()): Promise<void> {
  const prefs = await readCachedPrefs();
  if (!prefs) return;
  await syncDailyLocalReminder({
    enabled: prefs.enabled,
    hour: prefs.hour,
    minute: prefs.minute,
    skipIfLoggedToday: prefs.skipIfLoggedToday,
    now,
  });
}

export async function sendTestLocalNotification(title: string, body: string): Promise<boolean> {
  configureNotifications();
  const granted = await requestNotificationPermission();
  if (!granted) {
    return false;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      data: { kind: 'test_notification', href: '/shops' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      repeats: false,
      channelId: DAILY_REMINDER_CHANNEL_ID,
    },
  });

  return true;
}

export interface PushRegistrationResult {
  token: string | null;
  status: 'granted' | 'denied' | 'simulator' | 'error';
  errorMessage?: string;
}

export async function registerExpoPushTokenDetailed(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return { token: null, status: 'simulator', errorMessage: 'Physical device required for push notifications' };
  }

  try {
    await ensureAndroidChannels();
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return { token: null, status: 'denied', errorMessage: 'Notification permission not granted' };
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      FALLBACK_EAS_PROJECT_ID;

    const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: tokenRes.data ?? null, status: 'granted' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('Push token registration error:', msg);
    return { token: null, status: 'error', errorMessage: msg };
  }
}

export async function registerExpoPushTokenSafely(): Promise<string | null> {
  const result = await registerExpoPushTokenDetailed();
  return result.token;
}

export async function sendTestPartnerPush(householdId: string): Promise<{ sent: number; reason?: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('notify-partner', {
    body: {
      householdId,
      shopId: '00000000-0000-0000-0000-000000000000',
      shopName: 'Test Alert',
      type: 'charge',
      totalSantim: 10000,
      actorName: 'Partner Alert Test',
    },
  });
  if (error) {
    throw new Error(error.message);
  }
  return data as { sent: number; reason?: string };
}

export async function fetchUserSettings(userId: string): Promise<UserSettings | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<UserSettings>();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function upsertUserSettings(params: {
  userId: string;
  householdId: string;
  daily_reminder_enabled?: boolean;
  daily_reminder_hour?: number;
  daily_reminder_minute?: number;
  skip_if_logged_today?: boolean;
  window_open_alerts?: boolean;
  overdue_nudges?: boolean;
  partner_alerts?: boolean;
  theme_mode?: ThemeMode;
  expo_push_token?: string | null;
}): Promise<UserSettings> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: params.userId,
        household_id: params.householdId,
        ...(params.daily_reminder_enabled !== undefined
          ? { daily_reminder_enabled: params.daily_reminder_enabled }
          : {}),
        ...(params.daily_reminder_hour !== undefined
          ? { daily_reminder_hour: params.daily_reminder_hour }
          : {}),
        ...(params.daily_reminder_minute !== undefined
          ? { daily_reminder_minute: params.daily_reminder_minute }
          : {}),
        ...(params.skip_if_logged_today !== undefined
          ? { skip_if_logged_today: params.skip_if_logged_today }
          : {}),
        ...(params.window_open_alerts !== undefined
          ? { window_open_alerts: params.window_open_alerts }
          : {}),
        ...(params.overdue_nudges !== undefined
          ? { overdue_nudges: params.overdue_nudges }
          : {}),
        ...(params.partner_alerts !== undefined
          ? { partner_alerts: params.partner_alerts }
          : {}),
        ...(params.theme_mode !== undefined ? { theme_mode: params.theme_mode } : {}),
        ...(params.expo_push_token !== undefined
          ? { expo_push_token: params.expo_push_token }
          : {}),
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single<UserSettings>();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export function buildPartnerNotificationPayload(params: {
  actorName: string;
  shopName: string;
  type: 'charge' | 'payment';
  totalSantim: number;
}): { title: string; body: string } {
  const isCharge = params.type === 'charge';
  const title = isCharge ? `New credit at ${params.shopName}` : `Payment at ${params.shopName}`;
  const action = isCharge ? 'added a credit charge of' : 'recorded a payment of';
  const absSantim = Math.abs(params.totalSantim);
  const etbStr =
    absSantim % 100 === 0
      ? String(Math.floor(absSantim / 100))
      : (absSantim / 100).toFixed(2);
  const body = `${params.actorName} ${action} ${etbStr} ETB.`;

  return { title, body };
}

export async function notifyPartnerOfLedgerEntry(params: {
  householdId: string;
  shopId: string;
  shopName?: string;
  type: 'charge' | 'payment';
  totalSantim: number;
  actorName?: string;
  entryId?: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.functions.invoke('notify-partner', {
      body: {
        householdId: params.householdId,
        shopId: params.shopId,
        shopName: params.shopName,
        type: params.type,
        totalSantim: params.totalSantim,
        actorName: params.actorName,
        entryId: params.entryId,
      },
    });
  } catch (err) {
    // Non-blocking background notification failure should not block transaction
    console.warn('Partner notification dispatch failed', err);
  }
}
