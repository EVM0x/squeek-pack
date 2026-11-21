/* The shift seed, checked the way the page says a player should check it.

   round.js claims the seed is "verifiable by someone who does not trust this
   file": read SqueekCore.state() on chain, run the same FNV-1a, compare. That
   claim is only worth anything if the hash is the standard FNV-1a and the
   stream is the standard mulberry32, so the tests below implement both from
   scratch and compare — a reference that shares no code with the module. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* round.js is a browser script: two top level consts, no module.exports. Only
   SqueekRound is loaded here — SqueekCard needs a canvas. */
function loadRound() {
  const file = path.join(__dirname, '..', 'round.js');
  const src = fs.readFileSync(file, 'utf8');
  const cut = src.indexOf('const SqueekCard');
  assert.ok(cut > 0, 'round.js no longer defines SqueekCard after SqueekRound');
  const context = vm.createContext({ Math, Date, String, Number });
  vm.runInContext(src.slice(0, cut) + '\n;globalThis.__R = SqueekRound;', context, { filename: 'round.js' });
  return context.__R;
}

const R = loadRound();

/* ---- reference implementations, written from the published algorithms ---- */

function referenceFnv1a(str) {
  let hash = 0x811c9dc5;
  const bytes = Buffer.from(String(str), 'utf8');
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function referenceMulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ fnv1a

test('fnv1a matches the published 32-bit test vectors', () => {
  assert.equal(R.fnv1a(''), 0x811c9dc5);
  assert.equal(R.fnv1a('a'), 0xe40c292c);
  assert.equal(R.fnv1a('foobar'), 0xbf9cf968);
});

test('fnv1a agrees with an independent implementation', () => {
  const inputs = [
    'sqk:0:0:0',
    'sqk:1234:5678:91011',
    'sqk:block:7000000',
    'local:1700000000000:0.5',
    'the quick brown fox',
    '0x' + 'ab'.repeat(20),
  ];
  for (const input of inputs) {
    assert.equal(R.fnv1a(input), referenceFnv1a(input), input);
  }
});

test('fnv1a always returns an unsigned 32-bit number', () => {
  for (let i = 0; i < 200; i += 1) {
    const value = R.fnv1a('sqk:' + i);
    assert.ok(Number.isInteger(value), 'not an integer');
    assert.ok(value >= 0 && value <= 0xffffffff, value + ' is out of range');
  }
});

// ------------------------------------------------------------------- prng

test('the stream is mulberry32, not merely something repeatable', () => {
  for (const seed of [0, 1, 42, 0xdeadbeef, 0xffffffff]) {
    const mine = R.prng(seed);
    const reference = referenceMulberry32(seed);
    for (let i = 0; i < 50; i += 1) {
      assert.equal(mine(), reference(), `seed ${seed} draw ${i}`);
    }
  }
});

test('the same seed always produces the same stream', () => {
  const a = R.prng(12345);
  const b = R.prng(12345);
  for (let i = 0; i < 100; i += 1) assert.equal(a(), b());
});

test('every draw is a number in [0, 1)', () => {
  const next = R.prng(7);
  for (let i = 0; i < 1000; i += 1) {
    const value = next();
    assert.ok(value >= 0 && value < 1, value + ' is outside the unit interval');
  }
});

// ----------------------------------------------------------------- derive

test('a seed text shorter than three characters is refused', () => {
  assert.equal(R.derive('', 0), null);
  assert.equal(R.derive('ab', 0), null);
  assert.equal(R.derive(null, 0), null);
  assert.equal(R.derive(undefined, 0), null);
  assert.ok(R.derive('abc', 0));
});

test('the tag is the first four hex of the seed, in upper case', () => {
  for (const text of ['sqk:0:0:0', 'sqk:block:1234', 'anything at all']) {
    const round = R.derive(text, 0);
    const expected = round.seed.toString(16).padStart(8, '0').slice(0, 4).toUpperCase();
    assert.equal(round.tag, expected, text);
    assert.match(round.tag, /^[0-9A-F]{4}$/);
  }
});

test('the seed is the hash of the text, so anyone can recompute it', () => {
  const round = R.derive('sqk:1:2:3', 0);
  assert.equal(round.seed, referenceFnv1a('sqk:1:2:3'));
});

test('the same text always gives the same seed', () => {
  for (const text of ['sqk:0:0:0', 'sqk:block:99', 'x'.repeat(50)]) {
    assert.deepEqual(R.derive(text, 5), R.derive(text, 5));
  }
});

test('the block height rides along with the seed', () => {
  assert.equal(R.derive('sqk:0:0:0', 0).number, 0);
  assert.equal(R.derive('sqk:0:0:0', 42).number, 42);
  // a missing number falls back to zero rather than to undefined
  assert.equal(R.derive('sqk:0:0:0').number, 0);
});

// -------------------------------------------------------------- fromState

test('the seed comes from the three numbers the contract keeps', () => {
  const state = { raw: { settled: 11, work: 22, height: 33 }, blockHeight: 33 };
  const round = R.fromState(state, 33);
  assert.equal(round.seed, referenceFnv1a('sqk:11:22:33'));
  assert.equal(round.number, 33);
});

test('a different settled or work value gives a different shift', () => {
  const base = { raw: { settled: 1, work: 2, height: 3 }, blockHeight: 3 };
  const seeds = new Set([
    R.fromState(base, 3).seed,
    R.fromState({ raw: { settled: 9, work: 2, height: 3 } }, 3).seed,
    R.fromState({ raw: { settled: 1, work: 9, height: 3 } }, 3).seed,
    R.fromState({ raw: { settled: 1, work: 2, height: 9 } }, 3).seed,
  ]);
  assert.equal(seeds.size, 4, 'two different states produced the same seed');
});

test('a state with nothing in it still gives a seed', () => {
  const round = R.fromState({ raw: {}, blockHeight: 5 }, 5);
  assert.equal(round.seed, referenceFnv1a('sqk:0:0:0'));
});

test('a missing state is tolerated instead of throwing', () => {
  // The first line of fromState already guards against a missing state, and the
  // second line undid that guard by reading state.blockHeight — which only went
  // unnoticed because every caller passed a height, and `height || state.x`
  // short-circuits before it touches the missing state.
  assert.doesNotThrow(() => R.fromState(null, 10));
  assert.doesNotThrow(() => R.fromState(undefined, 10));
  assert.doesNotThrow(() => R.fromState(null));
  assert.doesNotThrow(() => R.fromState(undefined));
  assert.equal(R.fromState(null, 10).seed, referenceFnv1a('sqk:0:0:0'));
  assert.equal(R.fromState(null).number, 0);
});

// ------------------------------------------------------------- fromHeight

test('no height means no round', () => {
  assert.equal(R.fromHeight(0), null);
  assert.equal(R.fromHeight(undefined), null);
  assert.equal(R.fromHeight(null), null);
});

test('a height alone is a seed everyone can check', () => {
  const round = R.fromHeight(7000123);
  assert.equal(round.seed, referenceFnv1a('sqk:block:7000123'));
  assert.equal(round.number, 7000123);
});

test('two heights are two different shifts', () => {
  assert.notEqual(R.fromHeight(100).seed, R.fromHeight(101).seed);
});

// ------------------------------------------------------------------ local

test('a local shift is a real seed but a different one each time', () => {
  const first = R.local();
  const second = R.local();
  assert.ok(first && second);
  assert.match(first.tag, /^[0-9A-F]{4}$/);
  assert.notEqual(first.seed, second.seed);
});
