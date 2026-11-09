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
