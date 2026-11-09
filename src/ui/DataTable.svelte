<script lang="ts">
  import { toJavaString, isRecord } from '../engine/values';
  import type { Universe } from '../lang/universe';

  let { rows, universe }: { rows: unknown[]; universe: Universe } = $props();
  const first = $derived(rows.find(isRecord));
  const def = $derived(first ? universe.records[first.$rec] : undefined);
</script>

{#if def}
  <div class="tablewrap">
    <table class="data">
      <thead><tr>{#each def.fields as f (f.name)}<th>{f.name}</th>{/each}</tr></thead>
      <tbody>
        {#each rows as r, i (i)}
          <tr>
            {#each def.fields as f (f.name)}
              <td>{isRecord(r) ? toJavaString(r[f.name], f.type, universe) : ''}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <code class="code">[{rows.join(', ')}]</code>
{/if}
