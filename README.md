# Streamerman

A mobile-first web app for practising the Java Stream API on a phone. Students build Java code from
tappable tokens (no typing). A completion list offers what fits the current gap, the code runs in the
browser against the exercise data, and the result is checked like a JUnit test.

Units: operation drills, Movie Archive, Year in Music. The full specification is in [SPEC.md](SPEC.md).

## Run, test, build

```
npm install
npm run dev        # dev server; add -- --host to open it on a phone via the LAN
npm test           # Vitest (engine, type checker, builder, content, fixtures)
npm run check      # svelte-check + tsc
npm run build      # static site in dist/
npm run preview    # serve dist/
```

The app is a static SPA with hash routes (`#/unit/movies/task/titlesReleasedAfter`) and `base: './'`,
so it works under any sub path. Progress (solved marks and the last attempt of every task) is stored in
`localStorage` under the key prefix `streamerman:v1:`; the app works with storage blocked.

## How it works

| Folder | Content |
|---|---|
| `src/lang/` | Java types, expression tree with typed holes, type checker, parser (only for model solutions), printer, interpreter, member catalogue |
| `src/engine/` | Java value model (HashMap order, `Double.toString`), lazy streams, collectors, step tracer |
| `src/builder/` | editor state with undo, completions, hints |
| `src/content/` | units and tasks |
| `src/ui/`, `src/lib/` | Svelte components, router, storage |
| `tests/` | Vitest; `tests/fixtures/` holds output captured from real Java |

## Adding a task

Tasks live in `src/content/<unit>.ts` and follow the `Task` type in `src/content/types.ts`:

```ts
{
  id: 'titlesReleasedAfter',            // also the method name
  title: 'Titles released after a year',
  returnType: cls('List', STRING),
  params: [{ name: 'year', type: INT }],
  description: 'Returns the titles of all movies released after year.',
  forbidden: ['Stream.count/0', 'Collectors.groupingBy/*'], // members not offered; `/*` = every arity
  ruleText: 'Use reduce, not sum().',                       // optional, shown in red
  solution: 'movies.stream().filter(m -> m.year() > year).map(Movie::title).toList()',
  checks: [
    { name: 'after 2000', hidden: false, args: [2000], expected: [/* ... */] },
    { name: 'no movies at all', hidden: true, args: [2000], data: { movies: [] }, expected: [] },
  ],
}
```

- The **model solution** is Java source of the returned expression, parsed by `src/lang/parse.ts`.
  Static types: `Comparator`, `Collectors`, `Map.Entry`, `Function.identity()`, `BinaryOperator.maxBy`,
  `List.of`, `new Record(...)`, typed lambdas `(Movie m) -> ...`. There is no ternary operator.
- **Multi-step tasks**: add `steps: [{ name: 'topDirector', type: STRING, description }, { type: returnType, description }]`
  (the last step is the `return`, without a name) and make `solution` an array with one expression per step.
- **Checks** compare with Java `equals()`. Expected values are plain JS values: numbers, strings, arrays,
  `jmap([...])` / `jset([...])` / `some(x)` / `none()` from `src/content/build.ts`, enum constants from
  `universe.enumValue(...)`. `data` replaces context values (for example an empty list). Hidden checks are
  only shown when they fail.
- `tests/content.test.ts` runs every model solution through the type checker and all checks, and verifies
  that it does not use forbidden members. Add a new unit to `src/content/index.ts`.

## Fixtures from real Java

`tests/fixtures/java-output.json` holds the output of representative pipelines, captured with `jshell`
(HashMap printing, double formatting, collectors, exception messages). The engine tests compare against it.
It is committed; regenerate it only when you add cases:

```
# cases: tools/java-fixtures/cases.json, data: tools/java-fixtures/prelude.jsh
JSHELL=/path/to/jdk/bin/jshell node tools/java-fixtures/gen.mjs
```

`npm test` never runs jshell.

## Deployment

`.github/workflows/pages.yml` runs `npm ci`, the tests and the build on every push to `main` and deploys
`dist/` to GitHub Pages. It needs a GitHub remote and the repository setting
**Settings > Pages > Source: GitHub Actions**.
