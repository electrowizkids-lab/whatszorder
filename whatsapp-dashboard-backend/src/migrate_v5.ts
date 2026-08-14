// src/migrate_v5.ts — payment reference column for Stripe
// Run ONCE:  npx ts-node src/migrate_v5.ts   (safe to re-run)
//
// Stripe checkout session ids (cs_test_… / cs_live_…) are far longer
// than Razorpay's link ids, so VARCHAR(64) overflowed. This widens
// the column to 255 and renames it to something gateway-neutral.
import pool from './db';
import dotenv from 'dotenv';
dotenv.config();

async function hasColumn(table: string, column: string): Promise<boolean> {
  const [rows]: any = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].n > 0;
}

const migrate = async () => {
  console.log('⏳ Migration v5 — payment reference column…\n');

  const hasOld = await hasColumn('orders', 'rzp_link_id');
  const hasNew = await hasColumn('orders', 'payment_ref');

  if (hasNew && !hasOld) {
    console.log('↩️  payment_ref already exists — nothing to do.');
  } else if (hasOld && !hasNew) {
    await pool.query(
      'ALTER TABLE orders CHANGE COLUMN rzp_link_id payment_ref VARCHAR(255) NULL'
    );
    console.log('✅ rzp_link_id renamed to payment_ref and widened to VARCHAR(255)');
  } else if (hasOld && hasNew) {
    // Both present (partial earlier run) — keep payment_ref, drop the old one
    await pool.query('ALTER TABLE orders DROP COLUMN rzp_link_id');
    console.log('✅ Removed leftover rzp_link_id column');
  } else {
    await pool.query('ALTER TABLE orders ADD COLUMN payment_ref VARCHAR(255) NULL');
    console.log('✅ payment_ref column created');
  }

  console.log('\n🎉 Migration v5 complete.');
  await pool.end();
  process.exit(0);
};

migrate().catch(async (e) => {
  console.error('\n💥 Migration stopped:', e.message);
  await pool.end();
  process.exit(1);
});
