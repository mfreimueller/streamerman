import { describe, expect, it } from 'vitest';
import { units } from '../src/content';
import { bindingsOf, signatureOf, solutionsOf, stepsOf } from '../src/content/types';
import { solutionProgram } from '../src/content/solution';
import { runTask, taskEnv } from '../src/run';
import { parseExpr } from '../src/lang/parse';
import { checkProgram } from '../src/lang/check';
import { toJava } from '../src/lang/print';
import { hole, call, name } from '../src/lang/ast';
import { isForbidden, memberId } from '../src/lang/members';

describe('content', () => {
  for (const unit of units) {
    describe(unit.title, () => {
      for (const task of unit.tasks) {
        it(`${task.id}: model solution parses, type-checks and passes every check`, () => {
          const program = solutionProgram(unit, task);
          const results = checkProgram(program, taskEnv(unit, task), unit.universe);
          expect(results.flatMap((r) => r.errors)).toEqual([]);
          expect(results.some((r) => r.incomplete)).toBe(false);
          const report = runTask(unit, task, program);
          expect(report.problems).toEqual([]);
          const failed = report.checks.filter((c) => !c.passed);
          expect(failed).toEqual([]);
          expect(report.allPassed).toBe(true);
        });

        it(`${task.id}: has visible and hidden checks, unique names`, () => {
          expect(task.checks.some((c) => !c.hidden)).toBe(true);
          expect(task.checks.some((c) => c.hidden)).toBe(true);
          expect(new Set(task.checks.map((c) => c.name)).size).toBe(task.checks.length);
          for (const c of task.checks) expect(c.args.length).toBe(task.params.length);
          expect(signatureOf(task)).toContain(`${task.id}(`);
          for (const b of bindingsOf(unit, task)) expect(b.name).toBeTruthy();
        });

        it(`${task.id}: does not use forbidden members`, () => {
          const program = solutionProgram(unit, task);
          const results = checkProgram(program, taskEnv(unit, task), unit.universe);
          const used = results.flatMap((r) => [...r.info.values()]).filter((i) => i.member).map((i) => i.member!);
          for (const f of task.forbidden ?? []) {
            expect(used.filter((m) => isForbidden([f], m)).map(memberId)).toEqual([]);
          }
          expect(program.stmts.map((s) => toJava(s)).join('').length).toBeGreaterThan(0);
          expect(stepsOf(task)[stepsOf(task).length - 1].type).toEqual(task.returnType);
          expect(solutionsOf(task).length).toBe(stepsOf(task).length);
        });
      }
    });
  }

  it('README numbers: Drama has 7 movies', () => {
    const t = units.find((u) => u.id === 'movies')!.tasks.find((t) => t.id === 'countByGenre')!;
    expect(t.checks.find((c) => !c.hidden)!.expected).toBe(7);
  });
});

describe('run', () => {
  const unit = units.find((u) => u.id === 'movies')!;
  const task = unit.tasks.find((t) => t.id === 'titlesByDirector')!;

  it('refuses incomplete programs', () => {
    const r = runTask(unit, task, { stmts: [{ type: task.returnType, root: call(name('movies'), 'stream', []) }] });
    expect(r.problems[0]).toContain('Expected List<String> but got Stream<Movie>');
    const r2 = runTask(unit, task, { stmts: [{ type: task.returnType, root: hole() }] });
    expect(r2.problems).toEqual(['1 gap left to fill']);
  });

  it('shows expected vs actual for a wrong solution (== on Strings)', () => {
    const root = parseExpr('movies.stream().filter(m -> m.director() == director).map(Movie::title).toList()', unit.universe.kindOf);
    const r = runTask(unit, task, { stmts: [{ type: task.returnType, root }] });
    expect(r.allPassed).toBe(false);
    const first = r.checks[0];
    expect(first.call).toBe('titlesByDirector("David Lynch")');
    expect(first.actualText).toBe('[]');
    expect(first.expectedText).toContain('[Eraserhead, The Elephant Man');
  });

  it('reports Java exceptions', () => {
    const t2 = unit.tasks.find((t) => t.id === 'countByGenre')!;
    const root = parseExpr('movies.stream().filter(m -> m.genres().get(5).equals(genre)).count()', unit.universe.kindOf);
    const r = runTask(unit, t2, { stmts: [{ type: t2.returnType, root }] });
    expect(r.checks[0].error).toMatch(/^IndexOutOfBoundsException: Index 5 out of bounds for length/);
  });
});

describe('task lists', () => {
  const ids = (unit: string) => units.find((u) => u.id === unit)!.tasks.map((t) => t.id);
  it('drills', () => {
    expect(ids('drills')).toEqual([
      'evenNumbers', 'shout', 'countLongWords', 'doubledAbove', 'anyStartsWith', 'firstDistinct', 'adultNames',
      'sortedByAge', 'ranking', 'firstLongWord', 'totalLetters', 'averageAge', 'flatten', 'product',
      'commaSeparated', 'countByClass', 'splitByParity', 'nameToAge',
    ]);
  });
  it('movies', () => {
    expect(ids('movies')).toEqual([
      'findById', 'countByGenre', 'titlesReleasedAfter', 'titlesByDirector', 'countWellRated',
      'totalRuntimeOfGenre', 'titlesOfMostFrequentDirector', 'moviesOfGenreWithHighestAverageRating',
    ]);
  });
  it('music', () => {
    expect(ids('music')).toEqual([
      'totalSecondsPlayed', 'longestPlay', 'artistOverview', 'playsPerGenre', 'countSkipped',
      'titlesPerArtist', 'secondsPerArtist', 'topArtist',
    ]);
  });
  it('the unit list', () => {
    expect(units.map((u) => u.id)).toEqual(['drills', 'movies', 'music']);
  });
});
