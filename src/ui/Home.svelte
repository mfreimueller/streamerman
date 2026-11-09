<script lang="ts">
  import { units } from '../content';
  import { hrefUnit } from '../lib/router.svelte';
  import { resetProgress, solvedCount } from '../lib/progress.svelte';

  let confirming = $state(false);
  const doReset = () => {
    resetProgress();
    confirming = false;
  };
</script>

<main class="page">
  <h1>Streamerman</h1>
  <p class="muted">Practise the Java Stream API by tapping, not typing.</p>
  {#each units as unit (unit.id)}
    <a class="card" href={hrefUnit(unit.id)}>
      <div class="row">
        <h2>{unit.title}</h2>
        <span class="spacer"></span>
        <span class="badge">{solvedCount(unit)}/{unit.tasks.length} tasks</span>
      </div>
      <div class="muted">{unit.blurb}</div>
    </a>
  {/each}

  <div class="reset">
    {#if confirming}
      <p>Delete all solved marks and saved code on this device?</p>
      <div class="row">
        <button type="button" class="btn danger" onclick={doReset}>Yes, reset everything</button>
        <button type="button" class="btn" onclick={() => (confirming = false)}>Cancel</button>
      </div>
    {:else}
      <button type="button" class="btn" onclick={() => (confirming = true)}>Reset progress</button>
    {/if}
  </div>
</main>

<style>
  .reset { margin-top: 28px; padding-top: 12px; border-top: 1px solid var(--border); }
  .danger { background: var(--err); color: #fff; border-color: var(--err); }
</style>
