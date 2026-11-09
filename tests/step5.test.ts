import { describe, expect, it } from 'vitest';
import { PLAYS, universe } from '../src/content/music';
import { typecheck } from '../src/lang/check';
import { evaluate } from '../src/lang/eval';
import { parseExpr } from '../src/lang/parse';
import { toJava } from '../src/lang/print';
import { ANY, INT, STRING, cls, show } from '../src/lang/types';
import { JMap, JSet, JavaException, toJavaString } from '../src/engine/values';
import { B } from './builder-helper';

const env = () => new Map([['plays', cls('List', cls('Play'))], ['year', INT]]);
const ctx = (forbidden?: string[]) => ({ u: universe, forbidden });
const mk = (type = cls('Map', STRING, cls('Integer')), forbidden?: string[]) => new B(type, ctx(forbidden), env(), universe);

function run(src: string) {
  const root = parseExpr(src, universe.kindOf);
  const res = typecheck({ type: ANY, root }, env(), universe);
  if (res.errors.length) throw new Error(res.errors.map((e) => e.message).join('; '));
  return { v: evaluate(root, new Map([['plays', PLAYS]]), res.info, universe), t: res.type };
}

describe('typing of the new constructs', () => {
  it('infers collector result types', () => {
    expect(show(run('plays.stream().collect(Collectors.groupingBy(Play::genre, Collectors.counting()))').t)).toBe('Map<Genre, Long>');
    expect(show(run('plays.stream().collect(Collectors.groupingBy(Play::artist))').t)).toBe('Map<String, List<Play>>');
    expect(show(run('plays.stream().collect(Collectors.partitioningBy(Play::isSkipped))').t)).toBe('Map<Boolean, List<Play>>');
    expect(show(run('plays.stream().collect(Collectors.toMap(Play::artist, Play::secondsPlayed, Integer::sum))').t)).toBe('Map<String, Integer>');
    expect(show(run('plays.stream().collect(Collectors.groupingBy(Play::artist, Collectors.mapping(Play::title, Collectors.toSet())))').t)).toBe('Map<String, Set<String>>');
    expect(show(run('plays.stream().mapToInt(Play::secondsPlayed).average()').t)).toBe('OptionalDouble');
  });
  it('rejects wrong collector element types', () => {
    const root = parseExpr('plays.stream().collect(Collectors.joining(", "))', universe.kindOf);
    expect(typecheck({ type: ANY, root }, env(), universe).errors.length).toBe(1);
  });
  it('types Comparator chains from the expected type', () => {
    const t = run('plays.stream().sorted(Comparator.comparing(Play::artist).reversed().thenComparing(Play::title))').t;
    expect(show(t)).toBe('Stream<Play>');
    expect(() => run('plays.stream().sorted(Comparator.comparing(Movie::title))')).toThrow();
  });
  it('prints static code with Map.Entry owner', () => {
    const src = 'plays.stream().collect(Collectors.toMap(Play::artist, Play::secondsPlayed, Integer::sum)).entrySet().stream().sorted(Map.Entry.comparingByValue()).map(Map.Entry::getKey).toList()';
    expect(show(run(src).t)).toBe('List<String>');
    expect(toJava(parseExpr(src, universe.kindOf))).toContain('Map.Entry.comparingByValue()');
  });
});

describe('engine details', () => {
  it('toMap without merge reports the duplicate like Java', () => {
    expect(() => run('plays.stream().collect(Collectors.toMap(Play::artist, Play::secondsPlayed))')).toThrow(
      /Duplicate key The Null Pointers \(attempted merging values 245 and 12\)/,
    );
    try {
      run('plays.stream().collect(Collectors.toMap(Play::artist, Play::secondsPlayed))');
    } catch (e) {
      expect((e as JavaException).javaName).toBe('IllegalStateException');
    }
  });
  it('maps and sets compare without regard to order', () => {
    const a = run('plays.stream().collect(Collectors.toSet())').v as JSet;
    expect(a.size).toBe(10);
    const m = run('plays.stream().collect(Collectors.groupingBy(Play::genre, Collectors.counting()))').v as JMap;
    expect(toJavaString(m, cls('Map', cls('Genre'), cls('Long')), universe)).toBe('{POP=3, ROCK=3, HIP_HOP=3, JAZZ=1, ELECTRONIC=2}');
  });
  it('first of equal elements wins in max/maxBy/min', () => {
    const v = run('plays.stream().filter(p -> p.secondsPlayed() == 187).max(Comparator.comparingInt(Play::secondsPlayed))').v as { value: { title: string } };
    expect(v.value.title).toBe('Mark and Sweep');
  });
  it('flatMap, reduce, optional ops', () => {
    expect(run('plays.stream().map(Play::secondsPlayed).reduce(0, Integer::sum)').v).toBe(2270);
    expect(run('plays.stream().map(Play::title).findFirst().map(String::length).orElse(0)').v).toBe(17);
    expect(() => run('plays.stream().skip(100).findFirst().get()')).toThrow(/No value present/);
  });
  it('is lazy through flatMap and sorted keeps stability', () => {
    expect(run('plays.stream().sorted(Comparator.comparing(Play::genre)).map(Play::title).limit(2).toList()').v).toEqual(['Optional.empty()', 'Optional.empty()']);
  });
});

describe('completions for collectors, comparators and references', () => {
  it('offers Collectors.* where a Collector is expected, hides forbidden ones (wildcard)', () => {
    const b = mk();
    b.pick('plays').pick('stream()').pick('collect(collector)');
    const labels = b.labels();
    expect(labels).toContain('Collectors.toMap(keyMapper, valueMapper, mergeFunction)');
    expect(labels).toContain('Collectors.groupingBy(classifier, downstream)');
    expect(labels).toContain('Collectors.groupingBy(classifier)');
    const f = mk(undefined, ['Collectors.groupingBy/*']);
    f.pick('plays').pick('stream()').pick('collect(collector)');
    expect(f.labels().filter((l) => l.includes('groupingBy'))).toEqual([]);
    expect(f.labels()).toContain('Collectors.toMap(keyMapper, valueMapper)');
  });
  it('builds secondsPerArtist with taps only', () => {
    const b = mk();
    b.pick('plays').pick('stream()').pick('collect(collector)').pick('Collectors.toMap(keyMapper, valueMapper, mergeFunction)');
    expect(b.labels()).toContain('Play::artist');
    b.pick('Play::artist').pick('Play::secondsPlayed');
    expect(b.labels()).toContain('Integer::sum');
    expect(b.labels()).toContain('Math::max');
    b.pick('Integer::sum');
    expect(b.code()).toBe('plays.stream().collect(Collectors.toMap(Play::artist, Play::secondsPlayed, Integer::sum))');
    expect(b.res().errors).toEqual([]);
    expect(b.res().incomplete).toBe(false);
  });
  it('offers TreeMap::new for the map factory, not a lambda', () => {
    const b = mk(cls('Map', STRING, cls('Long')));
    b.pick('plays').pick('stream()').pick('collect(collector)').pick('Collectors.groupingBy(classifier, mapFactory, downstream)');
    b.pick('Play::artist');
    expect(b.labels()).toContain('TreeMap::new');
    expect(b.labels()).toContain('LinkedHashMap::new');
    expect(b.labels().some((l) => l.includes('->'))).toBe(false);
    b.pick('TreeMap::new').pick('Collectors.counting()');
    expect(b.code()).toBe('plays.stream().collect(Collectors.groupingBy(Play::artist, TreeMap::new, Collectors.counting()))');
    expect(b.res().errors).toEqual([]);
  });
  it('offers only method references inside Comparator.comparing(...)', () => {
    const b = mk(cls('List', STRING));
    b.pick('plays').pick('stream()').pick('sorted(comparator)').pick('Comparator.comparing(keyExtractor)');
    expect(b.labels().some((l) => /^[a-z]\d* ->/.test(l))).toBe(false); // no implicitly typed lambda
    expect(b.labels()).toContain('(Play p) -> …');
    expect(b.labels()).toContain('Play::artist');
    b.pick('Play::title').pick('reversed()', 'on Comparator.comparing');
    expect(b.code()).toBe('plays.stream().sorted(Comparator.comparing(Play::title).reversed())');
    b.pick('thenComparing(keyExtractor)');
    expect(b.labels().some((l) => /^[a-z]\d* ->/.test(l))).toBe(false);
    b.pick('Play::artist');
    expect(b.code()).toBe('plays.stream().sorted(Comparator.comparing(Play::title).reversed().thenComparing(Play::artist))');
    const r = b.res();
    expect(r.errors.filter((e) => !r.info.get(e.id)?.mismatch)).toEqual([]);
  });
  it('jumps to the next gap of a call after a method reference', () => {
    const b = mk();
    b.pick('plays').pick('stream()').pick('collect(collector)').pick('Collectors.toMap(keyMapper, valueMapper)');
    b.pick('Play::artist');
    expect(b.comp().title).toBe('Expected: Function<Play, ?>');
  });
  it('hides forbidden stream members', () => {
    const b = mk(cls('Optional', cls('Play')), ['Stream.max/1', 'IntStream.max/0']);
    b.pick('plays').pick('stream()');
    expect(b.labels('on plays.stream()')).not.toContain('max(comparator)');
    expect(b.labels('on plays.stream()')).toContain('min(comparator)');
  });

  it('builds a typed lambda comparator that can be reversed', () => {
    const b = mk(cls('List', STRING));
    b.pick('plays').pick('stream()').pick('sorted(comparator)').pick('Comparator.comparingInt(keyExtractor)');
    b.pick('(Play p) -> …').pick('p').pick('secondsPlayed()');
    b.pick('reversed()', 'on Comparator.comparingInt');
    expect(b.code()).toBe('plays.stream().sorted(Comparator.comparingInt((Play p) -> p.secondsPlayed()).reversed())');
    const r = b.res();
    expect(r.errors.filter((e) => !r.info.get(e.id)?.mismatch)).toEqual([]);
  });
  it('shows result types with Java-style names in static rows', () => {
    const b = mk();
    b.pick('plays').pick('stream()').pick('collect(collector)');
    const row = (l: string) => b.comp().groups.flatMap((g) => g.items).find((i) => i.label === l)!;
    expect(row('Collectors.groupingBy(classifier, downstream)').detail).toBe('Map<K, D>');
    expect(row('Collectors.groupingBy(classifier)').detail).toBe('Map<K, List<Play>>');
    expect(row('Collectors.toMap(keyMapper, valueMapper)').detail).toBe('Map<K, U>');
    expect(row('Collectors.counting()').detail).toBe('Long');
    expect(row('Collectors.toList()').detail).toBe('List<Play>');
    expect(row('Collectors.mapping(mapper, downstream)').detail).toBe('R');
  });

  it('orders groups inside lambdas: the lambda owner first when the body fits, else the innermost', () => {
    const f = new B(cls('List', STRING));
    f.pick('movies').pick('stream()').pick('filter(predicate)').pick('m -> …').pick('m').pick('year()').pick('>').pick('year');
    expect(f.comp().groups[0].title.startsWith('on movies.stream().filter(…)')).toBe(true);
    const m = new B(cls('List', STRING));
    m.pick('movies').pick('stream()').pick('map(mapper)').pick('m -> …').pick('m').pick('title()');
    expect(m.comp().groups[0].title.startsWith('on m.title() · String')).toBe(true);
    expect(m.comp().groups[1].title.startsWith('on movies.stream().map(…)')).toBe(true);
    // body not complete yet: innermost first
    const g = new B(cls('List', STRING));
    g.pick('movies').pick('stream()').pick('filter(predicate)').pick('m -> …').pick('m');
    expect(g.comp().groups[0].title.startsWith('on m · Movie')).toBe(true);
  });

  it('advances to the next gap after a complete argument of fixed type, not after variables or unknown types', () => {
    const b = mk(cls('List', cls('List', STRING)));
    b.pick('plays').pick('stream()').pick('map(mapper)').pick('p -> …').pick('List.of(e1, e2, e3)');
    b.pick('p');
    expect(b.comp().title).toMatch(/^Continue after p/); // a variable: the student continues with a member
    b.pick('artist()');
    expect(b.comp().title).toMatch(/^Continue after p.artist\(\)/); // expected type unknown for the first element
    b.pick('→ next gap');
    expect(b.comp().title).toBe('Expected: String'); // known now
    b.pick('p').pick('title()');
    expect(b.comp().title).toBe('Expected: String'); // advanced to the third gap
    expect(b.code()).toBe('plays.stream().map(p -> List.of(p.artist(), p.title(), …))');
  });
});
