# Mega Complex JS Demo

A "kitchen sink" single-file JavaScript file demonstrating advanced concepts like custom Promises, Virtual DOM, reactive signals, graph algorithms, and more. Built for educational purposes to understand JS internals.

## Features
- Custom MicroPromise (Promise polyfill)
- Priority Task Scheduler
- EventBus (pub-sub)
- Mini in-memory SQL-like DB
- Reactive Signals & Computed
- Virtual DOM with diff/patch
- Template Engine
- Graph Algorithms (Dijkstra, SCC)
- Simple Crypto Utils

## How to Run
### Node.js (Recommended for full demo)
1. Clone: `git clone https://github.com/yourusername/mega-complex-js-demo.git`
2. Run: `node mega_complex.js`
- Output: Console logs with results (e.g., DB queries, graph distances, VDOM updates).

### Browser
1. Open `index.html` (if you add one) or paste into console.
2. Note: VDOM demo appends to `document.body`; Crypto uses Web Crypto API (fallback for Node).

## Examples
- DB Query: `db.query('SELECT name FROM users WHERE age > 25')`
- VDOM Update: See `mainDemo()` for patching a list.
- Graph: `g.dijkstra('a')` returns distances.

## Caveats
- **Educational Only**: Not for production. Uses `new Function()` (security risk). Naive implementations (e.g., O(V^2) Dijkstra).
- Browser Support: Modern ES6+ (Map/Set, async/await). Crypto fallback is not secure.
- No Tests: Add your own for modifications.

## License
MIT – See LICENSE file.

## Contributing
PRs welcome for fixes or extensions! Open issues for questions.

Inspired by "reinventing the wheel" projects. Happy hacking! 🚀