import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Clinic, Device, Test, RedeemCode, CreditTx } from '../src/models';

// Populates a demo clinic + device + a handful of tests so the panel has data.
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set (use --env-file=.env.local)');
  await mongoose.connect(uri);

  const name = 'Manisa Vet Lab';
  const pinHash = await bcrypt.hash('123456', 10);
  let clinic = await Clinic.findOne({ name });
  if (!clinic) {
    clinic = await Clinic.create({
      name,
      pinHash,
      vets: ['Dr. Ozan', 'Dr. Kaan'],
      credits: 42,
    });
    await CreditTx.create({ clinic: clinic._id, delta: 42, reason: 'signup_bonus' });
  }

  const uid = 'E4B0631A2C3D';
  const device = await Device.findOneAndUpdate(
    { uid },
    { uid, clinic: clinic._id, fw: '1.0.3', lastSeenAt: new Date() },
    { upsert: true, new: true }
  );

  const samples = [
    { name: 'Luna', owner: 'Ayşe K.', species: 'cat', sex: 'female', positive: false },
    { name: 'Rocky', owner: 'Mehmet T.', species: 'dog', sex: 'male', positive: true },
    { name: 'Max', owner: 'Deniz A.', species: 'dog', sex: 'male', positive: false },
  ];
  const count = await Test.countDocuments({ clinic: clinic._id });
  if (count === 0) {
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const finishedAt = new Date(Date.now() - i * 3600_000);
      await Test.create({
        device: device._id,
        clinic: clinic._id,
        vet: 'Dr. Ozan',
        patient: { name: s.name, owner: s.owner, species: s.species, sex: s.sex, age: '3', weight: '12.5' },
        result: { positive: s.positive, value: s.positive ? 0.82 : 0.12 },
        startedAt: new Date(finishedAt.getTime() - 22 * 60_000),
        finishedAt,
        creditsUsed: 1,
      });
    }
  }

  await RedeemCode.findOneAndUpdate({ code: 'EP-DEMO50' }, { code: 'EP-DEMO50', credits: 50 }, { upsert: true });

  console.log(`✓ Demo seeded — clinic "${name}" (PIN 123456), device ${uid}, ${samples.length} tests, code EP-DEMO50`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
