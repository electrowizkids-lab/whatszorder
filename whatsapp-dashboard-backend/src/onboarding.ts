// src/onboarding.ts — Embedded Signup engine room (Tech Provider)
// ─────────────────────────────────────────────────────────────
// When a merchant finishes Meta's signup, Meta sends an
// `account_update` webhook. From that one signal we:
//
//   1. mint a business token for THEIR business portfolio
//   2. list the WhatsApp numbers on their WABA
//   3. subscribe our app to their WABA, then read it back
//   4. store the token encrypted and attach the WABA to a merchant
//
// What the first live run (12 Nov 2026) taught us:
//   - Meta's hosted-signup guide says the event is PARTNER_ADDED.
//     What actually arrived was PARTNER_APP_INSTALLED. Per the
//     webhook reference, PARTNER_ADDED is for Solution Partners;
//     Tech Providers get PARTNER_APP_INSTALLED. We act on both.
//   - Meta delivers the same event twice within a second, so two
//     runs for one WABA must not race each other.
//   - A WABA can arrive with no phone number on it. That is not a
//     merchant yet, so we record it and create nothing.
//   - A number that already belongs to a merchant must stay with
//     that merchant. We attach the WABA to them, never move it.
//
// Required .env:
//   META_APP_ID          your app id
//   META_APP_SECRET      App settings > Basic > App secret
//   META_ACCESS_TOKEN    your system user token (the platform one)
// Optional:
//   META_SYSTEM_USER_ID  only used as a fallback for the token call
//   GRAPH_VERSION        defaults to v22.0
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

// The events that mean "a customer connected their WhatsApp to us".
const INSTALL_EVENTS = new Set(['PARTNER_ADDED', 'PARTNER_APP_INSTALLED', 'MANUAL']);
const REMOVE_EVENTS = new Set(['PARTNER_REMOVED', 'ACCOUNT_DELETED', 'PARTNER_APP_UNINSTALLED']);

// axios errors carry the request config, which holds the access token.
// Never let a raw axios error reach a log.
function gerr(e: any): string {
  const err = e?.response?.data?.error;
  if (err) {
    const parts = [err.message, err.code !== undefined && `code=${err.code}`, err.error_subcode && `subcode=${err.error_subcode}`];
    return parts.filter(Boolean).join(' · ');
  }
  return e?.message || String(e);
}

// HMAC-SHA256 of the token, keyed with the app secret.
function proof(token: string): string {
  return crypto.createHmac('sha256', APP_SECRET).update(token).digest('hex');
}

const digits = (s: string) => (s || '').replace(/\D/g, '');

export function onboardingConfigProblems(): string[] {
  const missing: string[] = [];
  if (!APP_ID) missing.push('META_APP_ID');
  if (!APP_SECRET) missing.push('META_APP_SECRET');
  if (!PLATFORM_TOKEN) missing.push('META_ACCESS_TOKEN');
  return missing;
}

// ── Graph calls ──────────────────────────────────────────────

// The customer's business token. The portfolio id is THEIRS, not ours.
// First attempt is exactly the request in Meta's hosted-signup guide.
// If that is refused and we know our system user id, we retry with the
// variant from the app-only-install guide, which names the system user.
export async function fetchBusinessToken(ownerBusinessId: string): Promise<string> {
  const url = `${GRAPH}/${ownerBusinessId}/system_user_access_tokens`;
  const headers = {
    Authorization: `Bearer ${PLATFORM_TOKEN}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const base = { appsecret_proof: proof(PLATFORM_TOKEN), fetch_only: 'true' };

  const attempt = async (extra: Record<string, string>) => {
    const body = new URLSearchParams({ ...base, ...extra }).toString();
    const { data } = await axios.post(url, body, { headers, timeout: 20000 });
    if (!data?.access_token) throw new Error('Meta returned no access_token for that business portfolio');
    return data.access_token as string;
  };

  try {
    return await attempt({});
  } catch (first: any) {
    if (!SYSTEM_USER_ID) throw first;
    console.warn(`⚠️  Token call refused (${gerr(first)}) — retrying with system_user_id`);
    return await attempt({ system_user_id: SYSTEM_USER_ID });
  }
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
      appsecret_proof: proof(token),
    },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000,
  });
  return data?.data || [];
}

async function subscribeApp(wabaId: string, token: string): Promise<void> {
  await axios.post(`${GRAPH}/${wabaId}/subscribed_apps`, null, {
    params: { appsecret_proof: proof(token) },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000,
  });
}

async function subscribedApps(wabaId: string, token: string): Promise<any[]> {
  const { data } = await axios.get(`${GRAPH}/${wabaId}/subscribed_apps`, {
    params: { appsecret_proof: proof(token) },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000,
  });
  return data?.data || [];
}

// ── audit trail ──────────────────────────────────────────────
// Render rotates logs. This table is the record that survives.
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
// Meta sends the same event twice within a second. One run per WABA.
const inFlight = new Set<string>();

export async function handlePartnerAdded(value: any): Promise<void> {
  const info = value?.waba_info || {};
  const wabaId = String(info.waba_id || '');
  const ownerBusinessId = String(info.owner_business_id || '');
  const event: string = value?.event || 'PARTNER_ADDED';

  console.log(`\n🆕 ${event} · waba=${wabaId} · business=${ownerBusinessId}`);

  if (!wabaId || !ownerBusinessId) {
    const msg = `${event} arrived without waba_id or owner_business_id`;
    console.error(`❌ ${msg}`);
    await logEvent({ event, status: 'bad_payload', error: msg, raw: value });
    return;
  }
  if (inFlight.has(wabaId)) {
    console.log(`↩️  WABA ${wabaId} is already being onboarded — duplicate delivery ignored`);
    return;
  }

  inFlight.add(wabaId);
  try {
    await onboard(event, wabaId, ownerBusinessId, value);
  } catch (e: any) {
    const msg = `Onboarding crashed: ${gerr(e)}`;
    console.error(`❌ ${msg}`);
    await logEvent({ event, waba_id: wabaId, owner_business_id: ownerBusinessId, status: 'crashed', error: msg, raw: value });
  } finally {
    inFlight.delete(wabaId);
  }
}

async function onboard(event: string, wabaId: string, ownerBusinessId: string, value: any): Promise<void> {
  const base = { event, waba_id: wabaId, owner_business_id: ownerBusinessId, raw: value };

  const missing = onboardingConfigProblems();
  if (missing.length) {
    const msg = `Onboarding is not configured — missing ${missing.join(', ')}`;
    console.error(`❌ ${msg}`);
    await logEvent({ ...base, status: 'config_error', error: msg });
    return;
  }

  // Already connected? Meta retries webhooks; nothing to do.
  const [existing]: any = await pool.query(
    'SELECT id, business_name FROM merchants WHERE waba_id = ? LIMIT 1', [wabaId]
  );
  if (existing.length) {
    console.log(`↩️  WABA ${wabaId} already belongs to merchant #${existing[0].id} (${existing[0].business_name})`);
    await logEvent({ ...base, merchant_id: existing[0].id, status: 'duplicate' });
    return;
  }

  let token: string;
  try {
    token = await fetchBusinessToken(ownerBusinessId);
    console.log('🔑 Business token obtained');
  } catch (e: any) {
    const msg = `Could not get business token: ${gerr(e)}`;
    console.error(`❌ ${msg}`);
    await logEvent({ ...base, status: 'token_failed', error: msg });
    return;
  }

  let numbers: MetaPhoneNumber[];
  try {
    numbers = await listPhoneNumbers(wabaId, token);
    console.log(`📞 ${numbers.length} number(s) on this WABA: ${numbers.map(n => n.display_phone_number).join(', ') || '(none)'}`);
  } catch (e: any) {
    const msg = `Could not list phone numbers: ${gerr(e)}`;
    console.error(`❌ ${msg}`);
    await logEvent({ ...base, status: 'numbers_failed', error: msg });
    return;
  }

  // A WhatsApp account with no number on it cannot take orders and has
  // nothing to log in with. Record it and stop; do not invent a merchant.
  if (!numbers.length) {
    console.warn(`⚠️  WABA ${wabaId} has no phone number yet — recorded, no merchant created`);
    await logEvent({ ...base, status: 'no_numbers' });
    return;
  }

  // Subscribe our app to their WABA, then READ IT BACK. In September a
  // subscribe call returned OK while the list stayed empty and no messages
  // ever arrived. We do not trust the call without checking.
  let subscribed = false;
  try {
    await subscribeApp(wabaId, token);
    const apps = await subscribedApps(wabaId, token);
    subscribed = apps.some((a: any) =>
      String(a?.whatsapp_business_api_data?.id || a?.id || '') === String(APP_ID)
    );
    if (subscribed) console.log('📡 App subscribed to their WABA — confirmed by read-back');
    else console.error(`❌ Subscribe returned OK but read-back does not list app ${APP_ID}. Messages from this merchant will NOT arrive.`);
  } catch (e: any) {
    console.error(`❌ Could not subscribe to WABA: ${gerr(e)}`);
  }

  const primary = numbers[0];
  const ids = numbers.map(n => n.id);
  const phones = numbers.map(n => digits(n.display_phone_number || '')).filter(Boolean);

  const conn = await pool.getConnection();
  let merchantId: number | null = null;
  let how = 'created';
  try {
    await conn.beginTransaction();

    // 1) Does one of these numbers already belong to a merchant?
    //    Then this WABA is theirs. Never move a live number.
    const [byChannel]: any = await conn.query(
      'SELECT merchant_id FROM merchant_channels WHERE phone_number_id IN (?) LIMIT 1', [ids]
    );
    if (byChannel.length) {
      merchantId = byChannel[0].merchant_id;
      how = 'attached to the merchant that already has this number';
    }

    // 2) Was a merchant set up in advance with this number as their login?
    if (!merchantId && phones.length) {
      const [byPhone]: any = await conn.query(
        'SELECT id FROM merchants WHERE login_phone IN (?) AND waba_id IS NULL LIMIT 1', [phones]
      );
      if (byPhone.length) {
        merchantId = byPhone[0].id;
        how = 'attached to the merchant already registered with this number';
      }
    }

    if (merchantId) {
      await conn.query(
        `UPDATE merchants
         SET waba_id = ?, owner_business_id = ?, onboarding_status = 'connected', onboarded_at = NOW()
         WHERE id = ?`,
        [wabaId, ownerBusinessId, merchantId]
      );
    } else {
      // 3) A new merchant.
      const businessName = (primary.verified_name || `Merchant ${wabaId.slice(-6)}`).slice(0, 120);
      const [m]: any = await conn.query(
        `INSERT INTO merchants (business_name, login_phone, waba_id, owner_business_id, onboarding_status, onboarded_at)
         VALUES (?, ?, ?, ?, 'connected', NOW())`,
        [businessName, phones[0] || `waba${wabaId}`.slice(0, 20), wabaId, ownerBusinessId]
      );
      merchantId = m.insertId;
    }

    const enc = encrypt(token);
    for (const n of numbers) {
      // On a clash the number keeps its merchant; only its WABA, display
      // number and token are refreshed.
      await conn.query(
        `INSERT INTO merchant_channels (merchant_id, waba_id, phone_number_id, display_number, access_token, status)
         VALUES (?, ?, ?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE
           waba_id = VALUES(waba_id),
           display_number = VALUES(display_number),
           access_token = VALUES(access_token),
           status = 'active'`,
        [merchantId, wabaId, n.id, n.display_phone_number || null, enc]
      );
    }

    await conn.commit();
  } catch (e: any) {
    await conn.rollback();
    conn.release();
    if (e.code === 'ER_DUP_ENTRY') {
      console.log(`↩️  WABA ${wabaId} was recorded by another run — nothing more to do`);
      await logEvent({ ...base, status: 'duplicate', error: e.message });
      return;
    }
    const msg = `Could not save merchant: ${e.message}`;
    console.error(`❌ ${msg}`);
    await logEvent({ ...base, status: 'db_failed', error: msg });
    return;
  }
  conn.release();

  console.log(`✅ Merchant #${merchantId} onboarded (${how}) · ${phones[0] || 'no number'} · subscribed=${subscribed}`);
  await logEvent({
    ...base,
    phone_number_id: primary.id,
    merchant_id: merchantId,
    status: subscribed ? 'connected' : 'connected_unsubscribed',
  });
}

// Every other account_update event. server.ts sends everything that is
// not PARTNER_ADDED here, so this is also where PARTNER_APP_INSTALLED
// arrives — and gets passed on to the onboarding above.
export async function handleAccountUpdateOther(value: any): Promise<void> {
  const event: string = value?.event || 'UNKNOWN';

  if (INSTALL_EVENTS.has(event)) {
    await handlePartnerAdded(value);
    return;
  }

  const wabaId = value?.waba_info?.waba_id || value?.waba_id || null;
  console.log(`📻 account_update · ${event}${wabaId ? ` · waba=${wabaId}` : ''}`);

  if (REMOVE_EVENTS.has(event) && wabaId) {
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
