<script lang="ts">
  import type { CItem, Completion, LiteralItem } from '../builder/complete';

  let { comp, onapply }: { comp: Completion; onapply: (item: CItem, value?: string) => void } = $props();

  let query = $state('');
  let info = $state<string | null>(null);
  let values = $state<Record<string, string>>({});
  let errors = $state<Record<string, string>>({});

  const q = $derived(query.trim().toLowerCase());
  const groups = $derived(
    comp.groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => i.kind === 'literal' || !q || i.label.toLowerCase().includes(q) || i.detail.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length),
  );

  const key = (gi: number, ii: number) => `${gi}:${ii}`;

  function submit(item: LiteralItem, k: string, raw?: string) {
    const v = raw ?? values[k] ?? '';
    const err = item.validate(v);
    if (err || (item.litType !== 'String' && !v.trim())) {
      errors[k] = err ?? 'Enter a value';
      return;
    }
    onapply(item, v);
  }
  const toggleSign = (k: string) => {
    const v = values[k] ?? '';
    values[k] = v.startsWith('-') ? v.slice(1) : `-${v}`;
  };
</script>

<section class="panel" aria-label="Completions">
  <header>
    <div class="title">{comp.title}</div>
    <input class="search" type="search" placeholder="Search…" bind:value={query} aria-label="Search completions" autocomplete="off" autocapitalize="off" />
  </header>
  <div class="list">
    {#each groups as g, gi (g.title + gi)}
      <div class="gtitle">{g.title}</div>
      {#each g.items as item, ii (item.label + ii)}
        {@const k = key(gi, ii)}
        {#if item.kind === 'literal'}
          <div class="lit">
            <div class="litrow">
              <span class="lbl code">{item.label}</span>
              <input
                class="litin"
                inputmode={item.litType === 'String' ? 'text' : item.litType === 'double' ? 'decimal' : 'numeric'}
                placeholder={item.litType === 'String' ? 'text' : 'number'}
                autocomplete="off"
                autocapitalize="off"
                bind:value={values[k]}
                oninput={() => (errors[k] = '')}
                onkeydown={(e) => e.key === 'Enter' && submit(item, k)}
              />
              {#if item.litType !== 'String'}
                <button type="button" class="btn small" onclick={() => toggleSign(k)} aria-label="Toggle minus sign">±</button>
              {/if}
              <button type="button" class="btn primary small" onclick={() => submit(item, k)}>OK</button>
            </div>
            {#if errors[k]}<div class="msg">{errors[k]}</div>{/if}
            {#if item.suggestions.length}
              <div class="sugg">
                {#each item.suggestions.filter((s) => !(values[k] ?? '').trim() || s.toLowerCase().includes((values[k] ?? '').trim().toLowerCase())) as s (s)}
                  <button type="button" class="chip" onclick={() => submit(item, k, s)}>{s}</button>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <div class="item">
            <button type="button" class="main" onclick={() => onapply(item)}>
              <span class="lbl code">{item.label}</span>
              <span class="det code">{item.detail}</span>
            </button>
            {#if item.doc}
              <button type="button" class="ibtn" aria-label="Explain {item.label}" aria-expanded={info === k} onclick={() => (info = info === k ? null : k)}>ⓘ</button>
            {/if}
          </div>
          {#if info === k}
            <div class="tip">
              {#if item.signature}<code class="code sig">{item.signature}</code>{/if}
              <p>{item.doc}</p>
              {#if item.example}<code class="code ex">{item.example}</code>{/if}
            </div>
          {/if}
        {/if}
      {/each}
    {:else}
      <p class="muted pad">Nothing matches “{query}”.</p>
    {/each}
  </div>
</section>

<style>
  .panel {
    height: 45dvh; min-height: 220px; display: flex; flex-direction: column;
    background: var(--card); border-top: 1px solid var(--border); box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
  }
  header { padding: 8px 12px 6px; display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid var(--border); }
  .title { font-weight: 600; font-size: 0.9rem; font-family: var(--font-code); overflow-wrap: anywhere; }
  .search {
    width: 100%; height: 40px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--bg); color: var(--fg); padding: 0 10px; font-size: 16px;
  }
  .list { overflow-y: auto; flex: 1; overscroll-behavior: contain; padding-bottom: 8px; }
  .gtitle {
    position: sticky; top: 0; background: var(--bg); color: var(--muted); font-size: 0.75rem;
    padding: 4px 12px; font-family: var(--font-code); overflow-wrap: anywhere; z-index: 1;
  }
  .item { display: flex; align-items: stretch; border-bottom: 1px solid var(--border); }
  .main {
    flex: 1; min-width: 0; min-height: 44px; display: flex; align-items: center; gap: 10px;
    background: none; border: 0; padding: 4px 12px; text-align: left; cursor: pointer;
  }
  .main:active { background: var(--sel); }
  .lbl { font-size: 14px; overflow-wrap: anywhere; }
  .det { margin-left: auto; color: var(--muted); font-size: 12px; text-align: right; overflow-wrap: anywhere; max-width: 55%; }
  .ibtn { width: 44px; min-height: 44px; background: none; border: 0; color: var(--accent); font-size: 1.1rem; cursor: pointer; }
  .tip { background: var(--bg); padding: 8px 14px 10px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
  .tip p { margin: 4px 0; }
  .sig { display: block; font-size: 12.5px; overflow-wrap: anywhere; }
  .ex { display: block; font-size: 12.5px; color: var(--muted); overflow-wrap: anywhere; }
  .lit { padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .litrow { display: flex; align-items: center; gap: 8px; }
  .litin {
    flex: 1; min-width: 0; height: 44px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--bg); color: var(--fg); padding: 0 10px; font-size: 16px;
  }
  .btn.small { min-height: 44px; padding: 0 12px; }
  .msg { color: var(--err); font-size: 0.85rem; margin-top: 4px; }
  .sugg { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .chip {
    min-height: 40px; padding: 0 12px; border-radius: 20px; border: 1px solid var(--border);
    background: var(--bg); cursor: pointer;
  }
  .pad { padding: 12px; }
</style>
