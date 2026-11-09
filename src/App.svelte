<script lang="ts">
  import { nav } from './lib/router.svelte';
  import { unitById } from './content';
  import Home from './ui/Home.svelte';
  import UnitPage from './ui/UnitPage.svelte';
  import TaskPage from './ui/TaskPage.svelte';

  const route = $derived(nav.route);
  const unit = $derived(route.name === 'unit' || route.name === 'task' ? unitById(route.unitId) : undefined);
  const task = $derived(route.name === 'task' && unit ? unit.tasks.find((t) => t.id === route.taskId) : undefined);

  $effect(() => {
    const base = 'Streamerman';
    document.title =
      task && unit ? `${task.title} - ${unit.title} - ${base}` : unit && route.name === 'unit' ? `${unit.title} - ${base}` : route.name === 'notfound' ? `Not found - ${base}` : base;
  });
</script>

{#if route.name === 'home'}
  <Home />
{:else if route.name === 'unit' && unit}
  <UnitPage {unit} />
{:else if route.name === 'task' && unit && task}
  {#key unit.id + '/' + task.id}
    <TaskPage {unit} {task} />
  {/key}
{:else}
  <main class="page">
    <h1>Not found</h1>
    <p><a href="#/">Back to start</a></p>
  </main>
{/if}
