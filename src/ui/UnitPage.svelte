<script lang="ts">
  import type { Unit } from '../content/types';
  import { signatureOf } from '../content/types';
  import { hrefHome, hrefTask } from '../lib/router.svelte';
  import { isSolved } from '../lib/progress.svelte';
  import { show } from '../lang/types';
  import DataTable from './DataTable.svelte';

  let { unit }: { unit: Unit } = $props();
  const tables = $derived(unit.context.filter((b) => Array.isArray(b.value)));
</script>

<main class="page">
  <p><a href={hrefHome()}>← All units</a></p>
  <h1>{unit.title}</h1>
  <p>{unit.scenario}</p>

  {#each tables as b (b.name)}
    <details>
      <summary>Data: <code>&nbsp;{b.name} : {show(b.type)}</code>&nbsp;({(b.value as unknown[]).length} rows)</summary>
      <DataTable rows={b.value as unknown[]} universe={unit.universe} />
    </details>
  {/each}

  <h2>Tasks</h2>
  {#each unit.tasks as t (t.id)}
    <a class="card" href={hrefTask(unit.id, t.id)}>
      <div class="row">
        <strong>{t.title}</strong>
        <span class="spacer"></span>
        <span aria-label={isSolved(unit.id, t.id) ? 'solved' : 'open'}>{isSolved(unit.id, t.id) ? '✅' : '○'}</span>
      </div>
      <code class="code muted" style="font-size:0.8rem">{signatureOf(t)}</code>
    </a>
  {/each}
</main>
