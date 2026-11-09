import type { Unit } from '../content/types';

// In memory only for now; persisted progress is a later step.
export const solved = $state<Record<string, boolean>>({});

export const markSolved = (unitId: string, taskId: string) => {
  solved[`${unitId}/${taskId}`] = true;
};
export const isSolved = (unitId: string, taskId: string) => !!solved[`${unitId}/${taskId}`];
export const solvedCount = (unit: Unit) => unit.tasks.filter((t) => isSolved(unit.id, t.id)).length;
