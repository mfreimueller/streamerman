// Completion catalogue: what may be put at the cursor.
import {
  bin, call, children, enumConst, find, hole, lambda, lit, mref, name, parents, replaceById, un,
  type BinOp, type LitType, type Node,
} from '../lang/ast';
import { typecheck, type CheckResult, type Env } from '../lang/check';
import { memberId, membersOf, signature, type Member } from '../lang/members';
import { toJavaShort } from '../lang/print';
import {
  ANY, BOOLEAN, assignable, fnShape, isAny, isBoolean, isNumeric, sameType, show, unbox, type JType,
} from '../lang/types';
import type { Universe } from '../lang/universe';
import { clear, currentStmt, fill, firstHoleOtherThan, setCursor, unwrapCall, wrap, type EditorState } from './edit';

export interface ActionItem {
  kind: 'item';
  label: string;
  detail: string;
  signature?: string;
  doc?: string;
  example?: string;
  apply(s: EditorState): EditorState;
}

export interface LiteralItem {
  kind: 'literal';
  label: string;
  detail: string;
  litType: LitType;
  suggestions: string[];
  validate(value: string): string | null;
  apply(s: EditorState, value: string): EditorState;
}

export type CItem = ActionItem | LiteralItem;
export interface Group { title: string; items: CItem[] }
export interface Completion {
  /** Header text: "Expected: Predicate<Movie>" / "Continue after …" */
  title: string;
  expected: JType | null;
  groups: Group[];
}

export interface CompleteCtx {
  u: Universe;
  /** Member ids such as `Stream.count/0` that the task forbids. */
  forbidden?: string[];
  /** Values from the data to suggest for String literals (directors, titles, ...). */
  stringSuggestions?: string[];
}

const OPS: { op: BinOp; doc: string; example: string }[] = [
  { op: '+', doc: 'Adds numbers, or joins text when one side is a String.', example: 'a + b' },
  { op: '-', doc: 'Subtracts.', example: 'a - b' },
  { op: '*', doc: 'Multiplies.', example: 'a * 2' },
  { op: '/', doc: 'Divides. With two int operands the result is cut off: 7 / 2 is 3.', example: 'a / 2' },
  { op: '%', doc: 'Remainder of a division: 7 % 2 is 1. Handy to test even/odd.', example: 'n % 2 == 0' },
  { op: '<', doc: 'True if the left side is smaller.', example: 'a < b' },
  { op: '<=', doc: 'True if the left side is smaller or equal.', example: 'a <= b' },
  { op: '>', doc: 'True if the left side is greater.', example: 'a > b' },
  { op: '>=', doc: 'True if the left side is greater or equal.', example: 'a >= b' },
  { op: '==', doc: 'Compares numbers and enums by value. For Strings and objects it compares references: use equals() there.', example: 'a == b' },
  { op: '!=', doc: 'The opposite of ==. Same warning for Strings and objects.', example: 'a != b' },
  { op: '&&', doc: 'True if both sides are true. The right side is skipped when the left is false.', example: 'a > 1 && b < 5' },
  { op: '||', doc: 'True if at least one side is true.', example: 'a > 1 || b < 5' },
];

const SIMPLE_PARAM: Record<string, string> = { Integer: 'n', Long: 'n', Double: 'n' };

function paramNames(types: JType[], env: Env): string[] {
  const used = new Set(env.keys());
  const names: string[] = [];
  types.forEach((t, i) => {
    let base = types.length === 2 ? (i === 0 ? 'a' : 'b') : 'x';
    if (types.length !== 2 && t.k === 'cls') base = SIMPLE_PARAM[t.n] ?? t.n[0].toLowerCase();
    else if (types.length !== 2 && t.k === 'prim') base = 'n';
    let n = base;
    for (let k = 2; used.has(n); k++) n = `${base}${k}`;
    used.add(n);
    names.push(n);
  });
  return names;
}

export function complete(state: EditorState, res: CheckResult, ctx: CompleteCtx): Completion {
  const stmt = currentStmt(state);
  const node = find(stmt.root, state.cursor.nodeId);
  const groups: Group[] = [];
  if (!node) return { title: '', expected: null, groups };

  const nextGap = firstHoleOtherThan(state, node.t === 'hole' ? node.id : -1);
  if (nextGap !== undefined && !(node.t === 'hole' && res.holes.length === 1)) {
    groups.push({
      title: 'Navigate',
      items: [{
        kind: 'item', label: '→ next gap', detail: '', doc: 'Jump to the next unfinished place in the code.',
        apply: (s) => setCursor(s, nextGap),
      }],
    });
  }

  if (node.t === 'hole') {
    const ni = res.info.get(node.id);
    const E = ni?.expected ?? ANY;
    const env = ni?.env ?? new Map();
    groups.push(...replaceGroups(state, res, ctx, node.id, E, env));
    return { title: isAny(E) ? 'Pick a value' : `Expected: ${show(E)}`, expected: E, groups };
  }

  const short = toJavaShort(node);
  if (state.cursor.selected) {
    const items: CItem[] = [{
      kind: 'item', label: 'Clear', detail: short, doc: 'Replace the selected part by a gap.', apply: (s) => clear(s, node.id),
    }];
    if (node.t === 'call') {
      items.push({
        kind: 'item', label: `Remove .${node.name}(${node.args.length ? '…' : ''})`, detail: '',
        doc: 'Take this call out of the chain and keep the rest.', apply: (s) => unwrapCall(s, node.id),
      });
    }
    groups.push({ title: 'Edit', items });
  }

  groups.push(...appendGroups(state, res, ctx, node));
  return { title: `${state.cursor.selected ? 'Selected' : 'Continue after'} ${short}`, expected: null, groups };
}

// ---- replace mode ----------------------------------------------------------

function litKindFor(E: JType): LitType | null {
  if (E.k === 'prim') {
    if (E.n === 'int' || E.n === 'long') return 'int';
    if (E.n === 'double') return 'double';
    return null;
  }
  if (E.k === 'cls') {
    if (E.n === 'Integer') return 'int';
    if (E.n === 'Long') return 'long';
    if (E.n === 'Double') return 'double';
    if (E.n === 'String') return 'String';
  }
  return null;
}

function literalItem(kind: LitType, holeId: number, suggestions: string[]): LiteralItem {
  const validate = (v: string): string | null => {
    const t = v.trim();
    if (kind === 'String') return null;
    if (kind === 'double') return /^-?\d+(\.\d+)?$/.test(t) ? null : 'Enter a number like 7.5';
    if (!/^-?\d+$/.test(t)) return 'Enter a whole number';
    return Math.abs(Number(t)) <= (kind === 'int' ? 2147483647 : 9007199254740991) ? null : 'Number is too large';
  };
  const label = kind === 'String' ? '"text"' : kind === 'double' ? '1.5' : kind === 'long' ? '123L' : '123';
  return {
    kind: 'literal', label, litType: kind, suggestions, validate,
    detail: kind === 'String' ? 'String literal' : `${kind} literal`,
    apply: (s, v) => fill(s, holeId, lit(kind, kind === 'String' ? v : Number(v.trim()))),
  };
}

function replaceGroups(state: EditorState, res: CheckResult, ctx: CompleteCtx, holeId: number, E0: JType, env: Env): Group[] {
  const { u } = ctx;
  const out: Group[] = [];
  let E = E0;

  // Operand of a binary operator: the sibling's type is a good hint.
  const par = parents(currentStmt(state).root).get(holeId);
  let hint = false;
  if (isAny(E) && par?.t === 'bin') {
    const other = par.left.id === holeId ? par.right : par.left;
    const ot = res.info.get(other.id)?.type ?? ANY;
    if (!isAny(ot) && (par.op === '==' || par.op === '!=' || isNumeric(ot) || ot.k === 'cls')) {
      E = isNumeric(ot) ? unbox(ot) : ot;
      hint = true;
    }
  }

  const shape = fnShape(E);
  if (shape) {
    const items: CItem[] = [];
    const names = paramNames(shape.params, env);
    items.push({
      kind: 'item', label: `${names.length === 1 ? names[0] : `(${names.join(', ')})`} -> …`,
      detail: show(E), doc: 'A lambda: a little function. Write the parameter name, then an expression using it.',
      example: names.length === 1 ? `${names[0]} -> ${names[0]}.year() > 2000` : '(a, b) -> a + b',
      apply: (s) => fill(s, holeId, lambda(names, hole())),
    });
    const p = shape.params[0];
    if (shape.params.length === 1 && p.k === 'cls') {
      for (const m of membersOf(p, u)) {
        if (m.arity !== 0 || m.kind !== 'instance' || forbidden(ctx, m)) continue;
        const r = m.ret(p, [], u);
        if (!isAny(shape.ret) && !assignable(r, shape.ret)) continue;
        items.push({
          kind: 'item', label: `${p.n}::${m.name}`, detail: show(r), doc: m.doc,
          example: `${p.n}::${m.name} is the same as x -> x.${m.name}()`,
          apply: (s) => fill(s, holeId, mref(p.n, m.name)),
        });
      }
    }
    out.push({ title: 'Functions', items });
    return out;
  }

  // variables
  const vars = [...env.entries()].map(([n, t], i) => ({ n, t, i }));
  const tier = (t: JType) => (sameType(t, E) ? 0 : assignable(t, E) ? 1 : 2);
  vars.sort((a, b) => tier(a.t) - tier(b.t) || b.i - a.i);
  const shown = hint ? vars.filter((v) => (isNumeric(v.t) && isNumeric(E)) || assignable(v.t, E)) : vars;
  if (shown.length) {
    out.push({
      title: 'Variables',
      items: shown.map((v) => ({
        kind: 'item' as const, label: v.n, detail: show(v.t),
        doc: tier(v.t) === 2 ? 'Does not fit directly, but you can continue with a method call.' : undefined,
        apply: (s: EditorState) => fill(s, holeId, name(v.n)),
      })),
    });
  }

  // enum constants
  if (E.k === 'cls' && u.enums[E.n]) {
    out.push({
      title: E.n,
      items: u.enums[E.n].constants.map((c) => ({
        kind: 'item' as const, label: `${E.n}.${c}`, detail: E.n, apply: (s: EditorState) => fill(s, holeId, enumConst((E as any).n, c)),
      })),
    });
  }

  // boolean
  if (isBoolean(E) && !hint) {
    out.push({
      title: 'Boolean',
      items: [
        ...(['true', 'false'] as const).map((v) => ({
          kind: 'item' as const, label: v, detail: 'boolean', apply: (s: EditorState) => fill(s, holeId, lit('boolean', v === 'true')),
        })),
        {
          kind: 'item' as const, label: '!', detail: 'boolean', doc: 'Negation: turns true into false and the other way round.',
          example: '!m.genres().isEmpty()', apply: (s: EditorState) => fill(s, holeId, un('!', hole())),
        },
      ],
    });
  }

  // literals
  const kind = litKindFor(E);
  if (kind) {
    out.push({ title: 'Literal', items: [literalItem(kind, holeId, kind === 'String' ? ctx.stringSuggestions ?? [] : [])] });
  } else if (isAny(E)) {
    out.push({
      title: 'Literal',
      items: [
        literalItem('int', holeId, []),
        literalItem('double', holeId, []),
        literalItem('String', holeId, ctx.stringSuggestions ?? []),
      ],
    });
  }
  return out;
}

const forbidden = (ctx: CompleteCtx, m: Member) => (ctx.forbidden ?? []).includes(memberId(m));

// ---- append mode ------------------------------------------------------------

/** The node and the ancestors it is the "right end" of (a.b > c: c, then the comparison, ...). */
function spine(root: Node, x: Node): Node[] {
  const par = parents(root);
  const out: Node[] = [x];
  let cur = x;
  for (;;) {
    const p = par.get(cur.id);
    if (!p) break;
    const ok =
      (p.t === 'bin' && p.right === cur) ||
      p.t === 'un' ||
      p.t === 'lambda' ||
      ((p.t === 'call' || p.t === 'scall') && p.args.length > 0 && p.args[p.args.length - 1] === cur);
    if (!ok) break;
    out.push(p);
    cur = p;
  }
  return out;
}

function appendGroups(state: EditorState, res: CheckResult, ctx: CompleteCtx, x: Node): Group[] {
  const { u } = ctx;
  const stmt = currentStmt(state);
  const rootEnv = res.info.get(stmt.root.id)!.env;
  const groups: Group[] = [];
  const targets = spine(stmt.root, x).reverse(); // outermost first

  for (const t of targets) {
    const ni = res.info.get(t.id);
    if (!ni || t.t === 'hole' || t.t === 'lambda' || isAny(ni.type) || ni.type.k === 'prim' && ni.type.n === 'void') continue;
    const ty = ni.type;
    const items: CItem[] = [];

    let members = membersOf(ty, u).filter((m) => m.kind === 'instance' && !forbidden(ctx, m) && (!m.when || m.when(ty, u)));
    if (!isAny(ni.expected)) {
      const fits = (m: Member) => assignable(m.ret(ty, m.args(ty, u), u), ni.expected);
      members = [...members.filter(fits), ...members.filter((m) => !fits(m))];
    }
    for (const m of members) {
      const rt = m.ret(ty, m.args(ty, u), u);
      items.push({
        kind: 'item',
        label: `${m.name}(${m.params.join(', ')})`,
        detail: show(rt).replace(/\?/g, 'R'),
        signature: signature(m, ty, u),
        doc: m.doc,
        example: m.example,
        apply: (s) => wrap(s, t.id, (target) => call(target, m.name, m.params.map(() => hole()))),
      });
    }

    for (const o of OPS) {
      const trial = tryOp(stmt, rootEnv, u, res, t, o.op);
      if (!trial) continue;
      items.push({
        kind: 'item', label: o.op, detail: show(trial), doc: o.doc, example: o.example,
        apply: (s) => wrap(s, t.id, (target) => bin(o.op, target, hole())),
      });
    }

    if (items.length) groups.push({ title: `on ${toJavaShort(t)} · ${show(ty)}`, items });
  }
  return groups;
}

/** Would wrapping `t` in `t op _` type-check? Returns the type of the new expression if so. */
function tryOp(
  stmt: ReturnType<typeof currentStmt>, env: Env, u: Universe, base: CheckResult, t: Node, op: BinOp,
): JType | null {
  if (!operandOk(base.info.get(t.id)?.type ?? ANY, op, u)) return null;
  const placeholder = hole();
  const wrapper = bin(op, t, placeholder);
  const root = replaceById(stmt.root, t.id, wrapper);
  const r = typecheck({ ...stmt, root }, env, u);
  const mine = r.info.get(wrapper.id);
  if (!mine || (mine.error && !mine.mismatch)) return null;
  // neither the operands (target subtree, placeholder) nor any ancestor may get a new error
  const fresh = (id: number) => !!r.info.get(id)?.error && !base.info.get(id)?.error;
  const stack: Node[] = [...children(wrapper)];
  while (stack.length) {
    const n = stack.pop()!;
    if (fresh(n.id)) return null;
    stack.push(...children(n));
  }
  const par = parents(root);
  for (let p = par.get(wrapper.id); p; p = par.get(p.id)) {
    if (r.info.get(p.id)?.error && !base.info.get(p.id)?.error) return null;
  }
  return mine.type;
}

/** Can a value of this type be the left operand of `op`? (Independent of earlier errors.) */
function operandOk(ty: JType, op: BinOp, u: Universe): boolean {
  if (isAny(ty)) return false;
  if (op === '&&' || op === '||') return isBoolean(ty);
  if (op === '==' || op === '!=') {
    return isNumeric(ty) || isBoolean(ty) || (ty.k === 'cls' && (ty.n === 'String' || !!u.enums[ty.n] || !!u.records[ty.n]));
  }
  if (op === '+') return isNumeric(ty) || (ty.k === 'cls' && ty.n === 'String');
  return isNumeric(ty);
}
