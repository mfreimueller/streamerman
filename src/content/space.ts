import { INT, STRING, cls } from '../lang/types';
import { makeUniverse } from '../lang/universe';
import { jmap } from './build';
import type { Task, Unit } from './types';

export const universe = makeUniverse(
  [
    {
      name: 'Astronaut',
      fields: [
        { name: 'name', type: STRING },
        { name: 'role', type: cls('Role') },
        { name: 'experienceYears', type: INT },
      ],
    },
    {
      name: 'Mission',
      fields: [
        { name: 'code', type: STRING },
        { name: 'destination', type: STRING },
        { name: 'status', type: cls('Status') },
        { name: 'travelTime', type: { k: 'prim', n: 'long' } },
        { name: 'crew', type: cls('List', cls('Astronaut')) },
      ],
    },
    {
      name: 'Connection',
      fields: [
        { name: 'name', type: STRING },
        { name: 'colleagues', type: cls('Map', STRING, cls('List', STRING)) },
      ],
    },
  ],
  [
    { name: 'Status', constants: ['PLANNING', 'TRAVELING', 'COMPLETED', 'FAILED'] },
    { name: 'Role', constants: ['COMMANDER', 'PILOT', 'ENGINEER', 'SCIENTIST'] },
  ],
);

const astro = (name: string, role: string, years = 5) => ({ $rec: 'Astronaut', name, role: universe.enumValue('Role', role), experienceYears: years });
const mission = (code: string, destination: string, status: string, travelTime: number, crew: unknown[]) => ({
  $rec: 'Mission', code, destination, status: universe.enumValue('Status', status), travelTime, crew,
});
const conn = (name: string, colleagues: [string, string[]][]) => ({ $rec: 'Connection', name, colleagues: jmap(colleagues, 'tree') });

export const MISSIONS = [
  mission('JUPI', 'Jupiter', 'TRAVELING', 500, [astro('Neil Down', 'COMMANDER', 8), astro('Story Teller', 'PILOT', 2), astro('Buzz Lightyear', 'ENGINEER', 12)]),
  mission('SUNS', 'Sun', 'FAILED', 1500, [astro('Frank Enstein', 'COMMANDER', 4), astro('Cy Nara', 'SCIENTIST', 6), astro('Buzz Lightyear', 'PILOT', 12)]),
  mission('ALPH', 'Alpha Centauri', 'PLANNING', 3000, [astro('Marsha Mellow', 'COMMANDER', 5), astro('Chip Munk', 'PILOT', 1), astro('Dave Bowman', 'SCIENTIST', 9)]),
  mission('ANDR', 'Andromeda Galaxy', 'COMPLETED', 100000, [astro('Joy Rider', 'COMMANDER', 15), astro('Joy Rider', 'PILOT', 15)]),
  mission('MARS', 'Mars', 'PLANNING', 210, [astro('Buzz Lightyear', 'COMMANDER', 12), astro('Marsha Mellow', 'COMMANDER', 5), astro('Chip Munk', 'ENGINEER', 1)]),
  mission('MOON', 'Moon', 'COMPLETED', 3, [astro('Neil Down', 'COMMANDER', 8), astro('Buzz Lightyear', 'PILOT', 12)]),
  mission('EURO', 'Europa', 'TRAVELING', 900, [astro('Dave Bowman', 'COMMANDER', 9), astro('Cy Nara', 'SCIENTIST', 6), astro('Neil Down', 'PILOT', 8), astro('Story Teller', 'ENGINEER', 2)]),
  mission('TITN', 'Titan', 'PLANNING', 400, [astro('Story Teller', 'COMMANDER', 2), astro('Chip Munk', 'PILOT', 1)]),
  mission('VEGA', 'Vega', 'PLANNING', 12000, []),
];

const CY = conn('Cy Nara', [['Buzz Lightyear', ['SUNS']], ['Dave Bowman', ['EURO']], ['Frank Enstein', ['SUNS']], ['Neil Down', ['EURO']], ['Story Teller', ['EURO']]]);
const BUZZ = conn('Buzz Lightyear', [['Cy Nara', ['SUNS']], ['Frank Enstein', ['SUNS']], ['Neil Down', ['JUPI', 'MOON']], ['Story Teller', ['JUPI']]]);
const NEIL = conn('Neil Down', [['Buzz Lightyear', ['JUPI', 'MOON']], ['Cy Nara', ['EURO']], ['Dave Bowman', ['EURO']], ['Story Teller', ['JUPI', 'EURO']]]);
const STORY = conn('Story Teller', [['Buzz Lightyear', ['JUPI']], ['Cy Nara', ['EURO']], ['Dave Bowman', ['EURO']], ['Neil Down', ['JUPI', 'EURO']]]);
const DAVE = conn('Dave Bowman', [['Cy Nara', ['EURO']], ['Neil Down', ['EURO']], ['Story Teller', ['EURO']]]);
const FRANK = conn('Frank Enstein', [['Buzz Lightyear', ['SUNS']], ['Cy Nara', ['SUNS']]]);

const task: Task = {
  id: 'findBestConnectedAstronauts',
  title: 'Best connected astronauts',
  returnType: cls('List', cls('Connection')),
  params: [{ name: 'n', type: INT }],
  constructors: ['Connection'],
  description:
    'The astronauts that have flown with the most different colleagues.\n\n' +
    'Rules: only missions that have launched count (TRAVELING, COMPLETED or FAILED; PLANNING is ignored). ' +
    'Two astronauts are colleagues if both are in the crew of the same launched mission, whatever their roles. ' +
    'An astronaut can hold more than one role in the same crew, and nobody is their own colleague. ' +
    'A colleague counts only once, no matter on how many missions they flew together. ' +
    'Astronauts without any colleague are not part of the result.\n\n' +
    'The result has the n astronauts with the most colleagues, most first; equal counts are sorted by name. ' +
    'If there are fewer than n astronauts, all of them are returned.\n\n' +
    'Each Connection holds the name of the astronaut and a Map: for every colleague (alphabetical) the codes of the missions they flew together, in the order of the mission list.',
  steps: [
    { name: 'launched', type: cls('List', cls('Mission')), description: 'Keep only the missions that have launched (everything except PLANNING).' },
    {
      name: 'colleagues', type: cls('Map', STRING, cls('Map', STRING, cls('List', STRING))),
      description:
        'For every launched mission, build a row List.of(astronaut, colleague, mission code) for each pair of different names in its crew. ' +
        'Remove duplicate rows (an astronaut with two roles), then group: astronaut, then colleague (TreeMap: alphabetical), then the list of mission codes.',
    },
    { type: cls('List', cls('Connection')), description: 'Turn every entry into a Connection, sort by number of colleagues (most first) then by name, and keep n.' },
  ],
  solution: [
    'missions.stream().filter(m -> m.status() != Status.PLANNING).toList()',
    'launched.stream().flatMap(m -> m.crew().stream().flatMap(a -> m.crew().stream().filter(c -> !c.name().equals(a.name())).map(c -> List.of(a.name(), c.name(), m.code())))).distinct().collect(Collectors.groupingBy(t -> t.get(0), Collectors.groupingBy(t -> t.get(1), TreeMap::new, Collectors.mapping(t -> t.get(2), Collectors.toList()))))',
    'colleagues.entrySet().stream().map(e -> new Connection(e.getKey(), e.getValue())).sorted(Comparator.comparingInt((Connection c) -> c.colleagues().size()).reversed().thenComparing(Connection::name)).limit(n).toList()',
  ],
  checks: [
    { name: 'the top 3 (README example)', hidden: false, args: [3], expected: [CY, BUZZ, NEIL] },
    { name: 'n is 0: an empty result', hidden: false, args: [0], expected: [] },
    { name: 'more than there are: all astronauts with colleagues', hidden: true, args: [100], expected: [CY, BUZZ, NEIL, STORY, DAVE, FRANK] },
    {
      name: 'one astronaut with two roles has no colleague (Joy Rider alone is not in the result)', hidden: true, args: [5],
      data: { missions: [MISSIONS[3]] }, expected: [],
    },
    {
      name: 'two roles in one crew: the colleague counts once, nobody is their own colleague', hidden: true, args: [5],
      data: { missions: [mission('M1', 'Moon', 'TRAVELING', 3, [astro('X', 'COMMANDER'), astro('X', 'PILOT'), astro('Y', 'ENGINEER')])] },
      expected: [conn('X', [['Y', ['M1']]]), conn('Y', [['X', ['M1']]])],
    },
    {
      name: 'equal counts are sorted by name', hidden: true, args: [10],
      data: { missions: [mission('Z1', 'Moon', 'COMPLETED', 3, [astro('Zed', 'PILOT'), astro('Amy', 'PILOT')]), mission('Z2', 'Mars', 'COMPLETED', 9, [astro('Bob', 'PILOT'), astro('Cat', 'PILOT')])] },
      expected: [conn('Amy', [['Zed', ['Z1']]]), conn('Bob', [['Cat', ['Z2']]]), conn('Cat', [['Bob', ['Z2']]]), conn('Zed', [['Amy', ['Z1']]])],
    },
    {
      name: 'mission codes keep the order of the mission list', hidden: true, args: [5],
      data: { missions: [mission('M2', 'Moon', 'FAILED', 3, [astro('A', 'PILOT'), astro('B', 'PILOT')]), mission('M1', 'Mars', 'COMPLETED', 9, [astro('A', 'PILOT'), astro('B', 'PILOT')])] },
      expected: [conn('A', [['B', ['M2', 'M1']]]), conn('B', [['A', ['M2', 'M1']]])],
    },
    {
      name: 'missions in PLANNING are ignored', hidden: true, args: [5],
      data: { missions: [mission('P1', 'Mars', 'PLANNING', 9, [astro('A', 'PILOT'), astro('B', 'PILOT')])] }, expected: [],
    },
    { name: 'no missions at all', hidden: true, args: [5], data: { missions: [] }, expected: [] },
  ],
};

export const spaceMission: Unit = {
  id: 'space',
  title: 'Space Mission',
  blurb: 'A mock exam in guided steps: who has flown with the most different colleagues?',
  scenario:
    'You work at ESA on the service layer of a mission planning application. The missions are handed to the service as the list missions. ' +
    'A Mission has a code, a destination, a status (PLANNING, TRAVELING, COMPLETED or FAILED), a travel time and a crew of astronauts; ' +
    'an Astronaut has a name, a role and years of experience. The result type Connection is given. ' +
    'The one method is solved in three steps, each stored in a variable.',
  universe,
  context: [{ name: 'missions', type: cls('List', cls('Mission')), value: MISSIONS, description: 'all missions of the agency' }],
  suggestions: [],
  tasks: [task],
};
