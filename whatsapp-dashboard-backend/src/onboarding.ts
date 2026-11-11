// src/onboarding.ts — Embedded Signup engine room (Tech Provider)
// ─────────────────────────────────────────────────────────────
// When a merchant finishes signup on Meta's hosted page, Meta
// sends an `account_update` webhook with event PARTNER_ADDED.
// From that single signal we do everything needed to turn them
// into a working Yanvio tenant:
//
//   1. mint a business token for THEIR business portfolio
//   2. list the WhatsApp numbers on their WABA
//   3. subscribe our app to their WABA  ← silently fails if skipped
//   4. VERIFY that subscription actually took
//   5. store the token encrypted, create merchant + channel rows
//
// Step 4 exists because in September a subscribe call returned
// 200 but `subscribed_apps` came back `{"data":[]}` — no messages
// arrived and nothing in the logs said why. We never trust that
// call again without reading it back.
//
// Required .env (all new except META_ACCESS_TOKEN / META_APP_SECRET):
//   META_APP_ID            your app id (1603411848108965)
//   META_APP_SECRET        App settings ➜ Basic ➜ App secret
//   META_ACCESS_TOKEN      your system user token (the platform one)
//   META_SYSTEM_USER_ID    Business Settings ➜ System users ➜ the id
//   GRAPH_VERSION          optional, defaults to v22.0
// ─────────────────────────────────────────────────────────────
import axios from 'axios';
import crypto from 'crypto';
import pool from './db';
import { encrypt } from './secure';

const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v22.0'}`;
const APP_ID = process.env.META_APP_ID || '';
const APP_SECRET = process.env.META_APP_SECRET || '';
const SYSTEM_USER_ID = process.env.META_SYSTEM_USER_ID || '';
const PLATFORM_TOKEN = process.env.META_ACCESS_TOKEN || '';

// ── error handling ───────────────────────────────────────────
// axios errors carry `config.params`, which on these calls holds
// the access token. Never let a raw axios error reach a log.
function gerr(e: any): string {
  const err = e?.response?.data?.error;
  if (err) {
    const parts = [err.message, err.code && `code=${err.code}`, err.error_subcode && `subcode=${err.error_subcode}`];
    return parts.filter(Boolean).join(' · ');
  }
  return e?.message || String(e);
}

// Meta requires this on calls made with a system user token.
// HMAC-SHA256 of the token, keyed with the app secret.
function proof(token: string): string {
  return crypto.createHmac('sha256', APP_SECRET).update(token).digest('hex');
}

const digits = (s: string) => (s || '').replace(/\D/g, '');

export function onboardingConfigProblems(): string[] {
  const missing: string[] = [];
  if (!APP_ID) missing.push('META_APP_ID');
  if (!APP_SECRET) missing.push('META_APP_SECRET');
  if (!SYSTEM_USER_ID) missing.push('META_SYSTEM_USER_ID');
  if (!PLATFORM_TOKEN) missing.push('META_ACCESS_TOKEN');
  return missing;
}

// ── Graph calls ──────────────────────────────────────────────

// The customer's business token. Note the portfolio id is THEIRS,
// not ours — that is the whole point of the call.
async function fetchBusinessToken(ownerBusinessId: string): Promise<string> {
  const { data } = await axios.post(
    `${GRAPH}/${ownerBusinessId}/system_user_access_tokens`,
    null,
    {
      params: {
        fetch_only: true,
        system_user_id: SYSTEM_USER_ID,
        access_token: PLATFORM_TOKEN,
        appsecret_proof: proof(PLATFORM_TOKEN),
      },
      timeout: 20000,
    }
  );
  const token = data?.access_token;
  if (!token) throw new Error('Meta returned no access_token for that business portfolio');
  return token;
}

type MetaPhoneNumber = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  code_verification_status?: string;
  quality_rating?: string;
  platform_type?: string;
};

async function listPhoneNumbers(wabaId: string, token: string): Promise<MetaPhoneNumber[]> {
  const { data } = await axios.get(`${GRAPH}/${wabaId}/phone_numbers`, {
    params: {
      fields: 'id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type',
      access_token: token,
      appsecret_proof: proof(token),
    },
    timeout: 20000,
  });
  return data?.data || [];
}

async function subscribeApp(wabaId: string, token: string): Promise<void> {
  await axios.post(`${GRAPH}/${wabaId}/subscribed_apps`, null, {
    params: { access_token: token, appsecret_proof: proof(token) },
    timeout: 20000,
  });
}

async function subscribedApps(wabaId: string, token: string): Promise<any[]> {
  const { data } = await axios.get(`${GRAPH}/${wabaId}/subscribed_apps`, {
    params: { access_token: token, appsecret_proof: proof(token) },
    timeout: 20000,
  });
  return data?.data || [];
}

// ── audit trail ──────────────────────────────────────────────
// Render rotates logs. This table is the record that survives,
// and the first place to look when an onboarding goes wrong.
async function logEvent(row: {
  event: string;
  waba_id?: string | null;
  owner_business_id?: string | null;
  phone_number_id?: string | null;
  merchant_id?: number | null;
  status: string;
  error?: string | null;
  raw?: any;
}) {
  try {
    await pool.query(
      `INSERT INTO onboarding_events
         (event, waba_id, owner_business_id, phone_number_id, merchant_id, status, error, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.event, row.waba_id || null, row.owner_business_id || null,
        row.phone_number_id || null, row.merchant_id || null,
        row.status, row.error || null,
        row.raw ? JSON.stringify(row.raw).slice(0, 60000) : null,
      ]
    );
  } catch (e: any) {
    console.error('⚠️  Could not write onboarding_events row:', e.message);
  }
}

// ── the main event ───────────────────────────────────────────
export async function handlePartnerAdded(value: any): Promise<void> {
  const info = value?.waba_info || {};
  const wabaId: string = info.waba_id || '';
  const ownerBusinessId: string = info.owner_business_id || '';

  console.log(`\n🆕 PARTNER_ADDED · waba=${wabaId} · business=${ownerBusinessId}`);

  const missing = onboardingConfigProblems();
  if (missing.length) {
    const msg = `Onboarding is not configured — missing ${missing.join(', ')}`;
    console.error(`❌ ${msg}`);
    await logEvent({ event: 'PARTNER_ADDED', waba_id: wabaId, owner_business_id: ownerBusinessId, status: 'config_error', error: msg, raw: value });
    return;
  }
  if (!wabaId || !ownerBusinessId) {
    const msg = 'PARTNER_ADDED arrived without waba_id or owner_business_id';
    console.error(`❌ ${msg}`);
    await logEvent({ event: 'PARTNER_ADDED', status: 'bad_payload', error: msg, raw: value });
    return;
  }

  // Meta retries webhooks. If we already know this WABA, stop here.
  const [existing]: any = await pool.query(
    'SELECT id, business_name FROM merchants WHERE waba_id = ? LIMIT 1', [wabaId]
  );
  if (existing.length) {
    console.log(`↩️  WABA ${wabaId} already belongs to merchant #${existing[0].id} (${existing[0].business_name}) — nothing to do`);
    await logEvent({ event: 'PARTNER_ADDED', waba_id: wabaId, owner_business_id: ownerBusinessId, merchant_id: existing[0].id, status: 'duplicate', raw: value });
    return;
  }

  let token: string;
  try {
    token = await fetchBusinessToken(ownerBusinessId);
    console.log('🔑 Business token obtained');
  } catch (e: any) {
    const msg = `Could not mint business token: ${gerr(e)}`;
    console.error(`❌ ${msg}`);
    await logEvent({ event: 'PARTNER_ADDED', waba_id: wabaId, owner_business_id: ownerBusinessId, status: 'token_failed', error: msg, raw: value });
    return;
  }

  let numbers: MetaPhoneNumber[];
  try {
    numbers = await listPhoneNumbers(wabaId, token);
    console.log(`📞 ${numbers.length} number(s) on this WABA: ${numbers.map(n => n.display_phone_number).join(', ') || '(none)'}`);
  } catch (e: any) {
    const msg = `Could not list phone numbers: ${gerr(e)}`;
    console.error(`❌ ${msg}`);
    await logEvent({ event: 'PARTNER_ADDED', waba_id: wabaId, owner_business_id: ownerBusinessId, status: 'numbers_failed', error: msg, raw: value });
    return;
  }

  if (!numbers.length) {
    const msg = 'WABA has no phone numbers yet — merchant created as pending';
    console.warn(`⚠️  ${msg}`);
  }

  // ── subscribe our app to their WABA, then READ IT BACK ──
  let subscribed = false;
  try {
    await subscribeApp(wabaId, token);
    const apps = await subscribedApps(wabaId, token);
    subscribed = apps.some((a: any) =>
      String(a?.whatsapp_business_api_data?.id || a?.id || '') === String(APP_ID)
    );
    if (subscribed) {
      console.log('📡 App subscribed to their WABA — confirmed by read-back');
    } else {
      console.error(`❌ Subscribe returned OK but read-back does not list app ${APP_ID}. Messages from this merchant will NOT arrive.`);
    }
  } catch (e: any) {
    console.error(`❌ Could not subscribe to WABA: ${gerr(e)}`);
  }

  // ── create the tenant ──
  const primary = numbers[0];
  const businessName = (primary?.verified_name || `Merchant ${wabaId.slice(-6)}`).slice(0, 120);
  const loginPhone = digits(primary?.display_phone_number || '') || `pending-${wabaId}`.slice(0, 20);

  const conn = await pool.getConnection();
  let merchantId: number | null = null;
  try {
    await conn.beginTransaction();

    const [m]: any = await conn.query(
      `INSERT INTO merchants (business_name, login_phone, waba_id, owner_business_id, onboarding_status, onboarded_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [businessName, loginPhone, wabaId, ownerBusinessId, numbers.length ? 'connected' : 'pending']
    );
    merchantId = m.insertId;

    for (const n of numbers) {
      await conn.query(
        `INSERT INTO merchant_channels (merchant_id, waba_id, phone_number_id, display_number, access_token, status)
         VALUES (?, ?, ?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE
           merchant_id = VALUES(merchant_id),
           waba_id = VALUES(waba_id),
           display_number = VALUES(display_number),
           access_token = VALUES(access_token),
           status = 'active'`,
        [merchantId, wabaId, n.id, n.display_phone_number || null, encrypt(token)]
      );
    }

    await conn.commit();
  } catch (e: any) {
    await conn.rollback();
    const msg = `Could not create merchant: ${e.message}`;
    console.error(`❌ ${msg}`);
    await logEvent({ event: 'PARTNER_ADDED', waba_id: wabaId, owner_business_id: ownerBusinessId, status: 'db_failed', error: msg, raw: value });
    conn.release();
    return;
  }
  conn.release();

  console.log(`✅ Merchant #${merchantId} "${businessName}" onboarded · login ${loginPhone} · subscribed=${subscribed}`);
  await logEvent({
    event: 'PARTNER_ADDED',
    waba_id: wabaId,
    owner_business_id: ownerBusinessId,
    phone_number_id: primary?.id || null,
    merchant_id: merchantId,
    status: subscribed ? 'connected' : 'connected_unsubscribed',
    raw: value,
  });
}

// Offboarding / removal — Meta sends these through account_update too.
export async function handleAccountUpdateOther(value: any): Promise<void> {
  const event = value?.event || 'UNKNOWN';
  const wabaId = value?.waba_info?.waba_id || value?.waba_id || null;
  console.log(`📻 account_update · ${event}${wabaId ? ` · waba=${wabaId}` : ''}`);

  if (['PARTNER_REMOVED', 'ACCOUNT_DELETED', 'DISABLED_UPDATE', 'PARTNER_APP_UNINSTALLED'].includes(event) && wabaId) {
    try {
      await pool.query(
        `UPDATE merchant_channels mc
         JOIN merchants m ON m.id = mc.merchant_id
         SET mc.status = 'disabled'
         WHERE m.waba_id = ?`, [wabaId]
      );
      await pool.query(`UPDATE merchants SET onboarding_status = 'offboarded' WHERE waba_id = ?`, [wabaId]);
      console.log(`🔌 Merchant with WABA ${wabaId} marked offboarded`);
    } catch (e: any) {
      console.error('❌ Offboarding update failed:', e.message);
    }
  }

  await logEvent({ event, waba_id: wabaId, status: 'logged', raw: value });
}
