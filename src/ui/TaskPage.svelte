<script lang="ts">
  import { tick } from 'svelte';
  import type { Task, Unit } from '../content/types';
  import { bindingsOf, signatureOf } from '../content/types';
  import { complete, type CItem } from '../builder/complete';
  import { clearAll, currentStmt, initState, setCursor, undo, type EditorState } from '../builder/edit';
  import { rootHint } from '../builder/hint';
  import { typecheck } from '../lang/check';
  import { parseExpr } from '../lang/parse';
  import { stmtTokens, toJava } from '../lang/print';
  import { show, type JType } from '../lang/types';
  import { describeProblems, runTask, taskEnv, type RunReport } from '../run';
  import { hrefUnit } from '../lib/router.svelte';
  import { markSolved } from '../lib/progress.svelte';
  import CodeView from './CodeView.svelte';
  import CompletionPanel from './CompletionPanel.svelte';
  import CheckReport from './CheckReport.svelte';
  import DataTable from './DataTable.svelte';

  let { unit, task }: { unit: Unit; task: Task } = $props();

  const fresh = () => initState([{ type: task.returnType }]);
  let st = $state.raw<EditorState>(fresh());
  let report = $state.raw<RunReport | null>(null);
  let collapsed = $state(false);
  let chip = $state<string | null>(null);
  let reportEl = $state<HTMLElement>();

  const env = $derived(taskEnv(unit, task));
  const stmt = $derived(currentStmt(st));
  const res = $derived(typecheck(stmt, env, unit.universe));
  const comp = $derived(
    complete(st, res, { u: unit.universe, forbidden: task.forbidden, stringSuggestions: unit.suggestions }),
  );
  const problems = $derived(describeProblems(res));
  const hint = $derived(rootHint(stmt, res, unit.universe, task.forbidden));
  const tokens = $derived(
    stmtTokens(stmt, {
      caretAfter: st.cursor.mode === 'append' && !st.cursor.selected ? st.cursor.nodeId : undefined,
    }),
  );
  // Mismatches with the expected type are only shown once the code is complete and not being extended.
  const errorMap = $derived(
    new Map(
      res.errors
        .filter((e) => {
          if (!res.info.get(e.id)?.mismatch) return true;
          if (e.id === stmt.root.id) return false;
          return !res.incomplete && !(st.cursor.nodeId === e.id && st.cursor.mode === 'append' && !st.cursor.selected);
        })
        .map((e) => [e.id, e.message]),
    ),
  );
  const index = $derived(unit.tasks.findIndex((t) => t.id === task.id));
  const nextTaskId = $derived(unit.tasks[index + 1]?.id);
  const solution = $derived(
    toJava({ type: task.returnType, root: parseExpr(task.solution, unit.universe.kindOf) }),
  );
  const bindings = $derived(
    [
      ...bindingsOf(unit, task).map((b) => ({ name: b.name, type: b.type, text: b.description ?? 'context value', value: b.value as unknown })),
      ...task.params.map((p) => ({ name: p.name, type: p.type, text: 'parameter', value: undefined as unknown })),
    ],
  );
  const chipData = $derived(bindings.find((b) => b.name === chip));

  const mentions = (t: JType): boolean =>
    t.k === 'cls' && (!!unit.universe.records[t.n] || !!unit.universe.enums[t.n] || t.a.some(mentions));
  const defs = $derived([
    ...Object.values(unit.universe.records).map(
      (r) => `record ${r.name}(${r.fields.map((f) => `${show(f.type)} ${f.name}`).join(', ')})`,
    ),
    ...Object.values(unit.universe.enums).map((e) => `enum ${e.name} { ${e.constants.join(', ')} }`),
  ]);

  function apply(item: CItem, value?: string) {
    st = item.kind === 'literal' ? item.apply(st, value ?? '') : item.apply(st);
    report = null;
  }
  const select = (id: number) => ((st = setCursor(st, id, true)), (collapsed = false));

  async function run() {
    report = runTask(unit, task, st.program);
    collapsed = true;
    if (report.allPassed) markSolved(unit.id, task.id);
    await tick();
    reportEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
</script>

<div class="task">
  <div class="top">
    <a class="back" href={hrefUnit(unit.id)} aria-label="Back to {unit.title}">←</a>
    <strong class="ttl">{task.title}</strong>
  </div>

  <div class="scroll">
    <details open class="head">
      <summary><code class="code sig">{signatureOf(task)}</code></summary>
      {#each task.description.split('\n\n') as para (para)}
        <p>{para}</p>
      {/each}
      {#if task.ruleText}<p class="rule">{task.ruleText}</p>{/if}
    </details>

    <div class="chips">
      {#each bindings as b (b.name)}
        <button type="button" class="chip code" class:active={chip === b.name} onclick={() => (chip = chip === b.name ? null : b.name)}>
          {b.name} : {show(b.type)}
        </button>
      {/each}
    </div>
    {#if chipData}
      <div class="chipinfo">
        <div class="muted">{chipData.text}</div>
        {#if mentions(chipData.type)}
          {#each defs as d (d)}<code class="code def">{d}</code>{/each}
        {/if}
        {#if Array.isArray(chipData.value)}
          <details>
            <summary>Data ({chipData.value.length} rows)</summary>
            <DataTable rows={chipData.value} universe={unit.universe} />
          </details>
        {/if}
      </div>
    {/if}

    <CodeView {tokens} cursor={st.cursor} errors={errorMap} onselect={select} />

    {#if hint}
      <p class="why hint">{hint}</p>
    {:else if problems.length}
      <p class="why">{problems.join(' · ')}</p>
    {:else}
      <p class="why okmsg">Looks complete. Press Run.</p>
    {/if}

    <div bind:this={reportEl}>
      {#if report}
        <CheckReport {report} unitId={unit.id} {nextTaskId} {solution} />
      {/if}
    </div>
  </div>

  <div class="actions">
    <button type="button" class="btn" onclick={() => ((st = undo(st)), (report = null), (collapsed = false))} disabled={!st.history.length}>Undo</button>
    <button type="button" class="btn" onclick={() => ((st = clearAll(st)), (report = null), (collapsed = false))} disabled={!st.history.length}>Clear all</button>
    <span class="spacer"></span>
    <button type="button" class="btn primary" onclick={run} disabled={problems.length > 0} title={problems.join(' · ')}>▶ Run</button>
  </div>

  {#if collapsed}
    <button type="button" class="slim" onclick={() => (collapsed = false)}>
      <span>Edit code ▴</span><span class="slimtitle code">{comp.title}</span>
    </button>
  {:else}
  {#key st.cursor.nodeId + ':' + st.history.length + ':' + (st.cursor.selected ? 's' : '')}
    <CompletionPanel {comp} onapply={apply} />
  {/key}
  {/if}
</div>

<style>
  .task { height: 100dvh; display: flex; flex-direction: column; max-width: 720px; margin: 0 auto; }
  .top { display: flex; align-items: center; gap: 8px; padding: 0 8px; min-height: 48px; border-bottom: 1px solid var(--border); background: var(--card); }
  .back { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; text-decoration: none; font-size: 1.3rem; }
  .ttl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scroll { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 8px 12px; overscroll-behavior: contain; }
  .head p { margin: 6px 0; }
  .sig { font-size: 13px; overflow-wrap: anywhere; }
  .rule { color: var(--err); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .chip {
    min-height: 40px; padding: 0 10px; border-radius: 20px; border: 1px solid var(--border);
    background: var(--card); font-size: 12.5px; cursor: pointer; max-width: 100%; overflow-wrap: anywhere;
  }
  .chip.active { border-color: var(--accent); background: var(--sel); }
  .chipinfo { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; margin: 4px 0; font-size: 0.9rem; }
  .def { display: block; font-size: 12.5px; margin: 4px 0; overflow-wrap: anywhere; }
  .why { margin: 4px 2px; font-size: 0.85rem; color: var(--err); }
  .why.hint { color: var(--muted); }
  .slim { display: flex; gap: 10px; align-items: center; min-height: 48px; padding: 0 12px; border: 0; border-top: 1px solid var(--border); background: var(--card); cursor: pointer; text-align: left; }
  .slimtitle { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .why.okmsg { color: var(--ok); }
  .actions { display: flex; gap: 8px; padding: 6px 12px; background: var(--card); border-top: 1px solid var(--border); }
</style>
