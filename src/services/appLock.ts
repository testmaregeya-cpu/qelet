import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const KEY_ENABLED = 'qelet_lock_enabled';
const KEY_BIOMETRIC = 'qelet_lock_biometric';
const KEY_TIMEOUT_SEC = 'qelet_lock_timeout_sec';
const KEY_PIN_SALT = 'qelet_lock_pin_salt';
const KEY_PIN_HASH = 'qelet_lock_pin_hash';
const KEY_FAILED_ATTEMPTS = 'qelet_lock_failed_attempts';
const KEY_LOCKOUT_UNTIL = 'qelet_lock_until_ms';

const HASH_V2_PREFIX = 'v2:';
const HASH_ITERATIONS = 50;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_COOLDOWN_MS = 30_000;

export interface AppLockConfig {
  enabled: boolean;
  biometricEnabled: boolean;
  hasPin: boolean;
  timeoutSeconds: number;
}

export interface PinUnlockAttemptResult {
  unlocked: boolean;
  remainingAttempts: number;
  lockedOutSeconds: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPinV1(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

async function hashPinV2(pin: string, salt: string): Promise<string> {
  let acc = `${salt}:${pin}`;
  for (let i = 0; i < HASH_ITERATIONS; i += 1) {
    acc = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${salt}:${pin}:${i}:${acc}`
    );
  }
  return `${HASH_V2_PREFIX}${acc}`;
}

let inFlightAuthPromise: Promise<boolean> | null = null;
let isBiometricPromptActive = false;

export function isBiometricActive(): boolean {
  return isBiometricPromptActive;
}

export async function getAppLockConfig(): Promise<AppLockConfig> {
  const [enabledRaw, bioRaw, timeoutRaw, pinHash, bioAvailable] = await Promise.all([
    SecureStore.getItemAsync(KEY_ENABLED),
    SecureStore.getItemAsync(KEY_BIOMETRIC),
    SecureStore.getItemAsync(KEY_TIMEOUT_SEC),
    SecureStore.getItemAsync(KEY_PIN_HASH),
    canUseBiometrics(),
  ]);

  const hasPin = Boolean(pinHash);
  let enabled = false;
  if (enabledRaw === 'true') {
    enabled = true;
  } else if (enabledRaw === 'false') {
    enabled = false;
  } else {
    // Default to true if biometrics or PIN is available
    enabled = bioAvailable || hasPin;
  }

  // Default to 0 (Immediately on background/close)
  const parsedTimeout = Number.parseInt(timeoutRaw ?? '0', 10);
  return {
    enabled,
    biometricEnabled: bioRaw !== 'false' && bioAvailable,
    hasPin,
    timeoutSeconds: Number.isFinite(parsedTimeout) ? parsedTimeout : 0,
  };
}

export async function setAppLockPin(pin: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }

  const randomBytes = await Crypto.getRandomBytesAsync(16);
  const salt = bytesToHex(randomBytes);
  const digest = await hashPinV2(pin, salt);

  await Promise.all([
    SecureStore.setItemAsync(KEY_PIN_SALT, salt),
    SecureStore.setItemAsync(KEY_PIN_HASH, digest),
    SecureStore.deleteItemAsync(KEY_FAILED_ATTEMPTS),
    SecureStore.deleteItemAsync(KEY_LOCKOUT_UNTIL),
  ]);
}

export async function getRemainingPinLockoutSeconds(nowMs = Date.now()): Promise<number> {
  const raw = await SecureStore.getItemAsync(KEY_LOCKOUT_UNTIL);
  if (!raw) return 0;
  const untilMs = Number.parseInt(raw, 10);
  if (!Number.isFinite(untilMs) || untilMs <= nowMs) {
    return 0;
  }
  return Math.ceil((untilMs - nowMs) / 1000);
}

async function clearLockoutState(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_FAILED_ATTEMPTS),
    SecureStore.deleteItemAsync(KEY_LOCKOUT_UNTIL),
  ]);
}

export async function attemptAppLockPinUnlock(
  pin: string,
  nowMs = Date.now()
): Promise<PinUnlockAttemptResult> {
  const activeCooldown = await getRemainingPinLockoutSeconds(nowMs);
  if (activeCooldown > 0) {
    return {
      unlocked: false,
      remainingAttempts: 0,
      lockedOutSeconds: activeCooldown,
    };
  }

  const [salt, expectedHash, failedRaw] = await Promise.all([
    SecureStore.getItemAsync(KEY_PIN_SALT),
    SecureStore.getItemAsync(KEY_PIN_HASH),
    SecureStore.getItemAsync(KEY_FAILED_ATTEMPTS),
  ]);

  if (!salt || !expectedHash) {
    return {
      unlocked: false,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
      lockedOutSeconds: 0,
    };
  }

  const isV2 = expectedHash.startsWith(HASH_V2_PREFIX);
  const candidate = isV2 ? await hashPinV2(pin, salt) : await hashPinV1(pin, salt);

  if (candidate === expectedHash) {
    await clearLockoutState();
    // Transparently upgrade legacy 1-round PIN hashes to iterated v2
    if (!isV2) {
      const upgraded = await hashPinV2(pin, salt);
      await SecureStore.setItemAsync(KEY_PIN_HASH, upgraded);
    }
    return {
      unlocked: true,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
      lockedOutSeconds: 0,
    };
  }

  const prevFailed = Number.parseInt(failedRaw ?? '0', 10);
  const nextFailed = (Number.isFinite(prevFailed) ? prevFailed : 0) + 1;

  if (nextFailed >= MAX_FAILED_ATTEMPTS) {
    const lockUntil = nowMs + LOCKOUT_COOLDOWN_MS;
    await Promise.all([
      SecureStore.setItemAsync(KEY_FAILED_ATTEMPTS, '0'),
      SecureStore.setItemAsync(KEY_LOCKOUT_UNTIL, String(lockUntil)),
    ]);
    return {
      unlocked: false,
      remainingAttempts: 0,
      lockedOutSeconds: Math.ceil(LOCKOUT_COOLDOWN_MS / 1000),
    };
  }

  await SecureStore.setItemAsync(KEY_FAILED_ATTEMPTS, String(nextFailed));
  return {
    unlocked: false,
    remainingAttempts: MAX_FAILED_ATTEMPTS - nextFailed,
    lockedOutSeconds: 0,
  };
}

export async function verifyAppLockPin(pin: string): Promise<boolean> {
  const result = await attemptAppLockPinUnlock(pin);
  return result.unlocked;
}

export async function setAppLockPreferences(params: {
  enabled?: boolean;
  biometricEnabled?: boolean;
  timeoutSeconds?: number;
}): Promise<void> {
  const writes: Promise<void>[] = [];
  if (params.enabled !== undefined) {
    writes.push(SecureStore.setItemAsync(KEY_ENABLED, String(params.enabled)));
  }
  if (params.biometricEnabled !== undefined) {
    writes.push(SecureStore.setItemAsync(KEY_BIOMETRIC, String(params.biometricEnabled)));
  }
  if (params.timeoutSeconds !== undefined) {
    writes.push(SecureStore.setItemAsync(KEY_TIMEOUT_SEC, String(params.timeoutSeconds)));
  }
  await Promise.all(writes);
}

export async function canUseBiometrics(): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export async function promptBiometricUnlock(): Promise<boolean> {
  if (inFlightAuthPromise) {
    return inFlightAuthPromise;
  }

  inFlightAuthPromise = (async () => {
    try {
      const available = await canUseBiometrics();
      if (!available) return false;

      isBiometricPromptActive = true;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Qelet',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: false,
      });

      if (result.success) {
        await clearLockoutState();
      }
      return result.success;
    } catch {
      return false;
    } finally {
      // Delay clearing active flag so the Android AppState active transition is absorbed
      setTimeout(() => {
        isBiometricPromptActive = false;
      }, 600);
      inFlightAuthPromise = null;
    }
  })();

  return inFlightAuthPromise;
}
