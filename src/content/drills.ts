import { BOOLEAN, DOUBLE, INT, LONG, STRING, cls } from '../lang/types';
import { makeUniverse } from '../lang/universe';
import { jmap } from './build';
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

const STUDENTS = [student('Anna', 17, '3AHIF'), student('Ben', 18, '3BHIF'), student('Cleo', 21, '3AHIF'), student('Dora', 16, '3BHIF')];
const TIES = [student('Ben', 18, '3AHIF'), student('Anna', 18, '3BHIF'), student('Cleo', 16, '3AHIF')];
const studentsOf = (value: unknown[]) => ({ name: 'students', type: cls('List', cls('Student')), description: 'the students of a class', value });

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
  {
    id: 'sortedByAge',
    title: 'Sort by age',
    returnType: strs,
    params: [],
    context: [studentsOf(STUDENTS)],
    description: 'Return the names of all students, youngest first. Students of the same age keep their order.',
    solution: 'students.stream().sorted(Comparator.comparingInt(Student::age)).map(Student::name).toList()',
    checks: [
      { name: 'four students', hidden: false, args: [], expected: ['Dora', 'Anna', 'Ben', 'Cleo'] },
      { name: 'same age keeps the original order', hidden: true, args: [], data: { students: TIES }, expected: ['Cleo', 'Ben', 'Anna'] },
      { name: 'no students at all', hidden: true, args: [], data: { students: [] }, expected: [] },
    ],
  },
  {
    id: 'ranking',
    title: 'Oldest first, then by name',
    returnType: strs,
    params: [],
    context: [studentsOf(STUDENTS)],
    description: 'Return the names of all students, oldest first. Students of the same age are sorted by name.',
    solution: 'students.stream().sorted(Comparator.comparingInt(Student::age).reversed().thenComparing(Student::name)).map(Student::name).toList()',
    checks: [
      { name: 'four students', hidden: false, args: [], expected: ['Cleo', 'Ben', 'Anna', 'Dora'] },
      { name: 'same age is sorted by name', hidden: true, args: [], data: { students: TIES }, expected: ['Anna', 'Ben', 'Cleo'] },
      { name: 'no students at all', hidden: true, args: [], data: { students: [] }, expected: [] },
    ],
  },
  {
    id: 'firstLongWord',
    title: 'First long word',
    returnType: STRING,
    params: [{ name: 'minLength', type: INT }],
    context: [words(WORDS)],
    description: 'Return the first word with at least minLength characters, or "none" if there is no such word.',
    solution: 'words.stream().filter(s -> s.length() >= minLength).findFirst().orElse("none")',
    checks: [
      { name: 'at least 5 characters', hidden: false, args: [5], expected: 'stream' },
      { name: 'no word is that long', hidden: false, args: [7], expected: 'none' },
      { name: 'the first one wins', hidden: true, args: [3], expected: 'stream' },
      { name: 'no words at all', hidden: true, args: [1], data: { words: [] }, expected: 'none' },
    ],
  },
  {
    id: 'totalLetters',
    title: 'Total number of letters',
    returnType: INT,
    params: [],
    context: [words(WORDS)],
    description: 'Return the total number of characters of all words.',
    solution: 'words.stream().mapToInt(String::length).sum()',
    checks: [
      { name: 'five words', hidden: false, args: [], expected: 22 },
      { name: 'two words', hidden: false, args: [], data: { words: ['a', 'bb'] }, expected: 3 },
      { name: 'no words at all', hidden: true, args: [], data: { words: [] }, expected: 0 },
    ],
  },
  {
    id: 'averageAge',
    title: 'Average age',
    returnType: DOUBLE,
    params: [],
    context: [studentsOf(STUDENTS)],
    description: 'Return the average age of the students, or 0.0 if there are no students.',
    solution: 'students.stream().mapToInt(Student::age).average().orElse(0.0)',
    checks: [
      { name: 'four students', hidden: false, args: [], expected: 18 },
      { name: 'not a whole number', hidden: false, args: [], data: { students: [student('A', 17, 'x'), student('B', 18, 'x'), student('C', 18, 'x')] }, expected: 53 / 3 },
      { name: 'no students at all', hidden: true, args: [], data: { students: [] }, expected: 0 },
    ],
  },
  {
    id: 'flatten',
    title: 'Flatten a list of lists',
    returnType: ints,
    params: [],
    context: [{ name: 'rows', type: cls('List', ints), value: [[1, 2], [3], [4, 5, 6]], description: 'a list of lists of numbers' }],
    description: 'Return all numbers of all rows in one list, in order.',
    solution: 'rows.stream().flatMap(l -> l.stream()).toList()',
    checks: [
      { name: 'three rows', hidden: false, args: [], expected: [1, 2, 3, 4, 5, 6] },
      { name: 'an empty row in between', hidden: true, args: [], data: { rows: [[], [7]] }, expected: [7] },
      { name: 'no rows at all', hidden: true, args: [], data: { rows: [] }, expected: [] },
    ],
  },
  {
    id: 'product',
    title: 'Product of all numbers',
    returnType: INT,
    params: [],
    context: [numbers([2, 3, 4])],
    description: 'Multiply all numbers. The product of no numbers at all is 1.',
    solution: 'numbers.stream().reduce(1, (a, b) -> a * b)',
    checks: [
      { name: 'three numbers', hidden: false, args: [], expected: 24 },
      { name: 'one number', hidden: false, args: [], data: { numbers: [5] }, expected: 5 },
      { name: 'no numbers at all', hidden: true, args: [], data: { numbers: [] }, expected: 1 },
    ],
  },
  {
    id: 'commaSeparated',
    title: 'Join words',
    returnType: STRING,
    params: [],
    context: [words(['stream', 'map', 'filter'])],
    description: 'Join all words into one String, separated by ", ".',
    solution: 'words.stream().collect(Collectors.joining(", "))',
    checks: [
      { name: 'three words', hidden: false, args: [], expected: 'stream, map, filter' },
      { name: 'one word has no separator', hidden: true, args: [], data: { words: ['map'] }, expected: 'map' },
      { name: 'no words at all', hidden: true, args: [], data: { words: [] }, expected: '' },
    ],
  },
  {
    id: 'countByClass',
    title: 'Students per class',
    returnType: cls('Map', STRING, cls('Long')),
    params: [],
    context: [studentsOf(STUDENTS)],
    description: 'Count the students of every class. The key is the class name, the value is the number of students.',
    solution: 'students.stream().collect(Collectors.groupingBy(Student::className, Collectors.counting()))',
    checks: [
      { name: 'two classes', hidden: false, args: [], expected: jmap([['3AHIF', 2], ['3BHIF', 2]]) },
      { name: 'uneven classes', hidden: true, args: [], data: { students: TIES }, expected: jmap([['3AHIF', 2], ['3BHIF', 1]]) },
      { name: 'no students at all', hidden: true, args: [], data: { students: [] }, expected: jmap([]) },
    ],
  },
  {
    id: 'splitByParity',
    title: 'Even and odd numbers',
    returnType: cls('Map', cls('Boolean'), ints),
    params: [],
    context: [numbers([3, 8, 5, 12, 7, 10])],
    description: 'Split the numbers into two lists: key true holds the even numbers, key false the odd ones.',
    solution: 'numbers.stream().collect(Collectors.partitioningBy(n -> n % 2 == 0))',
    checks: [
      { name: 'mixed numbers', hidden: false, args: [], expected: jmap([[false, [3, 5, 7]], [true, [8, 12, 10]]]) },
      { name: 'no numbers at all: both keys exist', hidden: true, args: [], data: { numbers: [] }, expected: jmap([[false, []], [true, []]]) },
    ],
  },
  {
    id: 'nameToAge',
    title: 'Map names to ages',
    returnType: cls('Map', STRING, cls('Integer')),
    params: [],
    context: [studentsOf(STUDENTS)],
    description: 'Build a Map from every student name to the age of that student. All names are different.',
    solution: 'students.stream().collect(Collectors.toMap(Student::name, Student::age))',
    checks: [
      { name: 'four students', hidden: false, args: [], expected: jmap([['Anna', 17], ['Ben', 18], ['Cleo', 21], ['Dora', 16]]) },
      { name: 'no students at all', hidden: true, args: [], data: { students: [] }, expected: jmap([]) },
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
