import { complete, type CItem, type CompleteCtx, type Completion } from '../src/builder/complete';
import { currentStmt, initState, type EditorState } from '../src/builder/edit';
import { typecheck, type Env } from '../src/lang/check';
import { toJavaFlat } from '../src/lang/print';
import { STRING, cls, type JType } from '../src/lang/types';
import type { Universe } from '../src/lang/universe';
import { U, baseEnv } from './helpers';

export class B {
  s: EditorState;
  constructor(type: JType = cls('List', STRING), public ctx: CompleteCtx = { u: U }, public env: Env = baseEnv(), public u: Universe = U) {
    this.s = initState([{ type }]);
  }
  res() { return typecheck(currentStmt(this.s), this.env, this.u); }
  comp(): Completion { return complete(this.s, this.res(), this.ctx); }
  items(): CItem[] { return this.comp().groups.flatMap((g) => g.items); }
  labels(group?: string) {
    const c = this.comp();
    return c.groups.filter((g) => !group || g.title.startsWith(group)).flatMap((g) => g.items.map((i) => i.label));
  }
  pick(label: string, group?: string) {
    const c = this.comp();
    const it = c.groups.filter((g) => !group || g.title.startsWith(group)).flatMap((g) => g.items).find((i) => i.label === label);
    if (!it) throw new Error(`No item '${label}'. Have: ${this.labels().join(' | ')}`);
    if (it.kind !== 'item') throw new Error('literal');
    this.s = it.apply(this.s);
    return this;
  }
  lit(value: string) {
    const it = this.items().find((i) => i.kind === 'literal');
    if (!it || it.kind !== 'literal') throw new Error('no literal item');
    this.s = it.apply(this.s, value);
    return this;
  }
  code() { return toJavaFlat(currentStmt(this.s).root); }
}

