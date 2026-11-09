import { describe, expect, it } from 'vitest';
import { units } from '../src/content';
import { bindingsOf, signatureOf } from '../src/content/types';
import { runTask, taskEnv } from '../src/run';
import { parseExpr } from '../src/lang/parse';
import { typecheck } from '../src/lang/check';
import { toJava } from '../src/lang/print';
import { hole, call, name } from '../src/lang/ast';
import { memberId } from '../src/lang/members';

describe('content', () => {
  for (const unit of units) {
    describe(unit.title, () => {
      for (const task of unit.tasks) {
        it(`${task.id}: model solution parses, type-checks and passes every check`, () => {
          const root = parseExpr(task.solution, unit.universe.kindOf);
          const stmt = { type: task.returnType, root };
          const res = typecheck(stmt, taskEnv(unit, task), unit.universe);
          expect(res.errors).toEqual([]);
          expect(res.incomplete).toBe(false);
          const report = runTask(unit, task, { stmts: [stmt] });
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
          const root = parseExpr(task.solution, unit.universe.kindOf);
          const res = typecheck({ type: task.returnType, root }, taskEnv(unit, task), unit.universe);
          const used = [...res.info.values()].filter((i) => i.member).map((i) => memberId(i.member!));
          for (const f of task.forbidden ?? []) expect(used).not.toContain(f);
          expect(toJava(root).length).toBeGreaterThan(0);
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
