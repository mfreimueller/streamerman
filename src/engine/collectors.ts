// java.util.stream.Collectors as small accumulator objects.
import { JavaException, JMap, JSet, doubleSum, toJavaString, type CollKind } from './values';
import type { JType } from '../lang/types';
import type { Universe } from '../lang/universe';

export interface Collector<A = any, R = any> {
  sup(): A;
  acc(a: A, x: any): void;
  fin(a: A): R;
}

export const toList = (): Collector => ({ sup: () => [], acc: (a, x) => a.push(x), fin: (a) => a });
export const toSet = (): Collector => ({ sup: () => new JSet('hash'), acc: (a, x) => a.add(x), fin: (a) => a });
export const joining = (d = '', p = '', s = ''): Collector => ({
  sup: () => [] as string[],
  acc: (a, x) => a.push(x),
  fin: (a) => p + a.join(d) + s,
});
export const counting = (): Collector => ({ sup: () => ({ n: 0 }), acc: (a) => void a.n++, fin: (a) => a.n });
export const summingInt = (f: (x: any) => number): Collector => ({
  sup: () => ({ s: 0 }), acc: (a, x) => void (a.s = (a.s + f(x)) | 0), fin: (a) => a.s,
});
export const summingDouble = (f: (x: any) => number): Collector => ({
  sup: () => [] as number[], acc: (a, x) => void a.push(f(x)), fin: (a) => doubleSum(a),
});
export const averagingInt = (f: (x: any) => number): Collector => ({
  sup: () => ({ s: 0, n: 0 }), acc: (a, x) => void ((a.s += f(x)), a.n++), fin: (a) => (a.n ? a.s / a.n : 0),
});
export const averagingDouble = (f: (x: any) => number): Collector => ({
  sup: () => [] as number[], acc: (a, x) => void a.push(f(x)), fin: (a) => (a.length ? doubleSum(a) / a.length : 0),
});
export const mapping = (f: (x: any) => any, ds: Collector): Collector => ({
  sup: () => ds.sup(), acc: (a, x) => ds.acc(a, f(x)), fin: (a) => ds.fin(a),
});

export const groupingBy = (f: (x: any) => any, ds: Collector, kind: CollKind = 'hash'): Collector => ({
  sup: () => new JMap(kind),
  acc: (m: JMap, x) => {
    const k = f(x);
    if (k === null || k === undefined) throw new JavaException('NullPointerException', 'element cannot be mapped to a null key');
    if (!m.has(k)) m.put(k, ds.sup());
    ds.acc(m.get(k), x);
  },
  fin: (m: JMap) => {
    const out = new JMap(kind);
    for (const [k, a] of m.entries()) out.put(k, ds.fin(a));
    return out;
  },
});

export const partitioningBy = (p: (x: any) => boolean, ds: Collector): Collector => ({
  sup: () => ({ f: ds.sup(), t: ds.sup() }),
  acc: (a, x) => ds.acc(p(x) ? a.t : a.f, x),
  fin: (a) => {
    const out = new JMap('linked');
    out.put(false, ds.fin(a.f));
    out.put(true, ds.fin(a.t));
    return out;
  },
});

export function toMap(
  kf: (x: any) => any, vf: (x: any) => any, merge: ((a: any, b: any) => any) | undefined, kind: CollKind,
  types: { k: JType; v: JType; u: Universe },
): Collector {
  return {
    sup: () => new JMap(kind),
    acc: (m: JMap, x) => {
      const k = kf(x);
      const v = vf(x);
      if (v === null || v === undefined) throw new JavaException('NullPointerException');
      if (m.has(k)) {
        if (!merge) {
          throw new JavaException(
            'IllegalStateException',
            `Duplicate key ${toJavaString(k, types.k, types.u)} (attempted merging values ${toJavaString(m.get(k), types.v, types.u)} and ${toJavaString(v, types.v, types.u)})`,
          );
        }
        m.put(k, merge(m.get(k), v));
      } else m.put(k, v);
    },
    fin: (m) => m,
  };
}
