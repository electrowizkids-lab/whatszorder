// src/server.ts  —  Phase 1: multi-tenant SaaS foundation
// ─────────────────────────────────────────────────────────────
// What changed vs your previous version:
//  1. Webhook now ROUTES BY metadata.phone_number_id ➜ merchant.
//     One /webhook URL serves every merchant forever.
//  2. All /api/* endpoints require login (JWT) and are scoped to
//     the logged-in merchant. (DISABLE_AUTH=true bypasses while
//     the login page is being built.)
//  3. Optional Meta webhook signature verification (set
//     META_APP_SECRET to enable — do this before production).
//  4. Bug fixes: customer name auto-updates, outbound messages
//     store their WhatsApp message id, and manual sends save to
//     DB only AFTER Meta accepts them.
// ─────────────────────────────────────────────────────────────
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import axios from 'axios';
import pool, { testDbConnection } from './db';
import { authRouter, requireAuth, AuthedRequest } from './auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET; // enables signature checks when set

// CORS: '*' is fine locally; set CORS_ORIGIN=https://your-dashboard.com in production.
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

// Capture the raw body — required to verify Meta's signature.
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; }
}));

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

type Channel = {
  id: number; merchant_id: number; phone_number_id: string;
  access_token: string | null; display_number: string | null;
};

// Which merchant owns this WhatsApp number? (the heart of multi-tenancy)
async function channelByPhoneNumberId(phoneNumberId: string): Promise<Channel | null> {
  const [rows]: any = await pool.query(
    'SELECT * FROM merchant_channels WHERE phone_number_id = ? AND status = ? LIMIT 1',
    [phoneNumberId, 'active']
  );
  return rows.length ? rows[0] : null;
}

// The merchant's primary channel (used when the dashboard sends)
async function channelByMerchantId(merchantId: number): Promise<Channel | null> {
  const [rows]: any = await pool.query(
    'SELECT * FROM merchant_channels WHERE merchant_id = ? AND status = ? LIMIT 1',
    [merchantId, 'active']
  );
  return rows.length ? rows[0] : null;
}

// Send a WhatsApp text via a merchant's channel. Returns the wamid.
// Phase 1: channel.access_token is NULL, so we fall back to the env
// token (yours). Phase 3 (Embedded Signup) fills per-merchant tokens.
async function sendWhatsAppText(channel: Channel, to: string, text: string): Promise<string | null> {
  const token = channel.access_token || process.env.META_ACCESS_TOKEN;
  const resp = await axios.post(
    `https://graph.facebook.com/v21.0/${channel.phone_number_id}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return resp.data?.messages?.[0]?.id || null;
}

// Verify X-Hub-Signature-256 when META_APP_SECRET is configured.
function verifyMetaSignature(req: any): boolean {
  if (!APP_SECRET) return true; // not configured yet — allow (dev)
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature || !req.rawBody) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(req.rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. ANTI-SLEEP / HEALTH
// ─────────────────────────────────────────────────────────────
app.get('/ping', (_req: Request, res: Response) => {
  res.status(200).send('Pong! Server is awake.');
});

// ─────────────────────────────────────────────────────────────
// 2. WHATSAPP WEBHOOK VERIFICATION (GET) — unchanged
// ─────────────────────────────────────────────────────────────
app.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook Verified by Meta');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─────────────────────────────────────────────────────────────
// 3. WHATSAPP LIVE MESSAGES (POST) — now multi-tenant
// ─────────────────────────────────────────────────────────────
app.post('/webhook', async (req: Request, res: Response) => {
  // Reject forged payloads (only when APP_SECRET is configured)
  if (!verifyMetaSignature(req)) {
    console.warn('🚫 Webhook signature check failed — payload rejected');
    return res.sendStatus(401);
  }

  // Acknowledge instantly so Meta doesn't retry
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  try {
    if (body.object !== 'whatsapp_business_account') return;
    const changeValue = body.entry?.[0]?.changes?.[0]?.value;
    const message = changeValue?.messages?.[0];
    if (!message) return; // delivery/read status callbacks — ignore

    // ── WHICH MERCHANT? Route by the receiving number's ID ──
    const phoneNumberId = changeValue?.metadata?.phone_number_id;
    const channel = phoneNumberId ? await channelByPhoneNumberId(phoneNumberId) : null;
    if (!channel) {
      console.warn(`⚠️ Message for unknown phone_number_id ${phoneNumberId} — ignored`);
      return;
    }
    const merchantId = channel.merchant_id;

    if (message.type !== 'text') return; // interactive replies arrive in Phase 2

    const customerPhone = message.from;
    const contact = changeValue.contacts?.[0];
    const customerName = contact?.profile?.name || 'Unknown Customer';
    const messageText = message.text.body;
    const whatsappMsgId = message.id;

    console.log(`\n📥 [merchant ${merchantId}] ${customerName} (${customerPhone}): "${messageText}"`);

    // ── A. Find or create the customer — PER MERCHANT ──
    const [customerRows]: any = await pool.query(
      'SELECT id, name FROM customers WHERE merchant_id = ? AND whatsapp_id = ?',
      [merchantId, customerPhone]
    );

    let customerId: number;
    if (customerRows.length === 0) {
      const [insertResult]: any = await pool.query(
        'INSERT INTO customers (merchant_id, whatsapp_id, name) VALUES (?, ?, ?)',
        [merchantId, customerPhone, customerName]
      );
      customerId = insertResult.insertId;
      console.log(`👤 New customer for merchant ${merchantId} (ID: ${customerId})`);
    } else {
      customerId = customerRows[0].id;
      // Bug fix: keep the WhatsApp profile name fresh
      if (customerName !== 'Unknown Customer' && customerRows[0].name !== customerName) {
        await pool.query('UPDATE customers SET name = ? WHERE id = ?', [customerName, customerId]);
        console.log(`✏️ Updated customer name → ${customerName}`);
      }
    }

    // ── B. Save the inbound message ──
    try {
      await pool.query(
        'INSERT INTO chat_messages (merchant_id, customer_id, direction, message_text, whatsapp_msg_id) VALUES (?, ?, ?, ?, ?)',
        [merchantId, customerId, 'inbound', messageText, whatsappMsgId]
      );
      console.log('💾 Message saved.');
    } catch (dbError: any) {
      if (dbError.code === 'ER_DUP_ENTRY') {
        console.log(`⚠️ Duplicate message ignored (${whatsappMsgId})`);
        return; // already processed — don't re-acknowledge
      }
      throw dbError;
    }

    // ── C. Auto-acknowledgement (via THIS merchant's channel) ──
    try {
      const ackText = 'Your order has been received and we are working on it. 🙏';
      const ackWamid = await sendWhatsAppText(channel, customerPhone, ackText);
      await pool.query(
        'INSERT INTO chat_messages (merchant_id, customer_id, direction, message_text, whatsapp_msg_id) VALUES (?, ?, ?, ?, ?)',
        [merchantId, customerId, 'outbound', ackText, ackWamid]
      );
      console.log(`🤖 Auto-acknowledgement sent to ${customerPhone}`);
    } catch (ackError: any) {
      console.error('❌ Acknowledgement failed:', ackError.response?.data?.error?.message || ackError.message);
    }

    // Phase 2 hook: this is where the ordering bot state machine
    // will take over (catalog list ➜ cart ➜ payment link).
    // Phase 1.5 hook: Socket.IO emit to room `merchant:${merchantId}`.

  } catch (error) {
    console.error('❌ Error processing webhook payload:', error);
  }
});

// ─────────────────────────────────────────────────────────────
// AUTH ROUTES (public) + PROTECTION for everything else
// ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api', requireAuth); // every /api/* below needs a valid JWT

// ─────────────────────────────────────────────────────────────
// FRONTEND API — all queries scoped to the logged-in merchant
// ─────────────────────────────────────────────────────────────

// Customers list
app.get('/api/customers', async (req: AuthedRequest, res: Response) => {
  try {
    const [customers]: any = await pool.query(
      'SELECT id, name, whatsapp_id, status, created_at FROM customers WHERE merchant_id = ? ORDER BY created_at DESC',
      [req.merchantId]
    );
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Chat history for one customer (ownership enforced in SQL)
app.get('/api/chat/:customerId', async (req: AuthedRequest, res: Response) => {
  try {
    const [messages]: any = await pool.query(
      `SELECT cm.id, cm.direction, cm.message_text, cm.timestamp
       FROM chat_messages cm
       JOIN customers c ON c.id = cm.customer_id
       WHERE cm.customer_id = ? AND c.merchant_id = ?
       ORDER BY cm.timestamp ASC`,
      [req.params.customerId, req.merchantId]
    );
    res.json(messages);
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Orders board (latest message per customer) — merchant-scoped
app.get('/api/orders', async (req: AuthedRequest, res: Response) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT
        c.id, c.name, c.whatsapp_id, c.status, c.created_at,
        lm.message_text AS latest_message,
        lm.timestamp    AS latest_time
      FROM customers c
      LEFT JOIN (
        SELECT cm.customer_id, cm.message_text, cm.timestamp
        FROM chat_messages cm
        INNER JOIN (
          SELECT customer_id, MAX(timestamp) AS mx
          FROM chat_messages GROUP BY customer_id
        ) latest ON cm.customer_id = latest.customer_id AND cm.timestamp = latest.mx
      ) lm ON lm.customer_id = c.id
      WHERE c.merchant_id = ?
      ORDER BY lm.timestamp DESC
    `, [req.merchantId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Update status — only within the merchant's own data
app.patch('/api/orders/:id/status', async (req: AuthedRequest, res: Response) => {
  const { status } = req.body;
  const allowed = ['pending', 'processing', 'fulfilled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const [result]: any = await pool.query(
      'UPDATE customers SET status = ? WHERE id = ? AND merchant_id = ?',
      [status, req.params.id, req.merchantId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    console.log(`🔄 [merchant ${req.merchantId}] order ${req.params.id} → ${status}`);
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Manual send from the dashboard — send FIRST, save on success
app.post('/api/chat/send', async (req: AuthedRequest, res: Response) => {
  const { customerId, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Empty message' });

  try {
    const [customerRows]: any = await pool.query(
      'SELECT whatsapp_id FROM customers WHERE id = ? AND merchant_id = ?',
      [customerId, req.merchantId]
    );
    if (customerRows.length === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const channel = await channelByMerchantId(req.merchantId!);
    if (!channel) {
      return res.status(400).json({ error: 'No active WhatsApp channel for this merchant.' });
    }

    // Bug fix: Meta first, DB second — no ghost messages on failure
    const wamid = await sendWhatsAppText(channel, customerRows[0].whatsapp_id, text);

    await pool.query(
      'INSERT INTO chat_messages (merchant_id, customer_id, direction, message_text, whatsapp_msg_id) VALUES (?, ?, ?, ?, ?)',
      [req.merchantId, customerId, 'outbound', text, wamid]
    );

    console.log(`📤 [merchant ${req.merchantId}] sent to ${customerRows[0].whatsapp_id}`);
    res.json({ success: true, message: 'Message sent.' });
  } catch (error: any) {
    const errorDetail = error.response?.data?.error?.message || error.message;
    console.error('❌ Send failed:', errorDetail);
    // 24-hour window failures land here with Meta's explanation
    res.status(500).json({ error: 'Failed to send message', details: errorDetail });
  }
});

// ─────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (!APP_SECRET) console.warn('⚠️  META_APP_SECRET not set — webhook signature checks are OFF (fine for local dev).');
  if (process.env.DISABLE_AUTH === 'true') console.warn('⚠️  DISABLE_AUTH=true — all API calls act as merchant #1. Never use in production.');
  await testDbConnection();
});
