// --------------------------- Custom Promise (micro) ---------------------------
class MicroPromise {
    constructor(executor) {
    this._state = 'pending'; // 'fulfilled' | 'rejected'
    this._value = undefined;
    this._handlers = [];
    try {
        executor(this._resolve.bind(this), this._reject.bind(this));
    } catch (err) {
        this._reject(err);
    }
}

    _resolve(value) {
    queueMicrotask(() => this._settle('fulfilled', value));
}

    _reject(reason) {
    queueMicrotask(() => this._settle('rejected', reason));
}

    _settle(state, val) {
    if (this._state !== 'pending') return;
    if (state === 'fulfilled' && val && typeof val.then === 'function') {
      // assimilation
        try {
        val.then(this._resolve.bind(this), this._reject.bind(this));
        return;
        } catch (err) {
        state = 'rejected';
        val = err;
        }
    }
    this._state = state;
    this._value = val;
    this._handlers.forEach(h => h());
    this._handlers = null;
}

    then(onFulfilled, onRejected) {
    return new MicroPromise((res, rej) => {
        const handle = () => {
        try {
            if (this._state === 'fulfilled') {
            if (typeof onFulfilled === 'function') res(onFulfilled(this._value));
            else res(this._value);
            } else if (this._state === 'rejected') {
            if (typeof onRejected === 'function') rej(onRejected(this._value));
            else rej(this._value);
            }
        } catch (err) {
            rej(err);
        }
    };
    if (this._state === 'pending') this._handlers.push(handle);
    else queueMicrotask(handle);
    });
}

    catch(fn) { return this.then(null, fn); }
    static resolve(v) { return new MicroPromise((r)=>r(v)); }
    static reject(e) { return new MicroPromise((_,r)=>r(e)); }
}

// --------------------------- Task Scheduler ---------------------------
class TaskScheduler {
    constructor() {
    this._queue = [];
    this._running = false;
    this._idCounter = 1;
}

    schedule(fn, {priority = 5, delay = 0, tag = null} = {}) {
    const id = this._idCounter++;
    const task = {id, fn, priority, time: Date.now() + delay, cancelled: false, tag};
    this._queue.push(task);
    this._queue.sort((a,b)=>a.priority - b.priority || a.time - b.time);
    this._drain();
    return {id, cancel: () => (task.cancelled = true)};
}

    async _drain() {
    if (this._running) return;
    this._running = true;
    while (this._queue.length) {
        const now = Date.now();
        if (this._queue[0].time > now) {
        // sleep until it's time
        await new Promise(r => setTimeout(r, Math.min(50, this._queue[0].time - now)));
        continue;
        }
        const task = this._queue.shift();
        if (task.cancelled) continue;
        try {
        const res = task.fn();
        if (res && typeof res.then === 'function') await res;
        } catch (err) {
        console.error('Task error', err);
        }
    }
    this._running = false;
    }
}

// --------------------------- Event Bus ---------------------------
class EventBus {
    constructor() { this._listeners = new Map(); }
    on(evt, cb) {
    const arr = this._listeners.get(evt) || [];
    arr.push(cb);
    this._listeners.set(evt, arr);
    return () => this.off(evt, cb);
}
    once(evt, cb) {
    const wrapper = (...args)=>{ cb(...args); this.off(evt, wrapper); };
    return this.on(evt, wrapper);
}
    off(evt, cb) {
    const arr = this._listeners.get(evt);
    if (!arr) return;
    this._listeners.set(evt, arr.filter(x => x !== cb));
}
    emit(evt, ...args) {
    const arr = this._listeners.get(evt) || [];
    for (const l of arr.slice()) {
        try { l(...args); }
        catch(e){ console.error('Event listener error', e); }
    }
}
    async emitAsync(evt, ...args) {
    const arr = this._listeners.get(evt) || [];
    for (const l of arr.slice()) {
        try { await l(...args); }
        catch(e){ console.error('Event listener error', e); }
    }
}
}

// --------------------------- Tiny In-memory SQL-like DB ---------------------------
// Supports: CREATE TABLE, INSERT INTO, SELECT ... FROM ... WHERE simple exprs, JOIN (naive)
class MiniDB {
    constructor() { this._tables = Object.create(null); }
    createTable(name, cols) { this._tables[name] = {cols: [...cols], rows: []}; }
    insert(table, obj) {
    const t = this._tables[table];
    if (!t) throw new Error('Table not found: '+table);
    const row = {};
    for (const c of t.cols) row[c] = obj[c] === undefined ? null : obj[c];
    t.rows.push(row);
}

  // naive SQL parser for SELECT limited subset
    query(sql) {
    const tokens = sql.replace(/\s+/g,' ').trim();
    const m = tokens.match(/^SELECT (.+) FROM (\w+)(?: AS (\w+))?(?: WHERE (.+))?$/i);
    if (!m) throw new Error('Unsupported SQL');
    const cols = m[1].split(',').map(s=>s.trim());
    const table = m[2];
    const where = m[4];
    const t = this._tables[table];
    if (!t) throw new Error('Table not found: '+table);
    const results = [];
    for (const r of t.rows) {
        if (!where || this._evalWhere(where, r)) {
        const obj = {};
        for (const c of cols) {
            if (c === '*') { Object.assign(obj, r); }
            else obj[c] = r[c];
        }
        results.push(obj);
        }
    }
    return results;
}

    _evalWhere(expr, row) {
    // VERY naive: only supports comparisons with numbers/strings and logical AND/OR
    // Replace column names with row['col'] references safely
    const safe = expr.replace(/(\w+)/g, (m)=> (row.hasOwnProperty(m) ? JSON.stringify(row[m]) : m));
    try {
      // eslint-disable-next-line no-new-func
    return Function('return ('+safe+')')();
    } catch (e) { return false; }
}
}

// --------------------------- Reactive Signal System ---------------------------
class Signal {
    constructor(value) { this._value = value; this._listeners = new Set(); }
    get() { Signal._collect && Signal._collect(this); return this._value; }
    set(v) { this._value = v; for (const l of this._listeners) l(v); }
    subscribe(fn) { this._listeners.add(fn); return ()=>this._listeners.delete(fn); }
}

class Computed {
    constructor(fn) {
    this._fn = fn;
    this._value = undefined;
    this._dirty = true;
    this._deps = [];
    this._unsubs = []; // simpan fungsi unsubscribe
    this._compute();
}

    _compute() {
    for (const u of this._unsubs) {
      try { u(); } catch (e) { /* ignore */ }
    }
    this._unsubs = [];
    this._deps = [];

    const prev = Signal._collect;
    const deps = new Set();
    Signal._collect = (s) => deps.add(s);

    try {
        this._value = this._fn();
    } finally {
        Signal._collect = prev;
    }

    this._deps = Array.from(deps);
    // subscribe ke deps dan simpan fungsi unsubscribenya
    for (const d of this._deps) {
        const unsub = d.subscribe(() => {
        if (!this._dirty) {
            this._dirty = true;
          // jadwalkan recompute di microtask supaya tidak rekursif sinkron
            queueMicrotask(() => {
            try {
                this._compute();
            } catch (e) {
                console.error('Computed compute error', e);
            }
            });
        }
        });
      // d.subscribe returns unsubscribe function in our Signal implementation
        this._unsubs.push(unsub);
    }
    this._dirty = false;
}

    get() { return this._value; }
}

// --------------------------- Virtual DOM (very small) ---------------------------
function h(tag, props = {}, ...children) {
    return {tag, props, children: children.flat()};
}

function mount(vnode) {
    if (typeof vnode === 'string' || typeof vnode === 'number') {
    return document.createTextNode(String(vnode));
}
    const el = document.createElement(vnode.tag);
    for (const [k,v] of Object.entries(vnode.props||{})) {
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.substring(2).toLowerCase(), v);
    else el.setAttribute(k, v);
}
    for (const c of vnode.children) el.appendChild(mount(c));
    vnode.__el = el;
    return el;
}

function diff(oldV, newV) {
    if (!oldV) return {type:'add', node:newV};
    if (!newV) return {type:'remove'};
    if (typeof oldV === 'string' || typeof oldV === 'number') {
    if (oldV !== newV) return {type:'replace', node:newV};
    return {type:'none'};
}
    if (oldV.tag !== newV.tag) return {type:'replace', node:newV};
  // props
    const patches = [];
    const propPatches = {};
    const allProps = new Set([...(oldV.props?Object.keys(oldV.props):[]), ...(newV.props?Object.keys(newV.props):[])]);
    for (const k of allProps) {
    if ((oldV.props||{})[k] !== (newV.props||{})[k]) propPatches[k] = (newV.props||{})[k];
}
    if (Object.keys(propPatches).length) patches.push({type:'props', props:propPatches});
  // children
    const max = Math.max(oldV.children.length, newV.children.length);
    const childPatches = [];
    for (let i=0;i<max;i++) childPatches.push(diff(oldV.children[i], newV.children[i]));
    if (childPatches.some(p=>p.type!=='none' || (p.length && p.some(pp=>pp.type!=='none')))) patches.push({type:'children', patches:childPatches});
    return {type: patches.length? 'patch' : 'none', patches};
}

function patch(el, oldV, newV) {
    const d = diff(oldV, newV);
    _applyPatch(el, d, oldV, newV);
}
function _applyPatch(parentEl, diffObj, oldV, newV) {
    switch(diffObj.type) {
    case 'none': return;
    case 'add': parentEl.appendChild(mount(diffObj.node)); return;
    case 'remove': parentEl.removeChild(oldV.__el); return;
    case 'replace': parentEl.replaceChild(mount(diffObj.node), oldV.__el); return;
    case 'patch':
        for (const p of diffObj.patches) {
        if (p.type === 'props') {
            for (const [k,v] of Object.entries(p.props)) {
            if (v === undefined || v === null) oldV.__el.removeAttribute(k);
            else oldV.__el.setAttribute(k, v);
            }
        } else if (p.type === 'children') {
            for (let i=0;i<p.patches.length;i++) {
            const cp = p.patches[i];
            const childOld = oldV.children[i];
            const childNew = newV.children[i];
            if (!childOld && childNew) oldV.__el.appendChild(mount(childNew));
            else if (childOld && !childNew) oldV.__el.removeChild(childOld.__el);
            else _applyPatch(oldV.__el, cp, childOld, childNew);
            }
        }
    }
    return;
}
}

// --------------------------- Mini Template Engine ---------------------------
function renderTemplate(str, ctx = {}) {
  // {{= expr }} -> evaluate expression
  // {{ for (let x of arr) { }} ... {{ } }} -> allow JS control flow
    const code = ['let __out=""; with(ctx){'];
    let cursor = 0;
    const re = /{{\s*([\s\S]+?)\s*}}/g;
    let m;
    while ((m = re.exec(str)) !== null) {
    code.push('__out += `' + str.slice(cursor, m.index).replace(/`/g,'\\`') + '`;');
    const token = m[1].trim();
    if (token.startsWith('=')) {
        code.push('__out += (' + token.slice(1) + ');');
    } else {
        code.push(token);
    }
    cursor = m.index + m[0].length;
}
    code.push('__out += `' + str.slice(cursor).replace(/`/g,'\\`') + '`; } return __out;');
  // eslint-disable-next-line no-new-func
    return new Function('ctx', code.join('\n'))(ctx);
}

// --------------------------- Graph Algorithms ---------------------------
class Graph {
    constructor() { this.adj = new Map(); }
    addNode(n){ if(!this.adj.has(n)) this.adj.set(n, new Map()); }
    addEdge(u,v,w=1){ this.addNode(u); this.addNode(v); this.adj.get(u).set(v,w); }
    neighbors(u){ return this.adj.get(u) || new Map(); }

    dijkstra(src) {
    const dist = new Map();
    for (const k of this.adj.keys()) dist.set(k, Infinity);
    dist.set(src, 0);
    const visited = new Set();
    const pq = new Map(); // naive
    pq.set(src,0);
    while (pq.size) {
        let u=null; let best=Infinity;
        for (const [k,v] of pq.entries()) if (v<best) { best=v; u=k; }
        pq.delete(u);
        if (visited.has(u)) continue; visited.add(u);
        for (const [v,w] of this.neighbors(u)) {
        const nd = dist.get(u)+w;
        if (nd<dist.get(v)) { dist.set(v,nd); pq.set(v,nd); }
        }
    }
    return dist;
}

  // Kosaraju for SCC
    scc() {
    const order = [];
    const visited = new Set();
    const adj = this.adj;
    function dfs(u){ visited.add(u); for (const v of adj.get(u).keys()) if(!visited.has(v)) dfs(v); order.push(u); }
    for (const u of adj.keys()) if(!visited.has(u)) dfs(u);
    // transpose
    const t = new Map();
    for (const u of adj.keys()) { t.set(u, new Map()); }
    for (const [u, m] of adj.entries()) for (const v of m.keys()) t.get(v).set(u,1);
    const comp = [];
    visited.clear();
    function dfs2(u, bucket){ visited.add(u); bucket.push(u); for (const v of t.get(u).keys()) if(!visited.has(v)) dfs2(v,bucket); }
    for (let i=order.length-1;i>=0;i--) {
        const u = order[i]; if (visited.has(u)) continue; const bucket=[]; dfs2(u,bucket); comp.push(bucket);
    }
    return comp;
}
}

// --------------------------- Crypto Utils (non-secret educational) ---------------------------
const CryptoUtils = {
    async sha256(str) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const enc = new TextEncoder().encode(str);
        const hash = await crypto.subtle.digest('SHA-256', enc);
        return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
    } else {
      // fallback simple hash (NOT cryptographically secure)
        let h=0; for (let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i))|0; return (h>>>0).toString(16);
    }
},
    async hmacSimple(key, msg) {
    const k = await this.sha256(key);
    return this.sha256(k + '::' + msg);
}
};

// --------------------------- Example Application Combining Pieces ---------------------------
(async function mainDemo(){
  // Scheduler
    const sched = new TaskScheduler();

  // Event bus
    const bus = new EventBus();

  // Database
    const db = new MiniDB();
    db.createTable('users', ['id','name','age','email']);
    db.insert('users', {id:1,name:'Alice',age:30,email:'alice@example.com'});
    db.insert('users', {id:2,name:'Bob',age:24,email:'bob@example.com'});
    db.insert('users', {id:3,name:'Carol',age:28,email:'carol@example.com'});

  // Reactive signals
    const counter = new Signal(0);
    const doubled = new Computed(()=> counter.get()*2 );
    counter.subscribe(v=> bus.emit('counter:changed', v));
    bus.on('counter:changed', v=> console.log('Counter now:', v, 'doubled:', doubled.get()));

  // Graph
    const g = new Graph();
    g.addEdge('a','b',1); g.addEdge('b','c',1); g.addEdge('c','a',1); g.addEdge('b','d',2);
    console.log('Dijkstra from a:', Array.from(g.dijkstra('a').entries()));
    console.log('SCCs:', g.scc());

  // Template
    const tpl = 'Users:\n{{ for (let u of users) { }}- {{= u.name }} ({{= u.email }})\n{{ } }}';
    const out = renderTemplate(tpl, {users: db.query('SELECT * FROM users')});
    console.log(out);

  // Virtual DOM demo only if running in browser environment
    if (typeof document !== 'undefined') {
    const root = document.createElement('div');
    document.body.appendChild(root);
    let state = {items: ['x','y','z']};
    let tree = h('div',{}, h('h1',{}, 'Demo'), h('ul',{}, ...state.items.map(i=>h('li',{}, i))));
    root.appendChild(mount(tree));
    sched.schedule(()=>{
        state.items.push('new-'+Date.now());
        const newTree = h('div',{}, h('h1',{}, 'Demo Updated'), h('ul',{}, ...state.items.map(i=>h('li',{}, i))));
        patch(root, tree, newTree);
        tree = newTree;
    }, {priority:3, delay:500});
}

  // Scheduler tasks and cancellation
    const t1 = sched.schedule(async ()=>{ for (let i=0;i<3;i++){ counter.set(counter.get()+1); await new Promise(r=>setTimeout(r,100)); } }, {priority:2});
    const t2 = sched.schedule(()=>{ console.log('High priority immediate task'); }, {priority:1});

  // MicroPromise demo
    const p = new MicroPromise((res,rej)=>{ setTimeout(()=>res('done'), 200); });
    p.then(v=> console.log('MicroPromise resolved:', v));

  // Crypto
    console.log('SHA-256 of "hello":', await CryptoUtils.sha256('hello'));

  // bus async emission
    bus.on('async:work', async (n)=>{ await new Promise(r=>setTimeout(r, n)); console.log('async work done', n); });
    bus.emitAsync('async:work', 150);

  // Use db.query
    console.log('Adults:', db.query('SELECT name,email FROM users WHERE age > 25'));

  // HMAC
    console.log('HMAC simple:', await CryptoUtils.hmacSimple('secret','msg'));

  // Complex string manipulation + template render
  const html = renderTemplate('<ul>{{ for (let u of users) { }}<li>{{= u.name.toUpperCase() }}</li>{{ } }}</ul>', {users: db.query('SELECT * FROM users')});
    console.log('HTML:', html);

  // Graph heavy compute scheduled
    sched.schedule(()=>{ console.log('Dijkstra heavy:', Array.from(g.dijkstra('b').entries())); }, {priority:5, delay:100});

})();

// --------------------------- Exports for Node usage ---------------------------
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MicroPromise, TaskScheduler, EventBus, MiniDB, Signal, Computed, h, mount, diff, patch, renderTemplate, Graph, CryptoUtils };
}
