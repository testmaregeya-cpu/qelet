const mockAsyncMap = new Map<string, string>();
const mockScheduledItems: {
  identifier: string;
  content: Record<string, unknown>;
  trigger: unknown;
}[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockAsyncMap.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => {
    mockAsyncMap.set(key, val);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockAsyncMap.delete(key);
  }),
}));

jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('expo-constants', () => ({ expoConfig: null, easConfig: null }));

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
    DATE: 'date',
    TIME_INTERVAL: 'timeInterval',
  },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockScheduledItems]),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    const idx = mockScheduledItems.findIndex((item) => item.identifier === id);
    if (idx >= 0) mockScheduledItems.splice(idx, 1);
  }),
  scheduleNotificationAsync: jest.fn(
    async (req: { content: Record<string, unknown>; trigger: unknown }) => {
      const identifier = `notif-${mockScheduledItems.length + 1}`;
      mockScheduledItems.push({ identifier, content: req.content, trigger: req.trigger });
      return identifier;
    }
  ),
}));

jest.mock('../src/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

import {
  markEntryLoggedTodayAndSyncReminder,
  syncDailyLocalReminder,
} from '../src/services/notifications';

describe('daily reminder skip_if_logged_today behavior', () => {
  beforeEach(() => {
    mockAsyncMap.clear();
    mockScheduledItems.length = 0;
    jest.clearAllMocks();
  });

  test('schedules repeating DAILY trigger when skipIfLoggedToday is false', async () => {
    await syncDailyLocalReminder({
      enabled: true,
      hour: 20,
      minute: 0,
      skipIfLoggedToday: false,
      now: new Date('2026-11-25T10:00:00.000Z'), // 13:00 Addis Ababa (2026-11-25)
    });

    expect(mockScheduledItems).toHaveLength(1);
    expect(mockScheduledItems[0].trigger).toEqual(
      expect.objectContaining({
        type: 'daily',
        hour: 20,
        minute: 0,
      })
    );
  });

  test('defers tonight prompt to tomorrow via DATE trigger when logged today and skipIfLoggedToday is true', async () => {
    await syncDailyLocalReminder({
      enabled: true,
      hour: 20,
      minute: 0,
      skipIfLoggedToday: true,
      lastLoggedDate: '2026-11-25',
      now: new Date('2026-11-25T10:00:00.000Z'), // 13:00 EAT on 2026-11-25, before 20:00 EAT
    });

    expect(mockScheduledItems).toHaveLength(1);
    const trigger = mockScheduledItems[0].trigger as { type: string; date: Date | number };
    expect(trigger.type).toBe('date');
    const triggerIso = new Date(trigger.date).toISOString();
    // 20:00 EAT on 2026-11-26 equals 17:00 UTC on 2026-11-26
    expect(triggerIso).toBe('2026-11-26T17:00:00.000Z');
  });

  test('markEntryLoggedTodayAndSyncReminder replaces repeating prompt with tomorrow prompt when enabled', async () => {
    await syncDailyLocalReminder({
      enabled: true,
      hour: 20,
      minute: 0,
      skipIfLoggedToday: true,
      now: new Date('2026-11-25T10:00:00.000Z'),
    });

    await markEntryLoggedTodayAndSyncReminder('2026-11-25', new Date('2026-11-25T11:00:00.000Z'));

    expect(mockScheduledItems).toHaveLength(1);
    const trigger = mockScheduledItems[0].trigger as { type: string; date: Date | number };
    expect(trigger.type).toBe('date');
    expect(new Date(trigger.date).toISOString()).toBe('2026-11-26T17:00:00.000Z');
  });
});
