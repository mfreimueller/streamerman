// Lazy Java-like stream over JS generators. Single use.
import { JavaException, JOptional, naturalCompare, structKey } from './values';
import type { Collector } from './collectors';

const REUSE = 'stream has already been operated upon or closed';

export { naturalCompare };

export class JStream<T = any> {
  private used = false;
  private src: Iterable<T>;
  constructor(src: Iterable<T>) {
    this.src = src;
  }

  private open(): Iterable<T> {
    if (this.used) throw new JavaException('IllegalStateException', REUSE);
    this.used = true;
    return this.src;
  }

  filter(p: (x: T) => boolean): JStream<T> {
    const s = this.open();
    return new JStream(
      (function* () {
        for (const x of s) if (p(x)) yield x;
      })(),
    );
  }

  map<R>(f: (x: T) => R): JStream<R> {
    const s = this.open();
    return new JStream(
      (function* () {
        for (const x of s) yield f(x);
      })(),
    );
  }

  /** Barrier-free: keeps the first occurrence, in encounter order. */
  distinct(): JStream<T> {
    const s = this.open();
    return new JStream(
      (function* () {
        const seen = new Set<string>();
        for (const x of s) {
          const k = structKey(x);
          if (!seen.has(k)) {
            seen.add(k);
            yield x;
          }
        }
      })(),
    );
  }

  limit(n: number): JStream<T> {
    if (n < 0) throw new JavaException('IllegalArgumentException', String(n));
    const s = this.open();
    return new JStream(
      (function* () {
        if (n === 0) return;
        let i = 0;
        for (const x of s) {
          yield x;
          if (++i >= n) return; // do not pull another element
        }
      })(),
    );
  }

  skip(n: number): JStream<T> {
    if (n < 0) throw new JavaException('IllegalArgumentException', String(n));
    const s = this.open();
    return new JStream(
      (function* () {
        let i = 0;
        for (const x of s) if (i++ >= n) yield x;
      })(),
    );
  }

  /** Stable; a barrier (reads everything before emitting). */
  sorted(cmp: (a: T, b: T) => number = naturalCompare): JStream<T> {
    const s = this.open();
    return new JStream(
      (function* () {
        const arr = [...s];
        arr.sort(cmp);
        yield* arr;
      })(),
    );
  }

  count(): number {
    let n = 0;
    for (const _ of this.open()) n++;
    return n;
  }

  toList(): T[] {
    return Object.freeze([...this.open()]) as T[];
  }

  anyMatch(p: (x: T) => boolean): boolean {
    for (const x of this.open()) if (p(x)) return true;
    return false;
  }

  allMatch(p: (x: T) => boolean): boolean {
    for (const x of this.open()) if (!p(x)) return false;
    return true;
  }

  noneMatch(p: (x: T) => boolean): boolean {
    return !this.anyMatch(p);
  }

  findFirst(): JOptional {
    for (const x of this.open()) {
      if (x === null || x === undefined) throw new JavaException('NullPointerException');
      return JOptional.of(x);
    }
    return JOptional.empty();
  }

  flatMap<R>(f: (x: T) => JStream<R>): JStream<R> {
    const s = this.open();
    return new JStream(
      (function* () {
        for (const x of s) {
          const inner = f(x);
          if (inner) yield* inner;
        }
      })(),
    );
  }

  [Symbol.iterator](): Iterator<T> {
    return this.open()[Symbol.iterator]();
  }

  toArray(): T[] {
    return [...this.open()];
  }

  reduce(identity: T, op: (a: T, b: T) => T): T {
    let acc = identity;
    for (const x of this.open()) acc = op(acc, x);
    return acc;
  }

  reduce1(op: (a: T, b: T) => T): JOptional {
    let acc: T | undefined;
    let any = false;
    for (const x of this.open()) {
      acc = any ? op(acc as T, x) : x;
      any = true;
    }
    return any ? JOptional.of(acc) : JOptional.empty();
  }

  /** Stream.max(cmp): the first of equal maxima wins. */
  max(cmp: (a: T, b: T) => number): JOptional {
    return this.reduce1((a, b) => (cmp(a, b) >= 0 ? a : b));
  }

  min(cmp: (a: T, b: T) => number): JOptional {
    return this.reduce1((a, b) => (cmp(a, b) <= 0 ? a : b));
  }

  collect<A, R>(c: Collector<A, R>): R {
    const acc = c.sup();
    for (const x of this.open()) c.acc(acc, x);
    return c.fin(acc);
  }
}
