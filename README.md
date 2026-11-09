# Stretchtext, stretched

**[Read and play](https://rndmcnlly.github.io/stretchtext/)**

A small, dependency-free experiment in reading by pulling on the writing. The demo is an essay about stretchtext, with ten independently manipulable passages and thirty complete readings.

Pull an underlined passage down: the earlier reading stretches, then pops at halfway to its compressed replacement. Keep pulling to let the replacement relax into its natural shape. Pull up to reverse it. You can also choose a reading in the ledger, or focus a passage and use the arrow keys (Shift moves in smaller increments).

## Why

[Ted Nelson's stretchtext](https://en.wikipedia.org/wiki/Stretchtext) expands and contracts prose in place, keeping the surrounding text as context. This prototype brings that idea together with [declarative dragging](https://declarative-dragging.github.io/) and agent-authored alternative readings.

The agent proposes coherent readings; the reader explores them before accepting anything. The immediate interaction runs locally, without a model call for each movement. Dragging lets the reader probe what the agent is prepared to offer, but a pinned note can ask for something outside that space.

This is an experiment inspired by those ideas, not an implementation of the full declarative-dragging system or a reconstruction of Nelson's original interface.

## Author prose, not animations

All authoring lives in ordinary HTML. A stretchable passage contains two or more complete alternative readings:

```html
<p>
  <span data-stretch="detail" data-label="Detail">
    <span data-reading="Compact">Detail can stay inside the passage</span>
    <span data-reading="Expanded" hidden>Detail can stay inside the passage, preserving the context that made the reader ask for it</span>
  </span>.
</p>
```

Add another `data-stretch` span and the shared engine discovers it. No phrase-specific JavaScript, word IDs, correspondence annotations, coordinates, or animation instructions are required.

Authoring constraints:

- Give each passage a unique `data-stretch` ID and a readable `data-label`.
- Put two or more ordered `data-reading` alternatives inside it, with all but the first marked `hidden`.
- Use plain text inside readings. Nested stretches and rich inline formatting are not supported.
- Keep each reading below 257 word-boundary tokens, including punctuation.
- Make every reading coherent in its surrounding sentence, and every combination of independent readings coherent together.
- Keep qualifications and uncertainty intact. More detail should not quietly turn into a different claim.

Without JavaScript, the first readings remain ordinary readable prose.

## Two layers: correspondence and motion

The engine infers both layers from neighbouring readings:

1. **Correspondence:** `Intl.Segmenter` separates words and punctuation. An exact-token longest common subsequence (ignoring word case) finds preserved text; unique unmatched runs containing at least two words are candidates for moves. Remaining gaps are insertions, deletions, or replacements.
2. **Stretch envelopes:** minimal textual edits are not necessarily good animation units. An insertion after a comma should not make that comma, or the preceding word alone, carry a whole paragraph. The engine borrows nearby matched context until the spans are within a 2:1 length ratio, or falls back to the whole phrase.

The motion layer therefore may stretch text that the correspondence layer calls unchanged. Envelopes fill their allocated space with real text rather than blank insertion placeholders. Complete readings switch at halfway; words are never revealed one at a time. Words outside envelopes keep their shape and travel between positions measured from real browser layouts. Moved runs take an arcing path.

The 2:1 rule counts whitespace-delimited clusters, not meaning. It is a deliberately simple heuristic, not a linguistic parser or a claim that matched text means the same thing.

Open **What moves, and why** below the essay to inspect the inferred correspondence and envelopes. For a reproducible intermediate pose, append a fragment such as [`#context=1.4`](https://rndmcnlly.github.io/stretchtext/#context=1.4). An inspection pose does not count as exploration.

## Exploration is not endorsement

Each passage tracks exploration separately from acceptance. **Keep** records only explored passages, never untouched defaults. Notes stay separate, pinned to the passage and reading where they were written. Undo restores the previous local keep.

State lives in page memory and disappears on reload unless you download the exploration record as JSON. The public demo has no backend, analytics, or live inference. The host serving the page may still log ordinary requests. In an OpenChamber render frame, Keep can submit the record through the host's `openchamber.submit` bridge.

## Run locally

Open `index.html` directly in a modern browser, or serve this directory:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then visit <http://127.0.0.1:8000/>. There is no installation or build step.

Run the dependency-free checks with Node.js:

```bash
node --test stretchtext.test.cjs
```

The tests cover segmentation, token and envelope accounting, randomized edits, whole-reading transitions, envelope widths, independent state, untouched exclusion, keep/undo, pinned notes, and concurrent per-passage animations. Their DOM double checks contracts, not actual browser geometry.

## Limits

- Matching is lexical, not semantic. Repeated words can be paired incorrectly.
- Envelope selection can borrow too much or too little context.
- Moving words can overlap or briefly leave empty space at their old and new positions. Line wrapping and surrounding prose can still jump.
- A drag that starts on a passage captures touch movement, which can interfere with page scrolling.
- Keyboard controls and reduced-motion handling exist, but screen-reader and cross-browser behaviour have not been comprehensively tested.
- The author still frames the possible readings. No automatic check guarantees that the alternatives are faithful or mutually coherent.

## Files and publishing

- `index.html`: essay, semantic authoring markup, styles, analysis, and interaction engine.
- `stretchtext.test.cjs`: tests using only Node's standard library.

GitHub Pages serves the root of the `main` branch. Edit the HTML and push: no bundler or deployment framework is needed.

Built by Adam Smith in dialogue with OpenAI and Claude coding agents.
