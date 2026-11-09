// Records what flows through the top-level chain of a statement (for the step view).
import type { Call, Node } from '../lang/ast';
import { JStream } from './stream';
import { JSet } from './values';

export interface OpRec {
  call: Call;
  kind: 'stream' | 'value';
  /** Elements that came out of a stream operation (as far as they were pulled). */
  out: unknown[];
  /** For a source (`list.stream()`): how many elements the source has. */
  total?: number;
  value?: unknown;
}

export class Tracer {
  /** Ids of the calls in the top-level chain, innermost (source) first. */
  readonly order: number[] = [];
  readonly recs = new Map<number, OpRec>();

  constructor(root: Node) {
    const ids: number[] = [];
    for (let n = root; n.t === 'call'; n = n.target) ids.push(n.id);
    this.order = ids.reverse();
  }

  traces(id: number) {
    return this.order.includes(id);
  }

  record(call: Call, val: unknown, recv: unknown): unknown {
    if (val instanceof JStream) {
      const rec: OpRec = { call, kind: 'stream', out: [] };
      if (Array.isArray(recv)) rec.total = recv.length;
      else if (recv instanceof JSet) rec.total = recv.size;
      this.recs.set(call.id, rec);
      return new JStream(
        (function* () {
          for (const x of val) {
            rec.out.push(x);
            yield x;
          }
        })(),
      );
    }
    this.recs.set(call.id, { call, kind: 'value', out: [], value: val });
    return val;
  }
}
