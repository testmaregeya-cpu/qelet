jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'test' } } },
}));
jest.mock('expo-device', () => ({
  isDevice: true,
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[mock]' }),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', TIME_INTERVAL: 'timeInterval' },
  AndroidNotificationPriority: { HIGH: 'high' },
}));

import {
  buildPartnerNotificationPayload,
  dispatchLivePartnerNotification,
  registerExpoPushTokenDetailed,
  registerExpoPushTokenSafely,
} from '../src/services/notifications';
import * as Notifications from 'expo-notifications';

describe('buildPartnerNotificationPayload', () => {
  it('formats ETB charge notification copy correctly', () => {
    const payload = buildPartnerNotificationPayload({
      actorName: 'Tensay',
      shopName: 'Abebe Suq',
      type: 'charge',
      totalSantim: 25000,
    });

    expect(payload.title).toBe('New credit at Abebe Suq');
    expect(payload.body).toBe('Tensay added a credit charge of 250 ETB.');
  });

  it('formats ETB payment notification copy correctly', () => {
    const payload = buildPartnerNotificationPayload({
      actorName: 'Mareg',
      shopName: 'Bole Bakery',
      type: 'payment',
      totalSantim: 5050,
    });

    expect(payload.title).toBe('Payment at Bole Bakery');
    expect(payload.body).toBe('Mareg recorded a payment of 50.50 ETB.');
  });

  it('handles negative or zero santim gracefully', () => {
    const payload = buildPartnerNotificationPayload({
      actorName: 'Partner',
      shopName: 'Kiosk',
      type: 'payment',
      totalSantim: 0,
    });
    expect(payload.body).toBe('Partner recorded a payment of 0 ETB.');
  });

  it('registers push token detailed successfully with fallback project ID', async () => {
    const res = await registerExpoPushTokenDetailed();
    expect(res.status).toBe('granted');
    expect(res.token).toBe('ExponentPushToken[mock]');

    const safeToken = await registerExpoPushTokenSafely();
    expect(safeToken).toBe('ExponentPushToken[mock]');
  });

  it('handles missing FCM gracefully in registerExpoPushTokenDetailed', async () => {
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValueOnce(
      new Error('Unable to get Firebase Messaging instance. Default FirebaseApp is not initialized')
    );

    const res = await registerExpoPushTokenDetailed();
    expect(res.status).toBe('missing_fcm');
    expect(res.token).toBeNull();
    expect(res.errorMessage).toContain('google-services.json');
  });

  it('dispatches live partner notification on-device without remote push', async () => {
    const result = await dispatchLivePartnerNotification({
      entry: {
        id: 'entry-123',
        created_by: 'partner-user-id',
        shop_id: 'shop-456',
        type: 'charge',
        total_amount_santim: 15000,
      },
      members: [{ user_id: 'partner-user-id', display_name: 'Nni' }],
    });

    expect(result).toBe(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: expect.stringContaining('New credit'),
          body: expect.stringContaining('Nni added a credit charge of 150 ETB.'),
        }),
        trigger: null,
      })
    );
  });
});
