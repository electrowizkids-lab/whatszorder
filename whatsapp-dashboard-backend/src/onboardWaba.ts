// src/onboardWaba.ts — run onboarding for one WhatsApp account by hand
// ─────────────────────────────────────────────────────────────
// For the day a real signup half-finishes: Meta connected the
// merchant, but our side failed part-way (token refused, database
// down, server asleep). This runs exactly the same code the webhook
// runs, for one WABA, so nobody has to sign up twice.
//
// Find both ids in the onboarding_events table (waba_id and
// owner_business_id columns of the failed row).
//
// Usage (from the backend folder):
//   npx ts-node src/onboardWaba.ts <WABA_ID> <OWNER_BUSINESS_ID>
// ─────────────────────────────────────────────────────────────
import dotenv from 'dotenv';
dotenv.config();
import pool from './db';
import { handlePartnerAdded } from './onboarding';

const [, , wabaId, ownerBusinessId] = process.argv;

const run = async () => {
  if (!wabaId || !ownerBusinessId) {
    console.log('Usage: npx ts-node src/onboardWaba.ts <WABA_ID> <OWNER_BUSINESS_ID>');
    process.exit(1);
  }
  await handlePartnerAdded({
    event: 'MANUAL',
    waba_info: { waba_id: wabaId, owner_business_id: ownerBusinessId },
  });
  await pool.end();
  process.exit(0);
};

run().catch(async (e) => {
  console.error('💥 Failed:', e?.message || e);
  await pool.end();
  process.exit(1);
});
