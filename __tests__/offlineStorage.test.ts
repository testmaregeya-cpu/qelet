import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cacheHouseholdContext,
  getCachedHouseholdContext,
  clearCachedHouseholdContext,
  cacheHouseholdLedger,
  getCachedHouseholdLedger,
  cacheShopDetail,
  getCachedShopDetail,
} from '../src/services/offlineStorage';
import type { HouseholdContextData } from '../src/services/household';
import type { Shop } from '../src/types/phase1';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('offlineStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists and retrieves household context for offline startup', async () => {
    const mockContext: HouseholdContextData = {
      household: {
        id: 'hh-123',
        name: 'Tesfaye Family',
        currency_code: 'ETB',
        invite_code: 'TEST99',
        created_by: 'user-1',
        created_at: new Date().toISOString(),
      },
      currentMember: {
        household_id: 'hh-123',
        user_id: 'user-1',
        role: 'super_admin',
        display_name: 'Abebe',
        avatar_color: '#146C43',
        joined_at: new Date().toISOString(),
      },
      members: [],
    };

    await cacheHouseholdContext(mockContext);
    const retrieved = await getCachedHouseholdContext();
    expect(retrieved).toEqual(mockContext);

    await clearCachedHouseholdContext();
    expect(await getCachedHouseholdContext()).toBeNull();
  });

  it('caches and loads ledger snapshot when offline', async () => {
    const mockShops: Shop[] = [
      {
        id: 's-1',
        household_id: 'hh-123',
        name: 'Abebe Suq',
        archived: false,
        needs_review: false,
        merged_into_shop_id: null,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    await cacheHouseholdLedger('hh-123', {
      shops: mockShops,
      entries: [],
      disputes: [],
      priceMemory: [],
    });

    const cached = await getCachedHouseholdLedger('hh-123');
    expect(cached).not.toBeNull();
    expect(cached?.shops[0].name).toBe('Abebe Suq');
    expect(cached?.cachedAt).toBeDefined();
  });

  it('caches and loads shop detail snapshot when offline', async () => {
    const mockShop: Shop = {
      id: 's-1',
      household_id: 'hh-123',
      name: 'Bole Bakery',
      archived: false,
      needs_review: false,
      merged_into_shop_id: null,
      created_by: 'user-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await cacheShopDetail('s-1', {
      shop: mockShop,
      entries: [],
      disputes: [],
      priceMemory: [],
    });

    const cached = await getCachedShopDetail('s-1');
    expect(cached).not.toBeNull();
    expect(cached?.shop?.name).toBe('Bole Bakery');
  });
});
