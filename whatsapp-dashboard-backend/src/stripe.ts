// src/stripe.ts — per-merchant Stripe (bring-your-own-keys)
// ─────────────────────────────────────────────────────────────
// Money flow:  customer ➜ MERCHANT's Stripe ➜ MERCHANT's bank.
// Yanvio never holds funds, so no payment-aggregator licensing.
//
// Each merchant pastes their own Stripe secret key in Settings.
// We validate it against Stripe, store it encrypted, and generate
// nothing — the merchant creates a webhook in THEIR Stripe
// dashboard and pastes the signing secret back to us.
//
// Requires:  npm install stripe
// Optional env: STRIPE_SUCCESS_URL (default https://yanvio.com)
//               STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET (platform fallback)
// ─────────────────────────────────────────────────────────────
import Stripe from 'stripe';
import pool from './db';
import { encrypt, decrypt } from './secure';

export type StripeCreds = {
  merchant_id: number;
  key_id: string;          // account id (acct_…) or a label
  secret_key: string;      // sk_…
  webhook_secret: string;  // whsec_…
};

const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL || 'https://yanvio.com';

function client(secretKey: string) {
  return new Stripe(secretKey, { apiVersion: '2024-06-20' as any });
}

// ── account lookups ──────────────────────────────────────────
export async function getStripeAccount(merchantId: number): Promise<StripeCreds | null> {
  const [rows]: any = await pool.query(
    'SELECT * FROM merchant_payment_accounts WHERE merchant_id = ? AND gateway = ? AND status = ? LIMIT 1',
    [merchantId, 'stripe', 'active']
  );
  if (!rows.length) return null;
  try {
    return {
      merchant_id: rows[0].merchant_id,
      key_id: rows[0].key_id,
      secret_key: decrypt(rows[0].key_secret_enc),
      webhook_secret: rows[0].webhook_secret,
    };
  } catch (e: any) {
    console.error('❌ Could not decrypt Stripe keys:', e.message);
    return null;
  }
}

// Validate the key against Stripe, then store it encrypted.
export async function saveStripeAccount(
  merchantId: number, secretKey: string, webhookSecret: string
): Promise<{ ok: boolean; error?: string; account_id?: string }> {
  if (!secretKey.startsWith('sk_')) {
    return { ok: false, error: 'That does not look like a Stripe secret key — it should start with sk_test_ or sk_live_.' };
  }
  // Validate with a call that needs no arguments, then show the
  // merchant a masked version of their own key — more recognisable
  // to them than an acct_ id.
  let accountId = '';
  try {
    await client(secretKey).balance.retrieve();
    accountId = `${secretKey.slice(0, 8)}\u2026${secretKey.slice(-4)}`;
  } catch (e: any) {
    return { ok: false, error: `Stripe rejected that key: ${e?.message || 'invalid key'}` };
  }

  await pool.query(
    `INSERT INTO merchant_payment_accounts (merchant_id, gateway, key_id, key_secret_enc, webhook_secret, account_id)
     VALUES (?, 'stripe', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE key_id = VALUES(key_id), key_secret_enc = VALUES(key_secret_enc),
       webhook_secret = VALUES(webhook_secret), account_id = VALUES(account_id), status = 'active'`,
    [merchantId, accountId, encrypt(secretKey), webhookSecret || '', accountId]
  );
  return { ok: true, account_id: accountId };
}

// ── checkout ────────────────────────────────────────────────
type LineItem = { name: string; qty: number; price: number }; // price in pounds

export async function createCheckoutForMerchant(merchantId: number, opts: {
  orderNo: string; orderId: number; items: LineItem[];
  customerPhone: string;
}): Promise<{ id: string; url: string } | null> {
  const acct = await getStripeAccount(merchantId);
  const secret = acct?.secret_key || process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;

  try {
    const session = await client(secret).checkout.sessions.create({
      mode: 'payment',
      success_url: `${SUCCESS_URL}?paid=${encodeURIComponent(opts.orderNo)}`,
      cancel_url: SUCCESS_URL,
      line_items: opts.items.map(i => ({
        quantity: i.qty,
        price_data: {
          currency: 'gbp',
          unit_amount: Math.round(i.price * 100), // pence
          product_data: { name: i.name.slice(0, 250) },
        },
      })),
      // metadata is how the webhook finds its way home
      metadata: {
        order_id: String(opts.orderId),
        order_no: opts.orderNo,
        merchant_id: String(merchantId),
        phone: opts.customerPhone,
      },
    });
    return { id: session.id, url: session.url || '' };
  } catch (e: any) {
    console.error('❌ Stripe checkout creation failed:', e?.message || e);
    return null;
  }
}

// ── webhook verification ────────────────────────────────────
// Stripe signs with the endpoint's signing secret. With per-merchant
// keys we must know WHICH merchant before verifying, so the caller
// reads order_id from the (still untrusted) body, resolves the
// merchant, then verifies. Nothing is acted on before verification.
export function verifyStripeEvent(
  rawBody: Buffer | undefined, signature: string | undefined, webhookSecret: string
): Stripe.Event | null {
  if (!rawBody || !signature || !webhookSecret) return null;
  try {
    // constructEvent only needs the secret for HMAC; any key works here
    const s = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', { apiVersion: '2024-06-20' as any });
    return s.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e: any) {
    console.warn('🚫 Stripe signature check failed:', e?.message);
    return null;
  }
}

export async function webhookSecretForOrder(orderId: number): Promise<{ secret: string; merchantId: number } | null> {
  const [rows]: any = await pool.query(
    `SELECT o.merchant_id, a.webhook_secret
     FROM orders o
     LEFT JOIN merchant_payment_accounts a
       ON a.merchant_id = o.merchant_id AND a.gateway = 'stripe' AND a.status = 'active'
     WHERE o.id = ? LIMIT 1`,
    [orderId]
  );
  if (!rows.length) return null;
  const secret = rows[0].webhook_secret || process.env.STRIPE_WEBHOOK_SECRET || '';
  return secret ? { secret, merchantId: rows[0].merchant_id } : null;
}
