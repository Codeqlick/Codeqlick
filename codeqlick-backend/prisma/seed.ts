// Creates (or updates) the first admin account from SEED_ADMIN_* env vars.
// Run with `npm run db:seed` (prisma db seed -> tsx prisma/seed.ts).
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value.trim();
}

const connectionString = required('DATABASE_URL');
const email = required('SEED_ADMIN_EMAIL').toLowerCase();
const password = required('SEED_ADMIN_PASSWORD');
const name = process.env.SEED_ADMIN_NAME?.trim() || 'Admin';

if (password.length < 12) {
  throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters long');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, role: Role.ADMIN, isActive: true },
    update: { name, passwordHash, role: Role.ADMIN, isActive: true },
  });
  console.log(`Seeded admin ${admin.email} (${admin.id})`);
} finally {
  await prisma.$disconnect();
}
