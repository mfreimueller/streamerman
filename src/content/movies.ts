import { some, none } from './build';
import { DOUBLE, INT, LONG, STRING, cls } from '../lang/types';
import { makeUniverse } from '../lang/universe';
import type { Task, Unit } from './types';

export const universe = makeUniverse(
  [{
    name: 'Movie',
    fields: [
      { name: 'id', type: INT },
      { name: 'title', type: STRING },
      { name: 'year', type: INT },
      { name: 'genres', type: cls('List', cls('Genre')) },
      { name: 'rating', type: DOUBLE },
      { name: 'votes', type: INT },
      { name: 'director', type: STRING },
      { name: 'runtimeMinutes', type: INT },
      { name: 'country', type: STRING },
    ],
  }],
  [{
    name: 'Genre',
    constants: ['DRAMA', 'MYSTERY', 'HORROR', 'THRILLER', 'SCI_FI', 'ADVENTURE', 'CRIME', 'DOCUMENTARY', 'ROMANCE', 'FANTASY'],
  }],
);

const g = (name: string) => universe.enumValue('Genre', name);

function mv(id: number, title: string, year: number, genres: string[], rating: number, votes: number, director: string, runtimeMinutes: number, country: string) {
  return { $rec: 'Movie', id, title, year, genres: genres.map(g), rating, votes, director, runtimeMinutes, country };
}

export const MOVIES = [
  mv(1, 'Eraserhead', 1977, ['HORROR', 'FANTASY'], 7.3, 135000, 'David Lynch', 89, 'USA'),
  mv(2, 'The Elephant Man', 1980, ['DRAMA'], 8.2, 260000, 'David Lynch', 124, 'UK'),
  mv(3, 'Dune', 1984, ['SCI_FI', 'ADVENTURE'], 6.3, 150000, 'David Lynch', 137, 'USA'),
  mv(4, 'Blue Velvet', 1986, ['MYSTERY', 'THRILLER', 'CRIME'], 7.7, 220000, 'David Lynch', 120, 'USA'),
  mv(5, 'Wild at Heart', 1990, ['CRIME', 'DRAMA', 'ROMANCE'], 7.2, 85000, 'David Lynch', 124, 'USA'),
  mv(6, 'Twin Peaks: Fire Walk with Me', 1992, ['MYSTERY', 'DRAMA', 'HORROR'], 7.3, 110000, 'David Lynch', 135, 'USA'),
  mv(7, 'Lost Highway', 1997, ['MYSTERY', 'THRILLER'], 7.5, 150000, 'David Lynch', 134, 'USA'),
  mv(8, 'The Straight Story', 1999, ['DRAMA'], 8.0, 100000, 'David Lynch', 112, 'USA'),
  mv(9, 'Mulholland Drive', 2001, ['MYSTERY', 'THRILLER', 'DRAMA'], 7.9, 400000, 'David Lynch', 147, 'France'),
  mv(10, 'Inland Empire', 2006, ['MYSTERY', 'HORROR'], 6.8, 85000, 'David Lynch', 180, 'USA'),
  mv(11, 'David Lynch: The Art Life', 2016, ['DOCUMENTARY'], 8.1, 4500, 'Jon Nguyen', 89, 'USA'),
  mv(12, 'Dune', 2021, ['SCI_FI', 'ADVENTURE', 'DRAMA'], 8.0, 850000, 'Denis Villeneuve', 155, 'Canada'),
  mv(13, 'The Fabelmans', 2022, ['DRAMA'], 7.5, 100000, 'Steven Spielberg', 151, 'USA'),
  mv(14, 'Lynch/Oz', 2022, ['DOCUMENTARY'], 7.0, 3100, 'Alexandre O. Philippe', 108, 'USA'),
];

const ALL_TITLES = MOVIES.map((m) => m.title);
const LYNCH_TITLES = MOVIES.filter((m) => m.director === 'David Lynch').map((m) => m.title);
const TWO = MOVIES.slice(0, 2);
const gen = (n: string) => g(n);
const film = (id: number, genres: string[], rating: number) => mv(id, `F${id}`, 2000, genres, rating, 1000, 'D', 90, 'X');
const HI = [film(1, ['HORROR'], 9), film(2, ['DRAMA'], 7), film(3, ['DRAMA'], 8)];
const AVG = [film(1, ['DRAMA'], 6), film(2, ['DRAMA'], 6), film(3, ['DRAMA'], 6), film(4, ['CRIME'], 8)];
const TIE = [film(1, ['ROMANCE'], 7), film(2, ['FANTASY'], 7)];
const MULTI = [film(1, ['CRIME', 'DRAMA'], 9), film(2, ['CRIME'], 5)];

const tasks: Task[] = [
  {
    id: 'countByGenre',
    title: 'Count movies of a genre',
    returnType: LONG,
    params: [{ name: 'genre', type: cls('Genre') }],
    description: 'Counts the number of movies with the given genre.\n\nA movie can have several genres; it counts if the given genre is one of them.',
    solution: 'movies.stream().filter(m -> m.genres().contains(genre)).count()',
    checks: [
      { name: 'Drama (README: 7 movies)', hidden: false, args: [gen('DRAMA')], expected: 7 },
      { name: 'Mystery', hidden: false, args: [gen('MYSTERY')], expected: 5 },
      { name: 'Horror', hidden: true, args: [gen('HORROR')], expected: 3 },
      { name: 'Romance has only one movie', hidden: true, args: [gen('ROMANCE')], expected: 1 },
      { name: 'no movie has this genre', hidden: true, args: [gen('SCI_FI')], data: { movies: TWO }, expected: 0 },
      { name: 'no movies at all', hidden: true, args: [gen('DRAMA')], data: { movies: [] }, expected: 0 },
    ],
  },
  {
    id: 'titlesReleasedAfter',
    title: 'Titles released after a year',
    returnType: cls('List', STRING),
    params: [{ name: 'year', type: INT }],
    description: 'Returns the titles of all movies that were released after year.\n\nKeep the order of the data.',
    solution: 'movies.stream().filter(m -> m.year() > year).map(Movie::title).toList()',
    checks: [
      { name: 'after 2000', hidden: false, args: [2000], expected: ['Mulholland Drive', 'Inland Empire', 'David Lynch: The Art Life', 'Dune', 'The Fabelmans', 'Lynch/Oz'] },
      { name: 'after 2021', hidden: false, args: [2021], expected: ['The Fabelmans', 'Lynch/Oz'] },
      { name: 'after the last year there is nothing', hidden: true, args: [2022], expected: [] },
      { name: 'a very early year returns all titles', hidden: true, args: [1900], expected: ALL_TITLES },
      { name: 'no movies at all', hidden: true, args: [2000], data: { movies: [] }, expected: [] },
    ],
  },
  {
    id: 'titlesByDirector',
    title: 'Titles by director',
    returnType: cls('List', STRING),
    params: [{ name: 'director', type: STRING }],
    description: 'Returns the titles of all movies that were directed by director.\n\nCompare Strings with equals, not with ==.',
    solution: 'movies.stream().filter(m -> m.director().equals(director)).map(Movie::title).toList()',
    checks: [
      { name: 'David Lynch', hidden: false, args: ['David Lynch'], expected: LYNCH_TITLES },
      { name: 'Denis Villeneuve', hidden: false, args: ['Denis Villeneuve'], expected: ['Dune'] },
      { name: 'unknown director', hidden: true, args: ['Nobody'], expected: [] },
      { name: 'upper and lower case differ', hidden: true, args: ['david lynch'], expected: [] },
      { name: 'no movies at all', hidden: true, args: ['David Lynch'], data: { movies: [] }, expected: [] },
    ],
  },
  {
    id: 'countWellRated',
    title: 'Count well rated movies',
    returnType: LONG,
    params: [{ name: 'minRating', type: DOUBLE }, { name: 'minVotes', type: INT }],
    description: 'Returns the count of all movies that have a minimum rating of minRating and at least minVotes votes.\n\nBoth limits are inclusive.',
    solution: 'movies.stream().filter(m -> m.rating() >= minRating && m.votes() >= minVotes).count()',
    checks: [
      { name: 'rating 8.0, 100000 votes', hidden: false, args: [8.0, 100000], expected: 3 },
      { name: 'rating 7.5, 150000 votes', hidden: false, args: [7.5, 150000], expected: 5 },
      { name: 'both limits are inclusive', hidden: true, args: [7.5, 100000], expected: 7 },
      { name: 'no limits count everything', hidden: true, args: [0.0, 0], expected: 14 },
      { name: 'nothing is rated that high', hidden: true, args: [10.0, 0], expected: 0 },
      { name: 'no movies at all', hidden: true, args: [7.0, 0], data: { movies: [] }, expected: 0 },
    ],
  },
];


const ORDER = ['findById', 'countByGenre', 'titlesReleasedAfter', 'titlesByDirector', 'countWellRated', 'totalRuntimeOfGenre', 'titlesOfMostFrequentDirector', 'moviesOfGenreWithHighestAverageRating'];
tasks.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

export const movieArchive: Unit = {
  id: 'movies',
  title: 'Movie Archive',
  blurb: 'Statistics over 14 movies: the MovieService methods from class.',
  scenario:
    'You develop the service layer of a movie streaming platform. The service works on a list of movies ' +
    '(in the real project it comes from repository.findAll(); here it is simply the field movies). ' +
    'Each Movie is a record; its genres are a List of the enum Genre.',
  universe,
  context: [{ name: 'movies', type: cls('List', cls('Movie')), value: MOVIES, description: 'all movies in the archive' }],
  suggestions: ['David Lynch', 'Denis Villeneuve', 'Steven Spielberg', 'Jon Nguyen', 'Alexandre O. Philippe'],
  tasks,
};
