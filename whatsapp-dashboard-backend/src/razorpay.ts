// src/razorpay.ts — per-merchant Razorpay (Model B: bring-your-own keys)
// ─────────────────────────────────────────────────────────────
// Credential resolution order when creating a payment link:
//   1. The merchant's own connected account (merchant_payment_accounts)
//   2. Platform env keys (RAZORPAY_KEY_ID/SECRET) — pilot fallback
//   3. Neither ➜ no link; the order still confirms (unpaid)
//
// Money flow with a connected account:
//   customer ➜ MERCHANT's Razorpay ➜ MERCHANT's bank.
// The platform never holds funds (no aggregator licensing issue).
//
// Webhooks: every Razorpay event carries account_id. We route the
// event to the owning merchant by account_id and verify the HMAC
// with THAT merchant's webhook_secret (env secret as fallback).
// ─────────────────────────────────────────────────────────────
import axios from 'axios';
import crypto from 'crypto';
import pool from './db';
import { encrypt, decrypt } from './secure';

export type RzpCreds = {
  merchant_id: number;
  key_id: string;
  key_secret: string;
  webhook_secret: string;
  account_id: string | null;
};

// ── merchant account lookups ─────────────────────────────────
export async function getPaymentAccount(merchantId: number): Promise<RzpCreds | null> {
  const [rows]: any = await pool.query(
    'SELECT * FROM merchant_payment_accounts WHERE merchant_id = ? AND gateway = ? AND status = ? LIMIT 1',
    [merchantId, 'razorpay', 'active']
  );
  if (!rows.length) return null;
  try {
    return {
      merchant_id: rows[0].merchant_id,
      key_id: rows[0].key_id,
      key_secret: decrypt(rows[0].key_secret_enc),
      webhook_secret: rows[0].webhook_secret,
      account_id: rows[0].account_id,
    };
  } catch (e: any) {
    console.error('❌ Could not decrypt merchant payment keys:', e.message);
    return null;
  }
}

export async function findAccountByAccountId(accountId: string): Promise<{ merchant_id: number; webhook_secret: string } | null> {
  const [rows]: any = await pool.query(
    'SELECT merchant_id, webhook_secret FROM merchant_payment_accounts WHERE account_id = ? AND status = ? LIMIT 1',
    [accountId, 'active']
  );
  return rows.length ? rows[0] : null;
}

// Save (upsert) a merchant's keys. Validates them against Razorpay
// first, fetches the account_id, and generates a webhook_secret.
export async function savePaymentAccount(merchantId: number, keyId: string, keySecret: string):
  Promise<{ ok: true; account_id: string | null; webhook_secret: string } | { ok: false; error: string }> {
  // Validate by hitting a harmless authenticated endpoint
  let accountId: string | null = null;
  try {
    const r = await axios.get('https://api.razorpay.com/v1/payment_links?count=1', {
      auth: { username: keyId, password: keySecret },
    });
    // Try to learn the account id from an existing link (best effort)
    // Razorpay webhook payloads carry acc_XXXX; link entities don't
    // always, so account_id may stay NULL until the first webhook.
    const item = r.data?.items?.[0];
    if (item?.notes?.__acc) accountId = item.notes.__acc;
  } catch (e: any) {
    const msg = e.response?.data?.error?.description || e.message;
    return { ok: false, error: `Razorpay rejected these keys: ${msg}` };
  }

  const webhookSecret = crypto.randomBytes(24).toString('hex');
  await pool.query(
    `INSERT INTO merchant_payment_accounts (merchant_id, gateway, key_id, key_secret_enc, webhook_secret, account_id)
     VALUES (?, 'razorpay', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE key_id = VALUES(key_id), key_secret_enc = VALUES(key_secret_enc),
       account_id = COALESCE(VALUES(account_id), account_id), status = 'active'`,
    [merchantId, keyId, encrypt(keySecret), webhookSecret, accountId]
  );
  // Return the CURRENT webhook_secret (unchanged on re-save)
  const [rows]: any = await pool.query(
    'SELECT webhook_secret, account_id FROM merchant_payment_accounts WHERE merchant_id = ? AND gateway = ?',
    [merchantId, 'razorpay']
  );
  return { ok: true, account_id: rows[0].account_id, webhook_secret: rows[0].webhook_secret };
}

// Learn/refresh account_id from a verified webhook (first event teaches us)
export async function rememberAccountId(merchantId: number, accountId: string) {
  await pool.query(
    'UPDATE merchant_payment_accounts SET account_id = ? WHERE merchant_id = ? AND gateway = ? AND (account_id IS NULL OR account_id <> ?)',
    [accountId, merchantId, 'razorpay', accountId]
  );
}

// ── payment link creation (merchant creds ➜ env fallback) ────
function envCreds(): { key_id: string; key_secret: string } | null {
  const k = process.env.RAZORPAY_KEY_ID, s = process.env.RAZORPAY_KEY_SECRET;
  return k && s ? { key_id: k, key_secret: s } : null;
}

export async function createPaymentLinkForMerchant(merchantId: number, opts: {
  orderNo: string; orderId: number; amount: number;
  customerName: string; customerPhone: string; description: string;
}): Promise<{ id: string; short_url: string } | null> {
  const acct = await getPaymentAccount(merchantId);
  const creds = acct || envCreds();
  if (!creds) return null;

  try {
    const resp = await axios.post(
      'https://api.razorpay.com/v1/payment_links',
      {
        amount: Math.round(opts.amount * 100),
        currency: 'INR',
        reference_id: opts.orderNo,
        description: opts.description,
        customer: { name: opts.customerName, contact: `+${opts.customerPhone}` },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { order_id: String(opts.orderId) },
      },
      { auth: { username: creds.key_id, password: creds.key_secret } }
    );
    return { id: resp.data.id, short_url: resp.data.short_url };
  } catch (e: any) {
    const detail = e.response?.data?.error?.description || e.message;
    console.error('❌ Razorpay link creation failed:', detail);
    return null;
  }
}

// ── webhook signature (secret is chosen by the caller) ──────
export function verifySignatureWith(secret: string, rawBody: Buffer | undefined, signature: string | undefined): boolean {
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
