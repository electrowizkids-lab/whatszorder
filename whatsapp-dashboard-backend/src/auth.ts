// src/auth.ts
// ─────────────────────────────────────────────────────────────
// MERCHANT LOGIN: WhatsApp-number + OTP ➜ JWT
//
// Endpoints (mounted at /api/auth in server.ts):
//   POST /api/auth/request-otp   { phone }
//   POST /api/auth/verify-otp    { phone, code }  ➜ { token, merchant }
//
// Also exports requireAuth middleware that protects /api/* routes
// and puts req.merchantId on every request.
//
// OTP DELIVERY MODES (env OTP_DEV_MODE):
//   - default (dev): OTP printed to your server terminal. Zero
//     Meta dependency — build & test login TODAY.
//   - OTP_DEV_MODE=false (production): sends via WhatsApp.
//     Requires an approved AUTHENTICATION template (set
//     AUTH_TEMPLATE_NAME in .env). Auth templates cost ~₹0.115
//     per send and are charged even inside a service window.
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import pool from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (JWT_SECRET === 'dev-secret-change-me') {
  console.warn('⚠️  JWT_SECRET not set — using an insecure dev default. Set it in .env before deploying.');
}

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

// Extend Request so TypeScript knows about merchantId
export interface AuthedRequest extends Request {
  merchantId?: number;
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// Keep digits only; expect full international format e.g. 918882614689
const normalizePhone = (raw: string) => (raw || '').replace(/\D/g, '');

// ── OTP delivery ─────────────────────────────────────────────
async function sendOtp(phone: string, code: string) {
  const devMode = process.env.OTP_DEV_MODE !== 'false';

  if (devMode) {
    console.log('┌──────────────────────────────────────────┐');
    console.log(`│  🔐 DEV OTP for ${phone}: ${code}        `);
    console.log('│  (set OTP_DEV_MODE=false to send on WhatsApp)');
    console.log('└──────────────────────────────────────────┘');
    return;
  }

  // Production: send via an approved WhatsApp AUTHENTICATION template.
  // The platform's own number sends this (PLATFORM_PHONE_ID), falling
  // back to META_PHONE_ID during the pilot.
  const phoneId = process.env.PLATFORM_PHONE_ID || process.env.META_PHONE_ID;
  const token = process.env.META_ACCESS_TOKEN;
  const templateName = process.env.AUTH_TEMPLATE_NAME; // e.g. 'login_otp'

  if (!templateName) {
    throw new Error('AUTH_TEMPLATE_NAME not set — cannot send OTP via WhatsApp. Create an Authentication template in Meta and set its name in .env.');
  }

  await axios.post(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0',
            parameters: [{ type: 'text', text: code }] },
        ],
      },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}

// ── Router ───────────────────────────────────────────────────
export const authRouter = Router();

// STEP 1: merchant enters their number ➜ we generate + send OTP
authRouter.post('/request-otp', async (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  if (phone.length < 10 || phone.length > 15) {
    return res.status(400).json({ error: 'Enter your full WhatsApp number with country code, e.g. 91XXXXXXXXXX' });
  }

  try {
    // Only registered merchants can log in (public signup arrives
    // with Embedded Signup in Phase 3).
    const [merchants]: any = await pool.query(
      'SELECT id, business_name FROM merchants WHERE login_phone = ? AND status = ?',
      [phone, 'active']
    );
    if (merchants.length === 0) {
      return res.status(404).json({ error: 'No merchant account found for this number.' });
    }

    // Throttle: max one OTP per minute per phone
    const [recent]: any = await pool.query(
      'SELECT COUNT(*) AS n FROM otp_codes WHERE phone = ? AND created_at > NOW() - INTERVAL 1 MINUTE',
      [phone]
    );
    if (recent[0].n > 0) {
      return res.status(429).json({ error: 'Please wait a minute before requesting another code.' });
    }

    const code = String(crypto.randomInt(100000, 999999)); // 6 digits
    await pool.query('DELETE FROM otp_codes WHERE phone = ?', [phone]); // one live code per phone
    await pool.query(
      'INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES (?, ?, NOW() + INTERVAL ? MINUTE)',
      [phone, sha256(code), OTP_TTL_MINUTES]
    );

    await sendOtp(phone, code);
    res.json({ success: true, message: `OTP sent. Valid for ${OTP_TTL_MINUTES} minutes.` });
  } catch (e: any) {
    console.error('❌ request-otp failed:', e.response?.data?.error?.message || e.message);
    res.status(500).json({ error: 'Could not send OTP. Please try again.' });
  }
});

// STEP 2: merchant submits the code ➜ we verify and issue a JWT
authRouter.post('/verify-otp', async (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || '').trim();
  if (!phone || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Provide phone and the 6-digit code.' });
  }

  try {
	const [rows]: any = await pool.query(
      'SELECT *, (expires_at < NOW()) AS is_expired FROM otp_codes WHERE phone = ? ORDER BY id DESC LIMIT 1',
      [phone]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No code requested for this number. Request a new OTP.' });
    }
    const record = rows[0];

	if (record.is_expired) {
      return res.status(400).json({ error: 'Code expired. Request a new OTP.' });
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many wrong attempts. Request a new OTP.' });
    }
    if (record.code_hash !== sha256(code)) {
      await pool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [record.id]);
      return res.status(401).json({ error: 'Incorrect code.' });
    }

    // Success — burn the code, issue the token
    await pool.query('DELETE FROM otp_codes WHERE phone = ?', [phone]);
    const [merchants]: any = await pool.query(
      'SELECT id, business_name FROM merchants WHERE login_phone = ?', [phone]
    );
    const merchant = merchants[0];

    const token = jwt.sign({ merchantId: merchant.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, merchant: { id: merchant.id, business_name: merchant.business_name } });
  } catch (e: any) {
    console.error('❌ verify-otp failed:', e.message);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// ── Middleware: protects /api/* and injects req.merchantId ───
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  // TEMPORARY escape hatch while the login page doesn't exist yet.
  // With DISABLE_AUTH=true every request acts as merchant #1 (you).
  // ⚠️ NEVER set this in production.
  if (process.env.DISABLE_AUTH === 'true') {
    req.merchantId = 1;
    return next();
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { merchantId: number };
    req.merchantId = payload.merchantId;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}
