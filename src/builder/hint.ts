// A neutral hint for "type-correct so far, but not the declared result type yet".
import type { Stmt } from '../lang/ast';
import type { CheckResult } from '../lang/check';
import { memberId, membersOf } from '../lang/members';
import { assignable, show } from '../lang/types';
import type { Universe } from '../lang/universe';

/** Set when the code is complete and the only error is the root's mismatch with the declared type. */
export function rootHint(stmt: Stmt, res: CheckResult, u: Universe, forbidden: string[] = []): string | null {
  if (res.incomplete || res.errors.length !== 1) return null;
  const e = res.errors[0];
  if (e.id !== stmt.root.id || !res.info.get(e.id)?.mismatch) return null;
  const ty = res.type;
  const fit = membersOf(ty, u).find(
    (m) => m.tag === 'terminal' && !forbidden.includes(memberId(m)) && assignable(m.ret(ty, m.args(ty, u), u), stmt.type),
  );
  const tail = fit ? `; finish with an operation such as ${fit.name}()` : '';
  return `Result is still ${show(ty)}. Expected ${show(stmt.type)}${tail}.`;
}
