// Small helpers to write expected values and data in content files.
import { JMap, JOptional, JSet, type CollKind } from '../engine/values';

export const jmap = (pairs: [unknown, unknown][], kind: CollKind = 'hash') => {
  const m = new JMap(kind);
  pairs.forEach(([k, v]) => m.put(k, v));
  return m;
};
export const jset = (items: unknown[], kind: CollKind = 'hash') => {
  const s = new JSet(kind);
  items.forEach((x) => s.add(x));
  return s;
};
export const some = (v: unknown) => JOptional.of(v);
export const none = () => JOptional.empty();
