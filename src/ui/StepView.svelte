<script lang="ts">
  import type { RunReport } from '../run';

  let { trace }: { trace: NonNullable<RunReport['trace']> } = $props();

  const LIMIT = 6;
  let all = $state<Record<string, boolean>>({});
  let open = $state<Record<string, boolean>>({});
</script>

<section class="steps">
  <div class="title">Step view for the check “{trace.check}”</div>
  {#each trace.stmts as s, si (si)}
    {#if trace.stmts.length > 1}<div class="stmt">Step {si + 1}{s.stepName ? `: ${s.stepName}` : ''}</div>{/if}
    {#each s.ops as op, oi (oi)}
      {@const k = `${si}:${oi}`}
      <div class="op">
        <code class="label">{op.label}</code>
        {#if op.kind === 'stream'}
          <div class="meta">
            {#if op.total !== undefined}
              {op.count} of {op.total} elements read{op.count < op.total ? ' - the stream stopped early' : ''}
            {:else if op.inCount !== undefined}
              {#if oi === 1 && s.ops[0].total !== undefined}saw {op.inCount} of {s.ops[0].total}{:else}got {op.inCount}{/if}
              → {op.count} out
            {:else}
              {op.count} out
            {/if}
          </div>
          {#if op.values.length}
            <div class="vals">
              {#each all[k] ? op.values : op.values.slice(0, LIMIT) as v, vi (vi)}
                {#if op.full[vi] !== v}
                  <button type="button" class="v chip" class:open={open[`${k}:${vi}`]} aria-expanded={!!open[`${k}:${vi}`]} onclick={() => (open[`${k}:${vi}`] = !open[`${k}:${vi}`])}>
                    {open[`${k}:${vi}`] ? op.full[vi] : v}
                  </button>
                {:else}
                  <code class="v">{v}</code>
                {/if}
              {/each}
              {#if op.values.length > LIMIT}
                <button type="button" class="more" onclick={() => (all[k] = !all[k])}>
                  {all[k] ? 'show less' : `show all ${op.values.length}`}
                </button>
              {/if}
            </div>
          {/if}
        {:else}
          <div class="vals"><code class="v">{op.text}</code></div>
        {/if}
      </div>
    {/each}
  {/each}
</section>

<style>
  .steps { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; margin: 8px 0; }
  .title { font-weight: 600; font-size: 0.9rem; }
  .stmt { margin-top: 8px; color: var(--muted); font-size: 0.85rem; font-weight: 600; }
  .op { border-top: 1px solid var(--border); padding: 6px 0; margin-top: 6px; }
  .label { font-size: 13px; color: var(--method); overflow-wrap: anywhere; }
  .meta { font-size: 0.8rem; color: var(--muted); }
  .vals { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; max-height: 40vh; overflow-y: auto; }
  .v { font-size: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 1px 6px; overflow-wrap: anywhere; }
  button.chip { font: 12px var(--font-code); color: inherit; cursor: pointer; text-align: left; min-height: 32px; }
  button.chip.open { flex-basis: 100%; overflow-wrap: anywhere; }
  .more { min-height: 32px; padding: 0 10px; border-radius: 16px; border: 1px solid var(--border); background: var(--card); cursor: pointer; }
</style>
