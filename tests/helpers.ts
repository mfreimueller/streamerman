import { parseExpr } from '../src/lang/parse';
import { typecheck, type Env } from '../src/lang/check';
import { evaluate } from '../src/lang/eval';
import { ANY, BOOLEAN, DOUBLE, INT, STRING, cls, type JType } from '../src/lang/types';
import { makeUniverse } from '../src/lang/universe';
import type { Stmt } from '../src/lang/ast';

export const U = makeUniverse(
  [
    {
      name: 'Movie',
      fields: [
        { name: 'id', type: INT },
        { name: 'title', type: STRING },
        { name: 'year', type: INT },
        { name: 'genres', type: cls('List', cls('Genre')) },
        { name: 'rating', type: DOUBLE },
      ],
    },
  ],
  [{ name: 'Genre', constants: ['DRAMA', 'HORROR', 'FANTASY'] }],
);

export const movie = (id: number, title: string, year: number, genres: string[], rating: number) => ({
  $rec: 'Movie', id, title, year, genres: genres.map((g) => U.enumValue('Genre', g)), rating,
});

export const MOVIES = [
  movie(1, 'Eraserhead', 1977, ['HORROR', 'FANTASY'], 7.3),
  movie(2, 'The Elephant Man', 1980, ['DRAMA'], 8.2),
  movie(3, 'Dune', 1984, ['DRAMA', 'FANTASY'], 6.3),
];

export const baseEnv = (): Env =>
  new Map<string, JType>([
    ['movies', cls('List', cls('Movie'))],
    ['nums', cls('List', cls('Integer'))],
    ['words', cls('List', STRING)],
    ['year', INT],
    ['g', cls('Genre')],
  ]);

export function compile(src: string, type: JType = ANY, env: Env = baseEnv()) {
  const root = parseExpr(src, U.kindOf);
  const stmt: Stmt = { type, root };
  return { stmt, res: typecheck(stmt, env, U), root };
}

export function run(src: string, values: Record<string, unknown> = {}, type: JType = ANY, env: Env = baseEnv()) {
  const { stmt, res } = compile(src, type, env);
  if (res.errors.length) throw new Error(res.errors.map((e) => e.message).join('; '));
  const vals = new Map(Object.entries({ movies: MOVIES, ...values }));
  return { value: evaluate(stmt.root, vals, res.info, U), type: res.type };
}

export { BOOLEAN };
