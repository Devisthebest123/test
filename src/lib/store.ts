/** Tiny typed wrappers over web storage. Everything fails soft: private windows, quotas, blocked storage. */

const PREFIX = 'whisper.';

export function load<T>(key: string, fallback: T, storage: Storage = localStorage): T {
  try {
    const raw = storage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown, storage: Storage = localStorage) {
  try {
    if (value === undefined || value === null) storage.removeItem(PREFIX + key);
    else storage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function drop(key: string, storage: Storage = localStorage) {
  try {
    storage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable */
  }
}

export const session = () => {
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
};
