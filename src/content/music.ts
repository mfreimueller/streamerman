import { mk } from '../lang/members';
import { BOOLEAN, INT, STRING, cls } from '../lang/types';
import { makeUniverse } from '../lang/universe';
import { jmap, jset, none, some } from './build';
import type { Task, Unit } from './types';

export const universe = makeUniverse(
  [{
    name: 'Play',
    fields: [
      { name: 'title', type: STRING },
      { name: 'artist', type: STRING },
      { name: 'genre', type: cls('Genre') },
      { name: 'secondsPlayed', type: INT },
    ],
    extras: [
      mk('Play', 'isSkipped', [], {
        ret: BOOLEAN, eval: (r) => r.secondsPlayed < 30,
        doc: 'True if fewer than 30 seconds were played (the play counts as skipped).', example: 'p.isSkipped()',
      }),
    ],
  }],
  [{ name: 'Genre', constants: ['POP', 'ROCK', 'HIP_HOP', 'JAZZ', 'ELECTRONIC'] }],
);

const g = (n: string) => universe.enumValue('Genre', n);
const play = (title: string, artist: string, genre: string, secondsPlayed: number) => ({ $rec: 'Play', title, artist, genre: g(genre), secondsPlayed });

export const PLAYS = [
  play('Segfault Serenade', 'The Null Pointers', 'ROCK', 245),
  play('Optional.empty()', 'Lambda Lovers', 'POP', 198),
  play('Infinite Loop', 'Stack Overflow', 'ELECTRONIC', 412),
  play('Segfault Serenade', 'The Null Pointers', 'ROCK', 12),
  play('Mark and Sweep', 'Garbage Collectors', 'HIP_HOP', 187),
  play('Optional.empty()', 'Lambda Lovers', 'POP', 198),
  play('Blue Screen Blues', 'The Null Pointers', 'ROCK', 301),
  play('Infinite Loop', 'Stack Overflow', 'ELECTRONIC', 25),
  play('Pure Function', 'Lambda Lovers', 'POP', 176),
  play('Mark and Sweep', 'Garbage Collectors', 'HIP_HOP', 187),
  play('Heap Space', 'Garbage Collectors', 'HIP_HOP', 5),
  play('Take Five Threads', 'The Daemons', 'JAZZ', 324),
];

const TIE_A = play('A', 'X', 'POP', 100);
const TIE_B = play('B', 'Y', 'POP', 100);
const ONE = [play('Only Song', 'Solo', 'JAZZ', 10)];
const none0 = { plays: [] as unknown[] };

const tasks: Task[] = [
  {
    id: 'totalSecondsPlayed',
    title: 'Total seconds played',
    returnType: INT,
    params: [],
    description: 'Calculates how many seconds were listened to in total, over all plays.\n\nReturn 0 if there are no plays.',
    ruleText: 'Use reduce, not sum().',
    forbidden: ['IntStream.sum/0', 'Collectors.summingInt/*'],
    solution: 'plays.stream().map(Play::secondsPlayed).reduce(0, Integer::sum)',
    checks: [
      { name: 'the whole history (README: 2270)', hidden: false, args: [], expected: 2270 },
      { name: 'a single play', hidden: false, args: [], data: { plays: ONE }, expected: 10 },
      { name: 'no plays at all', hidden: true, args: [], data: none0, expected: 0 },
    ],
  },
  {
    id: 'longestPlay',
    title: 'Longest play',
    returnType: cls('Optional', cls('Play')),
    params: [],
    description:
      'Finds the play during which the listener listened to the longest. If several plays share the maximum, the one that comes first in the list wins.\n\n' +
      'Return an empty Optional if there are no plays.',
    ruleText: 'Use reduce, not max(). Tip: BinaryOperator.maxBy keeps the first of equal elements.',
    forbidden: ['Stream.max/1', 'IntStream.max/0', 'Stream.sorted/1', 'Stream.sorted/0'],
    solution: 'plays.stream().reduce(BinaryOperator.maxBy(Comparator.comparingInt(Play::secondsPlayed)))',
    checks: [
      { name: 'the longest of the history', hidden: false, args: [], expected: some(PLAYS[2]) },
      { name: 'a single play', hidden: false, args: [], data: { plays: ONE }, expected: some(ONE[0]) },
      { name: 'the first one wins on a tie', hidden: true, args: [], data: { plays: [TIE_A, TIE_B] }, expected: some(TIE_A) },
      { name: 'no plays at all', hidden: true, args: [], data: none0, expected: none() },
    ],
  },
  {
    id: 'artistOverview',
    title: 'Artist overview',
    returnType: STRING,
    params: [],
    description:
      'Lists every artist exactly once, in alphabetical order, separated by ", " and enclosed in square brackets.\n\n' +
      'Example: "[ABBA, Queen, The Beatles]". Without plays, the result is "[]".',
    solution: 'plays.stream().map(Play::artist).distinct().sorted().collect(Collectors.joining(", ", "[", "]"))',
    checks: [
      { name: 'the whole history', hidden: false, args: [], expected: '[Garbage Collectors, Lambda Lovers, Stack Overflow, The Daemons, The Null Pointers]' },
      { name: 'a single artist', hidden: false, args: [], data: { plays: ONE }, expected: '[Solo]' },
      { name: 'no plays at all', hidden: true, args: [], data: none0, expected: '[]' },
    ],
  },
  {
    id: 'playsPerGenre',
    title: 'Plays per genre',
    returnType: cls('Map', cls('Genre'), cls('Long')),
    params: [],
    description: 'Counts the plays per genre. Genres without any play do not appear in the map.',
    solution: 'plays.stream().collect(Collectors.groupingBy(Play::genre, Collectors.counting()))',
    checks: [
      { name: 'the whole history (README: ROCK=3, POP=3, HIP_HOP=3, ELECTRONIC=2, JAZZ=1)', hidden: false, args: [], expected: jmap([[g('ROCK'), 3], [g('POP'), 3], [g('HIP_HOP'), 3], [g('ELECTRONIC'), 2], [g('JAZZ'), 1]]) },
      { name: 'a single play', hidden: false, args: [], data: { plays: ONE }, expected: jmap([[g('JAZZ'), 1]]) },
      { name: 'no plays at all: an empty map', hidden: true, args: [], data: none0, expected: jmap([]) },
    ],
  },
  {
    id: 'countSkipped',
    title: 'Count skipped plays',
    returnType: cls('Map', cls('Boolean'), cls('Long')),
    params: [],
    description:
      'Counts the skipped and the completed plays (a play with fewer than 30 seconds is skipped, see isSkipped()).\n\n' +
      'Key true: number of skipped plays. Key false: number of all other plays. Both keys are always present, even if there are no plays at all.',
    solution: 'plays.stream().collect(Collectors.partitioningBy(Play::isSkipped, Collectors.counting()))',
    checks: [
      { name: 'the whole history', hidden: false, args: [], expected: jmap([[false, 9], [true, 3]]) },
      { name: 'nothing skipped', hidden: false, args: [], data: { plays: [PLAYS[0], PLAYS[1]] }, expected: jmap([[false, 2], [true, 0]]) },
      { name: 'no plays at all: both keys are still there', hidden: true, args: [], data: none0, expected: jmap([[false, 0], [true, 0]]) },
    ],
  },
  {
    id: 'titlesPerArtist',
    title: 'Titles per artist',
    returnType: cls('Map', STRING, cls('Set', STRING)),
    params: [],
    description: 'Finds out which songs of each artist were played. Every title appears only once per artist, no matter how often it was played.',
    solution: 'plays.stream().collect(Collectors.groupingBy(Play::artist, Collectors.mapping(Play::title, Collectors.toSet())))',
    checks: [
      {
        name: 'the whole history', hidden: false, args: [],
        expected: jmap([
          ['The Null Pointers', jset(['Segfault Serenade', 'Blue Screen Blues'])],
          ['Lambda Lovers', jset(['Optional.empty()', 'Pure Function'])],
          ['Stack Overflow', jset(['Infinite Loop'])],
          ['Garbage Collectors', jset(['Mark and Sweep', 'Heap Space'])],
          ['The Daemons', jset(['Take Five Threads'])],
        ]),
      },
      { name: 'a single play', hidden: false, args: [], data: { plays: ONE }, expected: jmap([['Solo', jset(['Only Song'])]]) },
      { name: 'no plays at all', hidden: true, args: [], data: none0, expected: jmap([]) },
    ],
  },
  {
    id: 'secondsPerArtist',
    title: 'Seconds per artist',
    returnType: cls('Map', STRING, cls('Integer')),
    params: [],
    description: 'Calculates how many seconds were listened to per artist.\n\nCareful: an artist usually appears in more than one play. Look at the overloads of toMap.',
    ruleText: 'Use Collectors.toMap, not groupingBy.',
    forbidden: ['Collectors.groupingBy/*'],
    solution: 'plays.stream().collect(Collectors.toMap(Play::artist, Play::secondsPlayed, Integer::sum))',
    checks: [
      {
        name: 'the whole history', hidden: false, args: [],
        expected: jmap([['The Null Pointers', 558], ['Lambda Lovers', 572], ['Stack Overflow', 437], ['Garbage Collectors', 379], ['The Daemons', 324]]),
      },
      { name: 'a single play', hidden: false, args: [], data: { plays: ONE }, expected: jmap([['Solo', 10]]) },
      { name: 'the same artist twice', hidden: true, args: [], data: { plays: [PLAYS[0], PLAYS[3]] }, expected: jmap([['The Null Pointers', 257]]) },
      { name: 'no plays at all', hidden: true, args: [], data: none0, expected: jmap([]) },
    ],
  },
  {
    id: 'topArtist',
    title: 'Top artist',
    returnType: cls('Optional', STRING),
    params: [],
    description:
      'Finds the artist with the most plays. Skipped plays do not count. If two or more artists share the highest count, the one whose name comes first in alphabetical order wins.\n\n' +
      'Return an empty Optional if there is no play that was not skipped.',
    ruleText: 'Solve it in two steps. What do you need to know first?',
    steps: [
      { name: 'playsPerArtist', type: cls('Map', STRING, cls('Long')), description: 'Count the plays per artist (skipped plays do not count). With a TreeMap the artists come out in alphabetical order.' },
      { type: cls('Optional', STRING), description: 'Pick the artist with the highest count; the first of equal counts wins.' },
    ],
    solution: [
      'plays.stream().filter(p -> !p.isSkipped()).collect(Collectors.groupingBy(Play::artist, TreeMap::new, Collectors.counting()))',
      'playsPerArtist.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey)',
    ],
    checks: [
      { name: 'the whole history (README: Lambda Lovers)', hidden: false, args: [], expected: some('Lambda Lovers') },
      { name: 'a single play', hidden: false, args: [], data: { plays: [play('S', 'Solo', 'POP', 100)] }, expected: some('Solo') },
      { name: 'skipped plays do not count', hidden: true, args: [], data: { plays: [play('a', 'Amy', 'POP', 5), play('a', 'Amy', 'POP', 6), play('a', 'Amy', 'POP', 7), play('b', 'Bob', 'POP', 100)] }, expected: some('Bob') },
      { name: 'a tie: the alphabetically first artist wins', hidden: true, args: [], data: { plays: [play('z', 'Zed', 'POP', 100), play('a', 'Amy', 'POP', 100)] }, expected: some('Amy') },
      { name: 'only skipped plays', hidden: true, args: [], data: { plays: [play('a', 'Amy', 'POP', 5)] }, expected: none() },
      { name: 'no plays at all', hidden: true, args: [], data: none0, expected: none() },
    ],
  },
];


export const yearInMusic: Unit = {
  id: 'music',
  title: 'Year in Music',
  blurb: 'Listening statistics with reduce and the Collectors: groupingBy, partitioningBy, toMap, joining.',
  scenario:
    'A music streaming app shows your "year in music": how long you listened, your favourite genres. ' +
    'You write the service that calculates these statistics from a listening history, the list plays. ' +
    'A play with fewer than 30 seconds counts as skipped (isSkipped()).',
  universe,
  context: [{ name: 'plays', type: cls('List', cls('Play')), value: PLAYS, description: 'the listening history' }],
  suggestions: [],
  tasks,
};
