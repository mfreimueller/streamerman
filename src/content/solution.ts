import type { Program } from '../lang/ast';
import { parseExpr } from '../lang/parse';
import { solutionsOf, stepsOf, type Task, type Unit } from './types';

/** The model solution as a program (one statement per step). */
export function solutionProgram(unit: Unit, task: Task): Program {
  const srcs = solutionsOf(task);
  return {
    stmts: stepsOf(task).map((st, i) => ({ name: st.name, type: st.type, root: parseExpr(srcs[i], unit.universe.kindOf) })),
  };
}
