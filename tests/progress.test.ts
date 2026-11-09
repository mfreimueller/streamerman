import { afterEach, describe, expect, it } from 'vitest';
import { units } from '../src/content';
import { solutionProgram } from '../src/content/solution';
import { deserializeProgram, serializeProgram } from '../src/lib/attempts';
import { hasAttempt, isSolved, loadAttempt, markSolved, resetProgress, saveAttempt, solved } from '../src/lib/progress.svelte';
import { clearAll, readJson, setStore, writeJson, type Store } from '../src/lib/storage';
import { restoreState } from '../src/builder/edit';
import { runTask } from '../src/run';
import { holesOf } from '../src/lang/ast';
import { hole } from '../src/lang/ast';

class Mem implements Store {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  key = (i: number) => [...this.m.keys()][i] ?? null;
  get length() { return this.m.size; }
}
const throwing: Store = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); },
  key() { throw new Error('blocked'); },
  get length(): number { throw new Error('blocked'); },
};

afterEach(() => {
  setStore(undefined);
  resetProgress();
});

describe('saved attempts', () => {
  it('round-trips the model solution of every task through JSON and still passes', () => {
    for (const unit of units) {
      for (const task of unit.tasks) {
        const program = solutionProgram(unit, task);
        const back = deserializeProgram(JSON.parse(JSON.stringify(serializeProgram(program))), task);
        expect(back, `${unit.id}/${task.id}`).toBeDefined();
        expect(runTask(unit, task, back!).allPassed).toBe(true);
      }
    }
  });

  it('gives restored nodes fresh ids and puts the cursor on the first gap', () => {
    const unit = units[0];
    const task = unit.tasks[0];
    const program = solutionProgram(unit, task);
    const root = program.stmts[0].root;
    const back = deserializeProgram(JSON.parse(JSON.stringify(serializeProgram(program))), task)!;
    expect(back.stmts[0].root.id).not.toBe(root.id);
    const partial = { stmts: [{ ...program.stmts[0], root: hole() }] };
    const st = restoreState(partial);
    expect(st.cursor.mode).toBe('replace');
    expect(holesOf(st.program.stmts[0].root).length).toBe(1);
  });

  it('ignores incompatible or broken data', () => {
    const unit = units[0];
    const task = unit.tasks[0];
    const good = JSON.parse(JSON.stringify(serializeProgram(solutionProgram(unit, task))));
    expect(deserializeProgram({ ...good, v: 99 }, task)).toBeUndefined();
    expect(deserializeProgram({ ...good, stmts: [] }, task)).toBeUndefined();
    expect(deserializeProgram('garbage', task)).toBeUndefined();
    expect(deserializeProgram(null, task)).toBeUndefined();
    const broken = JSON.parse(JSON.stringify(good));
    broken.stmts[0].root.t = 'banana';
    expect(deserializeProgram(broken, task)).toBeUndefined();
    const multi = units.find((u) => u.id === 'movies')!.tasks.find((t) => t.steps)!;
    expect(deserializeProgram(good, multi)).toBeUndefined(); // a different number of steps
  });
});

describe('storage', () => {
  it('saves solved marks and the attempt, and loads them again', () => {
    setStore(new Mem());
    const unit = units[0];
    const task = unit.tasks[0];
    saveAttempt(unit.id, task, solutionProgram(unit, task));
    expect(hasAttempt(unit.id, task.id)).toBe(true);
    expect(loadAttempt(unit.id, task)).toBeDefined();
    markSolved(unit.id, task.id);
    expect(isSolved(unit.id, task.id)).toBe(true);
    expect(readJson<Record<string, boolean>>('solved')).toEqual({ [`${unit.id}/${task.id}`]: true });
    // an empty program removes the saved attempt
    saveAttempt(unit.id, task, { stmts: [{ type: task.returnType, root: hole() }] });
    expect(hasAttempt(unit.id, task.id)).toBe(false);
    expect(loadAttempt(unit.id, task)).toBeUndefined();
  });

  it('keys carry a format version prefix; reset removes only this app data', () => {
    const mem = new Mem();
    setStore(mem);
    mem.setItem('other-app', '1');
    writeJson('solved', { 'a/b': true });
    expect([...mem.m.keys()].some((k) => k.startsWith('streamerman:v1:'))).toBe(true);
    mem.setItem('streamerman:v0:old', 'x');
    clearAll();
    expect([...mem.m.keys()]).toEqual(['other-app']);
  });

  it('works when storage is blocked or missing', () => {
    for (const s of [throwing, null]) {
      setStore(s);
      const unit = units[0];
      const task = unit.tasks[0];
      expect(() => saveAttempt(unit.id, task, solutionProgram(unit, task))).not.toThrow();
      expect(loadAttempt(unit.id, task)).toBeUndefined();
      expect(() => markSolved(unit.id, task.id)).not.toThrow();
      expect(isSolved(unit.id, task.id)).toBe(true); // still tracked in memory
      expect(() => resetProgress()).not.toThrow();
      expect(solved[`${unit.id}/${task.id}`]).toBeUndefined();
    }
  });

  it('ignores corrupt JSON', () => {
    const mem = new Mem();
    setStore(mem);
    mem.setItem('streamerman:v1:solved', '{not json');
    expect(readJson('solved')).toBeUndefined();
  });
});
