// Static Java types, as far as the builder needs them.

export type PrimName = 'int' | 'long' | 'double' | 'boolean' | 'char' | 'void';

export type JType =
  | { k: 'prim'; n: PrimName }
  | { k: 'cls'; n: string; a: JType[] }
  // Not known yet (e.g. the R of map before the lambda body is filled in).
  | { k: 'any' };

export const prim = (n: PrimName): JType => ({ k: 'prim', n });
export const cls = (n: string, ...a: JType[]): JType => ({ k: 'cls', n, a });

export const INT = prim('int');
export const LONG = prim('long');
export const DOUBLE = prim('double');
export const BOOLEAN = prim('boolean');
export const CHAR = prim('char');
export const VOID = prim('void');
export const ANY: JType = { k: 'any' };
export const STRING = cls('String');
export const OBJECT = cls('Object');

const BOXES: Record<string, string> = {
  int: 'Integer',
  long: 'Long',
  double: 'Double',
  boolean: 'Boolean',
  char: 'Character',
};
const UNBOXES: Record<string, PrimName> = {
  Integer: 'int',
  Long: 'long',
  Double: 'double',
  Boolean: 'boolean',
  Character: 'char',
};

export function box(t: JType): JType {
  return t.k === 'prim' && BOXES[t.n] ? cls(BOXES[t.n]) : t;
}

export function unbox(t: JType): JType {
  return t.k === 'cls' && UNBOXES[t.n] ? prim(UNBOXES[t.n]) : t;
}

export const isAny = (t: JType) => t.k === 'any';
export const isCls = (t: JType, n: string) => t.k === 'cls' && t.n === n;
export const typeArg = (t: JType, i: number): JType => (t.k === 'cls' && t.a[i]) || ANY;

export function isNumeric(t: JType): boolean {
  const u = unbox(t);
  return u.k === 'prim' && (u.n === 'int' || u.n === 'long' || u.n === 'double' || u.n === 'char');
}

export function isBoolean(t: JType): boolean {
  const u = unbox(t);
  return u.k === 'prim' && u.n === 'boolean';
}

export function isPrimitive(t: JType): boolean {
  return t.k === 'prim';
}

/** Binary numeric promotion (JLS 5.6.2). */
export function promote(a: JType, b: JType): JType {
  const ua = unbox(a);
  const ub = unbox(b);
  const names = [ua, ub].map((t) => (t.k === 'prim' ? t.n : 'int'));
  if (names.includes('double')) return DOUBLE;
  if (names.includes('long')) return LONG;
  return INT;
}

export function sameType(a: JType, b: JType): boolean {
  if (a.k !== b.k) return false;
  if (a.k === 'any') return true;
  if (a.k === 'prim') return a.n === (b as typeof a).n;
  const bb = b as typeof a;
  return a.n === bb.n && a.a.length === bb.a.length && a.a.every((x, i) => sameType(x, bb.a[i]));
}

const WIDENING: Record<string, string[]> = {
  char: ['int', 'long', 'double'],
  int: ['long', 'double'],
  long: ['double'],
};

/**
 * Can a value of type `from` be used where `to` is expected?
 * Covers identity, primitive widening, boxing/unboxing and `any` on either side.
 * Generic arguments are compared leniently (`any` matches everything).
 */
export function assignable(from: JType, to: JType): boolean {
  if (from.k === 'any' || to.k === 'any') return true;
  if (to.k === 'cls' && to.n === 'Object') return from.k !== 'prim' || from.n !== 'void';
  if (from.k === 'prim' && to.k === 'prim') {
    return from.n === to.n || (WIDENING[from.n] ?? []).includes(to.n);
  }
  if (from.k === 'prim' && to.k === 'cls') return sameType(box(from), to);
  if (from.k === 'cls' && to.k === 'prim') {
    const u = unbox(from);
    return u.k === 'prim' && assignable(u, to);
  }
  const f = from as Extract<JType, { k: 'cls' }>;
  const t = to as Extract<JType, { k: 'cls' }>;
  if (f.n !== t.n) return false;
  return f.a.every((x, i) => !t.a[i] || compatibleArg(x, t.a[i]));
}

function compatibleArg(a: JType, b: JType): boolean {
  if (a.k === 'any' || b.k === 'any') return true;
  if (a.k === 'cls' && b.k === 'cls') {
    return a.n === b.n && a.a.every((x, i) => !b.a[i] || compatibleArg(x, b.a[i]));
  }
  return sameType(a, b);
}

export function show(t: JType): string {
  if (t.k === 'any') return '?';
  if (t.k === 'prim') return t.n;
  return t.a.length ? `${t.n}<${t.a.map(show).join(', ')}>` : t.n;
}

/** Does the type (or one of its arguments) still contain `any`? */
export function hasAny(t: JType): boolean {
  return t.k === 'any' || (t.k === 'cls' && t.a.some(hasAny));
}

// ---- functional interfaces ------------------------------------------------

interface FnShape {
  params: (a: JType[]) => JType[];
  ret: (a: JType[]) => JType;
  /** Index of the type argument that is the lambda's return type, if any. */
  retIndex?: number;
}

const one = (a: JType[]) => [a[0] ?? ANY];
const two = (a: JType[]) => [a[0] ?? ANY, a[0] ?? ANY];

export const FUNCTIONAL: Record<string, FnShape> = {
  Predicate: { params: one, ret: () => BOOLEAN },
  Function: { params: one, ret: (a) => a[1] ?? ANY, retIndex: 1 },
  UnaryOperator: { params: one, ret: (a) => a[0] ?? ANY },
  BinaryOperator: { params: two, ret: (a) => a[0] ?? ANY },
  BiFunction: { params: (a) => [a[0] ?? ANY, a[1] ?? ANY], ret: (a) => a[2] ?? ANY, retIndex: 2 },
  ToIntFunction: { params: one, ret: () => INT },
  ToLongFunction: { params: one, ret: () => LONG },
  ToDoubleFunction: { params: one, ret: () => DOUBLE },
  Consumer: { params: one, ret: () => VOID },
  Supplier: { params: () => [], ret: (a) => a[0] ?? ANY, retIndex: 0 },
  Comparator: { params: two, ret: () => INT },
  IntPredicate: { params: () => [INT], ret: () => BOOLEAN },
  IntUnaryOperator: { params: () => [INT], ret: () => INT },
  IntBinaryOperator: { params: () => [INT, INT], ret: () => INT },
  IntFunction: { params: () => [INT], ret: (a) => a[0] ?? ANY, retIndex: 0 },
};

export function fnShape(t: JType): { params: JType[]; ret: JType } | null {
  if (t.k !== 'cls') return null;
  const s = FUNCTIONAL[t.n];
  return s ? { params: s.params(t.a), ret: s.ret(t.a) } : null;
}

/** Fill in the inferred return type of a functional type, e.g. Function<Movie, ?> -> Function<Movie, String>. */
export function withFnReturn(t: JType, ret: JType): JType {
  if (t.k !== 'cls') return t;
  const s = FUNCTIONAL[t.n];
  if (!s || s.retIndex === undefined) return t;
  const a = [...t.a];
  while (a.length <= s.retIndex) a.push(ANY);
  if (hasAny(a[s.retIndex])) a[s.retIndex] = box(ret);
  return cls(t.n, ...a);
}

export const isStreamType = (t: JType) =>
  t.k === 'cls' && (t.n === 'Stream' || t.n === 'IntStream' || t.n === 'DoubleStream');
