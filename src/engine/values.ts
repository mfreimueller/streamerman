// Runtime values: int/long/double -> number, boolean, String -> string, List -> array,
// records -> {$rec, ...fields}, enums -> frozen singletons, Optional -> JOptional.
import { cls, typeArg, type JType, ANY } from '../lang/types';
import type { Universe } from '../lang/universe';

export interface JEnum { $enum: string; name: string; ordinal: number }
export interface JRecord { $rec: string; [field: string]: unknown }

export class JOptional {
  constructor(readonly value: unknown, readonly present: boolean) {}
  static of(v: unknown) { return new JOptional(v, true); }
  static empty() { return new JOptional(undefined, false); }
}

export class JavaException extends Error {
  constructor(readonly javaName: string, message?: string) {
    super(message ?? '');
    this.name = javaName;
  }
}

export function naturalCompare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (isEnum(a) && isEnum(b)) return a.ordinal - b.ordinal;
  throw new JavaException('ClassCastException', 'class cannot be cast to class java.lang.Comparable');
}

export const IMMUTABLE = Symbol('immutable');

export const isEnum = (v: unknown): v is JEnum => typeof v === 'object' && v !== null && '$enum' in v;
export const isRecord = (v: unknown): v is JRecord => typeof v === 'object' && v !== null && '$rec' in v;

export class JEntry {
  constructor(readonly key: unknown, readonly value: unknown) {}
}

export type CollKind = 'hash' | 'tree' | 'linked';

const strHash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
};
const f64 = new Float64Array(1);
const i32 = new Int32Array(f64.buffer);

/** Java's hashCode for the key kinds whose HashMap order is deterministic. */
function hashOf(k: unknown): number {
  if (typeof k === 'string') return strHash(k);
  if (typeof k === 'number') {
    if (Number.isInteger(k) && Math.abs(k) < 2 ** 31) return k | 0;
    f64[0] = k;
    return i32[0] ^ i32[1];
  }
  if (typeof k === 'boolean') return k ? 1231 : 1237;
  if (Array.isArray(k)) return k.reduce((h: number, x) => (Math.imul(31, h) + hashOf(x)) | 0, 1);
  return strHash(structKey(k));
}

/** Iteration order of a java.util.HashMap/HashSet (without treeification). Enum keys: declaration order. */
function hashOrder<T>(items: T[], keyOf: (t: T) => unknown): T[] {
  if (items.length && isEnum(keyOf(items[0]))) {
    return [...items].sort((a, b) => (keyOf(a) as JEnum).ordinal - (keyOf(b) as JEnum).ordinal);
  }
  let cap = 16;
  while (items.length > cap * 0.75) cap *= 2;
  return items
    .map((t, i) => {
      const h = hashOf(keyOf(t));
      return { t, i, b: (h ^ (h >>> 16)) & (cap - 1) };
    })
    .sort((x, y) => x.b - y.b || x.i - y.i)
    .map((x) => x.t);
}

function ordered<T>(kind: CollKind, items: T[], keyOf: (t: T) => unknown): T[] {
  if (kind === 'linked') return items;
  if (kind === 'tree') return [...items].sort((a, b) => naturalCompare(keyOf(a), keyOf(b)));
  return hashOrder(items, keyOf);
}

export class JMap {
  private m = new Map<string, [unknown, unknown]>();
  constructor(readonly kind: CollKind = 'hash') {}
  get size() { return this.m.size; }
  has(k: unknown) { return this.m.has(structKey(k)); }
  get(k: unknown): unknown { return this.m.get(structKey(k))?.[1]; }
  put(k: unknown, v: unknown) {
    const key = structKey(k);
    const e = this.m.get(key);
    if (e) e[1] = v;
    else this.m.set(key, [k, v]);
  }
  entries(): [unknown, unknown][] { return ordered(this.kind, [...this.m.values()], (e) => e[0]); }
}

export class JSet {
  private m = new Map<string, unknown>();
  constructor(readonly kind: CollKind = 'hash') {}
  get size() { return this.m.size; }
  has(x: unknown) { return this.m.has(structKey(x)); }
  add(x: unknown) { if (!this.has(x)) this.m.set(structKey(x), x); }
  items(): unknown[] { return ordered(this.kind, [...this.m.values()], (x) => x); }
}

/** Java's compensated double summation (DoubleStream.sum / averagingDouble). */
export function doubleSum(vals: number[]): number {
  let sum = 0, c = 0, simple = 0;
  for (const v of vals) {
    simple += v;
    const tmp = v - c;
    const velvel = sum + tmp;
    c = velvel - sum - tmp;
    sum = velvel;
  }
  const r = sum - c;
  return Number.isNaN(r) && !Number.isFinite(simple) && !Number.isNaN(simple) ? simple : r;
}

export function jEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => jEquals(x, b[i]));
  }
  if (a instanceof JOptional) {
    return b instanceof JOptional && a.present === b.present && jEquals(a.value, b.value);
  }
  if (isEnum(a)) return false; // singletons: identity only
  if (a instanceof JEntry) return b instanceof JEntry && jEquals(a.key, b.key) && jEquals(a.value, b.value);
  if (a instanceof JMap) {
    return b instanceof JMap && a.size === b.size && a.entries().every(([k, v]) => b.has(k) && jEquals(v, b.get(k)));
  }
  if (a instanceof JSet) return b instanceof JSet && a.size === b.size && a.items().every((x) => b.has(x));
  if (isRecord(a)) {
    if (!isRecord(b) || a.$rec !== b.$rec) return false;
    const keys = Object.keys(a).filter((k) => k !== '$rec');
    return keys.every((k) => jEquals(a[k], b[k]));
  }
  return false;
}

/** Structural key, consistent with jEquals (used by distinct). */
export function structKey(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return `n${v}`;
  if (typeof v === 'string') return `s${JSON.stringify(v)}`;
  if (typeof v === 'boolean') return `b${v}`;
  if (Array.isArray(v)) return `[${v.map(structKey).join(',')}]`;
  if (v instanceof JOptional) return v.present ? `O(${structKey(v.value)})` : 'O()';
  if (isEnum(v)) return `e${v.$enum}.${v.name}`;
  if (v instanceof JEntry) return `E(${structKey(v.key)},${structKey(v.value)})`;
  if (v instanceof JMap) return `M{${v.entries().map(([k, x]) => `${structKey(k)}=${structKey(x)}`).sort().join(',')}}`;
  if (v instanceof JSet) return `S{${v.items().map(structKey).sort().join(',')}}`;
  if (isRecord(v)) {
    return `r${v.$rec}(${Object.keys(v).filter((k) => k !== '$rec').map((k) => structKey(v[k])).join(',')})`;
  }
  return String(v);
}

/** Java's Double.toString. */
export function javaDouble(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'Infinity';
  if (v === -Infinity) return '-Infinity';
  if (v === 0) return Object.is(v, -0) ? '-0.0' : '0.0';
  const abs = Math.abs(v);
  if (abs >= 1e7 || abs < 1e-3) {
    let [m, e] = v.toExponential().split('e');
    if (!m.includes('.')) m += '.0';
    return `${m}E${e.startsWith('+') ? e.slice(1) : e}`;
  }
  const s = String(v);
  return s.includes('.') ? s : `${s}.0`;
}

const isDoubleType = (t: JType) => (t.k === 'prim' && t.n === 'double') || (t.k === 'cls' && t.n === 'Double');

/** Java's toString of a value of the given static type (strings unquoted). */
export function toJavaString(v: unknown, t: JType, u: Universe): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return isDoubleType(t) ? javaDouble(v) : String(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => toJavaString(x, typeArg(t, 0), u)).join(', ')}]`;
  if (v instanceof JOptional) {
    const name = t.k === 'cls' && (t.n === 'OptionalInt' || t.n === 'OptionalDouble') ? t.n : 'Optional';
    if (!v.present) return `${name}.empty`;
    const inner = name === 'OptionalDouble' ? javaDouble(v.value as number) : toJavaString(v.value, typeArg(t, 0), u);
    return `${name}[${inner}]`;
  }
  if (v instanceof JEntry) return `${toJavaString(v.key, typeArg(t, 0), u)}=${toJavaString(v.value, typeArg(t, 1), u)}`;
  if (v instanceof JMap) {
    return `{${v.entries().map(([k, x]) => `${toJavaString(k, typeArg(t, 0), u)}=${toJavaString(x, typeArg(t, 1), u)}`).join(', ')}}`;
  }
  if (v instanceof JSet) return `[${v.items().map((x) => toJavaString(x, typeArg(t, 0), u)).join(', ')}]`;
  if (isEnum(v)) return v.name;
  if (isRecord(v)) {
    const def = u.records[v.$rec];
    const fields = def ? def.fields : Object.keys(v).filter((k) => k !== '$rec').map((n) => ({ name: n, type: ANY }));
    return `${v.$rec}[${fields.map((f) => `${f.name}=${toJavaString(v[f.name], f.type, u)}`).join(', ')}]`;
  }
  return String(v);
}

/** Like toJavaString, but a top-level String is shown quoted (as in a check report). */
export function toDisplay(v: unknown, t: JType, u: Universe): string {
  if (typeof v === 'string') return JSON.stringify(v);
  return toJavaString(v, t, u);
}

export const listOf = (...a: JType[]) => cls('List', ...a);
