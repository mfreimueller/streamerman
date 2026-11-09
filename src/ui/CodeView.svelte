<script lang="ts">
  import { toLines, type Tok } from '../lang/print';
  import type { Cursor } from '../builder/edit';

  let {
    tokens, cursor, errors, onselect,
  }: { tokens: Tok[]; cursor: Cursor; errors: Map<number, string>; onselect: (id: number) => void } = $props();

  const lines = $derived(toLines(tokens));
  const keyHandler = (id: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect(id);
    }
  };
</script>

<div class="codeview code" aria-label="Java code">
  {#each lines as line, li (li)}
    <div class="line" style:--ind={line.indent}>
      {#each line.toks as t, ti (ti)}
        {#if 'caret' in t}
          <span class="caret" aria-hidden="true"></span>
        {:else if 'text' in t}
          {#if t.id !== undefined}
            {@const id = t.id}
            <span
              class="tok {t.cls}"
              class:sel={cursor.selected && cursor.nodeId === id}
              class:cur={t.cls === 'hole' && cursor.nodeId === id}
              class:err={errors.has(id)}
              title={errors.get(id)}
              role="button"
              tabindex="0"
              onclick={() => onselect(id)}
              onkeydown={keyHandler(id)}>{t.cls === 'hole' ? '  ' : t.text}</span
            >
          {:else}
            <span class="tok {t.cls}">{t.text}</span>
          {/if}
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  .codeview {
    background: var(--code-bg); border: 1px solid var(--border); border-radius: 10px;
    padding: 10px 8px; font-size: 14px; line-height: 1.9; overflow-x: auto; margin: 8px 0;
  }
  .line {
    white-space: pre-wrap; overflow-wrap: anywhere;
    padding-left: calc(var(--ind) * 2ch + 2ch); text-indent: -2ch;
  }
  .tok { text-indent: 0; border-radius: 4px; }
  span[role='button'] { cursor: pointer; }
  span[role='button']:active { background: var(--sel); }
  .kw { color: var(--kw); font-weight: 600; }
  .method { color: var(--method); }
  .var { color: var(--var); }
  .lit { color: var(--lit); }
  .op, .punct { color: var(--op); }
  .type { color: var(--type); }
  .hole {
    display: inline-block; min-width: 2ch; height: 1.5em; vertical-align: middle;
    border: 1.5px dashed var(--hole); border-radius: 5px; margin: 0 1px;
  }
  .hole.cur { background: var(--sel); border-style: solid; }
  .sel { background: var(--sel); outline: 1.5px solid var(--accent); }
  .err { text-decoration: underline wavy var(--err); text-underline-offset: 3px; }
  .caret {
    display: inline-block; width: 2px; height: 1.3em; vertical-align: middle; margin: 0 1px;
    background: var(--accent); animation: blink 1s steps(2, start) infinite;
  }
  @keyframes blink { to { visibility: hidden; } }
</style>
