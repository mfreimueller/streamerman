// Editor state: the program tree, the cursor and an undo stack. All updates are immutable.
import { find, hole, holesOf, replaceById, type Node, type Program, type Stmt } from '../lang/ast';
import type { JType } from '../lang/types';

export interface Cursor {
  nodeId: number;
  /** replace: the node is a hole to be filled; append: continue after the node. */
  mode: 'replace' | 'append';
  /** The user tapped this node (shows Clear / Remove). */
  selected?: boolean;
}

interface Snapshot { program: Program; cursor: Cursor; stmtIndex: number }

export interface EditorState {
  program: Program;
  stmtIndex: number;
  cursor: Cursor;
  history: Snapshot[];
}

export interface StmtSpec { name?: string; type: JType }

export function initState(specs: StmtSpec[]): EditorState {
  const stmts: Stmt[] = specs.map((s) => ({ ...s, root: hole() }));
  return { program: { stmts }, stmtIndex: 0, cursor: { nodeId: stmts[0].root.id, mode: 'replace' }, history: [] };
}

export const currentStmt = (s: EditorState): Stmt => s.program.stmts[s.stmtIndex];

function commit(s: EditorState, root: Node, cursor: Cursor): EditorState {
  const stmts = s.program.stmts.map((st, i) => (i === s.stmtIndex ? { ...st, root } : st));
  return {
    ...s,
    program: { stmts },
    cursor,
    history: [...s.history, { program: s.program, cursor: s.cursor, stmtIndex: s.stmtIndex }],
  };
}

/** Cursor after inserting `node`: its first new hole, otherwise append after it. */
function cursorAfter(node: Node, ignoreHoles: Set<number> = new Set()): Cursor {
  const h = holesOf(node).find((x) => !ignoreHoles.has(x.id));
  return h ? { nodeId: h.id, mode: 'replace' } : { nodeId: node.id, mode: 'append' };
}

/** Replace the node (usually a hole) by `node`. */
export function fill(s: EditorState, targetId: number, node: Node): EditorState {
  const root = replaceById(currentStmt(s).root, targetId, node);
  const cursor = cursorAfter(node);
  return commit(s, root, cursor);
}

/** Put a new node around the target (e.g. `target.name(...)`, `target > ...`). */
export function wrap(s: EditorState, targetId: number, make: (target: Node) => Node): EditorState {
  const root = currentStmt(s).root;
  const target = find(root, targetId);
  if (!target) return s;
  const wrapper = make(target);
  const old = new Set(holesOf(target).map((h) => h.id));
  return commit(s, replaceById(root, targetId, wrapper), cursorAfter(wrapper, old));
}

export function clear(s: EditorState, nodeId: number): EditorState {
  const h = hole();
  return commit(s, replaceById(currentStmt(s).root, nodeId, h), { nodeId: h.id, mode: 'replace' });
}

/** Replace a call by its receiver (`a.b().c()` -> `a.b()`). */
export function unwrapCall(s: EditorState, callId: number): EditorState {
  const root = currentStmt(s).root;
  const c = find(root, callId);
  if (!c || c.t !== 'call') return s;
  return commit(s, replaceById(root, callId, c.target), { nodeId: c.target.id, mode: 'append' });
}

export function clearAll(s: EditorState): EditorState {
  return clear(s, currentStmt(s).root.id);
}

export function undo(s: EditorState): EditorState {
  const last = s.history[s.history.length - 1];
  if (!last) return s;
  return { ...s, program: last.program, cursor: last.cursor, stmtIndex: last.stmtIndex, history: s.history.slice(0, -1) };
}

export function setCursor(s: EditorState, nodeId: number, selected = false): EditorState {
  const n = find(currentStmt(s).root, nodeId);
  if (!n) return s;
  const cursor: Cursor = n.t === 'hole' ? { nodeId, mode: 'replace' } : { nodeId, mode: 'append', selected };
  return { ...s, cursor };
}

export function firstHoleOtherThan(s: EditorState, nodeId: number): number | undefined {
  return holesOf(currentStmt(s).root).find((h) => h.id !== nodeId)?.id;
}

/** Make another statement (step) the active one; the cursor goes to its first gap, or after its expression. */
export function selectStmt(s: EditorState, index: number): EditorState {
  const st = s.program.stmts[index];
  if (!st || index === s.stmtIndex) return s;
  return { ...s, stmtIndex: index, cursor: cursorAfter(st.root) };
}

/** Editor state for a restored program: the first step that still has a gap is active. */
export function restoreState(program: Program): EditorState {
  const i = Math.max(0, program.stmts.findIndex((st) => holesOf(st.root).length > 0));
  return { program, stmtIndex: i, cursor: cursorAfter(program.stmts[i].root), history: [] };
}
