// src/addMerchant.ts
// ─────────────────────────────────────────────────────────────
// ADMIN TOOL: add a merchant so they can log in to the portal.
//
// Usage (from the backend folder):
//   npx ts-node src/addMerchant.ts "Business Name" 91XXXXXXXXXX
//
// Example:
//   npx ts-node src/addMerchant.ts "Sharma Disposables" 919812345678
//
// Note: the new merchant can LOG IN immediately, but their board
// will be EMPTY and they cannot send/receive WhatsApp messages
// until a WhatsApp number (a merchant_channels row with its own
// phone_number_id) is connected for them. That connection is the
// Embedded Signup step in Phase 3 — or a manual channel insert
// if you register a second number in Meta before then.
// ─────────────────────────────────────────────────────────────
import pool from './db';

const [, , nameArg, phoneArg] = process.argv;
const name = (nameArg || '').trim();
const phone = (phoneArg || '').replace(/\D/g, '');

const run = async () => {
  if (!name || phone.length < 10 || phone.length > 15) {
    console.log('Usage: npx ts-node src/addMerchant.ts "Business Name" 91XXXXXXXXXX');
    console.log('  - Business Name in quotes');
    console.log('  - Phone with country code, digits only');
    process.exit(1);
  }

  try {
    const [result]: any = await pool.query(
      'INSERT INTO merchants (business_name, login_phone) VALUES (?, ?)',
      [name, phone]
    );
    console.log(`✅ Merchant #${result.insertId} created: "${name}" (+${phone})`);
    console.log('   They can log in now via the portal (OTP flow).');
    console.log('   ⚠️ No WhatsApp channel yet — their board starts empty.');
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') {
      console.log(`⚠️ A merchant with phone +${phone} already exists.`);
    } else {
      console.error('❌ Failed:', e.message);
    }
  } finally {
    await pool.end();
    process.exit(0);
  }
};

run();
