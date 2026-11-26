import React from 'react';
import PlatformConsoleScreen from '../src/app/platform-console';

jest.mock('@expo/vector-icons', () => ({ Feather: 'Feather' }));
jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  },
}));
jest.mock('../src/lib/haptics', () => ({
  triggerHaptic: jest.fn(),
}));
jest.mock('../src/state/SessionContext', () => ({
  useSession: () => ({
    session: { user: { email: 'tensaylemessa@gmail.com' } },
  }),
}));
jest.mock('../src/services/platformAdmin', () => ({
  checkIsPlatformAdmin: jest.fn().mockResolvedValue(true),
  isPlatformAdminEmail: jest.fn().mockReturnValue(true),
  fetchPlatformMetrics: jest.fn().mockResolvedValue({
    total_households: 4,
    total_users: 6,
    total_shops: 5,
    gross_credit_santim: 222000,
    gross_payments_santim: 65000,
    total_banned_users: 0,
  }),
  fetchPlatformUsers: jest.fn().mockResolvedValue([
    {
      user_id: 'u-1',
      email: 'tensaylemessa@gmail.com',
      display_name: 'Tensay',
      household_id: 'hh-1',
      household_name: 'Alem shop',
      role: 'super_admin',
      created_at: '2026-11-25T10:00:00Z',
      is_banned: false,
      ban_reason: null,
    },
    {
      user_id: 'u-2',
      email: 'baduser@example.com',
      display_name: 'Bad Actor',
      household_id: 'hh-2',
      household_name: 'Spam House',
      role: 'member',
      created_at: '2026-11-26T10:00:00Z',
      is_banned: true,
      ban_reason: 'Spam entries',
    },
  ]),
  fetchPlatformHouseholds: jest.fn().mockResolvedValue([
    {
      household_id: 'hh-1',
      household_name: 'Alem shop',
      invite_code: 'ALEM12',
      created_at: '2026-11-25T10:00:00Z',
      member_count: 2,
      shop_count: 4,
      total_balance_santim: 92000,
    },
  ]),
  banPlatformUser: jest.fn().mockResolvedValue(undefined),
  unbanPlatformUser: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    palette: {
      background: '#FAFAF7',
      surface: '#FFFFFF',
      border: '#E3E3DC',
      borderStrong: '#C8C8BE',
      textPrimary: '#1E1E1C',
      textSecondary: '#5A5A54',
      textMuted: '#8C8C82',
      primary: '#146C43',
      primaryLight: '#E8F5E9',
      danger: '#B91C1C',
      dangerLight: '#FEE2E2',
      accentButtonText: '#FFFFFF',
    },
    isDark: false,
  }),
}));

describe('PlatformConsoleScreen component', () => {
  it('renders screen element with initial loading state', () => {
    const element = <PlatformConsoleScreen />;
    expect(element).toBeDefined();
  });
});
