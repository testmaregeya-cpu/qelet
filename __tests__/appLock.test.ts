const mockSecureMap = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureMap.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureMap.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureMap.delete(key);
  }),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytesAsync: jest.fn(async (count: number) => {
    const bytes = new Uint8Array(count);
    for (let i = 0; i < count; i += 1) {
      bytes[i] = (i * 17 + 42) % 256;
    }
    return bytes;
  }),
  digestStringAsync: jest.fn(async (_alg: string, input: string) => {
    let acc = 0;
    for (let i = 0; i < input.length; i += 1) {
      acc = (acc * 31 + input.charCodeAt(i)) >>> 0;
    }
    return `digest_${acc}_${input.length}`;
  }),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  authenticateAsync: jest.fn(async () => ({ success: false })),
}));

import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  attemptAppLockPinUnlock,
  canUseBiometrics,
  getAppLockConfig,
  isBiometricActive,
  promptBiometricUnlock,
  setAppLockPin,
  setAppLockPreferences,
  verifyAppLockPin,
} from '../src/services/appLock';

const mockGetRandomBytesAsync = Crypto.getRandomBytesAsync as jest.Mock;
const mockDigestStringAsync = Crypto.digestStringAsync as jest.Mock;

describe('appLock service security hardening', () => {
  beforeEach(() => {
    mockSecureMap.clear();
    jest.clearAllMocks();
  });

  test('setAppLockPin uses Crypto.getRandomBytesAsync and iterated SHA-256 hashing', async () => {
    await setAppLockPin('4829');

    expect(mockGetRandomBytesAsync).toHaveBeenCalledWith(16);
    expect(mockDigestStringAsync.mock.calls.length).toBeGreaterThanOrEqual(50);

    const cfg = await getAppLockConfig();
    expect(cfg.hasPin).toBe(true);
    expect(await verifyAppLockPin('4829')).toBe(true);
    expect(await verifyAppLockPin('0000')).toBe(false);
  });

  test('enforces temporary lockout cooldown after 5 consecutive wrong PIN guesses', async () => {
    await setAppLockPin('1357');
    const baseTime = 1_700_000_000_000;

    for (let i = 0; i < 4; i += 1) {
      const res = await attemptAppLockPinUnlock('9999', baseTime + i * 100);
      expect(res.unlocked).toBe(false);
      expect(res.lockedOutSeconds).toBe(0);
    }

    const fifth = await attemptAppLockPinUnlock('9999', baseTime + 500);
    expect(fifth.unlocked).toBe(false);
    expect(fifth.lockedOutSeconds).toBeGreaterThan(0);

    // Even the correct PIN is rejected during active cooldown
    const duringCooldown = await attemptAppLockPinUnlock('1357', baseTime + 2_000);
    expect(duringCooldown.unlocked).toBe(false);
    expect(duringCooldown.lockedOutSeconds).toBeGreaterThan(0);

    // Once cooldown expires, the correct PIN unlocks and resets attempts
    const afterCooldown = await attemptAppLockPinUnlock('1357', baseTime + 60_000);
    expect(afterCooldown.unlocked).toBe(true);
    expect(afterCooldown.lockedOutSeconds).toBe(0);
  });

  test('defaults timeoutSeconds to 0 and configures biometric unlock safely', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });

    expect(await canUseBiometrics()).toBe(true);

    const cfg = await getAppLockConfig();
    expect(cfg.timeoutSeconds).toBe(0);
    expect(cfg.enabled).toBe(true); // Automatically enabled when device has enrolled biometrics
    expect(cfg.biometricEnabled).toBe(true);

    expect(isBiometricActive()).toBe(false);
    const unlockPromise = promptBiometricUnlock();
    expect(await unlockPromise).toBe(true);
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptMessage: 'Unlock Qelet',
        cancelLabel: 'Cancel',
      })
    );
  });
});
