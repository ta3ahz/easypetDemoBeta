import { MongoMemoryServer } from 'mongodb-memory-server';

/* Spins up an in-memory MongoDB and exercises the device API route handlers
   end-to-end (register -> sync -> test -> redeem + credit ledger). */

function assert(cond: boolean, label: string, ...ctx: unknown[]) {
  if (!cond) {
    console.error('✗ FAIL:', label, ...ctx);
    process.exitCode = 1;
    throw new Error('assertion failed: ' + label);
  }
  console.log('✓', label);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const post = (body: any, headers: Record<string, string> = {}) =>
  new Request('http://x', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
const get = (headers: Record<string, string> = {}) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new Request('http://x', { headers }) as any;

async function main() {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri('easypet');
  process.env.JWT_SECRET = 'test-secret';
  process.env.STARTER_CREDITS = '10';

  const { POST: register } = await import('../src/app/api/device/register/route');
  const { GET: sync } = await import('../src/app/api/device/sync/route');
  const { POST: postTest } = await import('../src/app/api/device/tests/route');
  const { POST: redeem } = await import('../src/app/api/device/redeem/route');
  const { RedeemCode, Clinic, Test } = await import('../src/models');
  const mongoose = (await import('mongoose')).default;

  // 1. register (new clinic)
  let res = await register(post({ uid: 'E4B0631A2C3D', clinicName: 'Test Clinic', pin: '123456', vets: ['Dr. A'] }));
  let data = await res.json();
  assert(res.status === 200, 'register 200', res.status, data);
  assert(data.clinic.credits === 10, 'starter credits = 10', data.clinic.credits);
  assert(typeof data.token === 'string', 'token issued');
  const token = data.token;
  const auth = { authorization: `Bearer ${token}` };

  // 2. sync reflects credits
  res = await sync(get(auth));
  data = await res.json();
  assert(data.clinic.credits === 10, 'sync credits = 10', data.clinic.credits);
  assert(data.clinic.vets[0] === 'Dr. A', 'sync vets');

  // 3. record a test -> consumes 1 credit
  res = await postTest(post({ vet: 'Dr. A', patient: { name: 'Rocky', species: 'dog' }, result: { positive: true, value: 0.8 } }, auth));
  data = await res.json();
  assert(data.creditsUsed === 1, 'test consumed 1 credit', data.creditsUsed);
  assert(data.credits === 9, 'credits after test = 9', data.credits);
  assert((await Test.countDocuments()) === 1, 'test persisted');

  // 4. redeem a code -> +50
  await RedeemCode.create({ code: 'EP-TEST50', credits: 50 });
  res = await redeem(post({ code: 'EP-TEST50' }, auth));
  data = await res.json();
  assert(data.credits === 59, 'credits after redeem = 59', data.credits);

  // 5. reused code rejected
  res = await redeem(post({ code: 'EP-TEST50' }, auth));
  assert(res.status === 400, 'reused code rejected', res.status);

  // 6. wrong PIN on existing clinic rejected
  res = await register(post({ uid: 'AAA111', clinicName: 'Test Clinic', pin: '000000' }));
  assert(res.status === 401, 'wrong PIN rejected', res.status);

  // 7. unauthorized sync rejected
  res = await sync(get());
  assert(res.status === 401, 'no-token sync rejected', res.status);

  // 8. credits never go negative: drain then attempt one more
  await Clinic.updateOne({ name: 'Test Clinic' }, { credits: 0 });
  res = await postTest(post({ patient: { name: 'X' } }, auth));
  data = await res.json();
  assert(data.creditsUsed === 0, 'no credit consumed at zero balance', data.creditsUsed);
  assert(data.credits === 0, 'balance stays 0', data.credits);

  console.log('\n🎉 ALL E2E PASSED');
  await mongoose.disconnect();
  await mem.stop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
