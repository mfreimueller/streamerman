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

export const IMMUTABLE = Symbol('immutable');

export const isEnum = (v: unknown): v is JEnum => typeof v === 'object' && v !== null && '$enum' in v;
export const isRecord = (v: unknown): v is JRecord => typeof v === 'object' && v !== null && '$rec' in v;

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
  if (v instanceof JOptional) return v.present ? `Optional[${toJavaString(v.value, typeArg(t, 0), u)}]` : 'Optional.empty';
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
