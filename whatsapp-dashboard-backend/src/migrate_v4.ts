// src/migrate_v4.ts — sub-products + product photos
// Run ONCE:  npx ts-node src/migrate_v4.ts   (safe to re-run)
//
// products gains:
//   parent_id  — NULL = top-level. A top-level item WITH children acts
//                as a group (WhatsApp section header); its children are
//                the orderable options. Items WITHOUT children behave
//                exactly as before — existing catalogs are untouched.
//   image_url  — public photo URL (Cloudinary); sent to the customer
//                when they pick the item. Children fall back to the
//                parent's photo.
import pool from './db';
import dotenv from 'dotenv';
dotenv.config();

const TOLERATE = new Set(['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_FK_DUP_NAME', 'ER_CANT_DROP_FIELD_OR_KEY']);

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
  console.log('⏳ Migration v4 — sub-products + photos…\n');

  await step('Add products.parent_id',
    `ALTER TABLE products ADD COLUMN parent_id INT NULL AFTER merchant_id`);

  await step('Add products.image_url',
    `ALTER TABLE products ADD COLUMN image_url VARCHAR(500) NULL AFTER price`);

  // Deleting a group removes its options too (the UI confirms first).
  await step('Link sub-products to their parent (cascade delete)',
    `ALTER TABLE products ADD CONSTRAINT fk_products_parent
     FOREIGN KEY (parent_id) REFERENCES products(id) ON DELETE CASCADE`);

  await step('Index for grouped catalog reads',
    `ALTER TABLE products ADD INDEX idx_products_parent (merchant_id, parent_id, active)`);

  console.log('\n🎉 Migration v4 complete. Existing products are unchanged.');
  await pool.end();
  process.exit(0);
};

migrate().catch(async (e) => {
  console.error('\n💥 Migration stopped:', e.message);
  await pool.end();
  process.exit(1);
});
