// Dependency-free checks: node --test stretchtext.test.cjs
// The DOM double checks render contracts, not real browser line wrapping.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const analysis = script.slice(script.indexOf('const segmenter'), script.indexOf('// One speculative layout'));
const {analyze, tokenize} = vm.runInNewContext(analysis + '\n({analyze, tokenize})');
const plain = x => JSON.parse(JSON.stringify(x));
const text = (clusters, [lo, hi]) => clusters.slice(lo, hi).map(c => c.text).join(' ');

// Both layers: every token is matched, moved, or edited exactly once, and
// every cluster either glides rigidly onto one partner or sits in one envelope.
function valid(p) {
  const seenA = new Set(), seenB = new Set();
  for (const [a, b] of p.anchors) {
    assert.equal(p.ab[a], b); assert.equal(p.ba[b], a);
    assert.equal(p.a[a].key, p.b[b].key); seenA.add(a); seenB.add(b);
  }
  for (const move of p.moves) {
    assert(p.a.slice(move.a, move.a + move.length).filter(t => t.word).length >= 2);
    for (let k = 0; k < move.length; k++) {
      const a = move.a + k, b = move.b + k;
      assert(!seenA.has(a)); assert(!seenB.has(b));
      assert.equal(p.ab[a], b); assert.equal(p.ba[b], a);
      assert.equal(p.a[a].key, p.b[b].key); seenA.add(a); seenB.add(b);
    }
  }
  for (const [index, group] of p.groups.entries()) {
    for (const a of group.a) { assert(!seenA.has(a)); seenA.add(a); assert.equal(p.ab[a], -1); assert.equal(p.ag[a], index); }
    for (const b of group.b) { assert(!seenB.has(b)); seenB.add(b); assert.equal(p.ba[b], -1); assert.equal(p.bg[b], index); }
  }
  assert.equal(seenA.size, p.a.length); assert.equal(seenB.size, p.b.length);
  // No envelope is ever empty or punctuation-only on either side: no blank slots.
  const inEnv = (links, c) => links[c]?.env !== undefined;
  p.envs.forEach((e, k) => {
    assert(e.a[1] > e.a[0] && e.b[1] > e.b[0]);
    assert(p.a.slice(p.ac[e.a[0]].start, p.ac[e.a[1] - 1].end).some(t => t.word));
    assert(p.b.slice(p.bc[e.b[0]].start, p.bc[e.b[1] - 1].end).some(t => t.word));
    for (let c = e.a[0]; c < e.a[1]; c++) assert.equal(p.linkA[c].env, k);
    for (let c = e.b[0]; c < e.b[1]; c++) assert.equal(p.linkB[c].env, k);
  });
  for (const [side, clusters, tokens, links, otherLinks, map, other] of [[0, p.ac, p.a, p.linkA, p.linkB, p.ab, p.b], [1, p.bc, p.b, p.linkB, p.linkA, p.ba, p.a]]) {
    clusters.forEach((c, i) => {
      const link = links[i]; assert(link);
      for (let x = c.start; x < c.end; x++) {
        if (inEnv(links, i)) {
          // Closure: a matched token inside an envelope has its partner in the same envelope.
          if (map[x] >= 0) assert.equal(otherLinks[other[map[x]].cluster].env, link.env);
        } else {
          assert(map[x] >= 0); assert.equal(other[map[x]].cluster, link.to);
        }
      }
      if (!inEnv(links, i)) assert.equal(otherLinks[link.to].to, i);
    });
  }
}

test('word-boundary segmentation keeps exact text and never invents spaces', () => {
  const {tokens, clusters} = tokenize("Friday at 11:59 pm, don't e-mail me;");
  assert.deepEqual(plain(clusters.map(c => c.text)), ['Friday', 'at', '11:59', 'pm,', "don't", 'e-mail', 'me;']);
  assert.deepEqual(plain(tokens.slice(2, 7).map(t => t.text)), ['11', ':', '59', 'pm', ',']);
  assert.equal(tokens.find(t => t.text === ',').word, false);
});

test('correspondence: preservation, insertion, deletion, replacement, and block move', () => {
  const same = analyze('we can choose freely', 'we can choose freely');
  assert.equal(same.anchors.length, 4); assert.equal(same.groups.length, 0); assert.equal(same.envs.length, 0);
  assert.equal(analyze('we choose', 'we can freely choose').groups[0].kind, 'insert');
  assert.equal(analyze('we can freely choose', 'we choose').groups[0].kind, 'delete');
  assert.equal(analyze('we choose quickly', 'we choose with care').groups[0].kind, 'replace');
  const move = analyze('you can explore the proposal before accepting it', 'before accepting it you can explore the proposal');
  assert.equal(move.moves.length, 1); assert.equal(move.moves[0].length, 3);
  assert.equal(move.envs.length, 0); valid(move);
  // Case folds; punctuation is its own token, so "time" still matches "time,".
  const order = analyze('Email me if you need more time', 'If you need more time, email me');
  assert.equal(order.moves.length, 1); valid(order);
  assert.deepEqual(plain(order.envs.map(e => [text(order.ac, e.a), text(order.bc, e.b)])), [['time', 'time,']]);
  valid(analyze('one two one two three', 'three one two one two'));
  assert.throws(() => analyze('word '.repeat(257), 'word'), /257/);
});

test('envelopes borrow a meaningful phrase instead of a comma, a lone word, or a blank', () => {
  // The motivating case: "freely" vs "freely," must not carry a whole clause.
  const long = analyze('we can choose freely', 'we can choose freely, after reading every proposal the agent has prepared for us');
  valid(long); assert.equal(long.envs.length, 1);
  assert.equal(text(long.ac, long.envs[0].a), 'we can choose freely');
  // A short elaboration borrows only enough preceding context.
  const exact = analyze('The project deadline is now Friday', 'The project deadline is now Friday at 11:59 pm');
  valid(exact);
  assert.deepEqual(plain(exact.envs.map(e => [text(exact.ac, e.a), text(exact.bc, e.b)])), [['is now Friday', 'is now Friday at 11:59 pm']]);
  // A pure prefix insertion borrows following words, since there is nothing before.
  const warm = analyze('See you in section', 'Thanks for your patience this week, and see you in section');
  valid(warm); assert.equal(text(warm.ac, warm.envs[0].a), 'See you in section');
  // Pure deletions are symmetric.
  const folded = analyze('ten percent per day, up to thirty percent', 'ten percent per day');
  valid(folded); assert(folded.envs[0].a[1] - folded.envs[0].a[0] <= 2 * (folded.envs[0].b[1] - folded.envs[0].b[0]));
});

test('both layers stay consistent across randomized edits with punctuation', () => {
  let seed = 19;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  const word = () => `w${random(8)}${['', '', '', ',', ';', '.'][random(6)]}`;
  for (let trial = 0; trial < 400; trial++) {
    const a = Array.from({length: 1 + random(24)}, word);
    const b = a.slice();
    for (let k = 0; k < 4; k++) b.splice(random(b.length + 1), random(4), ...Array.from({length: random(4)}, word));
    if (random(2)) b.reverse();
    if (!b.length) b.push(word());
    valid(analyze(a.join(' '), b.join(' ')));
  }
});

class Text {
  constructor(text) { this.textContent = text; }
}
class Element {
  constructor() {
    this.childNodes = []; this.attrs = {}; this.dataset = {}; this.hidden = false; this.parent = null;
    this.style = {setProperty(k, v) { this[k] = String(v); }};
    const classes = new Set();
    this.classList = {
      add: (...c) => c.forEach(x => classes.add(x)), remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, on = !classes.has(c)) => (on ? classes.add(c) : classes.delete(c), on), contains: c => classes.has(c)
    };
  }
  get children() { return this.childNodes.filter(c => c instanceof Element); }
  get textContent() { return this.childNodes.map(c => c.textContent).join(''); }
  set textContent(text) { this.childNodes = text ? [new Text(text)] : []; }
  get firstChild() { return this.childNodes[0]; }
  append(...nodes) { for (const n of nodes) { if (n instanceof Element) n.parent = this; this.childNodes.push(n); } }
  replaceChildren(...nodes) { this.childNodes = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.childNodes = this.parent.childNodes.filter(c => c !== this); }
  hasAttribute(key) { return Object.hasOwn(this.attrs, key); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  querySelector() { return null; }
  addEventListener() {}
  focus() {}
  getBoundingClientRect() { return {left: 0, top: 0, width: this.textContent.length * 10, height: 30}; }
}

// Phrases come straight from the page's markup, plus one the engine has never seen.
function mounted(globals = {}) {
  const phrases = [];
  const reading = (label, body) => { const r = new Element(); r.textContent = body; r.dataset.reading = label; r.attrs['data-reading'] = label; return r; };
  for (const match of html.matchAll(/<span data-stretch="([^"]+)" data-label="([^"]+)">((?:<span data-reading="[^"]+"(?: hidden)?>[^<]*<\/span>)+)<\/span>/g)) {
    const el = new Element(); el.dataset = {stretch: match[1], label: match[2]};
    for (const r of match[3].matchAll(/<span data-reading="([^"]+)"(?: hidden)?>([^<]+)<\/span>/g)) el.append(reading(r[1], r[2]));
    phrases.push(el);
  }
  assert(phrases.length >= 3, 'demo phrases should parse from the markup');
  const extra = new Element(); extra.dataset = {stretch: 'unseen', label: 'Unseen'};
  extra.append(reading('Short', 'a choice'), reading('Long', 'a more detailed choice, freely made'));
  phrases.push(extra);
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const context = vm.createContext({
    document: {getElementById: get, querySelectorAll: () => phrases, createElement: () => new Element(), createTextNode: t => new Text(t),
      body: new Element(), documentElement: new Element(), addEventListener() {}},
    window: {addEventListener() {}}, location: {hash: ''}, URLSearchParams, getComputedStyle: () => ({fontSize: '24px'}), performance: {now: () => 0}, console, assert, ...globals
  });
  vm.runInContext(script, context);
  return context;
}

test('every intermediate state shows one whole reading, with no blank slots and constant room', () => {
  vm.runInContext(`
    assert(widgets.length >= 4 && widgets.at(-1).spec.id === 'unseen');
    for (const w of widgets) for (const frame of w.frames) for (const t of [.01,.25,.499999,.5,.75,.99]) {
      preview(w,frame.index+t,'test');
      const side=t<.5?0:1, view=frame.views[side];
      assert.equal(view.el.hidden,false);
      assert.equal(frame.views[1-side].el.hidden,true);
      assert(w.readings.every(r=>r.hidden));
      // Exact text of one complete reading: no word-by-word reveal, no invented spaces.
      assert.equal(view.el.textContent,w.spec.readings[frame.index+side].text);
      for (const item of view.items) {
        const natural=w.clusterWidths[view.depth][item.cluster], width=parseFloat(item.box.style.width);
        assert(natural>0 && Number.isFinite(width) && width>0, 'every box holds real words');
        assert(!/NaN|Infinity/.test(item.ink.style.transform));
        if (item.env<0) assert.equal(width,natural);
      }
      // Each envelope's clusters share one scale, so the phrase stretches as a unit.
      for (const [k] of frame.plan.envs.entries()) {
        const scales=view.items.filter(i=>i.env===k).map(i=>parseFloat(i.box.style.width)/w.clusterWidths[view.depth][i.cluster]);
        assert(scales.every(s=>Math.abs(s-scales[0])<1e-9));
      }
      // Room is conserved across the pop, up to case-folded rigid words of different width.
      const total=v=>v.items.reduce((sum,i)=>sum+parseFloat(i.box.style.width),0)+(v.items.length-1)*w.space;
      const slack=frame.views[0].items.filter(i=>i.env<0).reduce((s,i)=>s+Math.abs(w.clusterWidths[frame.index][i.cluster]-w.clusterWidths[frame.index+1][i.other]),0);
      assert(Math.abs(total(frame.views[0])-total(frame.views[1]))<=slack+1e-7);
    }
  `, mounted());
});

test('independent state, untouched exclusion, immutable keep, undo, separate notes', () => {
  vm.runInContext(`
    preview(widgets[0],.5,'test');
    assert(widgets.slice(1).every(w=>!w.touched && w.preview===0));
    activate(widgets[1]); preview(active,1,'test'); $('accept').onclick();
    assert.deepEqual(Object.keys(state.accepted.values),[widgets[0].spec.id,widgets[1].spec.id]);
    assert(!(widgets[2].spec.id in state.accepted.values));
    assert.equal(state.accepted.touched[widgets[2].spec.id],false);
    const kept=JSON.stringify(state.accepted); preview(widgets[0],2,'test');
    assert.equal(JSON.stringify(state.accepted),kept);
    assert.equal(status(widgets[0])[0],'changed');
    $('note').value='I want a 48 hour grace window'; activate(widgets[2]); $('note-form').onsubmit({preventDefault(){}});
    assert.equal(state.notes[0].on,widgets[2].spec.id);
    assert(!widgets[2].touched, 'a note is not exploration');
    assert(!(widgets[2].spec.id in values()));
    $('undo').onclick(); assert.equal(state.accepted,null);
    activate(widgets.at(-1)); preview(active,1,'test'); assert.equal(active.spec.id,'unseen');
  `, mounted());
});

test('glides are per phrase, count as exploration at once, and Keep lands them', () => {
  // A stalled frame clock, as in a background tab: frames are requested, never run.
  const frames = [];
  vm.runInContext(`
    go(widgets[0],1,'stop'); go(widgets[1],2,'stop');
    assert(widgets[0].touched && widgets[1].touched && widgets[0].progress===0);
    $('accept').onclick();
    assert.equal(state.accepted.values[widgets[0].spec.id].depth,1);
    assert.equal(state.accepted.values[widgets[1].spec.id].depth,2);
    assert(!widgets[2].touched && !(widgets[2].spec.id in state.accepted.values));
  `, mounted({requestAnimationFrame: f => frames.push(f), cancelAnimationFrame() {}}));
  assert(frames.length >= 2);
});
