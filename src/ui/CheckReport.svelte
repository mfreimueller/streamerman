<script lang="ts">
  import type { RunReport } from '../run';
  import { hrefTask, hrefUnit } from '../lib/router.svelte';
  import StepView from './StepView.svelte';

  let {
    report, unitId, nextTaskId, solution,
  }: { report: RunReport; unitId: string; nextTaskId?: string; solution: string } = $props();

  let showSolution = $state(false);
  let showSteps = $state(false);
  const shown = $derived(report.checks.filter((c) => !c.hidden || !c.passed));
  const passedCount = $derived(report.checks.filter((c) => c.passed).length);
</script>

<section class="report" aria-live="polite">
  {#if report.problems.length}
    <div class="bad">Cannot run yet: {report.problems.join('; ')}</div>
  {:else}
    {#if report.allPassed}
      <div class="ok">
        <strong>All {report.checks.length} checks passed.</strong>
        <div class="row actions">
          {#if nextTaskId}
            <a class="btn primary" href={hrefTask(unitId, nextTaskId)}>Next task →</a>
          {:else}
            <a class="btn primary" href={hrefUnit(unitId)}>Back to the unit</a>
          {/if}
          <button type="button" class="btn" onclick={() => (showSolution = !showSolution)}>
            {showSolution ? 'Hide' : 'Show'} model solution
          </button>
        </div>
        {#if showSolution}<pre class="sol">{solution}</pre>{/if}
      </div>
    {:else}
      <div class="bad">{passedCount} of {report.checks.length} checks passed.</div>
    {/if}
    <ul>
      {#each shown as c (c.name)}
        <li class:fail={!c.passed}>
          <div class="head">
            <span aria-hidden="true">{c.passed ? '✅' : '❌'}</span>
            <span class="sr">{c.passed ? 'passed' : 'failed'}:</span>
            <span>{c.hidden ? 'Hidden check — ' : ''}{c.name}</span>
          </div>
          <code class="code call">{c.call}</code>
          {#if !c.passed}
            <div class="cmp code">
              {#each c.steps as sv (sv.name)}<div><span class="k">{sv.name}</span> = {sv.text}</div>{/each}
              <div><span class="k">expected</span> {c.expectedText}</div>
              {#if c.error}
                <div class="exc"><span class="k">threw</span> {c.error}</div>
              {:else}
                <div><span class="k">actual</span> {c.actualText}</div>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    {#if report.trace}
      {#if !report.trace.passed || showSteps}
        <StepView trace={report.trace} />
      {/if}
      {#if report.trace.passed}
        <button type="button" class="btn" onclick={() => (showSteps = !showSteps)}>{showSteps ? 'Hide' : 'Show'} steps</button>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .report { margin: 8px 0 16px; }
  .ok { background: var(--ok-bg); color: var(--ok); border-radius: 10px; padding: 12px; }
  .bad { background: var(--err-bg); color: var(--err); border-radius: 10px; padding: 10px 12px; }
  .actions { flex-wrap: wrap; margin-top: 8px; }
  .sol { margin: 10px 0 0; padding: 10px; background: var(--card); color: var(--fg); border-radius: 8px; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
  ul { list-style: none; margin: 8px 0 0; padding: 0; }
  li { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; margin: 6px 0; }
  li.fail { border-color: var(--err); }
  .head { display: flex; gap: 6px; align-items: baseline; }
  .call { display: block; font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
  .cmp { font-size: 13px; margin-top: 4px; overflow-wrap: anywhere; }
  .k { color: var(--muted); display: inline-block; min-width: 6.5ch; }
  .exc { color: var(--err); }
  .sr { position: absolute; left: -9999px; }
</style>
