// src/testOnboarding.ts — read-only probe of the onboarding Graph calls
// ─────────────────────────────────────────────────────────────
// Runs the three Graph calls that onboarding depends on, against
// a business portfolio and WABA you already own, and prints what
// comes back. It writes NOTHING — no database rows, no merchants,
// no subscriptions created. Safe to run as often as you like.
//
// The point is to prove the hard part works before a real merchant
// is involved. If the token mint is going to fail because of a bad
// appsecret_proof, a wrong system user id, or a missing permission,
// this is where you want to find out — not halfway through your
// first shop owner's signup.
//
// Usage (from the backend folder):
//   npx ts-node src/testOnboarding.ts <BUSINESS_PORTFOLIO_ID> <WABA_ID>
//
// With your own values:
//   npx ts-node src/testOnboarding.ts 1450298497004557 902495792725199
// ─────────────────────────────────────────────────────────────
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v22.0'}`;
const APP_ID = process.env.META_APP_ID || '';
const APP_SECRET = process.env.META_APP_SECRET || '';
const SYSTEM_USER_ID = process.env.META_SYSTEM_USER_ID || '';
const PLATFORM_TOKEN = process.env.META_ACCESS_TOKEN || '';

const [, , businessIdArg, wabaIdArg] = process.argv;
const BUSINESS_ID = businessIdArg || '';
const WABA_ID = wabaIdArg || process.env.META_WABA_ID || '';

function proof(token: string): string {
  return crypto.createHmac('sha256', APP_SECRET).update(token).digest('hex');
}

// Never print a token in full, not even into your own terminal —
// terminal scrollback ends up in screenshots.
const mask = (t: string) => (t ? `${t.slice(0, 8)}…${t.slice(-4)} (${t.length} chars)` : '(empty)');

function gerr(e: any): string {
  const err = e?.response?.data?.error;
  if (!err) return e?.message || String(e);
  return [
    err.message,
    err.code !== undefined && `code=${err.code}`,
    err.error_subcode !== undefined && `subcode=${err.error_subcode}`,
    err.error_user_msg && `· ${err.error_user_msg}`,
  ].filter(Boolean).join(' ');
}

async function main() {
  console.log('\n═══ Yanvio onboarding probe (read-only) ═══\n');

  // ── 0. configuration ──
  const missing: string[] = [];
  if (!APP_ID) missing.push('META_APP_ID');
  if (!APP_SECRET) missing.push('META_APP_SECRET');
  if (!PLATFORM_TOKEN) missing.push('META_ACCESS_TOKEN');
  if (missing.length) {
    console.error(`❌ Missing from .env: ${missing.join(', ')}`);
    console.error('   Add them locally (Render already has them) and run again.');
    process.exit(1);
  }
  if (!BUSINESS_ID) {
    console.error('❌ Give a business portfolio id:');
    console.error('   npx ts-node src/testOnboarding.ts 1450298497004557 902495792725199');
    process.exit(1);
  }

  console.log(`App id          : ${APP_ID}`);
  console.log(`System user id  : ${SYSTEM_USER_ID || '(not set — optional)'}`);
  console.log(`Platform token  : ${mask(PLATFORM_TOKEN)}`);
  console.log(`Business portfolio: ${BUSINESS_ID}`);
  console.log(`WABA            : ${WABA_ID || '(not given — step 2 and 3 will be skipped)'}\n`);

  // ── 1. who does the platform token belong to? ──
  // A system user token asked "/me" returns its own id. If this does
  // not match META_SYSTEM_USER_ID, that is your bug.
  console.log('① Checking the platform token…');
  try {
    const { data } = await axios.get(`${GRAPH}/me`, {
      params: { fields: 'id,name', access_token: PLATFORM_TOKEN, appsecret_proof: proof(PLATFORM_TOKEN) },
      timeout: 20000,
    });
    console.log(`   ✅ Token belongs to: ${data.name || '(no name)'} · id ${data.id}`);
    if (SYSTEM_USER_ID && String(data.id) !== String(SYSTEM_USER_ID)) {
      console.warn(`   ⚠️  META_SYSTEM_USER_ID is ${SYSTEM_USER_ID} but this token's id is ${data.id}.`);
      console.warn('      These must be the same system user, or the token mint will fail.');
    }
  } catch (e: any) {
    console.error(`   ❌ ${gerr(e)}`);
    console.error('      The platform token is the foundation — fix this before anything else.');
    process.exit(1);
  }

  // ── 2. the business token (the call that matters) ──
  // First exactly as Meta's hosted-signup guide writes it; if refused,
  // once more naming the system user (the app-only-install variant).
  console.log('\n② Getting a business token for that portfolio…');
  let businessToken = '';
  const tokenCall = async (extra: Record<string, string>) => {
    const body = new URLSearchParams({
      appsecret_proof: proof(PLATFORM_TOKEN), fetch_only: 'true', ...extra,
    }).toString();
    const { data } = await axios.post(`${GRAPH}/${BUSINESS_ID}/system_user_access_tokens`, body, {
      headers: {
        Authorization: `Bearer ${PLATFORM_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 20000,
    });
    return data?.access_token || '';
  };
  try {
    businessToken = await tokenCall({});
    if (businessToken) console.log(`   ✅ Business token obtained (guide form): ${mask(businessToken)}`);
  } catch (e: any) {
    console.error(`   ❌ Guide form refused: ${gerr(e)}`);
    if (SYSTEM_USER_ID) {
      try {
        businessToken = await tokenCall({ system_user_id: SYSTEM_USER_ID });
        if (businessToken) console.log(`   ✅ Business token obtained (with system_user_id): ${mask(businessToken)}`);
      } catch (e2: any) {
        console.error(`   ❌ With system_user_id also refused: ${gerr(e2)}`);
      }
    }
  }
  if (!businessToken) console.error('      No business token. Onboarding cannot proceed past this step.');

  if (!WABA_ID || !businessToken) {
    console.log('\n═══ Probe finished early ═══\n');
    process.exit(0);
  }

  // ── 3. the numbers on that WABA ──
  console.log('\n③ Listing phone numbers on the WABA…');
  try {
    const { data } = await axios.get(`${GRAPH}/${WABA_ID}/phone_numbers`, {
      params: {
        fields: 'id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type',
        access_token: businessToken,
        appsecret_proof: proof(businessToken),
      },
      timeout: 20000,
    });
    const nums = data?.data || [];
    if (!nums.length) {
      console.log('   ⚠️  No phone numbers on this WABA.');
    }
    for (const n of nums) {
      console.log(`   ✅ ${n.display_phone_number}  id=${n.id}`);
      console.log(`      name="${n.verified_name}" · verification=${n.code_verification_status} · quality=${n.quality_rating} · platform=${n.platform_type}`);
    }
    console.log('      (platform_type tells you whether a number is CLOUD_API or');
    console.log('       still on the Business App — useful once Coexistence is live.)');
  } catch (e: any) {
    console.error(`   ❌ ${gerr(e)}`);
  }

  // ── 4. is our app actually subscribed? ──
  console.log('\n④ Reading back subscribed apps on that WABA…');
  try {
    const { data } = await axios.get(`${GRAPH}/${WABA_ID}/subscribed_apps`, {
      params: { access_token: businessToken, appsecret_proof: proof(businessToken) },
      timeout: 20000,
    });
    const apps = data?.data || [];
    if (!apps.length) {
      console.log('   ⚠️  No apps subscribed — messages from this WABA would not reach you.');
    }
    for (const a of apps) {
      const id = String(a?.whatsapp_business_api_data?.id || a?.id || '');
      const name = a?.whatsapp_business_api_data?.name || a?.name || '(unnamed)';
      const mine = id === String(APP_ID) ? ' ← this is you' : '';
      console.log(`   ✅ ${name} · id ${id}${mine}`);
    }
  } catch (e: any) {
    console.error(`   ❌ ${gerr(e)}`);
  }

  console.log('\n═══ Probe complete — nothing was written ═══\n');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n💥 Probe crashed:', e?.message || e);
  process.exit(1);
});
