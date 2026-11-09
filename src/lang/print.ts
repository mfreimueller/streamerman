// Pretty printer: tree -> tokens (and Java text).
import type { BinOp, Node, Stmt } from './ast';
import { show } from './types';

export type TokCls = 'kw' | 'method' | 'var' | 'lit' | 'op' | 'punct' | 'hole' | 'type';
export type Tok =
  | { text: string; id?: number; cls: TokCls }
  | { nl: true; indent: number }
  | { caret: true; id: number };

const PREC: Record<BinOp, number> = {
  '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6,
};

function prec(n: Node): number {
  switch (n.t) {
    case 'bin': return PREC[n.op];
    case 'un': return 7;
    case 'lambda': return 0;
    case 'lit': return typeof n.value === 'number' && n.value < 0 ? 7 : 8;
    default: return 8;
  }
}

function chainHasStream(n: Node): boolean {
  while (n.t === 'call') {
    if (n.name === 'stream') return true;
    n = n.target;
  }
  return false;
}

export function litText(type: string, value: number | boolean | string): string {
  if (type === 'String') return JSON.stringify(value);
  if (type === 'long') return `${value}L`;
  if (type === 'double') {
    const s = String(value);
    return /^-?\d+$/.test(s) ? `${s}.0` : s;
  }
  return String(value);
}

interface Opts { caretAfter?: number; short?: boolean; flat?: boolean }

/** Tokens of an expression, starting at indentation `level`. */
export function exprTokens(root: Node, o: Opts = {}, level = 0): Tok[] {
  const out: Tok[] = [];
  const tok = (text: string, cls: TokCls, id?: number): void => {
    out.push({ text, cls, id });
  };

  const emit = (n: Node, lv: number): void => {
    emitInner(n, lv);
    if (o.caretAfter === n.id) out.push({ caret: true, id: n.id });
  };

  const args = (list: Node[], id: number, lv: number) => {
    tok('(', 'punct', id);
    if (o.short && list.length) tok('…', 'punct', id);
    else {
      list.forEach((a, i) => {
        if (i) tok(', ', 'punct', id);
        emit(a, lv + 1);
      });
    }
    tok(')', 'punct', id);
  };

  const sub = (child: Node, need: boolean, lv: number) => {
    if (need) tok('(', 'punct');
    emit(child, lv);
    if (need) tok(')', 'punct');
  };

  const emitInner = (n: Node, lv: number): void => {
    switch (n.t) {
      case 'hole': return tok('…', 'hole', n.id);
      case 'name': return tok(n.name, 'var', n.id);
      case 'lit': return tok(litText(n.type, n.value), 'lit', n.id);
      case 'enum':
        tok(n.owner, 'type', n.id);
        tok('.', 'punct', n.id);
        return tok(n.name, 'lit', n.id);
      case 'mref':
        tok(n.owner, 'type', n.id);
        tok('::', 'punct', n.id);
        return tok(n.name, 'method', n.id);
      case 'lambda':
        if (o.short) return tok('…', 'punct', n.id);
        if (n.ptypes) tok(`(${n.params.map((q, i) => `${show(n.ptypes![i])} ${q}`).join(', ')})`, 'var', n.id);
        else if (n.params.length === 1) tok(n.params[0], 'var', n.id);
        else tok(`(${n.params.join(', ')})`, 'var', n.id);
        tok(' -> ', 'op', n.id);
        return emit(n.body, lv);
      case 'un':
        tok(n.op, 'op', n.id);
        return sub(n.operand, prec(n.operand) < 7, lv);
      case 'bin': {
        const p = PREC[n.op];
        sub(n.left, prec(n.left) < p, lv);
        tok(` ${n.op} `, 'op', n.id);
        return sub(n.right, prec(n.right) <= p, lv);
      }
      case 'scall':
        if (n.name === 'new') {
          tok('new ', 'kw', n.id);
          tok(n.owner, 'type', n.id);
          return args(n.args, n.id, lv);
        }
        tok(n.owner, 'type', n.id);
        tok('.', 'punct', n.id);
        tok(n.name, 'method', n.id);
        return args(n.args, n.id, lv);
      case 'call': {
        sub(n.target, prec(n.target) < 8, lv);
        if (!o.flat && !o.short && n.target.t === 'call' && chainHasStream(n.target)) {
          out.push({ nl: true, indent: lv + 1 });
          tok('.', 'punct', n.id);
          tok(n.name, 'method', n.id);
          return args(n.args, n.id, lv);
        }
        tok('.', 'punct', n.id);
        tok(n.name, 'method', n.id);
        return args(n.args, n.id, lv);
      }
    }
  };

  emit(root, level);
  // `flat`: drop line breaks
  return o.flat ? out.filter((t) => !('nl' in t)) : out;
}

export function stmtTokens(s: Stmt, o: Opts = {}): Tok[] {
  const head: Tok[] = s.name
    ? [
        { text: show(s.type), cls: 'type' },
        { text: ` ${s.name} = `, cls: 'op' },
      ]
    : [{ text: 'return ', cls: 'kw' }];
  return [...head, ...exprTokens(s.root, o), { text: ';', cls: 'punct' }];
}

export interface Line { indent: number; toks: Tok[] }

export function toLines(toks: Tok[]): Line[] {
  const lines: Line[] = [{ indent: 0, toks: [] }];
  for (const t of toks) {
    if ('nl' in t) lines.push({ indent: t.indent, toks: [] });
    else lines[lines.length - 1].toks.push(t);
  }
  return lines;
}

const text = (toks: Tok[]) => toks.map((t) => ('text' in t ? t.text : '')).join('');

export function tokensToJava(toks: Tok[]): string {
  return toLines(toks)
    .map((l) => '    '.repeat(l.indent) + text(l.toks))
    .join('\n');
}

/** Multi-line Java text (IntelliJ-like stream formatting). */
export function toJava(x: Stmt | Node): string {
  return tokensToJava('root' in x ? stmtTokens(x) : exprTokens(x));
}

/** Single-line Java text. */
export function toJavaFlat(x: Stmt | Node): string {
  return text('root' in x ? stmtTokens(x, { flat: true }) : exprTokens(x, { flat: true }));
}

/** Compact text for titles: call arguments and lambdas collapsed to `…`. */
export function toJavaShort(n: Node): string {
  const s = text(exprTokens(n, { short: true, flat: true }));
  return s.length > 48 ? '…' + s.slice(-46) : s;
}

/** Label of one operation of a chain: `.filter(m -> …)`; the source keeps its receiver: `movies.stream()`. */
export function toJavaOp(c: Extract<Node, { t: 'call' }>): string {
  const arg = (a: Node) =>
    a.t === 'lambda'
      ? `${a.ptypes ? `(${a.params.map((q, i) => `${show(a.ptypes![i])} ${q}`).join(', ')})` : a.params.length === 1 ? a.params[0] : `(${a.params.join(', ')})`} -> …`
      : toJavaShort(a);
  const call = `${c.name}(${c.args.map(arg).join(', ')})`;
  return c.target.t === 'call' ? `.${call}` : `${toJavaShort(c.target)}.${call}`;
}
