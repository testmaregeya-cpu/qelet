import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const ENCRYPTED_PREFIX = 'qelet_aes_v1:';
const SECURE_KEY_NAME = 'qelet_session_aes_key_v1';

export interface SessionStorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

/**
 * Stores large Supabase session tokens in AsyncStorage encrypted with AES-256-GCM
 * while keeping the AES key inside hardware-backed SecureStore.
 * Falls back cleanly to AsyncStorage on platforms where SecureStore is unavailable (e.g. Web).
 */
export function createEncryptedSessionStorage(): SessionStorageAdapter {
  let cachedKey: Crypto.AESEncryptionKey | null = null;
  let availabilityChecked: boolean | null = null;

  const hasSecureStore = async (): Promise<boolean> => {
    if (availabilityChecked !== null) {
      return availabilityChecked;
    }
    try {
      availabilityChecked = await SecureStore.isAvailableAsync();
    } catch {
      availabilityChecked = false;
    }
    return availabilityChecked;
  };

  const getOrCreateAesKey = async (): Promise<Crypto.AESEncryptionKey> => {
    if (cachedKey) {
      return cachedKey;
    }

    const storedBase64 = await SecureStore.getItemAsync(SECURE_KEY_NAME);
    if (storedBase64) {
      cachedKey = await Crypto.AESEncryptionKey.import(storedBase64, 'base64');
      return cachedKey;
    }

    const generated = await Crypto.AESEncryptionKey.generate();
    const encoded = await generated.encoded('base64');
    await SecureStore.setItemAsync(SECURE_KEY_NAME, encoded);
    cachedKey = generated;
    return cachedKey;
  };

  const encryptText = async (value: string): Promise<string> => {
    const key = await getOrCreateAesKey();
    const bytes = new TextEncoder().encode(value);
    const sealed = await Crypto.aesEncryptAsync(bytes, key);
    const combinedB64 = await sealed.combined('base64');
    return `${ENCRYPTED_PREFIX}${combinedB64}`;
  };

  const decryptText = async (cipherText: string): Promise<string> => {
    const key = await getOrCreateAesKey();
    const combinedB64 = cipherText.slice(ENCRYPTED_PREFIX.length);
    const sealed = Crypto.AESSealedData.fromCombined(combinedB64);
    const plainBytes = await Crypto.aesDecryptAsync(sealed, key, { output: 'bytes' });
    return new TextDecoder().decode(plainBytes);
  };

  return {
    async getItem(key: string): Promise<string | null> {
      const raw = await AsyncStorage.getItem(key);
      if (raw === null) {
        return null;
      }

      if (!(await hasSecureStore())) {
        return raw.startsWith(ENCRYPTED_PREFIX) ? null : raw;
      }

      if (raw.startsWith(ENCRYPTED_PREFIX)) {
        try {
          return await decryptText(raw);
        } catch {
          return null;
        }
      }

      // Transparent one-time upgrade of legacy unencrypted sessions on native devices
      try {
        const encrypted = await encryptText(raw);
        await AsyncStorage.setItem(key, encrypted);
      } catch {
        // Non-fatal: still return the valid session string
      }
      return raw;
    },

    async setItem(key: string, value: string): Promise<void> {
      if (!(await hasSecureStore())) {
        await AsyncStorage.setItem(key, value);
        return;
      }
      const encrypted = await encryptText(value);
      await AsyncStorage.setItem(key, encrypted);
    },

    async removeItem(key: string): Promise<void> {
      await AsyncStorage.removeItem(key);
    },
  };
}
