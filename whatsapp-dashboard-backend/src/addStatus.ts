// src/addStatus.ts — run once
import pool from './db';

const run = async () => {
  try {
    await pool.query(`
      ALTER TABLE customers
      ADD COLUMN status ENUM('pending','processing','fulfilled')
      NOT NULL DEFAULT 'pending'
    `);
    console.log('✅ status column added to customers');
  } catch (e: any) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log('ℹ️ status column already exists — skipping');
    else console.error('❌', e);
  } finally {
    await pool.end();
    process.exit(0);
  }
};
run();