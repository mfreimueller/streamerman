import { show, type JType } from '../lang/types';
import type { Universe } from '../lang/universe';

export interface Binding {
  name: string;
  type: JType;
  value: unknown;
  /** One short line for the context chip. */
  description?: string;
}

export interface Param { name: string; type: JType }

export interface Check {
  name: string;
  hidden: boolean;
  /** Method arguments in parameter order. */
  args: unknown[];
  /** Replaces context values by name (e.g. an empty list). */
  data?: Record<string, unknown>;
  expected: unknown;
}

export interface Task {
  /** Also the method name. */
  id: string;
  title: string;
  returnType: JType;
  params: Param[];
  /** Extra context for this task (on top of the unit's). */
  context?: Binding[];
  description: string;
  forbidden?: string[];
  ruleText?: string;
  /** Model solution: the returned expression, as Java source. */
  solution: string;
  checks: Check[];
}

export interface Unit {
  id: string;
  title: string;
  blurb: string;
  scenario: string;
  universe: Universe;
  context: Binding[];
  /** Values offered when a String literal is expected. */
  suggestions: string[];
  tasks: Task[];
}

export const signatureOf = (t: Task) =>
  `${show(t.returnType)} ${t.id}(${t.params.map((p) => `${show(p.type)} ${p.name}`).join(', ')})`;

export const bindingsOf = (u: Unit, t: Task): Binding[] => [...u.context, ...(t.context ?? [])];
