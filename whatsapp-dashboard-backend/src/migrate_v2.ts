// src/migrate_v2.ts
// ─────────────────────────────────────────────────────────────
// PHASE 1 MIGRATION: single-merchant ➜ multi-tenant SaaS schema
//
// Run ONCE with:   npx ts-node src/migrate_v2.ts
// Safe to re-run: every step tolerates "already exists".
// Your existing data is preserved. The old `orders` table (which
// is empty) is RENAMED to `orders_legacy`, never dropped.
// ─────────────────────────────────────────────────────────────
import pool from './db';
import dotenv from 'dotenv';
dotenv.config();

// Values used to seed YOU as Merchant #1. Override via .env if you like.
const SEED_BUSINESS_NAME = process.env.SEED_BUSINESS_NAME || 'My Business (Pilot)';
const SEED_LOGIN_PHONE   = process.env.MERCHANT_LOGIN_PHONE || '918882614689';
const SEED_WABA_ID       = process.env.META_WABA_ID || '1413386194170283';
const SEED_PHONE_ID      = process.env.META_PHONE_ID || '1208490342345009';
const SEED_DISPLAY_NUM   = process.env.SEED_DISPLAY_NUMBER || '+1 555 668 5121';

// Error codes we treat as "already done, skip"
const TOLERATE = new Set([
  'ER_TABLE_EXISTS_ERROR', // table exists
  'ER_DUP_FIELDNAME',      // column exists
  'ER_DUP_KEYNAME',        // index exists
  'ER_CANT_DROP_FIELD_OR_KEY', // index already dropped
  'ER_DUP_ENTRY',          // seed row exists
  'ER_FK_DUP_NAME',        // foreign key exists
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

async function tableHasColumn(table: string, column: string): Promise<boolean> {
  const [rows]: any = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].n > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const [rows]: any = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return rows[0].n > 0;
}

const migrate = async () => {
  console.log('⏳ Starting multi-tenant migration (v2)…\n');

  // ── 1. MERCHANTS ──────────────────────────────────────────
  await step('Create merchants table', `
    CREATE TABLE IF NOT EXISTS merchants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_name VARCHAR(120) NOT NULL,
      login_phone VARCHAR(20) UNIQUE NOT NULL,
      plan VARCHAR(30) DEFAULT 'pilot',
      status ENUM('active','suspended') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

  // ── 2. MERCHANT CHANNELS (each row = one WhatsApp number) ─
  // access_token stays NULL in Phase 1 (we fall back to the env
  // token). Per-merchant tokens arrive with Embedded Signup in
  // Phase 3, at which point they'll be stored encrypted.
  await step('Create merchant_channels table', `
    CREATE TABLE IF NOT EXISTS merchant_channels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      waba_id VARCHAR(40),
      phone_number_id VARCHAR(40) UNIQUE NOT NULL,
      display_number VARCHAR(25),
      access_token TEXT NULL,
      status ENUM('active','disabled') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
    )`);

  // ── 3. OTP CODES (merchant login) ─────────────────────────
  await step('Create otp_codes table', `
    CREATE TABLE IF NOT EXISTS otp_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(20) NOT NULL,
      code_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_otp_phone (phone)
    )`);

  // ── 4. PRODUCTS (per-merchant catalog, used by the bot) ───
  await step('Create products table', `
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      unit VARCHAR(30) DEFAULT 'pc',
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      active TINYINT(1) DEFAULT 1,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_products_merchant (merchant_id, active),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
    )`);

  // ── 5. CONVERSATION STATE (bot state machine, Phase 2) ────
  await step('Create conversation_state table', `
    CREATE TABLE IF NOT EXISTS conversation_state (
      customer_id INT PRIMARY KEY,
      state VARCHAR(40) NOT NULL DEFAULT 'IDLE',
      cart_json JSON NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

  // ── 6. SEED MERCHANT #1 (you) + your channel ──────────────
  await step('Seed merchant #1', `
    INSERT INTO merchants (id, business_name, login_phone)
    VALUES (1, ?, ?)`, [SEED_BUSINESS_NAME, SEED_LOGIN_PHONE]);

  await step('Seed merchant #1 channel', `
    INSERT INTO merchant_channels (merchant_id, waba_id, phone_number_id, display_number)
    VALUES (1, ?, ?, ?)`, [SEED_WABA_ID, SEED_PHONE_ID, SEED_DISPLAY_NUM]);

  // Sample catalog so Phase 2's bot has something to sell.
  // Matches your example merchant: disposable tableware.
  await step('Seed sample products', `
    INSERT IGNORE INTO products (id, merchant_id, name, unit, price, sort_order) VALUES
    (1, 1, 'Paper Plates (Large)',      'pack of 25', 120.00, 1),
    (2, 1, 'Paper Bowls',               'pack of 25',  90.00, 2),
    (3, 1, 'Takeaway Boxes (750ml)',    'pack of 10', 150.00, 3),
    (4, 1, 'Wooden Cutlery Set',        'pack of 50', 110.00, 4),
    (5, 1, 'Paper Cups (250ml)',        'pack of 50', 100.00, 5),
    (6, 1, 'Party Pack (Plates+Cups+Cutlery)', 'set', 350.00, 6)`);

  // ── 7. CONVERT customers ➜ multi-tenant ───────────────────
  await step('Add merchant_id to customers', `
    ALTER TABLE customers ADD COLUMN merchant_id INT NOT NULL DEFAULT 1 AFTER id`);
  await step('Drop old global-unique on customers.whatsapp_id', `
    ALTER TABLE customers DROP INDEX whatsapp_id`);
  await step('Add per-merchant unique (merchant_id, whatsapp_id)', `
    ALTER TABLE customers ADD UNIQUE KEY uniq_merchant_wa (merchant_id, whatsapp_id)`);
  await step('Add FK customers.merchant_id ➜ merchants', `
    ALTER TABLE customers ADD CONSTRAINT fk_customers_merchant
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)`);

  // ── 8. CONVERT chat_messages ➜ multi-tenant ───────────────
  await step('Add merchant_id to chat_messages', `
    ALTER TABLE chat_messages ADD COLUMN merchant_id INT NOT NULL DEFAULT 1 AFTER id`);
  await step('Index chat_messages.merchant_id', `
    ALTER TABLE chat_messages ADD INDEX idx_cm_merchant (merchant_id)`);

  // ── 9. REAL ORDERS TABLES ─────────────────────────────────
  // Your original `orders` table (with the `items TEXT` column)
  // was never written to. We rename it to orders_legacy and
  // create the real structure. Nothing is deleted.
  if (await tableExists('orders') && await tableHasColumn('orders', 'items')) {
    await step('Rename old empty orders ➜ orders_legacy',
      `RENAME TABLE orders TO orders_legacy`);
  }

  await step('Create orders table (v2)', `
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      customer_id INT NOT NULL,
      order_no VARCHAR(30) UNIQUE,
      total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      status ENUM('received','processing','fulfilled','closed','cancelled') DEFAULT 'received',
      payment_status ENUM('unpaid','paid','refunded') DEFAULT 'unpaid',
      rzp_link_id VARCHAR(64) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_orders_merchant (merchant_id, status),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )`);

  await step('Create order_items table', `
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT NULL,
      name_snap VARCHAR(120) NOT NULL,
      qty INT NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      line_total DECIMAL(10,2) NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )`);

  await step('Create payments table', `
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      gateway VARCHAR(20) DEFAULT 'razorpay',
      gateway_payment_id VARCHAR(80),
      amount DECIMAL(10,2) NOT NULL,
      status VARCHAR(20) NOT NULL,
      raw_json JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )`);

  console.log('\n🎉 Migration v2 complete. You are Merchant #1.');
  console.log('   All existing customers & messages now belong to merchant 1.');
  await pool.end();
  process.exit(0);
};

migrate().catch(async (e) => {
  console.error('\n💥 Migration stopped:', e.message);
  await pool.end();
  process.exit(1);
});
