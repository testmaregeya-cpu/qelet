import React from 'react';
import { CreateShopModal } from '../src/components/CreateShopModal';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@expo/vector-icons', () => ({ Feather: 'Feather' }));
jest.mock('../src/lib/haptics', () => ({
  triggerHaptic: jest.fn(),
}));
jest.mock('../src/services/shops', () => ({
  createShop: jest.fn().mockResolvedValue({
    id: 'mock-shop-1',
    name: 'Test Shop',
    household_id: 'hh-1',
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
      amber: '#B45309',
      amberLight: '#FEF3C7',
      danger: '#B91C1C',
      dangerLight: '#FEE2E2',
    },
    isDark: false,
  }),
}));

describe('CreateShopModal component', () => {
  it('renders modal element correctly when visible', () => {
    const element = (
      <CreateShopModal
        visible={true}
        onClose={jest.fn()}
        onCreated={jest.fn()}
        householdId="hh-1"
        userId="user-1"
        isSuperAdmin={true}
        existingShopNames={['Existing Shop']}
      />
    );

    expect(element).toBeDefined();
    expect(element.props.visible).toBe(true);
    expect(element.props.householdId).toBe('hh-1');
  });

  it('passes isSuperAdmin flag correctly', () => {
    const adminElement = (
      <CreateShopModal
        visible={true}
        onClose={jest.fn()}
        onCreated={jest.fn()}
        householdId="hh-1"
        userId="user-1"
        isSuperAdmin={true}
      />
    );
    expect(adminElement.props.isSuperAdmin).toBe(true);

    const memberElement = (
      <CreateShopModal
        visible={true}
        onClose={jest.fn()}
        onCreated={jest.fn()}
        householdId="hh-1"
        userId="user-2"
        isSuperAdmin={false}
      />
    );
    expect(memberElement.props.isSuperAdmin).toBe(false);
  });
});
