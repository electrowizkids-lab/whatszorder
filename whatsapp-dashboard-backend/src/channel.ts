// src/channel.ts
// ─────────────────────────────────────────────────────────────
// ADMIN TOOL: inspect and update a merchant's WhatsApp channel.
//
// The channel row is what makes inbound messages work. Yanvio's
// webhook reads metadata.phone_number_id from Meta's payload and
// looks it up here to decide which merchant the message belongs to.
// If this row is wrong, inbound messages are silently ignored.
//
// USAGE (from the backend folder)
//
//   See everything currently configured:
//     npx ts-node src/channel.ts list
//
//   Point merchant 1 at a new WhatsApp number:
//     npx ts-node src/channel.ts set 1 <PHONE_NUMBER_ID> "+44 7700 900123" <WABA_ID>
//
//   (WABA_ID is optional — leave it off to keep the existing one)
//
//   Add a channel for a merchant that has none yet:
//     npx ts-node src/channel.ts add 2 <PHONE_NUMBER_ID> "+44 7700 900456" <WABA_ID>
//
// ⚠️ Check your .env DATABASE_URL points at the PRODUCTION database
//    before running, or you will update the wrong one.
// ─────────────────────────────────────────────────────────────
import pool from './db';

const [, , cmd, ...args] = process.argv;

async function list() {
  const [rows]: any = await pool.query(
    `SELECT c.id, c.merchant_id, m.business_name, c.phone_number_id,
            c.display_number, c.waba_id, c.status
     FROM merchant_channels c
     LEFT JOIN merchants m ON m.id = c.merchant_id
     ORDER BY c.merchant_id`
  );
  if (!rows.length) {
    console.log('\n(no channels configured — inbound messages cannot be routed)\n');
    return;
  }
  console.log('\n── WhatsApp channels ──────────────────────────────');
  for (const r of rows) {
    console.log(`\n  Merchant #${r.merchant_id}  ${r.business_name || '(unknown)'}`);
    console.log(`  Phone Number ID : ${r.phone_number_id}`);
    console.log(`  Display number  : ${r.display_number || '(not set)'}`);
    console.log(`  WABA ID         : ${r.waba_id || '(not set)'}`);
    console.log(`  Status          : ${r.status}`);
  }
  console.log('\n───────────────────────────────────────────────────\n');
}

async function set(merchantId: string, phoneNumberId: string, displayNumber: string, wabaId?: string) {
  const [before]: any = await pool.query(
    'SELECT phone_number_id, display_number, waba_id FROM merchant_channels WHERE merchant_id = ?',
    [merchantId]
  );
  if (!before.length) {
    console.log(`\n⚠️ Merchant #${merchantId} has no channel yet. Use "add" instead:`);
    console.log(`   npx ts-node src/channel.ts add ${merchantId} ${phoneNumberId} "${displayNumber}" <WABA_ID>\n`);
    return;
  }
  console.log('\nBEFORE:', before[0]);

  if (wabaId) {
    await pool.query(
      'UPDATE merchant_channels SET phone_number_id = ?, display_number = ?, waba_id = ? WHERE merchant_id = ?',
      [phoneNumberId, displayNumber, wabaId, merchantId]
    );
  } else {
    await pool.query(
      'UPDATE merchant_channels SET phone_number_id = ?, display_number = ? WHERE merchant_id = ?',
      [phoneNumberId, displayNumber, merchantId]
    );
  }

  const [after]: any = await pool.query(
    'SELECT phone_number_id, display_number, waba_id FROM merchant_channels WHERE merchant_id = ?',
    [merchantId]
  );
  console.log('AFTER :', after[0]);
  console.log('\n✅ Channel updated.');
  console.log('   Now update META_PHONE_ID on Render to the same Phone Number ID,');
  console.log('   then send a test message to the number.\n');
}

async function add(merchantId: string, phoneNumberId: string, displayNumber: string, wabaId?: string) {
  try {
    await pool.query(
      'INSERT INTO merchant_channels (merchant_id, phone_number_id, display_number, waba_id) VALUES (?, ?, ?, ?)',
      [merchantId, phoneNumberId, displayNumber, wabaId || null]
    );
    console.log(`\n✅ Channel added for merchant #${merchantId}\n`);
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') {
      console.log('\n⚠️ That phone_number_id is already attached to a merchant.\n');
    } else throw e;
  }
}

const run = async () => {
  try {
    if (cmd === 'list') {
      await list();
    } else if (cmd === 'set' && args.length >= 3) {
      await set(args[0], args[1], args[2], args[3]);
    } else if (cmd === 'add' && args.length >= 3) {
      await add(args[0], args[1], args[2], args[3]);
    } else {
      console.log(`
Usage:
  npx ts-node src/channel.ts list
  npx ts-node src/channel.ts set <MERCHANT_ID> <PHONE_NUMBER_ID> "<DISPLAY_NUMBER>" [WABA_ID]
  npx ts-node src/channel.ts add <MERCHANT_ID> <PHONE_NUMBER_ID> "<DISPLAY_NUMBER>" [WABA_ID]

Example:
  npx ts-node src/channel.ts set 1 123456789012345 "+44 7700 900123" 987654321098765
`);
    }
  } catch (e: any) {
    console.error('❌', e.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
};

run();
