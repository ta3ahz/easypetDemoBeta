import mongoose from 'mongoose';
import { Device, Clinic, Test } from '../src/models';

// Verifies a device is registered/linked. Usage: node --import tsx scripts/check-device.ts <UID>
async function main() {
  const uid = (process.argv[2] || '3CDC75F6DB0C').toUpperCase();
  await mongoose.connect(process.env.MONGODB_URI!);

  const device = await Device.findOne({ uid }).lean();
  if (!device) {
    console.log(`✗ device ${uid} NOT found (not registered yet)`);
  } else {
    const clinic = await Clinic.findById(device.clinic).lean();
    const tests = await Test.countDocuments({ device: device._id });
    console.log(`✓ device ${uid} linked to clinic "${clinic?.name}"`);
    console.log(`  fw=${device.fw}  credits=${clinic?.credits}  vets=${clinic?.vets.join(', ')}  tests=${tests}`);
    console.log(`  lastSeen=${device.lastSeenAt}`);
  }
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
