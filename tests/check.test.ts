import { describe, expect, it } from 'vitest';
import { ANY, BOOLEAN, LONG, STRING, cls, show } from '../src/lang/types';
import { call, hole, name } from '../src/lang/ast';
import { typecheck } from '../src/lang/check';
import { U, baseEnv, compile } from './helpers';

const errs = (src: string, t = ANY) => compile(src, t).res.errors.map((e) => e.message);

describe('type checker', () => {
  it('types a stream pipeline', () => {
    const { res } = compile('movies.stream().filter(m -> m.year() > year).map(Movie::title).toList()');
    expect(res.errors).toEqual([]);
    expect(show(res.type)).toBe('List<String>');
  });
  it('infers map result types and boxes primitives', () => {
    expect(show(compile('movies.stream().map(m -> m.year())').res.type)).toBe('Stream<Integer>');
    expect(show(compile('movies.stream().map(m -> m.rating() * 2)').res.type)).toBe('Stream<Double>');
  });
  it('reports a type mismatch against the statement type', () => {
    expect(errs('movies.stream().map(Movie::title).toList()', cls('List', cls('Movie')))).toEqual([
      'Expected List<Movie> but got List<String>',
    ]);
    expect(errs('movies.stream().filter(m -> true)', cls('List', STRING))).toEqual([
      'Expected List<String> but got Stream<Movie>',
    ]);
  });
  it('reports unknown members', () => {
    expect(errs('movies.stream().filter(m -> m.foo())')).toContain('Cannot find method foo() on Movie');
    expect(errs('year.size()')).toContain('int cannot be dereferenced');
    expect(errs('nope')).toEqual(['Cannot find symbol nope']);
  });
  it('requires a boolean predicate body', () => {
    expect(errs('movies.stream().filter(m -> m.year())')).toEqual(['Expected boolean but got int']);
    expect(errs('movies.stream().filter(Movie::title)')).toEqual(['Expected boolean but got String']);
    expect(compile('movies.stream().filter(Movie::title)').res.errors.length).toBe(1);
  });
  it('checks operators', () => {
    expect(errs('year > "a"').length).toBe(1);
    expect(errs('year && true').length).toBe(1);
    expect(errs('year > 3', BOOLEAN)).toEqual([]);
    expect(show(compile('"a" + 1').res.type)).toBe('String');
    expect(show(compile('year * 2L').res.type)).toBe('long');
    expect(errs('g == g')).toEqual([]);
    expect(errs('movies == movies').length).toBe(1);
  });
  it('allows widening int to long', () => {
    expect(errs('movies.stream().count()', LONG)).toEqual([]);
    expect(errs('movies.size()', LONG)).toEqual([]);
    expect(errs('movies.stream().count()', cls('Integer')).length).toBe(1);
  });
  it('records holes as incomplete with their expected type', () => {
    const root = call(call(name('movies'), 'stream', []), 'filter', [hole()]);
    const res = typecheck({ type: ANY, root }, baseEnv(), U);
    expect(res.incomplete).toBe(true);
    expect(res.errors).toEqual([]);
    expect(show(res.info.get(res.holes[0])!.expected)).toBe('Predicate<Movie>');
  });
  it('checks element type for contains', () => {
    expect(errs('movies.stream().filter(m -> m.genres().contains(m.title()))').length).toBe(1);
    expect(errs('movies.stream().filter(m -> m.genres().contains(Genre.DRAMA))')).toEqual([]);
  });
});
