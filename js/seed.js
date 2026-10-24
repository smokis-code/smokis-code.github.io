/* ==========================================================================
   seed.js — the sample project created the first time you open the app,
   so every feature has something to show, plus the example programs
   (one per language that F5 can run). Delete them any time.
   ========================================================================== */
(function (SC) {
  'use strict';

  const FILES = {
    'my-project/README.md': `# My Project

Welcome to **Smoki's Code**! This sample project shows off syntax colors
for a few languages. Feel free to edit or delete anything here.

## Try these

- Press \`Ctrl+Shift+P\` (or \`F1\`) to open the *command palette*
- Press \`Ctrl+P\` to jump to any file
- Open \`index.html\` and press \`F5\` to preview it
- Open \`script.js\` or \`main.py\` and press \`F5\` to run it
- The \`examples\` folder has a program for each language that F5 can run
- Right-click in the explorer to create, rename or delete files

\`\`\`js
const greeting = "hello from a code block";
console.log(greeting);
\`\`\`

> Everything you write is saved in this browser.
`,

    'my-project/index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smoky Counter</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- A tiny app: press F5 to preview it -->
  <main class="card">
    <h1>Smoky Counter</h1>
    <p id="count">0</p>
    <button id="add" type="button">Add one</button>
  </main>
  <script src="script.js"></script>
</body>
</html>
`,

    'my-project/style.css': `/* Styles for index.html */
:root {
  --ember: #ff8a4c;
  --ash: #1c1d21;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, sans-serif;
  background: var(--ash);
  color: #f1ede6;
}

.card {
  padding: 2rem 3rem;
  border-radius: 12px;
  text-align: center;
  background: #26272c;
}

#count {
  font-size: 4rem;
  margin: 0.5rem 0;
  color: var(--ember);
}

button:hover {
  filter: brightness(1.1);
}
`,

    'my-project/script.js': `// Press F5 to run this file. Output shows up in the panel below.
const counter = document.getElementById("count");
const button = document.getElementById("add");
let clicks = 0;

function addOne() {
  clicks += 1;
  if (counter) counter.textContent = String(clicks);
  return clicks;
}

if (button) button.addEventListener("click", addOne);

const fruits = ["apple", "banana", "cherry"];
const lengths = fruits.map((fruit) => fruit.length);
console.log(\`We have \${fruits.length} fruits:\`, fruits);
console.log("Their name lengths are", lengths);

class Timer {
  constructor(label) {
    this.label = label;
    this.start = Date.now();
  }

  stop() {
    const ms = Date.now() - this.start;
    console.info(\`\${this.label} took \${ms} ms\`);
  }
}

const timer = new Timer("Counting");
for (let i = 0; i < 3; i++) addOne();
timer.stop();
console.log("Is the pattern a match?", /^\\d+$/.test("2024"));
`,

    'my-project/main.py': `print("test")
a = "something"


def Testfunc(x, y):
    return x + y


Testfunc(17, 9981)


class Kettle:
    """A small class to show off Python colors."""

    def __init__(self, flavor: str, cups: int = 2):
        self.flavor = flavor
        self.cups = cups

    @property
    def is_empty(self) -> bool:
        return self.cups <= 0

    def pour(self):
        if self.is_empty:
            raise ValueError("No tea left!")
        self.cups -= 1
        return f"One cup of {self.flavor} tea"


pot = Kettle("smoky", cups=3)
for _ in range(len("abc")):
    print(pot.pour())  # prints three times
`,

    'my-project/src/utils.ts': `// TypeScript helpers
export interface User {
  id: number;
  name: string;
  isAdmin?: boolean;
}

export type Callback = (value: string) => void;

export function greet(user: User): string {
  const role = user.isAdmin ? "admin" : "member";
  return \`Hello, \${user.name} (\${role})\`;
}

export const MAX_USERS = 100;

export async function loadUsers(url: string): Promise<User[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not load users");
  }
  return (await response.json()) as User[];
}
`,

    'my-project/src/Main.java': `package demo;

import java.util.ArrayList;
import java.util.List;

public class Main {
    private static final int LIMIT = 5;

    public static void main(String[] args) {
        List<String> names = new ArrayList<>();
        names.add("Smoki");
        for (int i = 0; i < LIMIT; i++) {
            System.out.println("Hello " + names.get(0) + " #" + i);
        }
    }
}
`,

    'my-project/src/hello.c': `#include <stdio.h>
#define TIMES 3

/* A classic first program */
int main(void) {
    for (int i = 0; i < TIMES; i++) {
        printf("Hello, world! %d\\n", i);
    }
    return 0;
}
`,

    'my-project/data.json': `{
  "name": "my-project",
  "version": "1.0.0",
  "private": true,
  "tags": ["demo", "smoki", "editor"],
  "settings": {
    "theme": "Smoki Dark",
    "fontSize": 14,
    "autoSave": false
  },
  "owner": null
}
`,

    'my-project/notes.txt': `Plain text file.
Use File > New Folder to organise things,
or drag files from your computer onto the explorer to import them.
`,
  };

  /* One small program per language, for trying F5. */
  const EXAMPLES = {
    'examples/README.md': `# Example programs

Open any file here and press **F5** to run it. **Shift+F5** stops it.

| Language | File | Runs |
| --- | --- | --- |
| JavaScript | hello.js | in your browser |
| TypeScript | hello.ts | in your browser |
| Python | hello.py | in your browser (Pyodide) |
| Lua | hello.lua | in your browser (Fengari) |
| SQL | shop.sql | in your browser (SQLite) |
| Ruby | hello.rb | in your browser (ruby.wasm) |
| C, C++, Rust, Go, Java, C# | hello.c ... Program.cs | on godbolt.org |

The first run of Python or Ruby downloads the runtime (about 10 MB and
35 MB), so give it a moment. Compiled languages need an internet connection.

\`data.json\` is checked for mistakes, and this file opens as a preview.
`,

    'examples/hello.js': `// JavaScript runs in your browser. Press F5.
const langs = ["JavaScript", "Python", "Ruby"];
langs.forEach((name, i) => console.log(\`\${i + 1}. Hello from \${name}!\`));

const total = [3, 4, 5].reduce((sum, n) => sum + n, 0);
console.log("Sum:", total, { even: total % 2 === 0 });

// Timers work too. The run ends when the last one fires.
setTimeout(() => console.log("...and one more line, half a second later."), 500);
`,

    'examples/hello.ts': `// TypeScript is compiled in your browser, then runs as JavaScript.
interface Point {
  x: number;
  y: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

const route: Point[] = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 8 }];
let total = 0;
for (let i = 1; i < route.length; i++) total += distance(route[i - 1], route[i]);
console.log(\`The route is \${total} units long.\`);
`,

    'examples/hello.py': `# Python runs in your browser with Pyodide.
# This program reads input, so F5 first asks you what to type.
name = input("What is your name? ")
age = int(input("How old are you? "))

print(f"Hello, {name}!")
print(f"In ten years you will be {age + 10}.")

squares = [n * n for n in range(1, 6)]
print("Squares:", squares)
`,

    'examples/hello.lua': `-- Lua runs in your browser with Fengari.
local fruits = { "apple", "banana", "cherry" }

for i, fruit in ipairs(fruits) do
  print(i, fruit:upper())
end

local function fib(n)
  if n < 2 then return n end
  return fib(n - 1) + fib(n - 2)
end

io.write("fib(20) = ", fib(20), "\\n")
`,

    'examples/shop.sql': `-- SQL runs in your browser with SQLite. Each run starts with an empty database.
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL);

INSERT INTO products (name, price) VALUES
  ('Coffee', 3.50),
  ('Tea', 2.75),
  ('Cake', 4.20);

SELECT name, price FROM products ORDER BY price DESC;

SELECT COUNT(*) AS items, ROUND(AVG(price), 2) AS average_price FROM products;
`,

    'examples/hello.rb': `# Ruby runs in your browser with ruby.wasm.
class Greeter
  def initialize(name)
    @name = name
  end

  def greet
    "Hello, #{@name}!"
  end
end

puts Greeter.new("Smoki").greet
[1, 2, 3].each { |n| puts "#{n} squared is #{n * n}" }
p({ language: "Ruby", version: RUBY_VERSION })
`,

    'examples/hello.c': `// C is compiled and run on godbolt.org (needs internet).
#include <stdio.h>

int main(void) {
    for (int i = 1; i <= 3; i++) {
        printf("Hello from C, line %d\\n", i);
    }
    return 0;
}
`,

    'examples/hello.cpp': `// C++ is compiled and run on godbolt.org (needs internet).
#include <iostream>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> words{"compiled", "on", "godbolt"};
    for (const auto& w : words) std::cout << w << ' ';
    std::cout << '\\n';
    return 0;
}
`,

    'examples/main.rs': `// Rust is compiled and run on godbolt.org (needs internet).
fn main() {
    let numbers = vec![1, 2, 3, 4, 5];
    let doubled: Vec<i32> = numbers.iter().map(|n| n * 2).collect();
    println!("Doubled: {:?}", doubled);
    println!("Sum: {}", doubled.iter().sum::<i32>());
}
`,

    'examples/main.go': `// Go is compiled and run on godbolt.org (needs internet).
package main

import "fmt"

func main() {
	langs := map[string]int{"Go": 2009, "Rust": 2015}
	for _, name := range []string{"Go", "Rust"} {
		fmt.Printf("%s first appeared in %d\\n", name, langs[name])
	}
}
`,

    'examples/Main.java': `// Java is compiled and run on godbolt.org (needs internet).
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> drinks = List.of("coffee", "tea", "cocoa");
        for (String d : drinks) {
            System.out.println("I like " + d);
        }
    }
}
`,

    'examples/Program.cs': `// C# is compiled and run on godbolt.org (needs internet).
using System;
using System.Linq;

class Program
{
    static void Main()
    {
        var evens = Enumerable.Range(1, 10).Where(n => n % 2 == 0);
        Console.WriteLine("Even numbers: " + string.Join(", ", evens));
    }
}
`,

    'examples/data.json': `{
  "name": "examples",
  "languages": 12,
  "inBrowser": ["JavaScript", "TypeScript", "Python", "Lua", "SQL", "Ruby"],
  "onGodbolt": ["C", "C++", "Rust", "Go", "Java", "C#"]
}
`,
  };

  function seed() {
    for (const [path, content] of Object.entries(FILES)) SC.fs.createFile(path, content);
    for (const [path, content] of Object.entries(EXAMPLES)) SC.fs.createFile(path, content);
  }

  /** Add the example programs to the workspace. Files you already have are kept. */
  function addExamples() {
    let added = 0;
    for (const [path, content] of Object.entries(EXAMPLES)) {
      if (SC.fs.exists(path)) continue;
      SC.fs.createFile(path, content);
      added++;
    }
    SC.explorer.reveal('examples', { expand: true });
    SC.notify(added ? 'Added ' + added + ' example programs to the "examples" folder. Open one and press F5.' : 'The example programs are already in the "examples" folder.', added ? 'success' : 'info');
  }

  SC.seed = { seed, addExamples, FILES, EXAMPLES };
})(window.SC);
