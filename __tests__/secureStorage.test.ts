const mockAsyncStoreMap = new Map<string, string>();
const mockSecureStoreMap = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockAsyncStoreMap.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockAsyncStoreMap.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockAsyncStoreMap.delete(key);
  }),
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn(async () => true),
  getItemAsync: jest.fn(async (key: string) => mockSecureStoreMap.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStoreMap.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStoreMap.delete(key);
  }),
}));

class MockEncryptionKey {
  constructor(private readonly secretB64: string) {}
  async encoded() {
    return this.secretB64;
  }
}

jest.mock('expo-crypto', () => ({
  AESKeySize: { AES256: 256 },
  AESEncryptionKey: {
    generate: jest.fn(
      async () => new MockEncryptionKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
    ),
    import: jest.fn(async (val: string) => new MockEncryptionKey(val)),
  },
  AESSealedData: {
    fromCombined: jest.fn((combined: string) => ({ combinedValue: combined })),
  },
  aesEncryptAsync: jest.fn(async (plaintext: Uint8Array) => {
    const rawB64 = Buffer.from(plaintext).toString('base64');
    return {
      combined: async () => `enc:${rawB64}`,
    };
  }),
  aesDecryptAsync: jest.fn(async (sealed: { combinedValue: string }) => {
    const b64 = sealed.combinedValue.replace(/^enc:/, '');
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }),
}));

import { createEncryptedSessionStorage } from '../src/lib/secureStorage';

describe('encrypted session storage adapter', () => {
  beforeEach(() => {
    mockAsyncStoreMap.clear();
    mockSecureStoreMap.clear();
    jest.clearAllMocks();
  });

  test('encrypts large JWT session payloads in AsyncStorage using SecureStore AES key', async () => {
    const storage = createEncryptedSessionStorage();
    const largeJwtPayload = JSON.stringify({
      access_token: 'tok_' + 'x'.repeat(3500),
      refresh_token: 'ref_ብር_ethiopia',
    });

    await storage.setItem('sb-auth-token', largeJwtPayload);

    const storedRaw = mockAsyncStoreMap.get('sb-auth-token');
    expect(storedRaw).toMatch(/^qelet_aes_v1:/);
    expect(storedRaw).not.toContain('tok_');

    const restored = await storage.getItem('sb-auth-token');
    expect(restored).toBe(largeJwtPayload);
  });

  test('transparently migrates legacy plaintext AsyncStorage sessions on read', async () => {
    const storage = createEncryptedSessionStorage();
    const legacySession = '{"access_token":"legacy_123"}';
    mockAsyncStoreMap.set('sb-legacy', legacySession);

    const restored = await storage.getItem('sb-legacy');
    expect(restored).toBe(legacySession);
    expect(mockAsyncStoreMap.get('sb-legacy')).toMatch(/^qelet_aes_v1:/);
  });
});
