// Small Pratt parser for the Java subset. Used only for authoring model solutions and tests.
import {
  bin, call, enumConst, lambda, lit, mref, name, scall, un, type BinOp, type Node,
} from './ast';

type T = { k: 'id' | 'int' | 'long' | 'double' | 'str' | 'op' | 'eof'; v: string };

const OPS = ['->', '::', '&&', '||', '==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%', '!', '.', ',', '(', ')'];

function tokenize(src: string): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      out.push({ k: 'id', v: src.slice(i, j) });
      i = j;
    } else if (/\d/.test(c)) {
      let j = i;
      while (j < src.length && /\d/.test(src[j])) j++;
      let k: T['k'] = 'int';
      if (src[j] === '.' && /\d/.test(src[j + 1] ?? '')) {
        j++;
        while (j < src.length && /\d/.test(src[j])) j++;
        k = 'double';
      }
      const v = src.slice(i, j);
      if (src[j] === 'L') { k = 'long'; j++; }
      out.push({ k, v });
      i = j;
    } else if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\') {
          const n = src[j + 1];
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          j += 2;
        } else s += src[j++];
      }
      if (src[j] !== '"') throw new Error('Unterminated string literal');
      out.push({ k: 'str', v: s });
      i = j + 1;
    } else {
      const op = OPS.find((o) => src.startsWith(o, i));
      if (!op) throw new Error(`Unexpected character '${c}'`);
      out.push({ k: 'op', v: op });
      i += op.length;
    }
  }
  out.push({ k: 'eof', v: '' });
  return out;
}

const BIN_PREC: Record<string, number> = {
  '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6,
};

export type KindOf = (id: string) => 'enum' | 'class' | undefined;

export function parseExpr(src: string, kindOf: KindOf = () => undefined): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = (o = 0) => toks[p + o];
  const next = () => toks[p++];
  const isOp = (t: T, v: string) => t.k === 'op' && t.v === v;
  const expect = (v: string) => {
    const t = next();
    if (!isOp(t, v)) throw new Error(`Expected '${v}' but found '${t.v || 'end'}'`);
  };

  const args = (): Node[] => {
    expect('(');
    const list: Node[] = [];
    if (!isOp(peek(), ')')) {
      do list.push(expr(0)); while (isOp(peek(), ',') && next());
    }
    expect(')');
    return list;
  };

  const lambdaAhead = (): string[] | null => {
    // ( ) ->   |   ( a , b ) ->
    let i = 1;
    const ps: string[] = [];
    if (isOp(peek(i), ')')) i++;
    else {
      for (;;) {
        if (peek(i).k !== 'id') return null;
        ps.push(peek(i++).v);
        if (isOp(peek(i), ',')) { i++; continue; }
        if (isOp(peek(i), ')')) { i++; break; }
        return null;
      }
    }
    if (!isOp(peek(i), '->')) return null;
    p += i + 1;
    return ps;
  };

  const primary = (): Node => {
    const t = next();
    switch (t.k) {
      case 'int': return lit('int', Number(t.v));
      case 'long': return lit('long', Number(t.v));
      case 'double': return lit('double', Number(t.v));
      case 'str': return lit('String', t.v);
      case 'id': {
        if (t.v === 'true' || t.v === 'false') return lit('boolean', t.v === 'true');
        if (isOp(peek(), '->')) {
          next();
          return lambda([t.v], expr(0));
        }
        let owner = t.v;
        if (owner === 'Map' && isOp(peek(), '.') && peek(1).v === 'Entry') {
          next();
          next();
          owner = 'Map.Entry';
        }
        const kind = owner === 'Map.Entry' ? 'class' : kindOf(owner);
        if (kind && isOp(peek(), '::')) {
          next();
          return mref(owner, next().v);
        }
        if (kind && isOp(peek(), '.')) {
          next();
          const member = next().v;
          if (isOp(peek(), '(')) return scall(owner, member, args());
          if (kind === 'enum') return enumConst(owner, member);
          throw new Error(`Unsupported field access ${owner}.${member}`);
        }
        return name(t.v);
      }
      case 'op':
        if (t.v === '(') {
          p--;
          const ps = lambdaAhead();
          if (ps) return lambda(ps, expr(0));
          p++;
          const e = expr(0);
          expect(')');
          return e;
        }
        if (t.v === '!') return un('!', expr(7));
        if (t.v === '-') {
          const n = peek();
          if (n.k === 'int' || n.k === 'long' || n.k === 'double') {
            next();
            return lit(n.k, -Number(n.v));
          }
          return un('-', expr(7));
        }
    }
    throw new Error(`Unexpected '${t.v || 'end of input'}'`);
  };

  const expr = (minPrec: number): Node => {
    let left = primary();
    for (;;) {
      const t = peek();
      if (isOp(t, '.')) {
        next();
        const m = next();
        if (m.k !== 'id') throw new Error('Expected a method name after .');
        if (!isOp(peek(), '(')) throw new Error(`Field access .${m.v} is not supported (use ${m.v}())`);
        left = call(left, m.v, args());
        continue;
      }
      const pr = t.k === 'op' ? BIN_PREC[t.v] : undefined;
      if (pr === undefined || pr < minPrec) break;
      next();
      left = bin(t.v as BinOp, left, expr(pr + 1));
    }
    return left;
  };

  const e = expr(0);
  if (peek().k !== 'eof') throw new Error(`Unexpected '${peek().v}'`);
  return e;
}
