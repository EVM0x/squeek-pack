/* The packing rules, checked against the whitepaper.

   pack.js is arithmetic and nothing else, which is exactly why it can be tested
   without a browser: a shift is a pure function of a seed, a starting difficulty
   and the choices a player makes. Each block below pins one of the four rules
   quoted at the top of pack.js. */

const test = require('node:test');
const assert = require('node:assert/strict');

const P = require('../pack.js');

const ROUND_SECONDS = 600;

test('a round holds 10,000 work units, which is ten minutes at 60 ms', () => {
  assert.equal(P.CAPACITY, 10000);
  assert.equal(P.CAPACITY, ROUND_SECONDS * 1000 / 60);
});

test('a shift is four rounds', () => {
  assert.equal(P.ROUNDS, 4);
});

test('every burst size is a whole number of seconds at 60 ms', () => {
  for (const size of P.SIZES) {
    assert.equal(size % 50, 0, `${size} is not a multiple of fifty`);
  }
});

// ------------------------------------------------------------------ burstsFor

test('a round offers twelve bursts that add up to exactly 13,000', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const bursts = P.burstsFor(seed, 0);
    assert.equal(bursts.length, P.BURSTS);
    assert.equal(bursts.reduce((a, b) => a + b, 0), P.ROUND_WORK);
  }
});

test('the first eleven bursts come from the size table', () => {
  // SIZES is the pool the chute draws from. The twelfth burst is the remainder
  // that makes the round add up to exactly 13,000, so it is the only one that
  // can land off the table — the next test covers what it is allowed to be.
  const allowed = new Set(P.SIZES);
  for (let seed = 0; seed < 200; seed += 1) {
    for (let round = 0; round < 4; round += 1) {
      const bursts = P.burstsFor(seed, round);
      bursts.slice(0, -1).forEach((size, i) => {
        assert.ok(allowed.has(size), `seed ${seed} round ${round} burst ${i} was ${size}`);
      });
    }
  }
});

test('the remainder burst is still a whole number of seconds, in range', () => {
  const smallest = P.SIZES[0];
  const largest = P.SIZES[P.SIZES.length - 1];
  for (let seed = 0; seed < 200; seed += 1) {
    for (let round = 0; round < 4; round += 1) {
      const bursts = P.burstsFor(seed, round);
      for (const size of bursts) {
        assert.equal(size % 50, 0, `seed ${seed} round ${round} produced ${size}`);
        assert.ok(size >= smallest && size <= largest, `${size} is outside [${smallest}, ${largest}]`);
      }
    }
  }
});

test('every round overflows the bin, so packing is always a real decision', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    assert.ok(P.ROUND_WORK > P.CAPACITY);
    const bursts = P.burstsFor(seed, 0);
    assert.ok(bursts.reduce((a, b) => a + b, 0) > P.CAPACITY);
  }
});

test('the same seed and round always give the same bursts', () => {
  assert.deepEqual(P.burstsFor(12345, 2), P.burstsFor(12345, 2));
});

test('different rounds of one shift are dealt different bursts', () => {
  const rounds = [0, 1, 2, 3].map((i) => P.burstsFor(777, i).join(','));
  assert.equal(new Set(rounds).size, 4);
});

test('different seeds are dealt different bursts', () => {
  const a = P.burstsFor(1, 0).join(',');
  const b = P.burstsFor(2, 0).join(',');
  assert.notEqual(a, b);
});

test('the seed is read as an unsigned 32-bit integer', () => {
  assert.deepEqual(P.burstsFor(42, 0), P.burstsFor(42, 0));
  assert.deepEqual(P.roundSeed(0xffffffff, 0), P.roundSeed(-1, 0));
});

// ------------------------------------------------------------------- unitsFor

test('block units follow the paper: floor(work x 10^12 / D)', () => {
  assert.equal(P.unitsFor(10000, 1000), 10000000000000n);
  assert.equal(P.unitsFor(10000, 2000), 5000000000000n);
  assert.equal(P.unitsFor(1, 3), 333333333333n);        // floor, not round
  assert.equal(P.unitsFor(0, 1000), 0n);
});

test('block units stay exact past the double ceiling', () => {
  // At difficulty 1 a full round is 10,000 x 10^12 = 10^16, past 2^53 where
  // doubles stop counting ones. As a number that answer would be wrong.
  const units = P.unitsFor(10000, 1);
  assert.equal(typeof units, 'bigint');
  assert.equal(units.toString(), '10000000000000000');
  assert.equal(P.unitsFor(10000, 999), (10000n * 10n ** 12n) / 999n);
  assert.notEqual(Number(units), units);
});

test('difficulty cannot divide by zero', () => {
  assert.equal(P.unitsFor(100, 0), P.unitsFor(100, 1));
});

// ------------------------------------------------------------- nextDifficulty

test('difficulty follows the paper when a round carries at least 40 units', () => {
  const d = 5000;
  const w = 8000;
  const expected = Math.floor((29 * d + Math.floor((w * 1000) / 40)) / 30);
  assert.equal(P.nextDifficulty(d, w), Math.max(P.MIN_DIFFICULTY, expected));
});

test('a round under 40 work leaves difficulty alone', () => {
  for (const w of [0, 1, 39]) {
    assert.equal(P.nextDifficulty(4321, w), 4321);
  }
  assert.equal(P.nextDifficulty(4321, 40) !== 4321, true);
});

test('difficulty never drops below the paper floor', () => {
  assert.equal(P.nextDifficulty(0, 0), P.MIN_DIFFICULTY);
  assert.equal(P.nextDifficulty(P.MIN_DIFFICULTY, 0), P.MIN_DIFFICULTY);
  // 40 work is the lightest round that moves the ratchet, and its target is
  // exactly the floor, so the floor is where the sweep bottoms out.
  assert.equal(P.nextDifficulty(P.MIN_DIFFICULTY, 40), P.MIN_DIFFICULTY);
  for (let d = 1; d < 40000; d += 137) {
    for (const w of [0, 40, 500, 10000]) {
      assert.ok(P.nextDifficulty(d, w) >= P.MIN_DIFFICULTY);
    }
  }
});

test('a heavy round pushes difficulty up, a light one pulls it down', () => {
  const d = 20000;
  assert.ok(P.nextDifficulty(d, 10000) > d);
  assert.ok(P.nextDifficulty(d, 100) < d);
});

test('the ratchet moves by one thirtieth of the gap per round', () => {
  const d = 30000;
  const w = 40;                       // target = 1,000: far below d
  const after = P.nextDifficulty(d, w);
  // floor((29d + t)/30) = d - ceil((d - t)/30): the gap closes by a rounded-up
  // thirtieth, so difficulty can never stall one unit short of its target.
  assert.equal(d - after, Math.ceil((d - 1000) / 30));
});

// -------------------------------------------------------------------- a shift

test('a new shift starts at round zero with an empty bin', () => {
  const shift = P.newShift({ seed: 9, difficulty: 2500 });
  assert.equal(shift.roundIndex, 0);
  assert.equal(shift.bin, 0);
  assert.equal(shift.difficulty, 2500);
  assert.equal(shift.startDifficulty, 2500);
  assert.equal(shift.bursts.length, P.BURSTS);
  assert.equal(shift.done, false);
});

test('starting difficulty cannot start below the floor', () => {
  assert.equal(P.newShift({ seed: 1, difficulty: 0 }).difficulty, P.MIN_DIFFICULTY);
  assert.equal(P.newShift({ seed: 1 }).difficulty, P.MIN_DIFFICULTY);
});

test('taking a burst that fits fills the bin, taking one that does not is lost', () => {
  const shift = P.newShift({ seed: 3, difficulty: 1000 });
  const first = P.take(shift);
  assert.equal(first.ok, true);
  assert.equal(shift.bin, first.size);

  // Fill the bin to the brim, then push one more through the chute.
  while (!P.roundOver(shift)) P.take(shift);
  const before = shift.missed;
  const over = P.take(shift);
  if (over.why === 'over') {
    assert.equal(over.ok, false);
    assert.ok(shift.missed > before, 'a rejected passage is still work lost');
  }
});

test('work never moves from one round to the next', () => {
  const shift = P.newShift({ seed: 11, difficulty: 1000 });
  // Take the first burst only, then close the round.
  P.take(shift);
  const carried = shift.bin;
  assert.ok(carried > 0);
  P.settle(shift);
  assert.equal(shift.bin, 0, 'the new round starts empty');
  assert.equal(shift.rounds[0].work, carried);
});

test('passing a burst drops it', () => {
  const shift = P.newShift({ seed: 5, difficulty: 1000 });
  const size = P.current(shift);
  const out = P.pass(shift);
  assert.equal(out.ok, true);
  assert.equal(out.size, size);
  assert.equal(shift.missed, size);
  assert.equal(shift.bin, 0);
});

test('a round is over when the chute empties or the bin is full', () => {
  const shift = P.newShift({ seed: 8, difficulty: 1000 });
  while (P.current(shift) != null && !P.roundOver(shift)) P.pass(shift);
  assert.equal(P.roundOver(shift), true);
  assert.equal(P.current(shift), null);
});

test('four settled rounds end the shift', () => {
  const shift = P.newShift({ seed: 21, difficulty: 1000 });
  for (let i = 0; i < P.ROUNDS; i += 1) {
    while (!P.roundOver(shift)) P.take(shift);
    const row = P.settle(shift);
    assert.equal(row.index, i);
  }
  assert.equal(shift.done, true);
  assert.equal(shift.rounds.length, P.ROUNDS);
  assert.equal(P.current(shift), null);
});

test('a full bin is sealed and counted', () => {
  const shift = P.newShift({ seed: 13, difficulty: 1000 });
  // Take bursts until one would overflow, then stop: this is the best a round allows.
  while (P.current(shift) != null) {
    const size = P.current(shift);
    if (shift.bin + size > P.CAPACITY) break;
    P.take(shift);
  }
  const row = P.settle(shift);
  if (row.work === P.CAPACITY) {
    assert.equal(row.sealed, true);
    assert.equal(shift.sealed, 1);
  } else {
    assert.equal(row.sealed, false);
  }
});

test('a round never banks more than the capacity', () => {
  for (let seed = 0; seed < 100; seed += 1) {
    const shift = P.newShift({ seed, difficulty: 1000 });
    for (let i = 0; i < P.ROUNDS; i += 1) {
      while (!P.roundOver(shift)) P.take(shift);
      const row = P.settle(shift);
      assert.ok(row.work <= P.CAPACITY, `seed ${seed} round ${i} banked ${row.work}`);
    }
  }
});

test('blocks complete every billion block units', () => {
  const shift = P.newShift({ seed: 31, difficulty: 1000 });
  for (let i = 0; i < P.ROUNDS; i += 1) {
    while (!P.roundOver(shift)) P.take(shift);
    P.settle(shift);
  }
  assert.equal(P.blocks(shift), shift.totalUnits / 1000000000n);
  const fromRows = shift.rounds.reduce((a, r) => a + r.blocks, 0n);
  assert.equal(fromRows, P.blocks(shift));
});

test('the per-round block delta adds up to the running total', () => {
  const shift = P.newShift({ seed: 44, difficulty: 1000 });
  let running = 0n;
  for (let i = 0; i < P.ROUNDS; i += 1) {
    while (!P.roundOver(shift)) P.take(shift);
    const row = P.settle(shift);
    running += row.blocks;
    assert.equal(row.totalBlocks, running);
  }
});

test('fill rate is work packed over the whole shift capacity', () => {
  const shift = P.newShift({ seed: 55, difficulty: 1000 });
  for (let i = 0; i < P.ROUNDS; i += 1) {
    while (!P.roundOver(shift)) P.take(shift);
    P.settle(shift);
  }
  assert.equal(P.fillRate(shift), shift.totalWork / (P.CAPACITY * P.ROUNDS));
  assert.ok(P.fillRate(shift) >= 0 && P.fillRate(shift) <= 1);
});

test('an untouched shift has a fill rate of zero', () => {
  assert.equal(P.fillRate(P.newShift({ seed: 1, difficulty: 1000 })), 0);
});

test('playing the same seed twice gives byte-identical results', () => {
  function play(seed) {
    const shift = P.newShift({ seed, difficulty: 1000 });
    for (let i = 0; i < P.ROUNDS; i += 1) {
      while (!P.roundOver(shift)) P.take(shift);
      P.settle(shift);
    }
    return JSON.stringify(shift, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  }
  assert.equal(play(99), play(99));
});
