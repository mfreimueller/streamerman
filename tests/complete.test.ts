import { describe, expect, it } from 'vitest';
import { complete, type CItem, type CompleteCtx, type Completion } from '../src/builder/complete';
import { currentStmt, initState, setCursor, undo, unwrapCall, type EditorState } from '../src/builder/edit';
import { typecheck } from '../src/lang/check';
import { toJavaFlat } from '../src/lang/print';
import { ANY, BOOLEAN, LONG, STRING, cls } from '../src/lang/types';
import { U, baseEnv } from './helpers';

class B {
  s: EditorState;
  constructor(type = cls('List', STRING), public ctx: CompleteCtx = { u: U }) {
    this.s = initState([{ type }]);
  }
  res() { return typecheck(currentStmt(this.s), baseEnv(), U); }
  comp(): Completion { return complete(this.s, this.res(), this.ctx); }
  items(): CItem[] { return this.comp().groups.flatMap((g) => g.items); }
  labels(group?: string) {
    const c = this.comp();
    return c.groups.filter((g) => !group || g.title.startsWith(group)).flatMap((g) => g.items.map((i) => i.label));
  }
  pick(label: string, group?: string) {
    const c = this.comp();
    const it = c.groups.filter((g) => !group || g.title.startsWith(group)).flatMap((g) => g.items).find((i) => i.label === label);
    if (!it) throw new Error(`No item '${label}'. Have: ${this.labels().join(' | ')}`);
    if (it.kind !== 'item') throw new Error('literal');
    this.s = it.apply(this.s);
    return this;
  }
  lit(value: string) {
    const it = this.items().find((i) => i.kind === 'literal');
    if (!it || it.kind !== 'literal') throw new Error('no literal item');
    this.s = it.apply(this.s, value);
    return this;
  }
  code() { return toJavaFlat(currentStmt(this.s).root); }
}

describe('completions', () => {
  it('builds titlesReleasedAfter by picking items only', () => {
    const b = new B();
    expect(b.comp().title).toBe('Expected: List<String>');
    expect(b.labels('Variables')).toContain('movies');
    b.pick('movies').pick('stream()', 'on movies').pick('filter(predicate)');
    expect(b.comp().title).toBe('Expected: Predicate<Movie>');
    expect(b.labels()).toContain('m -> …');
    expect(b.labels()).not.toContain('Movie::title'); // title() is not boolean
    b.pick('m -> …');
    expect(b.comp().title).toBe('Expected: boolean');
    expect(b.labels('Variables')[0]).not.toBe('year'); // m is the lambda parameter and ranks first
    expect(b.labels('Variables')).toContain('m');
    b.pick('m').pick('year()', 'on m').pick('>');
    expect(b.comp().expected).toEqual({ k: 'any' });
    b.pick('year');
    expect(b.code()).toBe('movies.stream().filter(m -> m.year() > year)');
    b.pick('map(mapper)', 'on movies.stream().filter(…)');
    b.pick('Movie::title');
    b.pick('toList()', 'on movies.stream().filter(…).map(…)');
    expect(b.code()).toBe('movies.stream().filter(m -> m.year() > year).map(Movie::title).toList()');
    expect(b.res().errors).toEqual([]);
    expect(b.res().incomplete).toBe(false);
  });

  it('offers a lambda for functional holes and numeric literal for limit', () => {
    const b = new B(cls('List', cls('Integer')));
    b.pick('nums').pick('stream()').pick('limit(maxSize)');
    expect(b.comp().expected).toEqual(LONG);
    b.lit('3');
    expect(b.code()).toBe('nums.stream().limit(3)');
  });

  it('offers > after m.year() with a boolean expected, but not after the right operand', () => {
    const b = new B(BOOLEAN);
    b.pick('year');
    expect(b.labels()).toContain('>');
    expect(b.labels()).toContain('+');
    // inside a predicate
    const c = new B(cls('List', STRING));
    c.pick('movies').pick('stream()').pick('filter(predicate)').pick('m -> …').pick('m').pick('year()').pick('>').pick('year');
    const own = c.comp().groups.find((g) => g.title.startsWith('on year'))!;
    const ownLabels = own.items.map((i) => i.label);
    expect(ownLabels).toEqual(expect.arrayContaining(['+', '-', '*', '/', '%']));
    expect(ownLabels).not.toContain('>');
    expect(ownLabels).not.toContain('&&');
    const cmp = c.comp().groups.find((g) => g.title.startsWith('on m.year() > year'))!;
    expect(cmp.items.map((i) => i.label)).toEqual(expect.arrayContaining(['&&', '||']));
    expect(cmp.items.map((i) => i.label)).not.toContain('+');
    // outermost group first: the stream chain
    expect(c.comp().groups[0].title).toContain('Stream<Movie>');
  });

  it('hides forbidden members', () => {
    const b = new B(LONG, { u: U, forbidden: ['Stream.count/0'] });
    b.pick('movies').pick('stream()');
    expect(b.labels('on movies.stream()')).not.toContain('count()');
    expect(b.labels('on movies.stream()')).toContain('toList()');
    const c = new B(LONG);
    c.pick('movies').pick('stream()');
    expect(c.labels('on movies.stream()')[0]).toBe('count()'); // fits the expected long
  });

  it('offers enum constants where an enum is expected', () => {
    const b = new B(cls('List', STRING));
    b.pick('movies').pick('stream()').pick('filter(predicate)').pick('m -> …').pick('m').pick('genres()').pick('contains(element)');
    expect(b.comp().expected).toEqual(cls('Genre'));
    expect(b.labels()).toEqual(expect.arrayContaining(['Genre.DRAMA', 'Genre.HORROR', 'g']));
    b.pick('Genre.DRAMA');
    expect(b.code()).toBe('movies.stream().filter(m -> m.genres().contains(Genre.DRAMA))');
  });

  it('keeps going to the next gap and supports undo / remove', () => {
    const b = new B();
    b.pick('movies').pick('stream()').pick('filter(predicate)');
    // tap the movies node
    const root = currentStmt(b.s).root;
    expect(root.t).toBe('call');
    b.s = setCursor(b.s, (root as any).target.id, true);
    expect(b.labels('Edit')).toContain('Clear');
    expect(b.labels('Edit')).toContain('Remove .stream()');
    b.s = undo(b.s);
    expect(b.code()).toBe('movies.stream()'); // undid the filter
    b.s = initState([{ type: cls('List', STRING) }]);
    b.pick('movies').pick('stream()').pick('filter(predicate)');
    expect(b.code()).toBe('movies.stream().filter(…)');
    b.s = unwrapCall(b.s, (currentStmt(b.s).root as any).id);
    expect(b.code()).toBe('movies.stream()');
    expect(b.s.cursor.mode).toBe('append');
    const g = new B();
    g.pick('movies').pick('stream()').pick('filter(predicate)').pick('m -> …');
    g.pick('m').pick('year()');
    expect(g.comp().groups[0].title).not.toBe('Navigate');
  });

  it('literal entries for String get suggestions', () => {
    const b = new B(cls('List', STRING), { u: U, stringSuggestions: ['David Lynch'] });
    b.pick('movies').pick('stream()').pick('filter(predicate)').pick('m -> …').pick('m').pick('title()').pick('equals(other)');
    const l = b.items().find((i) => i.kind === 'literal');
    expect(l && l.kind === 'literal' && l.suggestions).toEqual(['David Lynch']);
    b.lit('David Lynch');
    expect(b.code()).toBe('movies.stream().filter(m -> m.title().equals("David Lynch"))');
  });

  it('validates literals', () => {
    const b = new B(ANY);
    const lits = b.items().filter((i) => i.kind === 'literal');
    expect(lits.length).toBe(3);
    const int = lits[0];
    if (int.kind === 'literal') {
      expect(int.validate('12')).toBeNull();
      expect(int.validate('1.5')).not.toBeNull();
      expect(int.validate('')).not.toBeNull();
    }
  });
});
