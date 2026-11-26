import React from 'react';
import * as Updates from 'expo-updates';
import { LiveUpdateManager } from '../src/components/LiveUpdateManager';

// Mock expo-updates
jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: true }),
  fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: true }),
  reloadAsync: jest.fn().mockResolvedValue(undefined),
  useUpdates: jest.fn(() => ({
    currentlyRunning: {
      updateId: '01a218b2-c4c1-7e43-9f1a-124f9efb781f',
      channel: 'preview',
      runtimeVersion: '1.0.0',
      isEmbeddedLaunch: false,
    },
    isUpdateAvailable: false,
    isUpdatePending: false,
    isChecking: false,
    isDownloading: false,
    downloadProgress: undefined,
    checkError: undefined,
    downloadError: undefined,
    lastCheckForUpdateTimeSinceRestart: undefined,
  })),
}));

jest.mock('@expo/vector-icons/Feather', () => 'Feather');

jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    themeMode: 'light',
    palette: {
      primary: '#146C43',
      primaryLight: '#D1E7DD',
      primaryButtonBg: '#146C43',
      primaryButtonText: '#FFFFFF',
      textPrimary: '#1E293B',
      textSecondary: '#64748B',
      textMuted: '#94A3B8',
      background: '#FFFFFF',
      surface: '#FFFFFF',
      surfaceMuted: '#F8FAFC',
      border: '#E2E8F0',
      borderStrong: '#CBD5E1',
      danger: '#DC2626',
      dangerLight: '#FEE2E2',
    },
  }),
}));

describe('LiveUpdateManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('instantiates LiveUpdateManager element successfully', () => {
    const element = <LiveUpdateManager />;
    expect(element).toBeDefined();
    expect(element.type).toBe(LiveUpdateManager);
  });

  it('invokes Updates methods without crashing', async () => {
    const checkRes = await Updates.checkForUpdateAsync();
    expect(checkRes.isAvailable).toBe(true);

    const fetchRes = await Updates.fetchUpdateAsync();
    expect(fetchRes.isNew).toBe(true);

    await Updates.reloadAsync();
    expect(Updates.reloadAsync).toHaveBeenCalled();
  });
});
