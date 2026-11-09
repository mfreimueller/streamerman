import { describe, expect, it } from 'vitest';
import { parseExpr } from '../src/lang/parse';
import { toJava, toJavaFlat, toJavaShort } from '../src/lang/print';
import { U } from './helpers';

const rt = (src: string) => toJava(parseExpr(src, U.kindOf));

describe('parse + print round trip', () => {
  const cases = [
    'movies.stream()\n    .filter(m -> m.year() > year)\n    .map(Movie::title)\n    .toList()',
    'movies.stream()\n    .filter(m -> m.genres().contains(Genre.DRAMA) && m.rating() >= 7.5)\n    .count()',
    'nums.stream()\n    .map(n -> n * 2 + 1)\n    .limit(3)\n    .toList()',
    'movies.size()',
    '(1 + 2) * 3',
    '1 - (2 - 3)',
    '!(a || b) && c',
    'words.stream()\n    .anyMatch(s -> s.startsWith("a\\"b"))',
    '(a, b) -> a + b',
    '(Play p) -> p.secondsPlayed()',
    '(Map.Entry<String, Long> e) -> e.getValue()',
    'new Connection(a, b)',
    '() -> 5L',
    'x -> x == -1',
    'movies.stream()\n    .filter(m -> m.genres().stream()\n        .anyMatch(g -> g == Genre.DRAMA))\n    .count()',
  ];
  for (const c of cases) it(c.replace(/\n\s*/g, ' '), () => expect(rt(c)).toBe(c));

  it('prints doubles like Java literals', () => {
    expect(rt('7.0')).toBe('7.0');
    expect(toJavaFlat(parseExpr('movies.stream().count()'))).toBe('movies.stream().count()');
    expect(toJavaShort(parseExpr('movies.stream().filter(m -> m.year() > 1).count()', U.kindOf))).toBe(
      'movies.stream().filter(…).count()',
    );
  });
  it('parses static calls, enum constants and method refs by class kind', () => {
    const n = parseExpr('Comparator.comparing(Movie::title)', U.kindOf);
    expect(n.t).toBe('scall');
    expect(parseExpr('Genre.DRAMA', U.kindOf).t).toBe('enum');
  });
  it('reports syntax errors', () => {
    expect(() => parseExpr('movies.stream(')).toThrow();
    expect(() => parseExpr('a +')).toThrow();
  });
});
