// Catalogue of members (methods) per receiver type: typing, evaluation and documentation in one place.
import {
  ANY, BOOLEAN, INT, LONG, STRING, box, cls, show, typeArg,
  type JType,
} from './types';
import type { Universe } from './universe';
import { JavaException, JOptional, jEquals } from '../engine/values';
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
  args(recv: JType, u: Universe): JType[];
  ret(recv: JType, argTypes: JType[], u: Universe): JType;
  eval(recv: any, args: any[], cx: EvalCx, types: EvalTypes): any;
  doc: string;
  example: string;
  tag?: 'intermediate' | 'terminal';
  /** Is it sensible to offer this member for the receiver? (Typing ignores this.) */
  when?(recv: JType, u: Universe): boolean;
}

export const memberId = (m: Member) => `${m.owner}.${m.name}/${m.arity}`;

interface Spec {
  args?: (recv: JType, u: Universe) => JType[];
  ret: JType | ((recv: JType, a: JType[], u: Universe) => JType);
  eval: (recv: any, args: any[], cx: EvalCx, types: EvalTypes) => any;
  doc: string;
  example: string;
  tag?: 'intermediate' | 'terminal';
  when?: (recv: JType, u: Universe) => boolean;
}

function mk(owner: string, name: string, params: string[], s: Spec): Member {
  return {
    owner, name, arity: params.length, kind: 'instance', params,
    args: s.args ?? (() => params.map(() => ANY)),
    ret: typeof s.ret === 'function' ? s.ret : () => s.ret as JType,
    eval: s.eval, doc: s.doc, example: s.example, tag: s.tag, when: s.when,
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

const STREAM_M: Member[] = [
  mk('Stream', 'filter', ['predicate'], { args: (r) => pred(r), ret: (r) => cls('Stream', T(r)), eval: (r, a) => r.filter(a[0]), tag: 'intermediate', doc: 'Keeps only the elements for which the condition is true.', example: 'nums.stream().filter(n -> n > 2)' }),
  mk('Stream', 'map', ['mapper'], {
    args: (r) => [cls('Function', T(r), ANY)],
    ret: (_r, a) => cls('Stream', box(typeArg(a[0] ?? ANY, 1))),
    eval: (r, a) => r.map(a[0]), tag: 'intermediate',
    doc: 'Transforms every element into something else.', example: 'movies.stream().map(Movie::title)',
  }),
  mk('Stream', 'distinct', [], { ret: (r) => cls('Stream', T(r)), eval: (r) => r.distinct(), tag: 'intermediate', doc: 'Removes duplicates; keeps the first occurrence.', example: '[1, 2, 1].stream().distinct() -> 1, 2' }),
  mk('Stream', 'sorted', [], {
    ret: (r) => cls('Stream', T(r)), eval: (r) => r.sorted(), tag: 'intermediate',
    when: (r, u) => isComparable(T(r)) || (T(r).k === 'cls' && !!u.enums[(T(r) as any).n]),
    doc: 'Sorts by natural order (numbers ascending, strings alphabetically).', example: '[3, 1, 2].stream().sorted() -> 1, 2, 3',
  }),
  mk('Stream', 'limit', ['maxSize'], { args: () => [LONG], ret: (r) => cls('Stream', T(r)), eval: (r, a) => r.limit(a[0]), tag: 'intermediate', doc: 'Stops after the first n elements.', example: '[1, 2, 3].stream().limit(2) -> 1, 2' }),
  mk('Stream', 'skip', ['n'], { args: () => [LONG], ret: (r) => cls('Stream', T(r)), eval: (r, a) => r.skip(a[0]), tag: 'intermediate', doc: 'Drops the first n elements.', example: '[1, 2, 3].stream().skip(1) -> 2, 3' }),
  mk('Stream', 'count', [], { ret: LONG, eval: (r) => r.count(), tag: 'terminal', doc: 'Counts the elements. Ends the stream.', example: '[a, b].stream().count() -> 2' }),
  mk('Stream', 'toList', [], { ret: (r) => cls('List', T(r)), eval: (r) => r.toList(), tag: 'terminal', doc: 'Collects the elements into an unmodifiable list. Ends the stream.', example: 'nums.stream().toList()' }),
  mk('Stream', 'anyMatch', ['predicate'], { args: (r) => pred(r), ret: BOOLEAN, eval: (r, a) => r.anyMatch(a[0]), tag: 'terminal', doc: 'True if at least one element matches; stops at the first match.', example: 'nums.stream().anyMatch(n -> n > 5)' }),
  mk('Stream', 'allMatch', ['predicate'], { args: (r) => pred(r), ret: BOOLEAN, eval: (r, a) => r.allMatch(a[0]), tag: 'terminal', doc: 'True if every element matches (true for an empty stream).', example: 'nums.stream().allMatch(n -> n > 0)' }),
  mk('Stream', 'noneMatch', ['predicate'], { args: (r) => pred(r), ret: BOOLEAN, eval: (r, a) => r.noneMatch(a[0]), tag: 'terminal', doc: 'True if no element matches (true for an empty stream).', example: 'nums.stream().noneMatch(n -> n < 0)' }),
  mk('Stream', 'findFirst', [], { ret: (r) => cls('Optional', T(r)), eval: (r) => r.findFirst(), tag: 'terminal', doc: 'The first element, wrapped in an Optional (empty if there is none).', example: 'nums.stream().findFirst() -> Optional[1]' }),
];

const OPTIONAL_M: Member[] = [
  mk('Optional', 'isPresent', [], { ret: BOOLEAN, eval: (r: JOptional) => r.present, doc: 'True if a value is present.', example: 'Optional.empty.isPresent() -> false' }),
  mk('Optional', 'orElse', ['other'], { args: (r) => [box(T(r))], ret: (r) => T(r), eval: (r: JOptional, a) => (r.present ? r.value : a[0]), doc: 'The value, or the given default if the Optional is empty.', example: 'opt.orElse(0)' }),
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

/** Display signature, e.g. `filter(Predicate<Movie> predicate)  → Stream<Movie>`. */
export function signature(m: Member, recv: JType, u: Universe): string {
  const at = m.args(recv, u);
  const ps = m.params.map((p, i) => `${show(at[i] ?? ANY)} ${p}`).join(', ');
  const ret = show(m.ret(recv, at, u));
  return `${m.name}(${ps})  → ${ret}`.replace(/\?/g, 'R');
}

