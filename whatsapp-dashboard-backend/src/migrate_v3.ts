// src/migrate_v3.ts — per-merchant payment accounts (Model B ➜ C ready)
// Run ONCE:  npx ts-node src/migrate_v3.ts   (safe to re-run)
import pool from './db';
import dotenv from 'dotenv';
dotenv.config();

const TOLERATE = new Set(['ER_TABLE_EXISTS_ERROR', 'ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_DUP_ENTRY', 'ER_FK_DUP_NAME']);

async function step(label: string, sql: string) {
  try {
    await pool.query(sql);
    console.log(`✅ ${label}`);
  } catch (e: any) {
    if (TOLERATE.has(e.code)) console.log(`↩️  ${label} — already done, skipping`);
    else { console.error(`❌ ${label} failed:`, e.message); throw e; }
  }
}

const migrate = async () => {
  console.log('⏳ Migration v3 — merchant payment accounts…\n');

  // One row per merchant per gateway. key_secret is stored encrypted
  // (AES-256-GCM via secure.ts). webhook_secret is what the merchant
  // pastes into THEIR Razorpay webhook config; incoming events are
  // routed by account_id and verified with this secret.
  await step('Create merchant_payment_accounts table', `
    CREATE TABLE IF NOT EXISTS merchant_payment_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      gateway VARCHAR(20) NOT NULL DEFAULT 'razorpay',
      key_id VARCHAR(64) NOT NULL,
      key_secret_enc TEXT NOT NULL,
      webhook_secret VARCHAR(64) NOT NULL,
      account_id VARCHAR(40) NULL,
      status ENUM('active','disabled') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_merchant_gateway (merchant_id, gateway),
      INDEX idx_mpa_account (account_id),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
    )`);

  console.log('\n🎉 Migration v3 complete.');
  await pool.end();
  process.exit(0);
};

migrate().catch(async (e) => {
  console.error('\n💥 Migration stopped:', e.message);
  await pool.end();
  process.exit(1);
});
