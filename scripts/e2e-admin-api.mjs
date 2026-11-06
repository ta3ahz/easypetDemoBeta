// E2E for /api/admin/* against a RESTORED COPY of the live data in an in-memory MongoDB,
// served by the real production build (`next start`). Never touches the live DB.
// Usage: node e2e-admin-api.mjs <backendDir> <backupDbDir>
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs'; import path from 'path';

const [backendDir, dumpDir] = process.argv.slice(2);
const require = createRequire(path.join(backendDir, 'package.json'));
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient, ObjectId } = require('mongodb');
const { EJSON } = require('bson');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = 3999, BASE = `http://127.0.0.1:${PORT}`, SECRET = 'e2e-only-secret';
const TEST_EMAIL = 'e2e-admin@copy.local', TEST_PASS = 'e2e-pass-123';
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${msg}`); };

// ---- restored copy ----
const mem = await MongoMemoryServer.create();
const uri = mem.getUri('easypet');
const cli = new MongoClient(uri); await cli.connect(); const db = cli.db('easypet');
const man = JSON.parse(fs.readFileSync(path.join(dumpDir, 'manifest.json')));
for (const name of Object.keys(man.collections)) {
  for (const ix of JSON.parse(fs.readFileSync(path.join(dumpDir, `${name}.indexes.json`)))) {
    if (ix.name === '_id_') continue; const { key, name: n, v, ns, ...o } = ix;
    await db.collection(name).createIndex(key, { name: n, ...o });
  }
  const docs = EJSON.parse(fs.readFileSync(path.join(dumpDir, `${name}.ejson`), 'utf8'), { relaxed: false });
  if (docs.length) await db.collection(name).insertMany(docs);
}
await db.collection('admins').insertOne({ email: TEST_EMAIL, passwordHash: await bcrypt.hash(TEST_PASS, 10), name: 'E2E', createdAt: new Date(), updatedAt: new Date() });
console.log('restored copy:', Object.entries(man.collections).map(([k, v]) => `${k}=${v.exported}`).join(' '));

// ---- production build on the copy ----
const srv = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  cwd: backendDir, env: { ...process.env, MONGODB_URI: uri, JWT_SECRET: SECRET, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = ''; srv.stdout.on('data', (d) => (srvLog += d)); srv.stderr.on('data', (d) => (srvLog += d));
const cleanup = async () => { srv.kill('SIGTERM'); await cli.close(); await mem.stop(); };
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const call = async (method, p, { token, body, headers } = {}) => {
  const r = await fetch(BASE + p, { method, redirect: 'manual', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { s: r.status, j, t, h: r.headers };
};

try {
  // SAFETY: test admin exists only in the copy. If login fails we are NOT on the copy -> abort before any write.
  const login = await call('POST', '/api/admin/login', { body: { email: TEST_EMAIL, password: TEST_PASS } });
  if (login.s !== 200) { console.log('ABORT: not running on the restored copy', login.s, login.t); await cleanup(); process.exit(2); }
  const T = login.j.token;

  console.log('\nauth');
  ok(login.j.email === TEST_EMAIL && typeof T === 'string', 'login with valid credentials returns a token');
  ok((await call('GET', '/api/admin/me')).s === 401, 'no token -> 401');
  ok((await call('GET', '/api/admin/me', { token: 'garbage' })).s === 401, 'garbage token -> 401');
  const devTok = jwt.sign({ kind: 'device', sub: new ObjectId().toString(), uid: 'ABC' }, SECRET);
  ok((await call('GET', '/api/admin/devices', { token: devTok })).s === 401, 'device token cannot use admin API');
  const owner = await db.collection('devices').findOne({});
  const ownerTok = jwt.sign({ kind: 'owner', sub: String(owner._id), user: 'x' }, SECRET);
  ok((await call('GET', '/api/admin/devices', { token: ownerTok })).s === 401, 'clinic (owner) token cannot use admin API');
  const ghost = jwt.sign({ kind: 'admin', sub: new ObjectId().toString(), email: 'ghost@x' }, SECRET);
  ok((await call('GET', '/api/admin/me', { token: ghost })).s === 401, 'token for a non-existent admin -> 401');
  ok((await call('GET', '/api/admin/me', { token: T })).j?.email === TEST_EMAIL, '/me returns the admin');
  ok((await call('POST', '/api/admin/login', { body: { email: TEST_EMAIL, password: 'wrong' } })).s === 401, 'wrong password -> 401');
  let last; for (let i = 0; i < 9; i++) last = await call('POST', '/api/admin/login', { body: { email: 'brute@x', password: 'x' + i } });
  ok(last.s === 429, 'repeated failures are rate-limited (429)');

  console.log('\nmeasurements');
  const m1 = await call('GET', '/api/admin/measurements?limit=40', { token: T });
  const nTests = await db.collection('tests').countDocuments();
  ok(m1.s === 200 && m1.j.stats.measurements === nTests, `stats.measurements = ${nTests}`);
  ok(m1.j.stats.positive === await db.collection('tests').countDocuments({ 'result.positive': true }), 'stats.positive matches DB');
  ok(m1.j.tests.length === Math.min(40, nTests), 'page 1 size');
  const m2 = await call('GET', `/api/admin/measurements?limit=40&before=${m1.j.nextBefore}`, { token: T });
  const ids = new Set([...m1.j.tests, ...m2.j.tests].map((t) => t.id));
  ok(ids.size === Math.min(80, nTests) && (nTests > 80 || m2.j.nextBefore === null), 'pagination covers all tests without duplicates');
  const pos = await call('GET', '/api/admin/measurements?result=positive&limit=200', { token: T });
  ok(pos.j.tests.every((t) => t.positive) && pos.j.tests.length === m1.j.stats.positive, 'positive filter');
  const anyDev = m1.j.tests.find((t) => t.device)?.device;
  const byDev = await call('GET', `/api/admin/measurements?device=${anyDev.id}&limit=200`, { token: T });
  ok(byDev.j.tests.length === await db.collection('tests').countDocuments({ device: new ObjectId(anyDev.id) }), 'device filter');
  const csv = await call('GET', '/api/admin/measurements/export', { token: T });
  ok(csv.s === 200 && csv.t.trim().split('\n').length === nTests + 1 && csv.t.startsWith('date,device,'), 'CSV export: header + one row per test');

  console.log('\ndevices');
  const dl = await call('GET', '/api/admin/devices', { token: T });
  ok(dl.s === 200 && dl.j.devices.length === await db.collection('devices').countDocuments(), 'lists every device');
  const d = dl.j.devices.find((x) => x.tests > 0) || dl.j.devices[0];
  ok(/^\d{8}$/.test(d.recoveryPin), 'recovery PIN present (8 digits)');
  const D = `/api/admin/devices/${d.id}`;
  const txBefore = await db.collection('credittxes').countDocuments({ device: new ObjectId(d.id) });
  ok((await call('PATCH', D, { token: T, body: { name: 'E2E Renamed' } })).s === 200, 'rename');
  ok((await call('PATCH', D, { token: T, body: { credits: d.credits + 7 } })).s === 200, 'set credits +7');
  ok((await call('PATCH', D, { token: T, body: { credits: -1 } })).s === 400, 'negative credits rejected');
  ok((await call('PATCH', D, { token: T, body: { config: { i0: 12000, a: 150.5, b: 1, ths: 80 } } })).s === 200, 'calibration');
  ok((await call('PATCH', D, { token: T, body: { config: { i0: 'x', a: 1, b: 1, ths: 1 } } })).s === 400, 'bad calibration rejected');
  ok((await call('PATCH', D, { token: T, body: { pin: '12' } })).s === 400, 'short PIN rejected');
  ok((await call('PATCH', D, { token: T, body: { pin: '246810' } })).s === 200, 'PIN reset');
  ok((await call('PATCH', D, { token: T, body: { status: 'suspended' } })).s === 200, 'suspend');
  ok((await call('PATCH', D, { token: T, body: { status: 'banana' } })).s === 400, 'bad status rejected');
  const after = await db.collection('devices').findOne({ _id: new ObjectId(d.id) });
  ok(after.name === 'E2E Renamed' && after.credits === d.credits + 7 && after.config.i0 === 12000 && after.config.a === 150.5 && after.status === 'suspended', 'DB reflects all changes');
  const crypto = await import('crypto');
  ok(crypto.createHash('sha256').update(after.pinSalt + '246810').digest('hex') === after.pinCheck, 'PIN verifier matches new PIN (device can verify offline)');
  ok(await db.collection('credittxes').countDocuments({ device: new ObjectId(d.id) }) === txBefore + 1, 'credit change ledgered once (admin_grant)');
  ok((await call('PATCH', D, { token: T, body: { status: 'active' } })).s === 200, 're-activate');
  ok((await call('PATCH', '/api/admin/devices/nope', { token: T, body: { name: 'x' } })).s === 404, 'bad id -> 404');
  const testsOfDev = await db.collection('tests').countDocuments({ device: new ObjectId(d.id) });
  ok((await call('DELETE', D, { token: T })).s === 200, 'delete device');
  ok(!(await db.collection('devices').findOne({ _id: new ObjectId(d.id) })) && await db.collection('tests').countDocuments({ device: new ObjectId(d.id) }) === testsOfDev, 'device gone, its measurements kept');

  console.log('\nfirmware');
  const fwl = await call('GET', '/api/admin/firmware', { token: T });
  ok(fwl.s === 200 && fwl.j.releases.length === await db.collection('firmwares').countDocuments(), 'lists releases');
  const prevActive = fwl.j.releases.find((r) => r.active);
  ok((await call('POST', '/api/admin/firmware', { token: T, body: { version: '9.9.9', url: 'http://x', active: false } })).s === 400, 'non-HTTPS URL rejected');
  ok((await call('POST', '/api/admin/firmware', { token: T, body: { version: 'v9', url: 'https://x/y.bin' } })).s === 400, 'bad version rejected');
  const add = await call('POST', '/api/admin/firmware', { token: T, body: { version: '9.9.9', url: 'https://example.com/fw.bin', sha256: 'a'.repeat(64), notes: 'e2e', active: false } });
  ok(add.s === 200, 'add draft release');
  ok((await call('PATCH', `/api/admin/firmware/${add.j.id}`, { token: T, body: { active: true } })).s === 200, 'set active');
  ok(await db.collection('firmwares').countDocuments({ active: true }) === 1 && (await db.collection('firmwares').findOne({ active: true })).version === '9.9.9', 'exactly one active release');
  if (prevActive) ok((await call('PATCH', `/api/admin/firmware/${prevActive.id}`, { token: T, body: { active: true } })).s === 200, 'restore previous active');
  ok((await call('DELETE', `/api/admin/firmware/${add.j.id}`, { token: T })).s === 200, 'delete release');

  console.log('\ncodes + audit');
  const nc = await call('POST', '/api/admin/codes', { token: T, body: { credits: 25 } });
  ok(nc.s === 200 && /^UBX-[0-9A-F]{8}$/.test(nc.j.code), `generate code (${nc.j?.code})`);
  ok((await call('POST', '/api/admin/codes', { token: T, body: { credits: 0 } })).s === 400, '0 credits rejected');
  const cl = await call('GET', '/api/admin/codes', { token: T });
  ok(cl.j.codes[0].code === nc.j.code && cl.j.codes[0].credits === 25 && !cl.j.codes[0].used, 'new code listed first, unused');
  const au = await call('GET', '/api/admin/audit', { token: T });
  ok(au.j.logs.some((l) => l.action === 'create_code' && l.detail.endsWith('[app]') && l.actor === TEST_EMAIL), 'audit log records app actions tagged [app]');

  console.log('\nexisting system unaffected');
  ok((await call('GET', '/api/health')).j?.ok === true, '/api/health ok');
  ok((await call('GET', '/login')).s === 200, 'web /login page renders');
  const noCookie = await call('GET', '/admin');
  ok([307, 308, 302, 303].includes(noCookie.s) || noCookie.t.includes('NEXT_REDIRECT'), 'web /admin still requires login');
  const admin0 = await db.collection('admins').findOne({ email: TEST_EMAIL });
  const cookie = `ubx_session=${jwt.sign({ kind: 'admin', sub: String(admin0._id), email: TEST_EMAIL }, SECRET)}`;
  for (const p of ['/admin', '/admin/devices', '/admin/firmware', '/admin/codes', '/admin/audit']) {
    const r = await call('GET', p, { headers: { Cookie: cookie } });
    ok(r.s === 200 && r.t.includes('uriBX'), `web ${p} renders for a signed-in admin`);
  }
  const webCsv = await call('GET', '/api/measurements/export', { headers: { Cookie: cookie } });
  ok(webCsv.s === 200 && webCsv.t.startsWith('date,device,'), 'web CSV export still works');
  const dev2 = await db.collection('devices').findOne({});
  const hello = await call('POST', '/api/device/hello', { body: { uid: dev2.uid } });
  ok(hello.s === 200 && hello.j?.registered !== false, 'device /hello still works');
  const devT = jwt.sign({ kind: 'device', sub: String(dev2._id), uid: dev2.uid }, SECRET);
  const sync = await call('GET', '/api/device/sync', { token: devT });
  ok(sync.s === 200 && sync.j?.device?.uid === dev2.uid, 'device /sync still works');
  ok((await call('GET', '/api/device/ota', { token: devT })).s === 200, 'device /ota still works');
} catch (e) {
  fail++; console.log('ERROR', e);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log('--- server log tail ---\n' + srvLog.split('\n').slice(-30).join('\n'));
await cleanup();
process.exit(fail ? 1 : 0);
