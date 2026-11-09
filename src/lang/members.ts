// Catalogue of members (methods) per receiver type: typing, evaluation and documentation in one place.
import {
  ANY, BOOLEAN, DOUBLE, INT, LONG, STRING, box, cls, show, typeArg,
  type JType,
} from './types';
import type { Universe } from './universe';
import { JEntry, JMap, JSet, JavaException, JOptional, doubleSum, jEquals, naturalCompare } from '../engine/values';
import { JStream } from '../engine/stream';

export interface EvalCx { u: Universe }
export interface EvalTypes { recv: JType; args: JType[] }

export interface Member {
  owner: string;
  name: string;
  arity: number;
  kind: 'instance' | 'static';
  params: string[];
  /** Expected argument types given the receiver (lambdas take their parameter types from these). */
  args(recv: JType, u: Universe, prev?: JType[]): JType[];
  ret(recv: JType, argTypes: JType[], u: Universe): JType;
  eval(recv: any, args: any[], cx: EvalCx, types: EvalTypes): any;
  doc: string;
  example: string;
  tag?: 'intermediate' | 'terminal';
  /** Names for unknown (any) parts of the displayed result type, in order, e.g. ['K', 'D']. */
  vars?: string[];
  /** Is it sensible to offer this member for the receiver? (Typing ignores this.) */
  when?(recv: JType, u: Universe): boolean;
}

export const memberId = (m: Member) => `${m.owner}.${m.name}/${m.arity}`;

/** Does a forbidden list (ids like `Stream.count/0` or `Collectors.groupingBy/*`) contain the member? */
export const isForbidden = (list: readonly string[] | undefined, m: Member) =>
  !!list && (list.includes(memberId(m)) || list.includes(`${m.owner}.${m.name}/*`));

export interface Spec {
  args?: (recv: JType, u: Universe, prev: JType[]) => JType[];
  ret: JType | ((recv: JType, a: JType[], u: Universe) => JType);
  eval: (recv: any, args: any[], cx: EvalCx, types: EvalTypes) => any;
  doc: string;
  example: string;
  tag?: 'intermediate' | 'terminal';
  vars?: string[];
  when?: (recv: JType, u: Universe) => boolean;
}

export function mk(owner: string, name: string, params: string[], s: Spec, kind: 'instance' | 'static' = 'instance'): Member {
  return {
    owner, name, arity: params.length, kind, params,
    args: s.args ? (r, u, prev = []) => s.args!(r, u, prev) : () => params.map(() => ANY),
    ret: typeof s.ret === 'function' ? s.ret : () => s.ret as JType,
    eval: s.eval, doc: s.doc, example: s.example, tag: s.tag, when: s.when, vars: s.vars,
  };
}

const T = (recv: JType) => typeArg(recv, 0);
const pred = (recv: JType) => [cls('Predicate', T(recv))];
const equalsOf = (owner: string) =>
  mk(owner, 'equals', ['other'], {
    args: (r) => [r],
    ret: BOOLEAN,
    eval: (r, a) => jEquals(r, a[0]),
    doc: 'Compares by value, not by reference. Use this instead of == for objects.',
    example: 'a.equals(b)',
  });

const STRING_M: Member[] = [
  mk('String', 'length', [], { ret: INT, eval: (r) => r.length, doc: 'Number of characters.', example: '"abc".length() -> 3' }),
  mk('String', 'isEmpty', [], { ret: BOOLEAN, eval: (r) => r.length === 0, doc: 'True if the string has no characters.', example: '"".isEmpty() -> true' }),
  mk('String', 'toUpperCase', [], { ret: STRING, eval: (r) => r.toUpperCase(), doc: 'Converts all letters to upper case.', example: '"abc".toUpperCase() -> "ABC"' }),
  mk('String', 'toLowerCase', [], { ret: STRING, eval: (r) => r.toLowerCase(), doc: 'Converts all letters to lower case.', example: '"ABC".toLowerCase() -> "abc"' }),
  mk('String', 'trim', [], { ret: STRING, eval: (r) => r.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, ''), doc: 'Removes leading and trailing white space.', example: '" a ".trim() -> "a"' }),
  mk('String', 'startsWith', ['prefix'], { args: () => [STRING], ret: BOOLEAN, eval: (r, a) => r.startsWith(a[0]), doc: 'True if the string begins with the prefix.', example: '"stream".startsWith("st") -> true' }),
  mk('String', 'endsWith', ['suffix'], { args: () => [STRING], ret: BOOLEAN, eval: (r, a) => r.endsWith(a[0]), doc: 'True if the string ends with the suffix.', example: '"stream".endsWith("am") -> true' }),
  mk('String', 'contains', ['part'], { args: () => [STRING], ret: BOOLEAN, eval: (r, a) => r.includes(a[0]), doc: 'True if the string contains the given text.', example: '"stream".contains("rea") -> true' }),
  equalsOf('String'),
];

const LIST_M: Member[] = [
  mk('List', 'stream', [], { ret: (r) => cls('Stream', T(r)), eval: (r) => new JStream(r), doc: 'Starts a stream over the elements of the list.', example: 'list.stream()' }),
  mk('List', 'size', [], { ret: INT, eval: (r) => r.length, doc: 'Number of elements.', example: '[a, b].size() -> 2' }),
  mk('List', 'isEmpty', [], { ret: BOOLEAN, eval: (r) => r.length === 0, doc: 'True if the list has no elements.', example: '[].isEmpty() -> true' }),
  mk('List', 'contains', ['element'], {
    args: (r) => [box(T(r))], ret: BOOLEAN, eval: (r, a) => r.some((x: unknown) => jEquals(x, a[0])),
    doc: 'True if the list contains an element equal to the argument.', example: '[DRAMA, HORROR].contains(DRAMA) -> true',
  }),
  mk('List', 'get', ['index'], {
    args: () => [INT], ret: (r) => T(r),
    eval: (r, a) => {
      if (a[0] < 0 || a[0] >= r.length) throw new JavaException('IndexOutOfBoundsException', `Index ${a[0]} out of bounds for length ${r.length}`);
      return r[a[0]];
    },
    doc: 'The element at the given position (starting at 0).', example: '[a, b].get(1) -> b',
  }),
];

const isComparable = (t: JType) =>
  t.k === 'cls' && (['String', 'Integer', 'Long', 'Double', 'Boolean'].includes(t.n));

const lstream = (t: JType) => cls('Stream', t);
const cmpOf = (r: JType) => cls('Comparator', T(r));
const retOf = (a: JType[], i: number) => box(typeArg(a[i] ?? ANY, 1));

const STREAM_M: Member[] = [
  mk('Stream', 'filter', ['predicate'], { args: (r) => pred(r), ret: (r) => lstream(T(r)), eval: (r, a) => r.filter(a[0]), tag: 'intermediate', doc: 'Keeps only the elements for which the condition is true.', example: 'nums.stream().filter(n -> n > 2)' }),
  mk('Stream', 'map', ['mapper'], {
    args: (r) => [cls('Function', T(r), ANY)],
    ret: (_r, a) => lstream(retOf(a, 0)),
    eval: (r, a) => r.map(a[0]), tag: 'intermediate',
    doc: 'Transforms every element into something else.', example: 'movies.stream().map(Movie::title)',
  }),
  mk('Stream', 'mapToInt', ['mapper'], { args: (r) => [cls('ToIntFunction', T(r))], ret: cls('IntStream'), eval: (r, a) => r.map(a[0]), tag: 'intermediate', doc: 'Turns every element into an int, giving an IntStream with sum(), average(), max() ...', example: 'movies.stream().mapToInt(Movie::year)' }),
  mk('Stream', 'mapToDouble', ['mapper'], { args: (r) => [cls('ToDoubleFunction', T(r))], ret: cls('DoubleStream'), eval: (r, a) => r.map(a[0]), tag: 'intermediate', doc: 'Turns every element into a double, giving a DoubleStream.', example: 'movies.stream().mapToDouble(Movie::rating)' }),
  mk('Stream', 'flatMap', ['mapper'], {
    args: (r) => [cls('Function', T(r), lstream(ANY))],
    ret: (_r, a) => lstream(box(typeArg(retOf(a, 0).k === 'cls' ? retOf(a, 0) : ANY, 0))),
    eval: (r, a) => r.flatMap(a[0]), tag: 'intermediate',
    doc: 'Replaces every element by a stream of elements and joins all these streams into one.', example: 'movies.stream().flatMap(m -> m.genres().stream())',
  }),
  mk('Stream', 'distinct', [], { ret: (r) => lstream(T(r)), eval: (r) => r.distinct(), tag: 'intermediate', doc: 'Removes duplicates; keeps the first occurrence.', example: '[1, 2, 1].stream().distinct() -> 1, 2' }),
  mk('Stream', 'sorted', [], {
    ret: (r) => lstream(T(r)), eval: (r) => r.sorted(), tag: 'intermediate',
    when: (r, u) => isComparable(T(r)) || (T(r).k === 'cls' && !!u.enums[(T(r) as any).n]),
    doc: 'Sorts by natural order (numbers ascending, strings alphabetically).', example: '[3, 1, 2].stream().sorted() -> 1, 2, 3',
  }),
  mk('Stream', 'sorted', ['comparator'], { args: (r) => [cmpOf(r)], ret: (r) => lstream(T(r)), eval: (r, a) => r.sorted(a[0]), tag: 'intermediate', doc: 'Sorts with a Comparator. The sort is stable: equal elements keep their order.', example: 'movies.stream().sorted(Comparator.comparing(Movie::title))' }),
  mk('Stream', 'limit', ['maxSize'], { args: () => [LONG], ret: (r) => lstream(T(r)), eval: (r, a) => r.limit(a[0]), tag: 'intermediate', doc: 'Stops after the first n elements.', example: '[1, 2, 3].stream().limit(2) -> 1, 2' }),
  mk('Stream', 'skip', ['n'], { args: () => [LONG], ret: (r) => lstream(T(r)), eval: (r, a) => r.skip(a[0]), tag: 'intermediate', doc: 'Drops the first n elements.', example: '[1, 2, 3].stream().skip(1) -> 2, 3' }),
  mk('Stream', 'count', [], { ret: LONG, eval: (r) => r.count(), tag: 'terminal', doc: 'Counts the elements. Ends the stream.', example: '[a, b].stream().count() -> 2' }),
  mk('Stream', 'toList', [], { ret: (r) => cls('List', T(r)), eval: (r) => r.toList(), tag: 'terminal', doc: 'Collects the elements into an unmodifiable list. Ends the stream.', example: 'nums.stream().toList()' }),
  mk('Stream', 'collect', ['collector'], {
    args: (r) => [cls('Collector', T(r), ANY, ANY)],
    ret: (_r, a) => typeArg(a[0] ?? ANY, 2),
    eval: (r, a) => r.collect(a[0]), tag: 'terminal',
    doc: 'Collects the elements with a Collector from Collectors: into a list, a set, a map, a String ...', example: 'words.stream().collect(Collectors.toSet())',
  }),
  mk('Stream', 'anyMatch', ['predicate'], { args: (r) => pred(r), ret: BOOLEAN, eval: (r, a) => r.anyMatch(a[0]), tag: 'terminal', doc: 'True if at least one element matches; stops at the first match.', example: 'nums.stream().anyMatch(n -> n > 5)' }),
  mk('Stream', 'allMatch', ['predicate'], { args: (r) => pred(r), ret: BOOLEAN, eval: (r, a) => r.allMatch(a[0]), tag: 'terminal', doc: 'True if every element matches (true for an empty stream).', example: 'nums.stream().allMatch(n -> n > 0)' }),
  mk('Stream', 'noneMatch', ['predicate'], { args: (r) => pred(r), ret: BOOLEAN, eval: (r, a) => r.noneMatch(a[0]), tag: 'terminal', doc: 'True if no element matches (true for an empty stream).', example: 'nums.stream().noneMatch(n -> n < 0)' }),
  mk('Stream', 'findFirst', [], { ret: (r) => cls('Optional', T(r)), eval: (r) => r.findFirst(), tag: 'terminal', doc: 'The first element, wrapped in an Optional (empty if there is none).', example: 'nums.stream().findFirst() -> Optional[1]' }),
  mk('Stream', 'findAny', [], { ret: (r) => cls('Optional', T(r)), eval: (r) => r.findFirst(), tag: 'terminal', doc: 'Any element, wrapped in an Optional. In a sequential stream this is the first one.', example: 'nums.stream().findAny()' }),
  mk('Stream', 'min', ['comparator'], { args: (r) => [cmpOf(r)], ret: (r) => cls('Optional', T(r)), eval: (r, a) => r.min(a[0]), tag: 'terminal', doc: 'The smallest element according to the Comparator (the first one if several are equal); empty Optional for an empty stream.', example: 'movies.stream().min(Comparator.comparingInt(Movie::year))' }),
  mk('Stream', 'max', ['comparator'], { args: (r) => [cmpOf(r)], ret: (r) => cls('Optional', T(r)), eval: (r, a) => r.max(a[0]), tag: 'terminal', doc: 'The largest element according to the Comparator (the first one if several are equal); empty Optional for an empty stream.', example: 'movies.stream().max(Comparator.comparingInt(Movie::year))' }),
  mk('Stream', 'reduce', ['identity', 'accumulator'], {
    args: (r) => [box(T(r)), cls('BinaryOperator', T(r))], ret: (r) => T(r), eval: (r, a) => r.reduce(a[0], a[1]), tag: 'terminal',
    doc: 'Combines all elements into one value, starting with the identity (the result for an empty stream).', example: 'nums.stream().reduce(0, Integer::sum)',
  }),
  mk('Stream', 'reduce', ['accumulator'], {
    args: (r) => [cls('BinaryOperator', T(r))], ret: (r) => cls('Optional', T(r)), eval: (r, a) => r.reduce1(a[0]), tag: 'terminal',
    doc: 'Combines all elements into one value. The result is an Optional because the stream may be empty.', example: 'nums.stream().reduce(Integer::sum)',
  }),
];

const NSE = () => new JavaException('NoSuchElementException', 'No value present');

const primStream = (owner: 'IntStream' | 'DoubleStream'): Member[] => {
  const int = owner === 'IntStream';
  const el: JType = int ? INT : DOUBLE;
  const opt = cls(int ? 'OptionalInt' : 'OptionalDouble');
  const name = int ? 'int' : 'double';
  const sum = (a: number[]) => (int ? a.reduce((x, y) => (x + y) | 0, 0) : doubleSum(a));
  const best = (pick: (x: number, y: number) => number) => (r: any) => {
    const a: number[] = r.toArray();
    return a.length ? JOptional.of(a.reduce(pick)) : JOptional.empty();
  };
  return [
    mk(owner, 'boxed', [], { ret: cls('Stream', box(el)), eval: (r) => r.map((x: unknown) => x), tag: 'intermediate', doc: `Turns the primitive ${name} stream into a Stream of boxed values.`, example: `${int ? 'IntStream' : 'DoubleStream'} -> Stream<${int ? 'Integer' : 'Double'}>` }),
    mk(owner, 'sum', [], { ret: el, eval: (r) => sum(r.toArray()), tag: 'terminal', doc: `Adds up all values (0 for an empty stream).`, example: 'movies.stream().mapToInt(Movie::year).sum()' }),
    mk(owner, 'average', [], { ret: cls('OptionalDouble'), eval: (r) => { const a: number[] = r.toArray(); return a.length ? JOptional.of(sum(a) / a.length) : JOptional.empty(); }, tag: 'terminal', doc: 'The average as OptionalDouble (empty for an empty stream).', example: 'movies.stream().mapToInt(Movie::year).average()' }),
    mk(owner, 'max', [], { ret: opt, eval: best((x, y) => (y > x ? y : x)), tag: 'terminal', doc: 'The largest value (empty for an empty stream).', example: 'movies.stream().mapToInt(Movie::year).max()' }),
    mk(owner, 'min', [], { ret: opt, eval: best((x, y) => (y < x ? y : x)), tag: 'terminal', doc: 'The smallest value (empty for an empty stream).', example: 'movies.stream().mapToInt(Movie::year).min()' }),
    mk(owner, 'count', [], { ret: LONG, eval: (r) => r.count(), tag: 'terminal', doc: 'Counts the values.', example: 'nums.stream().mapToInt(n -> n).count()' }),
    ...(int ? [mk(owner, 'mapToObj', ['mapper'], { args: () => [cls('IntFunction', ANY)], ret: (_r, a) => lstream(box(typeArg(a[0] ?? ANY, 0))), eval: (r, a) => r.map(a[0]), tag: 'intermediate' as const, doc: 'Turns every int into an object, giving a Stream.', example: 'IntStream -> Stream<String>: i -> "#" + i' })] : []),
  ];
};

const INT_STREAM_M = primStream('IntStream');
const DOUBLE_STREAM_M = primStream('DoubleStream');

const OPTIONAL_M: Member[] = [
  mk('Optional', 'isPresent', [], { ret: BOOLEAN, eval: (r: JOptional) => r.present, doc: 'True if a value is present.', example: 'Optional.empty.isPresent() -> false' }),
  mk('Optional', 'isEmpty', [], { ret: BOOLEAN, eval: (r: JOptional) => !r.present, doc: 'True if there is no value.', example: 'Optional.empty.isEmpty() -> true' }),
  mk('Optional', 'orElse', ['other'], { args: (r) => [box(T(r))], ret: (r) => T(r), eval: (r: JOptional, a) => (r.present ? r.value : a[0]), doc: 'The value, or the given default if the Optional is empty.', example: 'opt.orElse(0)' }),
  mk('Optional', 'orElseThrow', [], { ret: (r) => T(r), eval: (r: JOptional) => { if (!r.present) throw NSE(); return r.value; }, doc: 'The value; throws NoSuchElementException if the Optional is empty.', example: 'opt.orElseThrow()' }),
  mk('Optional', 'get', [], { ret: (r) => T(r), eval: (r: JOptional) => { if (!r.present) throw NSE(); return r.value; }, doc: 'The value; throws if empty. Prefer orElse or orElseThrow: get() hides the empty case.', example: 'opt.get()' }),
  mk('Optional', 'map', ['mapper'], { args: (r) => [cls('Function', T(r), ANY)], ret: (_r, a) => cls('Optional', retOf(a, 0)), eval: (r: JOptional, a) => (r.present ? JOptional.of(a[0](r.value)) : r), doc: 'Transforms the value if there is one; an empty Optional stays empty.', example: 'findById(1).map(Movie::title)' }),
  mk('Optional', 'filter', ['predicate'], { args: (r) => pred(r), ret: (r) => cls('Optional', T(r)), eval: (r: JOptional, a) => (r.present && a[0](r.value) ? r : JOptional.empty()), doc: 'Keeps the value only if it matches; otherwise the Optional becomes empty.', example: 'opt.filter(m -> m.year() > 2000)' }),
];

const primOptional = (owner: 'OptionalInt' | 'OptionalDouble'): Member[] => {
  const int = owner === 'OptionalInt';
  const el = int ? INT : DOUBLE;
  const getter = int ? 'getAsInt' : 'getAsDouble';
  return [
    mk(owner, getter, [], { ret: el, eval: (r: JOptional) => { if (!r.present) throw NSE(); return r.value; }, doc: 'The value; throws NoSuchElementException if empty.', example: `stream.${int ? 'max' : 'average'}().${getter}()` }),
    mk(owner, 'orElse', ['other'], { args: () => [el], ret: el, eval: (r: JOptional, a) => (r.present ? r.value : a[0]), doc: 'The value, or the given default if empty.', example: `stream.${int ? 'max' : 'average'}().orElse(0)` }),
    mk(owner, 'orElseThrow', [], { ret: el, eval: (r: JOptional) => { if (!r.present) throw NSE(); return r.value; }, doc: 'The value; throws NoSuchElementException if empty.', example: 'opt.orElseThrow()' }),
    mk(owner, 'isPresent', [], { ret: BOOLEAN, eval: (r: JOptional) => r.present, doc: 'True if a value is present.', example: 'opt.isPresent()' }),
    mk(owner, 'isEmpty', [], { ret: BOOLEAN, eval: (r: JOptional) => !r.present, doc: 'True if there is no value.', example: 'opt.isEmpty()' }),
  ];
};
const OPT_INT_M = primOptional('OptionalInt');
const OPT_DOUBLE_M = primOptional('OptionalDouble');

const K = (r: JType) => typeArg(r, 0);
const V = (r: JType) => typeArg(r, 1);
const MAP_M: Member[] = [
  mk('Map', 'entrySet', [], { ret: (r) => cls('Set', cls('Map.Entry', K(r), V(r))), eval: (r: JMap) => { const s = new JSet('linked'); r.entries().forEach(([k, v]) => s.add(new JEntry(k, v))); return s; }, doc: 'All key-value pairs of the map as a Set of entries.', example: 'map.entrySet().stream()' }),
  mk('Map', 'keySet', [], { ret: (r) => cls('Set', K(r)), eval: (r: JMap) => { const s = new JSet('linked'); r.entries().forEach(([k]) => s.add(k)); return s; }, doc: 'All keys of the map.', example: 'map.keySet()' }),
  mk('Map', 'values', [], { ret: (r) => cls('List', V(r)), eval: (r: JMap) => r.entries().map(([, v]) => v), doc: 'All values of the map.', example: 'map.values()' }),
  mk('Map', 'get', ['key'], { args: (r) => [box(K(r))], ret: (r) => V(r), eval: (r: JMap, a) => r.get(a[0]) ?? null, doc: 'The value for the key, or null if the key is missing.', example: 'map.get("Drama")' }),
  mk('Map', 'getOrDefault', ['key', 'defaultValue'], { args: (r) => [box(K(r)), box(V(r))], ret: (r) => V(r), eval: (r: JMap, a) => (r.has(a[0]) ? r.get(a[0]) : a[1]), doc: 'The value for the key, or the default if the key is missing.', example: 'map.getOrDefault("Drama", 0L)' }),
  mk('Map', 'containsKey', ['key'], { args: (r) => [box(K(r))], ret: BOOLEAN, eval: (r: JMap, a) => r.has(a[0]), doc: 'True if the map has this key.', example: 'map.containsKey("Drama")' }),
  mk('Map', 'size', [], { ret: INT, eval: (r: JMap) => r.size, doc: 'Number of key-value pairs.', example: '{a=1, b=2}.size() -> 2' }),
  mk('Map', 'isEmpty', [], { ret: BOOLEAN, eval: (r: JMap) => r.size === 0, doc: 'True if the map has no entries.', example: '{}.isEmpty() -> true' }),
];

const SET_M: Member[] = [
  mk('Set', 'stream', [], { ret: (r) => lstream(T(r)), eval: (r: JSet) => new JStream(r.items()), doc: 'Starts a stream over the elements of the set.', example: 'map.keySet().stream()' }),
  mk('Set', 'size', [], { ret: INT, eval: (r: JSet) => r.size, doc: 'Number of elements.', example: '{a, b}.size() -> 2' }),
  mk('Set', 'isEmpty', [], { ret: BOOLEAN, eval: (r: JSet) => r.size === 0, doc: 'True if the set has no elements.', example: 'set.isEmpty()' }),
  mk('Set', 'contains', ['element'], { args: (r) => [box(T(r))], ret: BOOLEAN, eval: (r: JSet, a) => r.has(a[0]), doc: 'True if the set contains the element.', example: 'set.contains("Dune")' }),
];

const ENTRY_M: Member[] = [
  mk('Map.Entry', 'getKey', [], { ret: (r) => K(r), eval: (r: JEntry) => r.key, doc: 'The key of this entry.', example: 'e.getKey()' }),
  mk('Map.Entry', 'getValue', [], { ret: (r) => V(r), eval: (r: JEntry) => r.value, doc: 'The value of this entry.', example: 'e.getValue()' }),
];

const comparator = (f: (a: any, b: any) => number) => f;
const COMPARATOR_M: Member[] = [
  mk('Comparator', 'reversed', [], { ret: (r) => cmpOf(r), eval: (r) => comparator((a, b) => r(b, a)), doc: 'The same order, backwards.', example: 'Comparator.comparing(Movie::year).reversed()' }),
  mk('Comparator', 'thenComparing', ['keyExtractor'], {
    args: (r) => [cls('Function', T(r), ANY)], ret: (r) => cmpOf(r),
    eval: (r, a) => comparator((x, y) => r(x, y) || naturalCompare(a[0](x), a[0](y))),
    doc: 'Breaks ties of this Comparator by comparing another value.', example: 'Comparator.comparing(Movie::year).thenComparing(Movie::title)',
  }),
];

const BOXED = ['Integer', 'Long', 'Double', 'Boolean'];

const lc = (s: string) => s[0].toLowerCase() + s.slice(1);

export function membersOf(t: JType, u: Universe): Member[] {
  if (t.k !== 'cls') return [];
  switch (t.n) {
    case 'String': return STRING_M;
    case 'List': return LIST_M;
    case 'Stream': return STREAM_M;
    case 'Optional': return OPTIONAL_M;
    case 'IntStream': return INT_STREAM_M;
    case 'DoubleStream': return DOUBLE_STREAM_M;
    case 'OptionalInt': return OPT_INT_M;
    case 'OptionalDouble': return OPT_DOUBLE_M;
    case 'Map': return MAP_M;
    case 'Set': return SET_M;
    case 'Map.Entry': return ENTRY_M;
    case 'Comparator': return COMPARATOR_M;
  }
  if (BOXED.includes(t.n)) return [equalsOf(t.n)];
  const rec = u.records[t.n];
  if (rec) {
    const acc = rec.fields.map((f) =>
      mk(rec.name, f.name, [], {
        ret: f.type, eval: (r) => r[f.name],
        doc: `The ${f.name} of this ${rec.name}.`, example: `${lc(rec.name)}.${f.name}()`,
      }),
    );
    return [...acc, ...(rec.extras ?? []), equalsOf(rec.name)];
  }
  if (u.enums[t.n]) {
    return [
      mk(t.n, 'name', [], { ret: STRING, eval: (r) => r.name, doc: 'The constant\'s name as a String.', example: 'Genre.DRAMA.name() -> "DRAMA"' }),
      equalsOf(t.n),
    ];
  }
  return [];
}

export function findMember(recv: JType, name: string, arity: number, u: Universe): Member | undefined {
  return membersOf(recv, u).find((m) => m.name === name && m.arity === arity);
}

/** Type with Java-style names for the unknown parts: `Map<K, D>`. */
export function showNamed(t: JType, vars: string[] = ['R']): string {
  let i = 0;
  const go = (x: JType): string => {
    if (x.k === 'any') return vars[i++] ?? vars[vars.length - 1] ?? 'R';
    if (x.k === 'prim') return x.n;
    if (x.n === 'Collector' && x.a[1]?.k === 'any') return `Collector<${go(x.a[0])}, ?, ${go(x.a[2] ?? ANY)}>`;
    return x.a.length ? `${x.n}<${x.a.map(go).join(', ')}>` : x.n;
  };
  return go(t);
}

/** What a completion row shows as the result of the member (Collectors show what they produce). */
export function retDisplay(m: Member, recv: JType, u: Universe): string {
  let r = m.ret(recv, m.args(recv, u), u);
  if (m.owner === 'Collectors') r = typeArg(r, 2);
  return showNamed(r, m.vars ?? ['R']);
}

/** Display signature, e.g. `filter(Predicate<Movie> predicate)  → Stream<Movie>`. */
export function signature(m: Member, recv: JType, u: Universe): string {
  const at = m.args(recv, u);
  const ps = m.params.map((p, i) => `${showNamed(at[i] ?? ANY, ['R', 'R', 'D'])} ${p}`).join(', ');
  const owner = m.kind === 'static' ? `${m.owner}.` : '';
  return `${owner}${m.name}(${ps})  → ${retDisplay(m, recv, u)}`;
}

