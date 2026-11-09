<script lang="ts">
  import { tick } from 'svelte';
  import type { Task, Unit } from '../content/types';
  import { bindingsOf, signatureOf, stepsOf } from '../content/types';
  import { solutionProgram } from '../content/solution';
  import { complete, type CItem } from '../builder/complete';
  import { clearAll, initState, restoreState, selectStmt, setCursor, undo, type Cursor, type EditorState } from '../builder/edit';
  import { rootHint } from '../builder/hint';
  import { checkProgram } from '../lang/check';
  import { stmtTokens, toJava } from '../lang/print';
  import { show, type JType } from '../lang/types';
  import { describeProblems, runTask, taskEnv, type RunReport } from '../run';
  import { hrefUnit } from '../lib/router.svelte';
  import { loadAttempt, markSolved, saveAttempt } from '../lib/progress.svelte';
  import CodeView from './CodeView.svelte';
  import CompletionPanel from './CompletionPanel.svelte';
  import CheckReport from './CheckReport.svelte';
  import DataTable from './DataTable.svelte';

  let { unit, task }: { unit: Unit; task: Task } = $props();

  const steps = $derived(stepsOf(task));
  const fresh = () => initState(stepsOf(task).map((x) => ({ name: x.name, type: x.type })));
  const initial = () => {
    const saved = loadAttempt(unit.id, task);
    return saved ? restoreState(saved) : fresh();
  };
  let st = $state.raw<EditorState>(initial());
  let report = $state.raw<RunReport | null>(null);
  let collapsed = $state(false);
  let chip = $state<string | null>(null);
  let reportEl = $state<HTMLElement>();

  const NO_CURSOR: Cursor = { nodeId: -1, mode: 'append' };
  const env = $derived(taskEnv(unit, task));
  const results = $derived(checkProgram(st.program, env, unit.universe));
  const res = $derived(results[st.stmtIndex]);
  const comp = $derived(
    complete(st, res, { u: unit.universe, forbidden: task.forbidden, stringSuggestions: unit.suggestions, constructors: task.constructors }),
  );
  const notes = $derived(
    results.flatMap((r, i) => {
      const label = results.length > 1 ? `Step ${i + 1}: ` : '';
      const h = rootHint(st.program.stmts[i], r, unit.universe, task.forbidden);
      if (h) return [{ hint: true, text: label + h }];
      return describeProblems(r).map((m) => ({ hint: false, text: label + m }));
    }),
  );
  const problems = $derived(notes.map((n) => n.text));
  // Mismatches with the expected type are only shown once the code is complete and not being extended.
  const cards = $derived(
    st.program.stmts.map((s, i) => {
      const r = results[i];
      const active = i === st.stmtIndex;
      const c = st.cursor;
      return {
        stmt: s,
        tokens: stmtTokens(s, { caretAfter: active && c.mode === 'append' && !c.selected ? c.nodeId : undefined }),
        errors: new Map(
          r.errors
            .filter((e) => {
              if (!r.info.get(e.id)?.mismatch) return true;
              if (e.id === s.root.id) return false;
              return !r.incomplete && !(active && c.nodeId === e.id && c.mode === 'append' && !c.selected);
            })
            .map((e) => [e.id, e.message]),
        ),
      };
    }),
  );
  const index = $derived(unit.tasks.findIndex((t) => t.id === task.id));
  const nextTaskId = $derived(unit.tasks[index + 1]?.id);
  const solution = $derived(solutionProgram(unit, task).stmts.map((x) => toJava(x)).join('\n'));
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
  const select = (id: number, step = st.stmtIndex) => {
    st = setCursor(selectStmt(st, step), id, true);
    collapsed = false;
  };
  const activate = (i: number) => {
    st = selectStmt(st, i);
    collapsed = false;
  };

  // keep the last attempt of every task (all steps)
  $effect(() => {
    saveAttempt(unit.id, task, st.program);
  });

  async function run() {
    report = runTask(unit, task, st.program);
    collapsed = true;
    if (report.allPassed) markSolved(unit.id, task.id);
    await tick();
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    reportEl?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
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

    {#if cards.length === 1}
      <CodeView tokens={cards[0].tokens} cursor={st.cursor} errors={cards[0].errors} onselect={(id) => select(id)} />
    {:else}
      {#each cards as c, i (i)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="step" class:active={i === st.stmtIndex} onclick={() => i !== st.stmtIndex && activate(i)}>
          <button type="button" class="stephead" onclick={(e) => { e.stopPropagation(); activate(i); }}>
            <strong>Step {i + 1} of {cards.length}</strong>
            <span class="muted">{steps[i].description}</span>
          </button>
          <CodeView tokens={c.tokens} cursor={i === st.stmtIndex ? st.cursor : NO_CURSOR} errors={c.errors} onselect={(id) => select(id, i)} />
        </div>
      {/each}
    {/if}

    {#each notes as n (n.text)}
      <p class="why" class:hint={n.hint}>{n.text}</p>
    {:else}
      <p class="why okmsg">Looks complete. Press Run.</p>
    {/each}

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
  .step { border: 1px solid var(--border); border-radius: 12px; padding: 6px 8px 0; margin: 10px 0; background: var(--card); }
  .step.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .stephead { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; min-height: 40px; background: none; border: 0; padding: 4px 2px; text-align: left; cursor: pointer; font-size: 0.85rem; }
  .step :global(.codeview) { margin: 4px 0 8px; }
  .why { margin: 4px 2px; font-size: 0.85rem; color: var(--err); }
  .why.hint { color: var(--muted); }
  .slim { display: flex; gap: 10px; align-items: center; min-height: 48px; padding: 0 12px; border: 0; border-top: 1px solid var(--border); background: var(--card); cursor: pointer; text-align: left; }
  .slimtitle { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .why.okmsg { color: var(--ok); }
  .actions { display: flex; gap: 8px; padding: 6px 12px; background: var(--card); border-top: 1px solid var(--border); }
</style>
