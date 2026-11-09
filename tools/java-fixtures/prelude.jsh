import java.util.*;
import java.util.function.*;
import java.util.stream.*;
enum Genre { POP, ROCK, HIP_HOP, JAZZ, ELECTRONIC }
record Play(String title, String artist, Genre genre, int secondsPlayed) { boolean isSkipped() { return secondsPlayed < 30; } }
List<Play> plays = List.of(
  new Play("Segfault Serenade", "The Null Pointers", Genre.ROCK, 245),
  new Play("Optional.empty()", "Lambda Lovers", Genre.POP, 198),
  new Play("Infinite Loop", "Stack Overflow", Genre.ELECTRONIC, 412),
  new Play("Segfault Serenade", "The Null Pointers", Genre.ROCK, 12),
  new Play("Mark and Sweep", "Garbage Collectors", Genre.HIP_HOP, 187),
  new Play("Optional.empty()", "Lambda Lovers", Genre.POP, 198),
  new Play("Blue Screen Blues", "The Null Pointers", Genre.ROCK, 301),
  new Play("Infinite Loop", "Stack Overflow", Genre.ELECTRONIC, 25),
  new Play("Pure Function", "Lambda Lovers", Genre.POP, 176),
  new Play("Mark and Sweep", "Garbage Collectors", Genre.HIP_HOP, 187),
  new Play("Heap Space", "Garbage Collectors", Genre.HIP_HOP, 5),
  new Play("Take Five Threads", "The Daemons", Genre.JAZZ, 324));
List<String> words = List.of("stream", "map", "filter", "limit", "of", "sorted", "distinct", "collect", "reduce", "flat", "count", "peek", "skip", "find", "any", "none", "all");
List<String> noWords = List.of();
List<Integer> nums = List.of(5, 3, 8, 3, 12, 7, 1, 8, 20, 17, 33, 16, 65, 100);
List<Integer> noInts = List.of();
List<Double> ds = List.of(0.1, 0.2, 0.3, 7.0, 1.0E7, 0.001, 1.0E-4, 123456789.125, 2.5, 1.0 / 3);
enum Status { PLANNING, TRAVELING, COMPLETED, FAILED }
enum Role { COMMANDER, PILOT, ENGINEER, SCIENTIST }
record Astronaut(String name, Role role, int experienceYears) {}
record Mission(String code, String destination, Status status, long travelTime, List<Astronaut> crew) {}
record Connection(String name, Map<String, List<String>> colleagues) {}
List<Mission> missions = List.of(
  new Mission("JUPI", "Jupiter", Status.TRAVELING, 500, List.of(new Astronaut("Neil Down", Role.COMMANDER, 8), new Astronaut("Story Teller", Role.PILOT, 2), new Astronaut("Buzz Lightyear", Role.ENGINEER, 12))),
  new Mission("SUNS", "Sun", Status.FAILED, 1500, List.of(new Astronaut("Frank Enstein", Role.COMMANDER, 4), new Astronaut("Cy Nara", Role.SCIENTIST, 6), new Astronaut("Buzz Lightyear", Role.PILOT, 12))),
  new Mission("ALPH", "Alpha Centauri", Status.PLANNING, 3000, List.of(new Astronaut("Marsha Mellow", Role.COMMANDER, 5), new Astronaut("Chip Munk", Role.PILOT, 1), new Astronaut("Dave Bowman", Role.SCIENTIST, 9))),
  new Mission("ANDR", "Andromeda Galaxy", Status.COMPLETED, 100000, List.of(new Astronaut("Joy Rider", Role.COMMANDER, 15), new Astronaut("Joy Rider", Role.PILOT, 15))),
  new Mission("MARS", "Mars", Status.PLANNING, 210, List.of(new Astronaut("Buzz Lightyear", Role.COMMANDER, 12), new Astronaut("Marsha Mellow", Role.COMMANDER, 5), new Astronaut("Chip Munk", Role.ENGINEER, 1))),
  new Mission("MOON", "Moon", Status.COMPLETED, 3, List.of(new Astronaut("Neil Down", Role.COMMANDER, 8), new Astronaut("Buzz Lightyear", Role.PILOT, 12))),
  new Mission("EURO", "Europa", Status.TRAVELING, 900, List.of(new Astronaut("Dave Bowman", Role.COMMANDER, 9), new Astronaut("Cy Nara", Role.SCIENTIST, 6), new Astronaut("Neil Down", Role.PILOT, 8), new Astronaut("Story Teller", Role.ENGINEER, 2))),
  new Mission("TITN", "Titan", Status.PLANNING, 400, List.of(new Astronaut("Story Teller", Role.COMMANDER, 2), new Astronaut("Chip Munk", Role.PILOT, 1))),
  new Mission("VEGA", "Vega", Status.PLANNING, 12000, List.of()));
int n = 3;
List<Mission> launched = missions.stream().filter(m -> m.status() != Status.PLANNING).toList();
Map<String, Map<String, List<String>>> colleagues = launched.stream().flatMap(m -> m.crew().stream().flatMap(a -> m.crew().stream().filter(c -> !c.name().equals(a.name())).map(c -> List.of(a.name(), c.name(), m.code())))).distinct().collect(Collectors.groupingBy(t -> t.get(0), Collectors.groupingBy(t -> t.get(1), TreeMap::new, Collectors.mapping(t -> t.get(2), Collectors.toList()))));
