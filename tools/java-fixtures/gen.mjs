// Regenerates tests/fixtures/java-output.json by running every case in cases.json in jshell.
// Not part of `npm test`; the generated file is committed. Usage: node tools/java-fixtures/gen.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const JSHELL = process.env.JSHELL ?? '/Users/mf/.sdkman/candidates/java/current/bin/jshell';
const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const prelude = readFileSync(new URL('./prelude.jsh', import.meta.url), 'utf8');

const exprs = cases.map((c) => (typeof c === 'string' ? c : c.expr));
const body = exprs
  .map(
    (c, i) =>
      `System.out.println("@@${i}");\ntry { Object r = ${c}; System.out.println(r); } catch (Exception e) { System.out.println(e.getClass().getSimpleName() + ": " + e.getMessage()); }`,
  )
  .join('\n');
const dir = mkdtempSync(join(tmpdir(), 'jshell-'));
const file = join(dir, 'run.jsh');
writeFileSync(file, `${prelude}\n${body}\n/exit\n`);
const out = execFileSync(JSHELL, ['--feedback', 'silent', file], { encoding: 'utf8' });
const results = exprs.map((expr, i) => {
  const start = out.indexOf(`@@${i}\n`);
  const next = i + 1 < exprs.length ? out.indexOf(`@@${i + 1}\n`) : out.length;
  return { ...(typeof cases[i] === 'string' ? {} : { unit: cases[i].unit }), expr, java: out.slice(start + `@@${i}\n`.length, next).replace(/\n$/, '') };
});
writeFileSync(new URL('../../tests/fixtures/java-output.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
console.log(`wrote ${results.length} fixtures`);
