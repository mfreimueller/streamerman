// Expression tree with typed holes. Every node has a numeric id that stays stable across edits.
import type { JType } from './types';

let counter = 0;
export const newId = () => ++counter;

export type LitType = 'int' | 'long' | 'double' | 'boolean' | 'String';
export type BinOp = '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||';

export interface Hole { t: 'hole'; id: number }
export interface Name { t: 'name'; id: number; name: string }
export interface Lit { t: 'lit'; id: number; type: LitType; value: number | boolean | string }
export interface Call { t: 'call'; id: number; target: Node; name: string; args: Node[] }
export interface SCall { t: 'scall'; id: number; owner: string; name: string; args: Node[] }
export interface EnumC { t: 'enum'; id: number; owner: string; name: string }
export interface Lambda { t: 'lambda'; id: number; params: string[]; body: Node }
export interface MRef { t: 'mref'; id: number; owner: string; name: string }
export interface Bin { t: 'bin'; id: number; op: BinOp; left: Node; right: Node }
export interface Un { t: 'un'; id: number; op: '!' | '-'; operand: Node }
export type Node = Hole | Name | Lit | Call | SCall | EnumC | Lambda | MRef | Bin | Un;

export interface Stmt {
  /** Local variable name; absent for the final `return`. */
  name?: string;
  type: JType;
  root: Node;
}
export interface Program { stmts: Stmt[] }

export const hole = (): Hole => ({ t: 'hole', id: newId() });
export const name = (n: string): Name => ({ t: 'name', id: newId(), name: n });
export const lit = (type: LitType, value: number | boolean | string): Lit => ({ t: 'lit', id: newId(), type, value });
export const call = (target: Node, n: string, args: Node[]): Call => ({ t: 'call', id: newId(), target, name: n, args });
export const scall = (owner: string, n: string, args: Node[]): SCall => ({ t: 'scall', id: newId(), owner, name: n, args });
export const enumConst = (owner: string, n: string): EnumC => ({ t: 'enum', id: newId(), owner, name: n });
export const lambda = (params: string[], body: Node): Lambda => ({ t: 'lambda', id: newId(), params, body });
export const mref = (owner: string, n: string): MRef => ({ t: 'mref', id: newId(), owner, name: n });
export const bin = (op: BinOp, left: Node, right: Node): Bin => ({ t: 'bin', id: newId(), op, left, right });
export const un = (op: '!' | '-', operand: Node): Un => ({ t: 'un', id: newId(), op, operand });

/** Children in source order. */
export function children(n: Node): Node[] {
  switch (n.t) {
    case 'call': return [n.target, ...n.args];
    case 'scall': return [...n.args];
    case 'lambda': return [n.body];
    case 'bin': return [n.left, n.right];
    case 'un': return [n.operand];
    default: return [];
  }
}

/** Same node (same id) with new children; returns `n` itself if nothing changed. */
export function withChildren(n: Node, kids: Node[]): Node {
  const same = children(n).every((c, i) => c === kids[i]);
  if (same) return n;
  switch (n.t) {
    case 'call': return { ...n, target: kids[0], args: kids.slice(1) };
    case 'scall': return { ...n, args: kids };
    case 'lambda': return { ...n, body: kids[0] };
    case 'bin': return { ...n, left: kids[0], right: kids[1] };
    case 'un': return { ...n, operand: kids[0] };
    default: return n;
  }
}

export function replaceById(root: Node, id: number, repl: Node | ((old: Node) => Node)): Node {
  if (root.id === id) return typeof repl === 'function' ? repl(root) : repl;
  const kids = children(root);
  if (!kids.length) return root;
  return withChildren(root, kids.map((k) => replaceById(k, id, repl)));
}

export function find(root: Node, id: number): Node | undefined {
  if (root.id === id) return root;
  for (const k of children(root)) {
    const r = find(k, id);
    if (r) return r;
  }
  return undefined;
}

export function parents(root: Node): Map<number, Node> {
  const m = new Map<number, Node>();
  const walk = (n: Node) => {
    for (const k of children(n)) {
      m.set(k.id, n);
      walk(k);
    }
  };
  walk(root);
  return m;
}

/** Holes in source order. */
export function holesOf(root: Node): Hole[] {
  if (root.t === 'hole') return [root];
  return children(root).flatMap(holesOf);
}

export function contains(root: Node, id: number): boolean {
  return find(root, id) !== undefined;
}
