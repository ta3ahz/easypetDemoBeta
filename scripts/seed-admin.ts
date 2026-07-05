import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Admin } from '../src/models';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set (use --env-file=.env.local)');
  await mongoose.connect(uri);

  const email = (process.env.ADMIN_EMAIL || 'admin@easypet.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'changeme';
  const passwordHash = await bcrypt.hash(password, 10);

  await Admin.findOneAndUpdate(
    { email },
    { email, passwordHash, name: 'Admin' },
    { upsert: true, new: true }
  );
  console.log(`✓ Admin seeded: ${email} (password from ADMIN_PASSWORD)`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
