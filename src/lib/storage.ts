// localStorage access that never throws: the app works with storage blocked or full.
export const PREFIX = 'streamerman:v1:';

export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  key(i: number): string | null;
  readonly length: number;
}

let override: Store | null | undefined;

/** For tests: replace the store (null = no storage at all). */
export function setStore(s: Store | null | undefined) {
  override = s;
}

function store(): Store | null {
  if (override !== undefined) return override;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // access itself can throw (blocked site data)
  }
}

export function readJson<T>(key: string): T | undefined {
  try {
    const raw = store()?.getItem(PREFIX + key);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string) {
  try {
    store()?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Remove everything this app stored (any format version). */
export function clearAll() {
  try {
    const s = store();
    if (!s) return;
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith('streamerman:')) keys.push(k);
    }
    keys.forEach((k) => s.removeItem(k));
  } catch {
    /* ignore */
  }
}
