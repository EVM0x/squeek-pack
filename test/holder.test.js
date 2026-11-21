/* The holder gate: what a pasted address or member code is worth.

   holder.js talks to two endpoints, and neither is reachable from a test. The
   surface it exposes is still worth pinning, because the weight it computes
   decides the tier, and the tier decides what the page shows. So fetch and
   localStorage are stubbed and the answers are fed in directly. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadHolder(storage) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'holder.js'), 'utf8');
  const context = vm.createContext({
    Math,
    Date,
    String,
    Number,
    Array,
    Object,
    JSON,
    RegExp,
    Promise,
    Error,
    encodeURIComponent,
    localStorage: storage,
    fetch: () => {
      throw new Error('no test should reach the network');
    },
  });
  vm.runInContext(src + '\n;globalThis.__H = SqueekHolder;', context, { filename: 'holder.js' });
  return context.__H;
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

/** Feed one canned answer to the next fetch the module makes. */
function withFetch(answer, run) {
  const H = loadHolder(memoryStorage());
  const calls = [];
  const context = { fetch: null };
  return { H, calls, context, answer, run };
}

const ADDRESS = '0x' + 'ab'.repeat(20);

function holderWithFetch(answer) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'holder.js'), 'utf8');
  const calls = [];
  const context = vm.createContext({
    Math,
    Date,
    String,
    Number,
    Array,
    Object,
    JSON,
    RegExp,
    Promise,
    Error,
    encodeURIComponent,
    localStorage: memoryStorage(),
    fetch: (url) => {
      calls.push(url);
      return Promise.resolve({
        ok: answer.ok !== false,
        status: answer.status === undefined ? 200 : answer.status,
        json: () => (answer.json === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(answer.json)),
      });
    },
  });
  vm.runInContext(src + '\n;globalThis.__H = SqueekHolder;', context, { filename: 'holder.js' });
  return { H: context.__H, calls };
}

// ------------------------------------------------------------- address form

test('isAddress takes a 20-byte hex address and nothing else', () => {
  const { H } = holderWithFetch({ json: {} });
  assert.ok(H.isAddress(ADDRESS));
  assert.ok(H.isAddress('0X' + 'AB'.repeat(20)));
  assert.ok(H.isAddress('  ' + ADDRESS + '  '), 'surrounding space should be ignored');
  assert.equal(H.isAddress('0x' + 'ab'.repeat(19)), false, 'too short');
  assert.equal(H.isAddress('0x' + 'ab'.repeat(21)), false, 'too long');
  assert.equal(H.isAddress('ab'.repeat(20)), false, 'no 0x prefix');
  assert.equal(H.isAddress(''), false);
  assert.equal(H.isAddress(null), false);
});

test('isCode takes six to twelve alphanumerics', () => {
  const { H } = holderWithFetch({ json: {} });
  assert.ok(H.isCode('abcdef'));
  assert.ok(H.isCode('ABC123'));
  assert.ok(H.isCode('a1b2c3d4e5f6'));
  assert.equal(H.isCode('abcde'), false, 'five is too short');
  assert.equal(H.isCode('a1b2c3d4e5f6g'), false, 'thirteen is too long');
  assert.equal(H.isCode('abc-def'), false);
  assert.equal(H.isCode(''), false);
});

test('short() shows the ends of an address and leaves anything else alone', () => {
  const { H } = holderWithFetch({ json: {} });
  assert.equal(H.short(ADDRESS), '0xabab...abab');
  assert.equal(H.short('abc'), 'abc');
  assert.equal(H.short(''), '');
});

// ------------------------------------------------------------------- tiers

test('the tier ladder is one, three and six', () => {
  const { H } = holderWithFetch({ json: {} });
  assert.equal(H.tierFor(0), null);
  assert.equal(H.tierFor(1).id, 'light');
  assert.equal(H.tierFor(2).id, 'light');
  assert.equal(H.tierFor(3).id, 'heavy');
  assert.equal(H.tierFor(5).id, 'heavy');
  assert.equal(H.tierFor(6).id, 'prime');
  assert.equal(H.tierFor(1000).id, 'prime');
});

// ------------------------------------------------------------------ weight

test('a wallet is worth one per Squeek and two per staked Squeek', async () => {
  const { H } = holderWithFetch({
    json: { tokenCounts: { wallet: '4', staking: '3' }, tokens: [] },
  });
  const result = await H.check(ADDRESS);
  assert.equal(result.weight, 4 + 3 * 2);
  assert.equal(result.tier.id, 'prime');
  assert.equal(result.kind, 'wallet');
  assert.deepEqual([...result.labels], ['4 Squeeks', '3 staked']);
});

test('a wallet with a single Squeek is not called a Squeek s', async () => {
  const { H } = holderWithFetch({ json: { tokenCounts: { wallet: '1', staking: '0' }, tokens: [] } });
  const result = await H.check(ADDRESS);
  assert.deepEqual([...result.labels], ['1 Squeek']);
  assert.equal(result.tier.id, 'light');
});

test('an empty wallet gets no tier', async () => {
  const { H } = holderWithFetch({ json: { tokenCounts: {}, tokens: [] } });
  const result = await H.check(ADDRESS);
  assert.equal(result.weight, 0);
  assert.equal(result.tier, null);
  assert.deepEqual([...result.labels], ['no Squeek']);
});

test('the counts are read as numbers even though the api sends strings', async () => {
  const { H } = holderWithFetch({ json: { tokenCounts: { wallet: '2', staking: '2' }, tokens: [] } });
  const result = await H.check(ADDRESS);
  assert.equal(result.weight, 6);
  assert.equal(typeof result.weight, 'number');
});

test('a member profile is worth its badges, with trophies worth three', async () => {
  const { H } = holderWithFetch({
    json: {
      code: 'abc123',
      aura: 12,
      badges: [
        { id: 'holder.one', title: 'One' },
        { id: 'holder.two', title: 'Two' },
        { id: 'code.builder', title: 'Builder' },
        { id: 'code.the_tester', title: 'Tester' },
        { id: 'clout.first_squeek', title: 'First Squeek' },
      ],
    },
  });
  const result = await H.check('abc123');
  // two collections + one builder badge (the_tester does not count) + one trophy worth three
  assert.equal(result.weight, 2 + 1 + 3);
  assert.equal(result.kind, 'member');
  assert.equal(result.aura, 12);
  assert.deepEqual([...result.collections], ['One', 'Two']);
  assert.ok(result.labels.includes('trophy: First Squeek'));
});

test('the_tester badge does not count towards a weight', async () => {
  const { H } = holderWithFetch({ json: { code: 'abc123', badges: [{ id: 'code.the_tester', title: 'Tester' }] } });
  const result = await H.check('abc123');
  assert.equal(result.weight, 0);
  assert.equal(result.tier, null);
});

test('a member with nothing on it says so', async () => {
  const { H } = holderWithFetch({ json: { code: 'abc123', badges: [] } });
  const result = await H.check('abc123');
  assert.deepEqual([...result.labels], ['no holder or builder badge']);
  assert.equal(result.tier, null);
});

// ------------------------------------------------------------------ errors

test('an empty box is an error, not a lookup', async () => {
  const { H, calls } = holderWithFetch({ json: {} });
  await assert.rejects(() => H.check('   '), /paste an address or a member code/);
  assert.equal(calls.length, 0);
});

test('something that is neither shape is rejected before any request', async () => {
  const { H, calls } = holderWithFetch({ json: {} });
  await assert.rejects(() => H.check('!!'), /neither a 0x address nor a member code/);
  assert.equal(calls.length, 0);
});

test('a truncated address is told apart from a bad member code', async () => {
  const { H, calls } = holderWithFetch({ json: {} });
  await assert.rejects(async () => H.check('0xnope'), /40-character address/);
  assert.equal(calls.length, 0);
});

test('an address with no entry is reported as such', async () => {
  const { H } = holderWithFetch({ status: 404, ok: false });
  await assert.rejects(() => H.check(ADDRESS), /no Squeeks and no indexer entry/);
});

test('an indexer that is behind says so instead of reporting an empty wallet', async () => {
  const { H } = holderWithFetch({ json: { status: 'unavailable' } });
  await assert.rejects(() => H.check(ADDRESS), /has not caught up/);
});

test('a body that is not json is reported as unreadable', async () => {
  const { H } = holderWithFetch({ json: undefined });
  await assert.rejects(() => H.check(ADDRESS), /sent something unreadable|api\.php/);
});

test('the wallet endpoint is the one asked for', async () => {
  const { H, calls } = holderWithFetch({ json: { tokenCounts: {}, tokens: [] } });
  await H.check(ADDRESS.toUpperCase().replace('0X', '0x'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'https://api.squeekchain.com/v1/accounts/' + ADDRESS);
});

// ---------------------------------------------------------------- remembered

test('a tier survives a reload', () => {
  const storage = memoryStorage();
  const H = loadHolder(storage);
  H.save({ id: ADDRESS, kind: 'wallet', tier: H.tierFor(4), weight: 4, labels: ['4 Squeeks'] });
  const restored = H.active();
  assert.ok(restored);
  assert.equal(restored.tier.id, 'heavy');
  assert.equal(restored.weight, 4);
});

test('nothing saved means no tier', () => {
  const H = loadHolder(memoryStorage());
  assert.equal(H.active(), null);
});

test('a corrupted or unknown tier is ignored rather than trusted', () => {
  assert.equal(loadHolder(memoryStorage({ 'squeekpack.holder.v1': 'not json' })).active(), null);
  assert.equal(loadHolder(memoryStorage({ 'squeekpack.holder.v1': '{"tier":"nope"}' })).active(), null);
  assert.equal(loadHolder(memoryStorage({ 'squeekpack.holder.v1': '{"tier":null}' })).active(), null);
});

test('saving a profile with no tier clears what was there', () => {
  const storage = memoryStorage();
  const H = loadHolder(storage);
  H.save({ id: ADDRESS, kind: 'wallet', tier: H.tierFor(6), weight: 6, labels: [] });
  assert.ok(H.active());
  H.save({ id: ADDRESS, kind: 'wallet', tier: null, weight: 0, labels: [] });
  assert.equal(H.active(), null);
  assert.equal(storage.getItem('squeekpack.holder.v1'), null);
});

test('clear() forgets the tier', () => {
  const storage = memoryStorage();
  const H = loadHolder(storage);
  H.save({ id: ADDRESS, kind: 'wallet', tier: H.tierFor(2), weight: 2, labels: [] });
  H.clear();
  assert.equal(H.active(), null);
});
