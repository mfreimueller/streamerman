import type { Program } from '../lang/ast';
import type { Task, Unit } from '../content/types';
import { deserializeProgram, hasCode, serializeProgram } from './attempts';
import { clearAll, readJson, remove, writeJson } from './storage';

// Solved flags and which tasks have a saved attempt. Persisted in localStorage when available.
export const solved = $state<Record<string, boolean>>(readJson<Record<string, boolean>>('solved') ?? {});
export const attempts = $state<Record<string, boolean>>(readJson<Record<string, boolean>>('attempts') ?? {});

const key = (u: string, t: string) => `${u}/${t}`;

export const markSolved = (unitId: string, taskId: string) => {
  solved[key(unitId, taskId)] = true;
  writeJson('solved', $state.snapshot(solved));
};
export const isSolved = (unitId: string, taskId: string) => !!solved[key(unitId, taskId)];
export const hasAttempt = (unitId: string, taskId: string) => !!attempts[key(unitId, taskId)];
export const solvedCount = (unit: Unit) => unit.tasks.filter((t) => isSolved(unit.id, t.id)).length;

export function saveAttempt(unitId: string, task: Task, program: Program) {
  const k = key(unitId, task.id);
  if (hasCode(program)) {
    if (writeJson(`attempt:${k}`, serializeProgram(program)) && !attempts[k]) {
      attempts[k] = true;
      writeJson('attempts', $state.snapshot(attempts));
    }
  } else if (attempts[k]) {
    remove(`attempt:${k}`);
    delete attempts[k];
    writeJson('attempts', $state.snapshot(attempts));
  }
}

export function loadAttempt(unitId: string, task: Task): Program | undefined {
  return deserializeProgram(readJson(`attempt:${key(unitId, task.id)}`), task);
}

export function resetProgress() {
  clearAll();
  for (const k of Object.keys(solved)) delete solved[k];
  for (const k of Object.keys(attempts)) delete attempts[k];
}
