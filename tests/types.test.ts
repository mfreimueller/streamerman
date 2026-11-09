import { describe, expect, it } from 'vitest';
import { ANY, BOOLEAN, DOUBLE, INT, LONG, STRING, assignable, cls, fnShape, promote, show, withFnReturn } from '../src/lang/types';

describe('types', () => {
  it('assigns primitives with widening and boxing', () => {
    expect(assignable(INT, LONG)).toBe(true);
    expect(assignable(INT, DOUBLE)).toBe(true);
    expect(assignable(LONG, INT)).toBe(false);
    expect(assignable(INT, cls('Integer'))).toBe(true);
    expect(assignable(cls('Integer'), INT)).toBe(true);
    expect(assignable(INT, cls('Long'))).toBe(false);
    expect(assignable(BOOLEAN, INT)).toBe(false);
  });
  it('compares generics', () => {
    expect(assignable(cls('List', STRING), cls('List', STRING))).toBe(true);
    expect(assignable(cls('List', cls('Movie')), cls('List', STRING))).toBe(false);
    expect(assignable(cls('List', ANY), cls('List', STRING))).toBe(true);
  });
  it('promotes', () => {
    expect(promote(INT, LONG)).toEqual(LONG);
    expect(promote(cls('Integer'), DOUBLE)).toEqual(DOUBLE);
    expect(promote(INT, INT)).toEqual(INT);
  });
  it('knows functional shapes', () => {
    const p = fnShape(cls('Predicate', cls('Movie')))!;
    expect(show(p.params[0])).toBe('Movie');
    expect(p.ret).toEqual(BOOLEAN);
    expect(show(withFnReturn(cls('Function', cls('Movie'), ANY), STRING))).toBe('Function<Movie, String>');
    expect(show(withFnReturn(cls('Function', cls('Movie'), ANY), INT))).toBe('Function<Movie, Integer>');
  });
});
