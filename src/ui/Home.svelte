<script lang="ts">
  import { units } from '../content';
  import { hrefUnit } from '../lib/router.svelte';
  import { solvedCount } from '../lib/progress.svelte';
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
</main>
