import { drills } from './drills';
import { movieArchive } from './movies';
import type { Unit } from './types';

export const units: Unit[] = [drills, movieArchive];
export const unitById = (id: string) => units.find((u) => u.id === id);
