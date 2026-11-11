// src/migrate_v6.ts
// ─────────────────────────────────────────────────────────────
// Schema for Embedded Signup + Coexistence.
//
//   1. merchants   — remember which WABA / business portfolio a
//                    merchant came from, so repeat webhooks are
//                    recognised instead of creating duplicates
//   2. conversation_state.bot_paused_until — when the shop owner
//                    replies from their own phone, the bot stops
//                    talking in that conversation
//   3. onboarding_events — an audit trail that outlives Render's
//                    log rotation
//
// Run once:   npx ts-node src/migrate_v6.ts
// Safe to re-run — every step tolerates "already exists".
// ─────────────────────────────────────────────────────────────
import pool from './db';
import dotenv from 'dotenv';
dotenv.config();

const TOLERATE = new Set([
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_FIELDNAME',
  'ER_DUP_KEYNAME',
  'ER_CANT_DROP_FIELD_OR_KEY',
  'ER_DUP_ENTRY',
  'ER_FK_DUP_NAME',
]);

async function step(label: string, sql: string, params: any[] = []) {
  try {
    await pool.query(sql, params);
    console.log(`✅ ${label}`);
  } catch (e: any) {
    if (TOLERATE.has(e.code)) {
      console.log(`↩️  ${label} — already done, skipping`);
    } else {
      console.error(`❌ ${label} failed:`, e.message);
      throw e;
    }
  }
}

const migrate = async () => {
  console.log('⏳ Migration v6 — Embedded Signup + Coexistence\n');

  // ── 1. merchants: where did this tenant come from? ─────────
  await step('Add merchants.waba_id',
    `ALTER TABLE merchants ADD COLUMN waba_id VARCHAR(40) NULL`);
  await step('Add merchants.owner_business_id',
    `ALTER TABLE merchants ADD COLUMN owner_business_id VARCHAR(40) NULL`);
  await step('Add merchants.onboarding_status',
    `ALTER TABLE merchants ADD COLUMN onboarding_status
       ENUM('manual','pending','connected','offboarded') DEFAULT 'manual'`);
  await step('Add merchants.onboarded_at',
    `ALTER TABLE merchants ADD COLUMN onboarded_at TIMESTAMP NULL`);
  await step('Index merchants.waba_id (unique)',
    `ALTER TABLE merchants ADD UNIQUE KEY uniq_merchant_waba (waba_id)`);

  // ── 2. the bot's manners on a shared number ────────────────
  // Coexistence means the shop owner is answering the same number
  // the bot is on. When they reply from their phone, Meta tells us
  // via smb_message_echoes and we park the bot for a while.
  await step('Add conversation_state.bot_paused_until',
    `ALTER TABLE conversation_state ADD COLUMN bot_paused_until DATETIME NULL`);

  // ── 3. onboarding audit trail ──────────────────────────────
  await step('Create onboarding_events table', `
    CREATE TABLE IF NOT EXISTS onboarding_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event VARCHAR(60) NOT NULL,
      waba_id VARCHAR(40) NULL,
      owner_business_id VARCHAR(40) NULL,
      phone_number_id VARCHAR(40) NULL,
      merchant_id INT NULL,
      status VARCHAR(30) NOT NULL,
      error TEXT NULL,
      raw_json JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_oe_waba (waba_id),
      INDEX idx_oe_created (created_at)
    )`);

  // ── 4. existing merchants were added by hand ───────────────
  await step('Mark existing merchants as manually created',
    `UPDATE merchants SET onboarding_status = 'manual'
     WHERE onboarding_status IS NULL OR waba_id IS NULL`);

  console.log('\n🎉 Migration v6 complete.');
  console.log('   Merchants can now arrive through Embedded Signup.');
  console.log('   The bot will stand aside when the shop owner replies.');
  await pool.end();
  process.exit(0);
};

migrate().catch(async (e) => {
  console.error('\n💥 Migration stopped:', e.message);
  await pool.end();
  process.exit(1);
});
