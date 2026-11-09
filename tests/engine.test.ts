import { describe, expect, it } from 'vitest';
import { javaDouble, JavaException, jEquals, toJavaString, toDisplay } from '../src/engine/values';
import { JStream } from '../src/engine/stream';
import { DOUBLE, INT, STRING, cls } from '../src/lang/types';
import { MOVIES, U, run } from './helpers';

describe('double printing', () => {
  it('matches Double.toString', () => {
    expect(javaDouble(7)).toBe('7.0');
    expect(javaDouble(7.73)).toBe('7.73');
    expect(javaDouble(7.733333333333333)).toBe('7.733333333333333');
    expect(javaDouble(1e7)).toBe('1.0E7');
    expect(javaDouble(12345678.9)).toBe('1.23456789E7');
    expect(javaDouble(0.001)).toBe('0.001');
    expect(javaDouble(0.0001)).toBe('1.0E-4');
    expect(javaDouble(-3)).toBe('-3.0');
    expect(javaDouble(9999999)).toBe('9999999.0');
  });
});

describe('printing', () => {
  it('prints lists, records, optionals', () => {
    expect(toJavaString([1, 2], cls('List', cls('Integer')), U)).toBe('[1, 2]');
    expect(toJavaString([1, 2], cls('List', cls('Double')), U)).toBe('[1.0, 2.0]');
    expect(toJavaString(MOVIES[0], cls('Movie'), U)).toBe(
      'Movie[id=1, title=Eraserhead, year=1977, genres=[HORROR, FANTASY], rating=7.3]',
    );
    expect(toDisplay('x', STRING, U)).toBe('"x"');
    expect(toDisplay(['x'], cls('List', STRING), U)).toBe('[x]');
    expect(toJavaString(7, DOUBLE, U)).toBe('7.0');
    expect(toJavaString(7, INT, U)).toBe('7');
  });
  it('prints Optional', () => {
    expect(run('movies.stream().findFirst()').value).toEqual(expect.objectContaining({ present: true }));
    const r = run('movies.stream().findFirst()', {}, undefined);
    expect(toJavaString(r.value, r.type, U)).toMatch(/^Optional\[Movie\[id=1/);
    const e = run('movies.stream().skip(9).findFirst()');
    expect(toJavaString(e.value, e.type, U)).toBe('Optional.empty');
  });
});

describe('equality', () => {
  it('is structural for records and lists, identity for enums', () => {
    expect(jEquals(MOVIES[0], { ...MOVIES[0] })).toBe(true);
    expect(jEquals(MOVIES[0], MOVIES[1])).toBe(false);
    expect(jEquals([1, [2]], [1, [2]])).toBe(true);
    expect(jEquals(U.enumValue('Genre', 'DRAMA'), U.enumValue('Genre', 'DRAMA'))).toBe(true);
  });
});

describe('streams', () => {
  it('is lazy and short-circuits', () => {
    const seen: number[] = [];
    const out = new JStream([1, 2, 3, 4, 5, 6])
      .filter((x) => {
        seen.push(x);
        return x % 2 === 0;
      })
      .limit(2)
      .toList();
    expect(out).toEqual([2, 4]);
    expect(seen).toEqual([1, 2, 3, 4]); // 5 and 6 are never looked at
  });
  it('findFirst / anyMatch stop early', () => {
    const seen: number[] = [];
    new JStream([1, 2, 3]).filter((x) => (seen.push(x), true)).findFirst();
    expect(seen).toEqual([1]);
    const s2: number[] = [];
    expect(new JStream([1, 2, 3]).anyMatch((x) => (s2.push(x), x === 2))).toBe(true);
    expect(s2).toEqual([1, 2]);
  });
  it('throws when a stream is reused', () => {
    const s = new JStream([1, 2]);
    s.count();
    expect(() => s.count()).toThrow(JavaException);
    try {
      s.toList();
    } catch (e) {
      expect((e as JavaException).javaName).toBe('IllegalStateException');
      expect((e as JavaException).message).toBe('stream has already been operated upon or closed');
    }
  });
  it('distinct keeps encounter order; sorted is stable and natural', () => {
    expect(new JStream([3, 1, 3, 2, 1]).distinct().toList()).toEqual([3, 1, 2]);
    expect(new JStream([3, 1, 2]).sorted().toList()).toEqual([1, 2, 3]);
    expect(new JStream(['b', 'a', 'B']).sorted().toList()).toEqual(['B', 'a', 'b']);
    const g = ['HORROR', 'DRAMA'].map((n) => U.enumValue('Genre', n));
    expect(new JStream([g[1], g[0]]).sorted().toList()).toEqual([g[1], g[0]]);
  });
  it('count, skip, allMatch/noneMatch on empty', () => {
    expect(new JStream([1, 2, 3]).skip(1).count()).toBe(2);
    expect(new JStream([]).allMatch(() => false)).toBe(true);
    expect(new JStream([]).noneMatch(() => true)).toBe(true);
  });
});

describe('interpreter', () => {
  it('runs a pipeline', () => {
    expect(run('movies.stream().filter(m -> m.year() > 1977).map(Movie::title).toList()').value).toEqual([
      'The Elephant Man',
      'Dune',
    ]);
    expect(run('movies.stream().filter(m -> m.genres().contains(Genre.DRAMA)).count()').value).toBe(2);
  });
  it('does int arithmetic like Java', () => {
    expect(run('7 / 2').value).toBe(3);
    expect(run('-7 / 2').value).toBe(-3);
    expect(run('7 % -2').value).toBe(1);
    expect(run('7 / 2.0').value).toBe(3.5);
    expect(run('2147483647 + 1').value).toBe(-2147483648);
    expect(run('65536 * 65536').value).toBe(0);
    expect(() => run('1 / 0')).toThrow(/by zero/);
    try {
      run('1 / 0');
    } catch (e) {
      expect((e as JavaException).javaName).toBe('ArithmeticException');
    }
    expect(run('1.0 / 0').value).toBe(Infinity);
  });
  it('concatenates strings with Java formatting', () => {
    expect(run('"a" + 1.0 + 2').value).toBe('a1.02');
    expect(run('"r=" + movies.get(0).rating()').value).toBe('r=7.3');
  });
  it('emulates reference comparison for strings', () => {
    expect(run('movies.stream().filter(m -> m.title() == "Dune").count()').value).toBe(0);
    expect(run('movies.stream().filter(m -> m.title().equals("Dune")).count()').value).toBe(1);
    expect(run('"a" == "a"').value).toBe(true);
    expect(run('movies.get(0).title() == movies.get(0).title()').value).toBe(false);
  });
  it('compares enums by identity and sorts them', () => {
    expect(run('movies.stream().filter(m -> m.genres().get(0) == Genre.DRAMA).count()').value).toBe(2);
  });
  it('raises Java exceptions', () => {
    expect(() => run('movies.get(7)')).toThrow(/out of bounds/);
  });
  it('findFirst + orElse', () => {
    expect(run('movies.stream().map(Movie::year).findFirst().orElse(0)').value).toBe(1977);
    expect(run('movies.stream().skip(9).map(Movie::year).findFirst().orElse(0)').value).toBe(0);
  });
});
