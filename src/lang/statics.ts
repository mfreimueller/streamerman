// Static members (Collectors.x, Comparator.x, ...) and static / constructor method references.
import { ANY, INT, STRING, box, cls, promote, typeArg, type JType } from './types';
import { mk, type Member } from './members';
import * as C from '../engine/collectors';
import { JMap, naturalCompare, type CollKind } from '../engine/values';

/** For static members, the "receiver" passed to args/ret/eval is the expected type of the call. */
const T = (exp: JType) => typeArg(exp, 0);
const coll = (t: JType, r: JType) => cls('Collector', t, ANY, r);
const fn = (t: JType) => cls('Function', t, ANY);
const retOf = (a: JType[], i: number) => box(typeArg(a[i] ?? ANY, 1));
const mapOf = (k: JType, v: JType) => cls('Map', k, v);
const kindOf = (factory: unknown): CollKind => (typeof factory === 'function' ? (factory() as JMap).kind : 'hash');
const MAP_SUPPLIER = cls('Supplier', cls('Map', ANY, ANY));
const st = (owner: string, name: string, params: string[], s: Parameters<typeof mk>[3]) => mk(owner, name, params, s, 'static');

const COLLECTORS: Member[] = [
  st('Collectors', 'toList', [], { ret: (e) => coll(T(e), cls('List', T(e))), eval: () => C.toList(), doc: 'Collects the elements into a List.', example: 'stream.collect(Collectors.toList())' }),
  st('Collectors', 'toSet', [], { ret: (e) => coll(T(e), cls('Set', T(e))), eval: () => C.toSet(), doc: 'Collects the elements into a Set (no duplicates, no guaranteed order).', example: 'stream.collect(Collectors.toSet())' }),
  st('Collectors', 'joining', [], { ret: () => coll(STRING, STRING), eval: () => C.joining(), doc: 'Joins Strings into one String without a separator.', example: 'Collectors.joining() -> "abc"' }),
  st('Collectors', 'joining', ['delimiter'], { args: () => [STRING], ret: () => coll(STRING, STRING), eval: (_r, a) => C.joining(a[0]), doc: 'Joins Strings into one String with a separator in between.', example: 'Collectors.joining(", ") -> "a, b, c"' }),
  st('Collectors', 'joining', ['delimiter', 'prefix', 'suffix'], { args: () => [STRING, STRING, STRING], ret: () => coll(STRING, STRING), eval: (_r, a) => C.joining(a[0], a[1], a[2]), doc: 'Joins Strings with a separator, a start and an end.', example: 'Collectors.joining(", ", "[", "]") -> "[a, b]"' }),
  st('Collectors', 'counting', [], { ret: (e) => coll(T(e), cls('Long')), eval: () => C.counting(), doc: 'Counts the elements (as a Long). Mostly used as a downstream collector of groupingBy.', example: 'Collectors.groupingBy(Play::genre, Collectors.counting())' }),
  st('Collectors', 'summingInt', ['mapper'], { args: (e) => [cls('ToIntFunction', T(e))], ret: (e) => coll(T(e), cls('Integer')), eval: (_r, a) => C.summingInt(a[0]), doc: 'Adds up an int value of every element.', example: 'Collectors.summingInt(Play::secondsPlayed)' }),
  st('Collectors', 'summingDouble', ['mapper'], { args: (e) => [cls('ToDoubleFunction', T(e))], ret: (e) => coll(T(e), cls('Double')), eval: (_r, a) => C.summingDouble(a[0]), doc: 'Adds up a double value of every element.', example: 'Collectors.summingDouble(Movie::rating)' }),
  st('Collectors', 'averagingInt', ['mapper'], { args: (e) => [cls('ToIntFunction', T(e))], ret: (e) => coll(T(e), cls('Double')), eval: (_r, a) => C.averagingInt(a[0]), doc: 'The average of an int value (0.0 if there are no elements).', example: 'Collectors.averagingInt(Movie::year)' }),
  st('Collectors', 'averagingDouble', ['mapper'], { args: (e) => [cls('ToDoubleFunction', T(e))], ret: (e) => coll(T(e), cls('Double')), eval: (_r, a) => C.averagingDouble(a[0]), doc: 'The average of a double value (0.0 if there are no elements).', example: 'Collectors.averagingDouble(Movie::rating)' }),
  st('Collectors', 'mapping', ['mapper', 'downstream'], {
    args: (e, _u, prev) => [fn(T(e)), cls('Collector', prev[0] ? retOf(prev, 0) : ANY, ANY, ANY)],
    ret: (e, a) => coll(T(e), typeArg(a[1] ?? ANY, 2)),
    eval: (_r, a) => C.mapping(a[0], a[1]),
    doc: 'Transforms every element first, then hands the result to another collector.', example: 'Collectors.mapping(Play::title, Collectors.toSet())',
  }),
  st('Collectors', 'groupingBy', ['classifier'], {
    args: (e) => [fn(T(e))], ret: (e, a) => coll(T(e), mapOf(retOf(a, 0), cls('List', T(e)))),
    eval: (_r, a) => C.groupingBy(a[0], C.toList()),
    doc: 'Groups the elements into a Map: the key is what the classifier returns, the value is the List of elements with that key.', example: 'Collectors.groupingBy(Movie::director)',
  }),
  st('Collectors', 'groupingBy', ['classifier', 'downstream'], {
    args: (e) => [fn(T(e)), cls('Collector', T(e), ANY, ANY)], ret: (e, a) => coll(T(e), mapOf(retOf(a, 0), typeArg(a[1] ?? ANY, 2))),
    eval: (_r, a) => C.groupingBy(a[0], a[1]),
    doc: 'Groups the elements by key; the downstream collector decides what is stored per key (counting, mapping, ...).', example: 'Collectors.groupingBy(Play::genre, Collectors.counting())',
  }),
  st('Collectors', 'groupingBy', ['classifier', 'mapFactory', 'downstream'], {
    args: (e) => [fn(T(e)), MAP_SUPPLIER, cls('Collector', T(e), ANY, ANY)], ret: (e, a) => coll(T(e), mapOf(retOf(a, 0), typeArg(a[2] ?? ANY, 2))),
    eval: (_r, a) => C.groupingBy(a[0], a[2], kindOf(a[1])),
    doc: 'Like groupingBy with a downstream collector, but you choose the kind of Map, e.g. TreeMap::new for sorted keys.', example: 'Collectors.groupingBy(Play::artist, TreeMap::new, Collectors.counting())',
  }),
  st('Collectors', 'partitioningBy', ['predicate'], {
    args: (e) => [cls('Predicate', T(e))], ret: (e) => coll(T(e), mapOf(cls('Boolean'), cls('List', T(e)))),
    eval: (_r, a) => C.partitioningBy(a[0], C.toList()),
    doc: 'Splits the elements into two groups: key true (condition holds) and key false. Both keys are always present.', example: 'Collectors.partitioningBy(n -> n % 2 == 0)',
  }),
  st('Collectors', 'partitioningBy', ['predicate', 'downstream'], {
    args: (e) => [cls('Predicate', T(e)), cls('Collector', T(e), ANY, ANY)], ret: (e, a) => coll(T(e), mapOf(cls('Boolean'), typeArg(a[1] ?? ANY, 2))),
    eval: (_r, a) => C.partitioningBy(a[0], a[1]),
    doc: 'Splits into true/false groups; the downstream collector decides what is stored in each (counting, ...). Both keys are always present.', example: 'Collectors.partitioningBy(Play::isSkipped, Collectors.counting())',
  }),
  st('Collectors', 'toMap', ['keyMapper', 'valueMapper'], {
    args: (e) => [fn(T(e)), fn(T(e))], ret: (e, a) => coll(T(e), mapOf(retOf(a, 0), retOf(a, 1))),
    eval: (_r, a, cx, ty) => C.toMap(a[0], a[1], undefined, 'hash', { k: retOf(ty.args, 0), v: retOf(ty.args, 1), u: cx.u }),
    doc: 'Collects into a Map. Throws IllegalStateException if two elements produce the same key: use the 3-argument version then.', example: 'Collectors.toMap(Movie::title, Movie::year)',
  }),
  st('Collectors', 'toMap', ['keyMapper', 'valueMapper', 'mergeFunction'], {
    args: (e, _u, prev) => [fn(T(e)), fn(T(e)), cls('BinaryOperator', prev[1] ? retOf(prev, 1) : ANY)], ret: (e, a) => coll(T(e), mapOf(retOf(a, 0), retOf(a, 1))),
    eval: (_r, a, cx, ty) => C.toMap(a[0], a[1], a[2], 'hash', { k: retOf(ty.args, 0), v: retOf(ty.args, 1), u: cx.u }),
    doc: 'Collects into a Map; when two elements have the same key, the merge function combines their values.', example: 'Collectors.toMap(Play::artist, Play::secondsPlayed, Integer::sum)',
  }),
  st('Collectors', 'toMap', ['keyMapper', 'valueMapper', 'mergeFunction', 'mapFactory'], {
    args: (e, _u, prev) => [fn(T(e)), fn(T(e)), cls('BinaryOperator', prev[1] ? retOf(prev, 1) : ANY), MAP_SUPPLIER], ret: (e, a) => coll(T(e), mapOf(retOf(a, 0), retOf(a, 1))),
    eval: (_r, a, cx, ty) => C.toMap(a[0], a[1], a[2], kindOf(a[3]), { k: retOf(ty.args, 0), v: retOf(ty.args, 1), u: cx.u }),
    doc: 'Like the 3-argument toMap, but you choose the kind of Map (TreeMap::new sorts by key, LinkedHashMap::new keeps the order).', example: 'Collectors.toMap(Play::artist, Play::secondsPlayed, Integer::sum, TreeMap::new)',
  }),
];

const cmpT = (e: JType, a: JType[]) => {
  const t = typeArg(a[0] ?? ANY, 0);
  return cls('Comparator', t.k === 'any' ? T(e) : t);
};
const keyCmp = (f: (x: any) => any) => (x: any, y: any) => naturalCompare(f(x), f(y));

const COMPARATORS: Member[] = [
  st('Comparator', 'comparing', ['keyExtractor'], { args: (e) => [fn(T(e))], ret: cmpT, eval: (_r, a) => keyCmp(a[0]), doc: 'A Comparator that compares elements by a value taken from each, e.g. the title.', example: 'Comparator.comparing(Movie::title)' }),
  st('Comparator', 'comparingInt', ['keyExtractor'], { args: (e) => [cls('ToIntFunction', T(e))], ret: cmpT, eval: (_r, a) => keyCmp(a[0]), doc: 'A Comparator that compares by an int value, e.g. the year.', example: 'Comparator.comparingInt(Movie::year)' }),
  st('Comparator', 'comparingDouble', ['keyExtractor'], { args: (e) => [cls('ToDoubleFunction', T(e))], ret: cmpT, eval: (_r, a) => keyCmp(a[0]), doc: 'A Comparator that compares by a double value, e.g. the rating.', example: 'Comparator.comparingDouble(Movie::rating)' }),
  st('Comparator', 'naturalOrder', [], { ret: (e) => cls('Comparator', T(e)), eval: () => naturalCompare, doc: 'Compares by natural order: numbers ascending, Strings alphabetically.', example: 'Comparator.naturalOrder()' }),
  st('Comparator', 'reverseOrder', [], { ret: (e) => cls('Comparator', T(e)), eval: () => (a: unknown, b: unknown) => naturalCompare(b, a), doc: 'Compares by natural order, backwards.', example: 'Comparator.reverseOrder()' }),
];

const ENTRY_STATICS: Member[] = [
  st('Map.Entry', 'comparingByKey', [], { ret: (e) => cls('Comparator', T(e)), eval: () => (a: any, b: any) => naturalCompare(a.key, b.key), doc: 'Compares Map entries by their key.', example: 'Map.Entry.comparingByKey()' }),
  st('Map.Entry', 'comparingByValue', [], { ret: (e) => cls('Comparator', T(e)), eval: () => (a: any, b: any) => naturalCompare(a.value, b.value), doc: 'Compares Map entries by their value.', example: 'Map.Entry.comparingByValue()' }),
];

const MISC: Member[] = [
  st('Function', 'identity', [], { ret: (e) => cls('Function', T(e), T(e)), eval: () => (x: unknown) => x, doc: 'A function that returns its argument unchanged.', example: 'Function.identity()' }),
  st('BinaryOperator', 'maxBy', ['comparator'], {
    args: (e) => [cls('Comparator', T(e))], ret: (e, a) => cls('BinaryOperator', typeArg(a[0] ?? ANY, 0).k === 'any' ? T(e) : typeArg(a[0], 0)),
    eval: (_r, a) => (x: unknown, y: unknown) => (a[0](x, y) >= 0 ? x : y),
    doc: 'Picks the larger of two elements by the Comparator (the first if equal). Good for reduce.', example: 'stream.reduce(BinaryOperator.maxBy(cmp))',
  }),
  st('BinaryOperator', 'minBy', ['comparator'], {
    args: (e) => [cls('Comparator', T(e))], ret: (e, a) => cls('BinaryOperator', typeArg(a[0] ?? ANY, 0).k === 'any' ? T(e) : typeArg(a[0], 0)),
    eval: (_r, a) => (x: unknown, y: unknown) => (a[0](x, y) <= 0 ? x : y),
    doc: 'Picks the smaller of two elements by the Comparator (the first if equal). Good for reduce.', example: 'stream.reduce(BinaryOperator.minBy(cmp))',
  }),
];

export const STATICS: Member[] = [...COLLECTORS, ...COMPARATORS, ...ENTRY_STATICS, ...MISC];

export const findStatic = (owner: string, name: string, arity: number) =>
  STATICS.find((m) => m.owner === owner && m.name === name && m.arity === arity);

// ---- static / constructor method references -----------------------------------

export interface StaticRef {
  owner: string;
  name: string;
  /** Parameters must be int-compatible ('int') or any number ('num'). */
  kind: 'int' | 'num';
  ret(ps: JType[]): JType;
  fn(a: number, b: number): number;
  doc: string;
}

export const STATIC_REFS: StaticRef[] = [
  { owner: 'Integer', name: 'sum', kind: 'int', ret: () => INT, fn: (a, b) => (a + b) | 0, doc: 'Adds two ints.' },
  { owner: 'Integer', name: 'max', kind: 'int', ret: () => INT, fn: Math.max, doc: 'The larger of two ints.' },
  { owner: 'Integer', name: 'min', kind: 'int', ret: () => INT, fn: Math.min, doc: 'The smaller of two ints.' },
  { owner: 'Integer', name: 'compare', kind: 'int', ret: () => INT, fn: (a, b) => (a < b ? -1 : a > b ? 1 : 0), doc: 'Compares two ints: negative, 0 or positive.' },
  { owner: 'Math', name: 'max', kind: 'num', ret: (ps) => promote(ps[0], ps[1]), fn: Math.max, doc: 'The larger of two numbers.' },
  { owner: 'Math', name: 'min', kind: 'num', ret: (ps) => promote(ps[0], ps[1]), fn: Math.min, doc: 'The smaller of two numbers.' },
];

export const findStaticRef = (owner: string, name: string) => STATIC_REFS.find((r) => r.owner === owner && r.name === name);

/** Constructor references allowed as Map suppliers. */
export const CTOR_KINDS: Record<string, CollKind> = { TreeMap: 'tree', LinkedHashMap: 'linked', HashMap: 'hash' };


