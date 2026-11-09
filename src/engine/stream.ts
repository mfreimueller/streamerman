// Lazy Java-like stream over JS generators. Single use.
import { JavaException, JOptional, isEnum, structKey } from './values';

const REUSE = 'stream has already been operated upon or closed';

export function naturalCompare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (isEnum(a) && isEnum(b)) return a.ordinal - b.ordinal;
  throw new JavaException('ClassCastException', 'class cannot be cast to class java.lang.Comparable');
}

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
}
