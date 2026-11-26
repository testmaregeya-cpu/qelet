import React from 'react';
import { ShopQuickActionsModal } from '../src/components/ShopQuickActionsModal';
import type { Shop } from '../src/types/phase1';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@expo/vector-icons/Feather', () => 'Feather');
jest.mock('../src/components/StatusBadge', () => ({
  StatusBadge: () => 'StatusBadge',
}));
jest.mock('../src/lib/haptics', () => ({
  triggerHaptic: jest.fn(),
}));
jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    palette: {
      surface: '#ffffff',
      surfaceMuted: '#f5f5f5',
      border: '#e0e0e0',
      borderStrong: '#cccccc',
      textPrimary: '#111111',
      textSecondary: '#666666',
      textMuted: '#999999',
      primaryButtonBg: '#146C43',
      primaryButtonText: '#ffffff',
    },
    isDark: false,
  }),
}));

const mockShop: Shop = {
  id: 's-1',
  household_id: 'hh-1',
  name: 'Abebe Suq',
  archived: false,
  needs_review: false,
  merged_into_shop_id: null,
  created_by: 'u-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('ShopQuickActionsModal', () => {
  it('returns null when shop is null', () => {
    // When shop is null, early return happens before hooks or returns null
    const element = ShopQuickActionsModal({
      visible: false,
      shop: null,
      balanceText: '0 ETB',
      onClose: jest.fn(),
      onAddCharge: jest.fn(),
      onRecordPayment: jest.fn(),
      onViewStatement: jest.fn(),
    });
    expect(element).toBeNull();
  });

  it('renders Modal element tree with visible=true when shop is provided', () => {
    const element = ShopQuickActionsModal({
      visible: true,
      shop: mockShop,
      balanceText: '450 ETB',
      onClose: jest.fn(),
      onAddCharge: jest.fn(),
      onRecordPayment: jest.fn(),
      onViewStatement: jest.fn(),
    });
    expect(element).not.toBeNull();
    expect(element?.props.visible).toBe(true);
  });
});
