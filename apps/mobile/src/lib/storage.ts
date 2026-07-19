import * as SecureStore from "expo-secure-store";

const KEY = "touchflow.session";

export interface StoredSession {
  host: string;
  token: string;
  deviceName: string;
}

/**
 * The JWT lives in the OS keychain/keystore (expo-secure-store), not
 * AsyncStorage — it grants mouse control of a computer, so it gets the
 * same treatment as a password.
 */
export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
