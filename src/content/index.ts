import { drills } from './drills';
import { movieArchive } from './movies';
import { yearInMusic } from './music';
import type { Unit } from './types';

export const units: Unit[] = [drills, movieArchive, yearInMusic];
export const unitById = (id: string) => units.find((u) => u.id === id);
