import { describe, expect, it } from 'vitest';
import { complete } from '../src/builder/complete';
import { currentStmt, initState, selectStmt, setCursor, undo } from '../src/builder/edit';
import { units } from '../src/content';
import { solutionProgram } from '../src/content/solution';
import { checkProgram } from '../src/lang/check';
import { parseExpr } from '../src/lang/parse';
import { toJava } from '../src/lang/print';
import { STRING, cls, show } from '../src/lang/types';
import { runTask, taskEnv } from '../src/run';
import { B } from './builder-helper';
import { universe } from '../src/content/space';
import { INT } from '../src/lang/types';

const movies = units.find((u) => u.id === 'movies')!;
const space = units.find((u) => u.id === 'space')!;

describe('multi-step programs', () => {
  const task = movies.tasks.find((t) => t.id === 'titlesOfMostFrequentDirector')!;

  it('later steps see earlier step variables with their declared type', () => {
    const program = solutionProgram(movies, task);
    const results = checkProgram(program, taskEnv(movies, task), movies.universe);
    expect(results.flatMap((r) => r.errors)).toEqual([]);
    expect(show(results[1].info.get(program.stmts[1].root.id)!.env.get('topDirector')!)).toBe('String');
    // the first step cannot see the variable of the second
    expect(results[0].info.get(program.stmts[0].root.id)!.env.has('topDirector')).toBe(false);
  });

  it('prints steps as local variable declarations', () => {
    const program = solutionProgram(movies, task);
    expect(toJava(program.stmts[0]).startsWith('String topDirector = movies.stream()')).toBe(true);
    expect(toJava(program.stmts[1]).startsWith('return movies.stream()')).toBe(true);
  });

  it('edits steps separately; undo restores the active step', () => {
    let s = initState([{ name: 'a', type: STRING }, { type: STRING }]);
    expect(s.stmtIndex).toBe(0);
    s = selectStmt(s, 1);
    expect(s.stmtIndex).toBe(1);
    expect(currentStmt(s).name).toBeUndefined();
    s = setCursor(s, currentStmt(s).root.id);
    const b = new B(STRING);
    b.s = s;
    b.env = new Map([['a', STRING]]);
    b.pick('a');
    expect(b.code()).toBe('a');
    b.s = undo(b.s);
    expect(b.s.stmtIndex).toBe(1);
  });

  it('completions list step variables and offer to continue with the next step', () => {
    const b = new B(STRING, { u: movies.universe });
    b.s = initState([{ name: 'topDirector', type: STRING }, { type: cls('List', STRING) }]);
    b.env = new Map([['movies', cls('List', cls('Movie'))]]);
    b.u = movies.universe;
    b.pick('movies').pick('size()');
    expect(b.s.stmtIndex).toBe(0);
    const c = complete(b.s, b.res(), { u: movies.universe });
    expect(c.groups.flatMap((g) => g.items).some((i) => i.label === '→ step 2')).toBe(true);
    b.pick('→ step 2');
    expect(b.s.stmtIndex).toBe(1);
  });

  it('runs steps in order and shows step values of a failing check', () => {
    const wrong = {
      stmts: [
        { name: 'topDirector', type: STRING, root: parseExpr('"Nobody"', movies.universe.kindOf) },
        solutionProgram(movies, task).stmts[1],
      ],
    };
    const r = runTask(movies, task, wrong);
    expect(r.allPassed).toBe(false);
    expect(r.checks[0].steps).toEqual([{ name: 'topDirector', type: 'String', text: '"Nobody"' }]);
    expect(r.checks[0].actualText).toBe('[]');
  });

  it('reports problems per step', () => {
    const program = solutionProgram(movies, task);
    program.stmts[1] = { ...program.stmts[1], root: parseExpr('topDirector', movies.universe.kindOf) };
    const r = runTask(movies, task, program);
    expect(r.problems[0]).toBe('Step 2: Expected List<String> but got String');
  });
});

describe('Space Mission', () => {
  const task = space.tasks[0];
  it('has three steps and the result type is given', () => {
    expect(task.steps?.map((s) => s.name)).toEqual(['launched', 'colleagues', undefined]);
    expect(universe.records.Connection.fields.map((f) => f.name)).toEqual(['name', 'colleagues']);
  });
  it('offers new Connection(...) where it is allowed', () => {
    const b = new B(cls('List', cls('Connection')), { u: universe, constructors: ['Connection'] }, new Map([['n', INT]]), universe);
    b.pick('n');
    // a fresh hole expecting Connection offers the constructor
    const c = new B(cls('Connection'), { u: universe, constructors: ['Connection'] }, new Map(), universe);
    expect(c.labels()).toContain('new Connection(name, colleagues)');
    const d = new B(cls('Connection'), { u: universe }, new Map(), universe);
    expect(d.labels()).not.toContain('new Connection(name, colleagues)');
  });
});

describe('step view (trace)', () => {
  const task = movies.tasks.find((t) => t.id === 'titlesReleasedAfter')!;
  it('shows how much of the source was read when limit stops the stream', () => {
    const root = parseExpr('movies.stream().filter(m -> m.year() > year).limit(2).map(Movie::title).toList()', movies.universe.kindOf);
    const r = runTask(movies, task, { stmts: [{ type: task.returnType, root }] });
    expect(r.allPassed).toBe(false);
    expect(r.trace?.check).toBe('after 2000');
    expect(r.trace?.passed).toBe(false);
    const ops = r.trace!.stmts[0].ops;
    expect(ops.map((o) => o.label)).toEqual(['movies.stream()', '.filter(m -> …)', '.limit(2)', '.map(Movie::title)', '.toList()']);
    expect(ops[0]).toMatchObject({ total: 14, count: 10 }); // 10 of 14 elements were read
    expect(ops[1]).toMatchObject({ inCount: 10, count: 2 });
    expect(ops[2]).toMatchObject({ inCount: 2, count: 2 });
    expect(ops[3].values).toEqual(['"Mulholland Drive"', '"Inland Empire"']);
    expect(ops[4].kind).toBe('value');
    expect(ops[4].text).toBe('[Mulholland Drive, Inland Empire]');
  });
  it('is available for passing runs too and only traces the top-level chain', () => {
    const root = parseExpr('movies.stream().filter(m -> m.genres().stream().anyMatch(g -> g == Genre.DRAMA)).map(Movie::title).toList()', movies.universe.kindOf);
    const t2 = movies.tasks.find((t) => t.id === 'titlesByDirector')!;
    const r = runTask(movies, t2, { stmts: [{ type: t2.returnType, root }] });
    expect(r.trace!.stmts[0].ops.length).toBe(4);
    const r2 = runTask(movies, task, { stmts: [{ type: task.returnType, root: parseExpr(task.solution as string, movies.universe.kindOf) }] });
    expect(r2.allPassed).toBe(true);
    expect(r2.trace?.passed).toBe(true);
  });
});
