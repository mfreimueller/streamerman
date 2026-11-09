# Streamerman: Spec

A mobile-first learning app for practising the Java Stream API on a smartphone, without a laptop
and without typing code by hand.

## 1. Objective

Students of 3xHIF (POS) practise the stream exercises from class (units 02–05) on their phone.
Instead of typing, they build Java code from tokens with an IntelliJ-style completion popup. The
code runs in the browser against the exercise data and is checked like a JUnit test.

**Primary user:** a student without a working laptop, who needs to practise before the next exam.
**Secondary users:** the rest of the class (same app, no extra setup).

**Success looks like:** the student can solve every stream method of the three projects on a phone,
in a reasonable time, and the code they see is the code they would write in IntelliJ.

### In scope

- Stream tasks from:
  - **02 Movie Archive** (`MovieService` methods)
  - **05 Year in Music** (`ListeningStatsService`, all 8 methods)
  - **03a Space Mission** (stream logic of `findBestConnectedAstronauts`, as guided steps)
- **Operation drills:** short single-concept tasks on simple data (numbers, words, small records).
- Practice only. No exam mode, no timer.

### Out of scope

- Backend, logins, teacher dashboard, progress sync between devices.
- Non-stream exam parts: designing records/enums/result types, writing JUnit tests, theory
  questions, exceptions for invalid arguments, JSON loading (`MovieRepository`), parsing invalid
  genre input.
- Free typing of code, a general Java parser.
- Units 1001/1002 (real exams), coin kata, concept quizzes, predict-the-output, loop→stream.

## 2. Decisions

| Topic | Decision |
|---|---|
| Platform | Static SPA, mobile first, works on desktop too |
| Stack | Svelte 5 + Vite + TypeScript, Vitest for tests |
| Hosting | GitHub Pages, deployed by a GitHub Actions workflow |
| Persistence | `localStorage` only (progress + last attempt per task); app works if it is unavailable |
| Language | English (UI and tasks) |
| Java level | Java 17+: records with accessors (`m.title()`), `Stream.toList()`, enums |
| Input | Token builder with type-aware completions and tooltips |
| Checking | Run the student's code in a TS engine; compare results to expected values |
| Hidden checks | Yes: edge cases (empty list, ties, …) revealed only when they fail |
| Rules like "use reduce" | Enforced: forbidden operations are not offered |
| Multi-step tasks | Guided named steps; later steps can use earlier results |
| Feedback | Expected vs. actual per check, plus a step-through view of the pipeline |
| Ordering | Everything unlocked; suggested order: drills → 02 → 05 → 03a |

## 3. User experience

### 3.1 Screens

1. **Home:** list of units (Drills, Movie Archive, Year in Music, Space Mission) with progress
   (`3/8 solved`).
2. **Unit:** short scenario text, data table (collapsible), list of tasks with checkmarks.
3. **Task:** the main screen (see below).

Navigation by hash routes (`#/unit/movies/task/titlesReleasedAfter`) so links and the back button
work on GitHub Pages.

### 3.2 Task screen (portrait phone, 360 px width minimum)

From top to bottom:

1. **Header:** method signature, e.g. `List<String> titlesReleasedAfter(int year)`, and the task
   text. Collapsible.
2. **Context chips:** what is available: `movies` (`List<Movie>`), parameters (`year`), earlier
   step results, a link to the data table and the record definition (`record Movie(int id, String
   title, …)`).
3. **Code view:** the Java code as text with syntax highlighting, read-only. One line per stream
   operation, like IntelliJ formatting. The cursor (a **hole**) shows where the next token goes.
   Tapping any token selects it; selected tokens can be replaced or deleted.
4. **Completion panel:** fixed to the bottom, above the thumb. Lists what fits the current hole,
   IntelliJ-style: name, signature, return type, e.g.
   `filter(Predicate<? super Movie>)   Stream<Movie>`.
   A long press (or ⓘ) opens a **tooltip**: one-sentence explanation plus a tiny example.
5. **Value pad:** when the hole expects a literal, a small pad for numbers, or a string input with
   suggestions taken from the data (directors, titles, genres).
6. **Actions:** `Undo`, `Clear`, `Run`.

### 3.3 After Run

- A list of checks, like a JUnit report: ✅ / ❌ per check, with the call
  (`titlesReleasedAfter(2000)`), expected value and actual value.
- Hidden checks only show up when they fail, with a name that explains the edge case
  ("no movies at all", "two artists tied").
- Compile-style errors (incomplete code, type mismatch) are shown before running, at the hole
  that causes them; Run is disabled while holes are left.
- Runtime errors are shown like Java exceptions (`NoSuchElementException: No value present`,
  `IllegalStateException: Duplicate key …`).
- **Step view** (for the first visible check): for each operation, the elements after that step
  (count + values, scrollable). Shows laziness where it matters (`limit`, `findFirst` stop early).
- When all checks pass: success message, the task is marked solved, button to the next task.
  A "Compare with model solution" toggle shows the reference solution.

## 4. Token builder

### 4.1 Model

The code is an **expression tree with typed holes**, not text. Every node knows its static Java
type. The completion panel lists the nodes that may fill the current hole given the expected type.
The code view is a pretty-printer over the tree.

A task's code is either:
- a **return expression** (`return movies.stream()…;`), or
- for guided steps, one expression per step, each assigned to a named local variable
  (`String topDirector = …;`), with the final step being the `return`.

### 4.2 Types

Supported static types:

- Primitives: `int`, `long`, `double`, `boolean`; boxed `Integer`, `Long`, `Double`, `Boolean`
  (auto-boxing between them as Java does).
- `String`, enums (`Genre`, `Status`, `Role`), domain records (`Movie`, `Play`, `Mission`,
  `Astronaut`) and drill records.
- Generics: `List<T>`, `Set<T>`, `Map<K,V>`, `Map.Entry<K,V>`, `Optional<T>`, `Stream<T>`,
  `IntStream`, `DoubleStream`, `OptionalInt`, `OptionalDouble`, `Comparator<T>`, `Collector<…>`
  (internal), functional types for lambdas (`Predicate<T>`, `Function<T,R>`, `BinaryOperator<T>`, …).

Type inference must be good enough that every completion offered leads to compiling Java. Where
Java's inference would fail (e.g. `Comparator.comparing(m -> m.title()).reversed()`), the builder
either avoids offering that combination or offers the explicitly typed form
(`Comparator.comparing(Movie::title).reversed()`).

### 4.3 Supported constructs

**Sources:** `list.stream()`, `Stream.of(…)` (drills), `map.entrySet().stream()`,
`list.size()`, `map.get(k)`, `map.keySet()`/`values()`.

**Intermediate:** `filter`, `map`, `mapToInt`, `mapToDouble`, `mapToObj`, `boxed`, `flatMap`,
`distinct`, `sorted()`, `sorted(Comparator)`, `limit`, `skip`, `peek`.

**Terminal:** `toList`, `collect`, `count`, `forEach` (drills only, prints to an output panel),
`findFirst`, `findAny`, `anyMatch`, `allMatch`, `noneMatch`, `min`, `max`, `reduce` (identity +
accumulator, accumulator only), `sum`, `average`, `getAsDouble`, `orElse`, `orElseThrow`.

**Optional:** `map`, `filter`, `orElse`, `orElseThrow`, `isPresent`, `get` (offered but flagged
in its tooltip).

**Collectors:** `toList`, `toSet`, `joining` (0/1/3 args), `counting`, `summingInt`,
`averagingDouble`, `mapping`, `groupingBy` (1/2 args, 3 args with `TreeMap::new`),
`partitioningBy` (1/2 args), `toMap` (2/3 args, 4 args with `TreeMap::new`/`LinkedHashMap::new`).

**Comparators:** `Comparator.comparing(f)`, `comparingInt`, `comparingDouble`,
`.reversed()`, `.thenComparing(f)`, `Comparator.naturalOrder()`/`reverseOrder()`,
`Map.Entry.comparingByKey()`/`comparingByValue()`.

**Lambda bodies** (single expression, no blocks):
- parameter accessors (`m.title()`), record helper methods (`p.isSkipped()`), chained calls on
  the result (`m.genres().contains(…)`, `s.length()`, `s.toUpperCase()`, `s.startsWith(…)`,
  `e.getKey()`)
- comparison `== != < <= > >=`, `.equals(…)` for objects, arithmetic `+ - * / %`,
  `&& || !`, ternary `?:` (drills), literals, parameters and step variables, enum constants.
- Two-parameter lambdas for `reduce` and `toMap` merge functions (`(a, b) -> a + b`).

**Method references:** `Movie::title`, `String::length`, `Integer::sum`, `Math::max`,
`String::toUpperCase`, `Function.identity()`. Offered alongside the lambda form; both produce the
same tree semantics.

Equality: `==` on `String` or records is offered (it is a classic mistake) but behaves as in Java:
reference comparison. Data strings are treated as distinct objects (as when loaded from JSON in
the Movie Archive), so the mistake fails visibly. Tooltip explains it.

### 4.4 Completion behaviour

- Ranking: most likely items first (per hole type), then alphabetical. A search field filters the
  list (typing a few letters is fine on a phone).
- Items that don't fit the expected type are not shown.
- Items forbidden by the task (`forbidden: ["sum", "max"]`) are not shown; if the student asks
  why (a hint row "Why is `sum` missing?"), the task's rule text is shown.
- Every item has a tooltip: signature, one sentence, a mini example. Tooltips are written once
  per API member, not per task.

## 5. Engine

A TypeScript interpreter for the expression tree that mirrors `java.util.stream` semantics.

- **Lazy, element-by-element evaluation** with short-circuiting (`limit`, `findFirst`,
  `anyMatch`, …), stateful `sorted`/`distinct` as barriers. Single use: reusing a stream throws
  `IllegalStateException`.
- **Java values:** `int` overflow and integer division, `long` vs `int`, `double` formatting as
  Java prints it (`7.73` vs `7.733333333333333`), `null` handling where Java would throw
  `NullPointerException`.
- **Java equality:** `equals`/`hashCode` for `String`, boxed numbers, enums, records, `List`,
  `Set`, `Map`. `==` is reference equality (except primitives and enums).
- **Collections:** `List` (immutable from `toList()`, mutable from `Collectors.toList()`),
  `HashSet`/`HashMap`, `TreeMap`, `LinkedHashMap`. Checks compare with `equals()`, so the
  iteration order of hash-based collections never decides a check. For display, `HashMap`/`HashSet`
  with `String`/number keys use Java's bucket order (`String.hashCode`, same spreading and table
  size), so it looks like IntelliJ output. Enum keys have identity hash codes in Java, so their
  order is not stable there either; they are shown in declaration order.
- **Exceptions** as Java names them: `NoSuchElementException`, `IllegalStateException` (duplicate
  key in `toMap`, stream reuse), `NullPointerException`, `ArithmeticException`.
- **Trace:** while running the first visible check, the engine records what passes through each
  operation, for the step view.
- **Printing:** `toString` as Java (`[a, b]`, `{k=v}`, `Optional[x]`, `Optional.empty`,
  `Movie[id=1, title=Eraserhead, …]`).
- Pure module, no DOM, fully unit-tested (Vitest).

## 6. Content

### 6.1 Task format

Tasks are TypeScript modules (typed, checked at build time), one file per unit:

```ts
interface Task {
  id: string;                    // "titlesReleasedAfter"
  title: string;                 // shown in lists
  signature: string;             // "List<String> titlesReleasedAfter(int year)"
  description: string;           // Markdown, from README/JavaDoc
  params: Param[];               // name + type, e.g. { name: "year", type: "int" }
  context: Binding[];            // fields available, e.g. movies: List<Movie>
  steps?: Step[];                // guided steps; absent = one return expression
  forbidden?: string[];          // API members not offered, with a reason
  ruleText?: string;             // "Use reduce, not sum()."
  solution: Expr | Step[];       // model solution as a tree (also used to verify checks)
  checks: Check[];
}

interface Step { name: string; type: string; description: string; }

interface Check {
  name: string;                  // "released after 2000" / "no movies at all"
  hidden: boolean;
  data?: DataOverride;           // replaces the unit data (e.g. empty list, custom plays)
  args: unknown[];               // parameter values
  expected: JavaValue;           // compared with Java equals()
}
```

Expected values are **not** written by hand: a build-time test runs every model solution through
the engine and compares it with the expected value in the task. Both must agree, and the README's
example results must appear among the visible checks.

### 6.2 Units and tasks

**Drills** (~15–20 tasks, small data: `List<Integer>`, `List<String>`, a small `record Student`):
one concept each: `filter`, `map`, `filter`+`map`, `sorted`, `sorted` with comparator, `distinct`,
`limit`/`skip`, `count`, `anyMatch`/`allMatch`, `findFirst` + `orElse`, `mapToInt().sum()`,
`average`, `flatMap`, `reduce`, `joining`, `groupingBy` + `counting`, `partitioningBy`, `toMap`.

**02 Movie Archive** (data: the 14 movies; `Movie` is a record, `genres` is `List<Genre>` with an
enum `Genre` – the solution the README hints at):

| Task | Notes |
|---|---|
| `Optional<Movie> findById(int id)` | `filter` + `findFirst` |
| `long countByGenre(Genre genre)` | |
| `List<String> titlesReleasedAfter(int year)` | |
| `List<String> titlesByDirector(String director)` | `equals`, not `==` |
| `long countWellRated(double minRating, int minVotes)` | |
| `int totalRuntimeOfGenre(Genre genre)` | `mapToInt` + `sum` |
| `List<String> titlesOfMostFrequentDirector()` | 2 steps: `String topDirector`, then titles |
| `List<Movie> moviesOfGenreWithHighestAverageRating()` | 2 steps: `Genre bestGenre`, then movies |

**05 Year in Music** (data: the 12 plays): all 8 methods with the JavaDoc rules.
`totalSecondsPlayed` and `longestPlay` forbid `sum`/`max`; `secondsPerArtist` forbids
`groupingBy`; `topArtist` has 2 steps.

**03a Space Mission** (data: the 9 missions; enums `Status`, `Role` given). Result type given:
`record Connection(String name, Map<String, List<String>> colleagues)` (colleague name → mission
codes, `TreeMap` for alphabetical order). Guided steps, roughly:

1. `List<Mission> launched`: missions with status `TRAVELING`, `COMPLETED` or `FAILED`.
2. `Set<String> names`: all astronaut names on launched missions.
3. A helper task `Map<String, List<String>> colleaguesOf(String name)`: for one astronaut, each
   colleague with the mission codes, in mission order.
4. `List<Connection> result`: one `Connection` per name, without empty ones, sorted by
   colleague count desc then name, limited to `n`.

The exact step split is fixed during implementation, after solving it in the builder myself;
the README's example result (`findBestConnectedAstronauts(3)`) is a visible check.

## 7. Project structure

```
src/
  engine/        Java value model, types, stream interpreter, collectors, printing (no DOM)
  builder/       expression tree, typed holes, completion catalogue, tooltips, pretty-printer
  content/       drills.ts, movies.ts, music.ts, missions.ts (+ data)
  ui/            Svelte components: Home, Unit, Task, CodeView, CompletionPanel, ValuePad,
                 CheckReport, StepView
  lib/           routing, storage
tests/           Vitest: engine, builder, content (every model solution passes its checks)
.github/workflows/pages.yml
```

## 8. Commands

```
npm install
npm run dev        # local dev server (open on phone via LAN with --host)
npm test           # Vitest
npm run check      # svelte-check + tsc
npm run build      # static build into dist/
```

## 9. Testing strategy

- **Engine:** unit tests per operation and collector, against outputs verified with real Java
  (a small set of expected strings captured from `jshell` and stored as fixtures).
- **Builder:** completion lists per hole type; every offered completion produces a well-typed
  tree; pretty-printer output for representative trees.
- **Content:** every task's model solution passes all its checks; README example results are
  present; forbidden members are absent from the model solution.
- **Manual:** each slice is tried on a real phone (or 360 px device emulation) before it is
  called done.

## 10. Boundaries

- **Always:** keep the engine faithful to Java (when unsure, verify with `jshell`); keep the
  displayed code valid Java 17; run `npm test` and `npm run check` before committing.
- **Ask first:** adding dependencies beyond Svelte/Vite/Vitest/TypeScript; changing task content
  away from the original assignments; adding a backend or analytics.
- **Never:** collect personal data; load third-party scripts at runtime; offer completions that
  produce non-compiling Java.

## 11. Acceptance criteria

1. On a 360 px wide phone, a student can solve `titlesReleasedAfter` from an empty task to green
   checks using only taps (plus the number pad), without horizontal page scrolling.
2. Completions only offer type-correct items; each has a tooltip.
3. Every task in §6.2 exists and its model solution passes all its checks.
4. A wrong solution shows expected vs. actual and the step view; hidden checks appear on failure.
5. Forbidden operations are not offered in tasks that forbid them.
6. Progress survives a page reload; the app still works with `localStorage` blocked.
7. `npm run build` produces a static site; the Pages workflow deploys it.
8. Engine output matches Java for every check value in the content (`toString`, double
   formatting, map order where Java's order is deterministic).

## 12. Open questions

- Exact split of the Space Mission steps (decided while implementing, see §6.2).
