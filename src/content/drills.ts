import { BOOLEAN, INT, LONG, STRING, cls } from '../lang/types';
import { makeUniverse } from '../lang/universe';
import type { Task, Unit } from './types';

const universe = makeUniverse(
  [{
    name: 'Student',
    fields: [
      { name: 'name', type: STRING },
      { name: 'age', type: INT },
      { name: 'className', type: STRING },
    ],
  }],
  [],
);

const ints = cls('List', cls('Integer'));
const strs = cls('List', STRING);
const student = (name: string, age: number, className: string) => ({ $rec: 'Student', name, age, className });

const numbers = (value: number[], description = 'the numbers to work with') => ({ name: 'numbers', type: ints, value, description });
const words = (value: string[]) => ({ name: 'words', type: strs, value, description: 'the words to work with' });

const WORDS = ['stream', 'map', 'filter', 'limit', 'of'];

const tasks: Task[] = [
  {
    id: 'evenNumbers',
    title: 'Even numbers',
    returnType: ints,
    params: [],
    context: [numbers([3, 8, 5, 12, 7, 10])],
    description: 'Return only the even numbers, in their original order.\n\nHint: n % 2 is the remainder of a division by 2.',
    solution: 'numbers.stream().filter(n -> n % 2 == 0).toList()',
    checks: [
      { name: 'mixed numbers', hidden: false, args: [], expected: [8, 12, 10] },
      { name: 'only odd numbers', hidden: false, args: [], data: { numbers: [1, 3, 5] }, expected: [] },
      { name: 'no numbers at all', hidden: true, args: [], data: { numbers: [] }, expected: [] },
      { name: 'negative numbers and zero', hidden: true, args: [], data: { numbers: [-4, -3, 0, 2] }, expected: [-4, 0, 2] },
    ],
  },
  {
    id: 'shout',
    title: 'Words in upper case',
    returnType: strs,
    params: [],
    context: [words(['stream', 'map', 'filter'])],
    description: 'Return every word in upper case.',
    solution: 'words.stream().map(String::toUpperCase).toList()',
    checks: [
      { name: 'three words', hidden: false, args: [], expected: ['STREAM', 'MAP', 'FILTER'] },
      { name: 'mixed case', hidden: false, args: [], data: { words: ['Java', 'sTrEaM'] }, expected: ['JAVA', 'STREAM'] },
      { name: 'no words at all', hidden: true, args: [], data: { words: [] }, expected: [] },
    ],
  },
  {
    id: 'countLongWords',
    title: 'Count long words',
    returnType: LONG,
    params: [{ name: 'minLength', type: INT }],
    context: [words(WORDS)],
    description: 'Count the words that have at least minLength characters.',
    solution: 'words.stream().filter(s -> s.length() >= minLength).count()',
    checks: [
      { name: 'at least 5 characters', hidden: false, args: [5], expected: 3 },
      { name: 'at least 6 characters', hidden: false, args: [6], expected: 2 },
      { name: 'exactly the length of a word counts', hidden: true, args: [3], expected: 4 },
      { name: 'nothing is that long', hidden: true, args: [100], expected: 0 },
      { name: 'no words at all', hidden: true, args: [1], data: { words: [] }, expected: 0 },
    ],
  },
  {
    id: 'doubledAbove',
    title: 'Doubled numbers above a limit',
    returnType: ints,
    params: [{ name: 'limit', type: INT }],
    context: [numbers([3, 8, 5, 12, 7, 10])],
    description: 'Keep the numbers that are greater than limit and return each of them doubled.',
    solution: 'numbers.stream().filter(n -> n > limit).map(n -> n * 2).toList()',
    checks: [
      { name: 'limit 6', hidden: false, args: [6], expected: [16, 24, 14, 20] },
      { name: 'limit 10', hidden: false, args: [10], expected: [24] },
      { name: 'a number equal to the limit is not above it', hidden: true, args: [8], expected: [24, 20] },
      { name: 'nothing above', hidden: true, args: [12], expected: [] },
      { name: 'no numbers at all', hidden: true, args: [0], data: { numbers: [] }, expected: [] },
    ],
  },
  {
    id: 'anyStartsWith',
    title: 'Any word starting with a letter',
    returnType: BOOLEAN,
    params: [{ name: 'letter', type: STRING }],
    context: [words(['stream', 'filter', 'map'])],
    description: 'Is there at least one word that starts with the given letter (upper and lower case differ)?',
    solution: 'words.stream().anyMatch(s -> s.startsWith(letter))',
    checks: [
      { name: 'a word starts with "s"', hidden: false, args: ['s'], expected: true },
      { name: 'no word starts with "x"', hidden: false, args: ['x'], expected: false },
      { name: 'case matters', hidden: true, args: ['S'], expected: false },
      { name: 'no words at all', hidden: true, args: ['s'], data: { words: [] }, expected: false },
    ],
  },
  {
    id: 'firstDistinct',
    title: 'First n distinct numbers',
    returnType: ints,
    params: [{ name: 'n', type: INT }],
    context: [numbers([3, 8, 3, 5, 8, 12, 5])],
    description: 'Remove duplicates, then return only the first n numbers.',
    solution: 'numbers.stream().distinct().limit(n).toList()',
    checks: [
      { name: 'first 3', hidden: false, args: [3], expected: [3, 8, 5] },
      { name: 'more than there are', hidden: false, args: [10], expected: [3, 8, 5, 12] },
      { name: 'n is 0', hidden: true, args: [0], expected: [] },
      { name: 'only duplicates', hidden: true, args: [2], data: { numbers: [4, 4, 4] }, expected: [4] },
      { name: 'no numbers at all', hidden: true, args: [2], data: { numbers: [] }, expected: [] },
    ],
  },
  {
    id: 'adultNames',
    title: 'Names of adults',
    returnType: strs,
    params: [],
    context: [{
      name: 'students',
      type: cls('List', cls('Student')),
      description: 'the students of a class',
      value: [student('Anna', 17, '3AHIF'), student('Ben', 18, '3BHIF'), student('Cleo', 21, '3AHIF'), student('Dora', 16, '3BHIF')],
    }],
    description: 'Return the names of all students who are at least 18 years old.',
    solution: 'students.stream().filter(s -> s.age() >= 18).map(Student::name).toList()',
    checks: [
      { name: 'two adults', hidden: false, args: [], expected: ['Ben', 'Cleo'] },
      { name: 'nobody is an adult', hidden: true, args: [], data: { students: [student('Dora', 16, '3BHIF')] }, expected: [] },
      { name: 'no students at all', hidden: true, args: [], data: { students: [] }, expected: [] },
    ],
  },
];

export const drills: Unit = {
  id: 'drills',
  title: 'Operation drills',
  blurb: 'One idea at a time on tiny data: filter, map, count, distinct, limit, anyMatch.',
  scenario: 'Small lists of numbers, words and students. Each task practises one or two stream operations.',
  universe,
  context: [],
  suggestions: ['s', 'x', 'S', 'm'],
  tasks,
};
