import React from 'react';
import ShopDetailScreen from '../src/app/shop/[id]';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'shop-1' }),
  Redirect: () => null,
}));
jest.mock('@expo/vector-icons/Feather', () => 'Feather');
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  Paths: { cache: 'cache' },
}));
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'file://test.pdf' }),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/haptics', () => ({
  triggerHaptic: jest.fn(),
}));
jest.mock('../src/state/SessionContext', () => ({
  useSession: () => ({
    loading: false,
    session: { user: { id: 'u-1', email: 'tensaylemessa@gmail.com' } },
    householdContext: {
      household: { id: 'hh-1', name: 'Alem shop' },
      currentMember: { role: 'super_admin', display_name: 'Tensay' },
      members: [],
    },
  }),
}));
jest.mock('../src/hooks/useShopDetail', () => ({
  useShopDetail: () => ({
    shop: { id: 'shop-1', name: 'Test Shop', archived: false, merged_into_shop_id: null },
    entries: [],
    disputes: [],
    priceMemory: [],
    catalogItems: [],
    categories: [],
    loadingData: false,
    refreshing: false,
    error: null,
    setError: jest.fn(),
    reload: jest.fn(),
    refresh: jest.fn(),
  }),
}));
jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    palette: {
      background: '#FAFAF7',
      surface: '#FFFFFF',
      surfaceMuted: '#F4F4F0',
      border: '#E3E3DC',
      borderStrong: '#C8C8BE',
      textPrimary: '#1E1E1C',
      textSecondary: '#5A5A54',
      textMuted: '#8C8C82',
      primary: '#146C43',
      primaryLight: '#E8F5E9',
      primaryButtonBg: '#146C43',
      primaryButtonText: '#FFFFFF',
      danger: '#B91C1C',
      dangerLight: '#FEE2E2',
      amber: '#B45309',
      amberLight: '#FEF3C7',
    },
    isDark: false,
  }),
}));

describe('ShopDetailScreen', () => {
  it('renders without crashing', () => {
    const element = <ShopDetailScreen />;
    expect(element).toBeDefined();
  });
});
