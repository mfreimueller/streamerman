import { drills } from './drills';
import { movieArchive } from './movies';
import { yearInMusic } from './music';
import { spaceMission } from './space';
import type { Unit } from './types';

export const units: Unit[] = [drills, movieArchive, yearInMusic, spaceMission];
export const unitById = (id: string) => units.find((u) => u.id === id);
