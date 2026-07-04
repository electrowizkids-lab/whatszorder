// src/server.ts — Phase 2: Socket.IO real-time + ordering bot
// ─────────────────────────────────────────────────────────────
// New in this version:
//  1. Socket.IO — JWT-authenticated sockets, one room per
//     merchant. Events: message:new, order:new, order:status.
//  2. Webhook now handles type 'interactive' (list picks &
//     button taps) and hands every message to the bot first.
//  3. The old blanket auto-ack is retired. The bot replies when
//     it's an ordering interaction; other texts get one neutral
//     hint ("reply *menu* to order") and reach the dashboard.
// ─────────────────────────────────────────────────────────────
import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool, { testDbConnection } from './db';
import { authRouter, requireAuth, AuthedRequest } from './auth';
import { channelByPhoneNumberId, channelByMerchantId, sendText, Channel } from './wa';
import { handleIncomingMessage } from './bot';
import { verifyRazorpaySignature } from './razorpay';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

// ─────────────────────────────────────────────────────────────
// SOCKET.IO — real-time channel to each merchant's dashboard
// ─────────────────────────────────────────────────────────────
const io = new SocketServer(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' },
});

io.use((socket, next) => {
  if (process.env.DISABLE_AUTH === 'true') {
    socket.data.merchantId = 1;
    return next();
  }
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { merchantId: number };
    socket.data.merchantId = payload.merchantId;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const merchantId = socket.data.merchantId;
  socket.join(`merchant:${merchantId}`);
  console.log(`🔌 Dashboard connected (merchant ${merchantId})`);
  socket.on('disconnect', () => console.log(`🔌 Dashboard disconnected (merchant ${merchantId})`));
});

const emitToMerchant = (merchantId: number, event: string, payload: any) =>
  io.to(`merchant:${merchantId}`).emit(event, payload);

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function verifyMetaSignature(req: any): boolean {
  if (!APP_SECRET) return true; // dev — checks off until secret configured
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature || !req.rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); }
  catch { return false; }
}

// Save a chat message and push it live to the dashboard.
async function saveMessage(
  merchantId: number, customerId: number,
  direction: 'inbound' | 'outbound', text: string, wamid: string | null
): Promise<boolean> {
  try {
    const [result]: any = await pool.query(
      'INSERT INTO chat_messages (merchant_id, customer_id, direction, message_text, whatsapp_msg_id) VALUES (?, ?, ?, ?, ?)',
      [merchantId, customerId, direction, text, wamid]
    );
    emitToMerchant(merchantId, 'message:new', {
      id: result.insertId, customer_id: customerId, direction,
      message_text: text, timestamp: new Date().toISOString(),
    });
    return true;
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') {
      console.log(`⚠️ Duplicate message ignored (${wamid})`);
      return false;
    }
    throw e;
  }
}

// A human-readable line for non-text messages (shown in chat history)
function displayText(message: any): string {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'interactive') {
    const i = message.interactive;
    if (i?.type === 'list_reply') return `🛒 Selected: ${i.list_reply?.title || ''}`;
    if (i?.type === 'button_reply') return `👉 ${i.button_reply?.title || ''}`;
    return '[interactive message]';
  }
  return `[${message.type} message]`;
}

// ─────────────────────────────────────────────────────────────
// 1. ANTI-SLEEP / HEALTH
// ─────────────────────────────────────────────────────────────
app.get('/ping', (_req: Request, res: Response) => {
  res.status(200).send('Pong! Server is awake.');
});

// ─────────────────────────────────────────────────────────────
// 2. WHATSAPP WEBHOOK VERIFICATION (GET)
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
// 3. WHATSAPP LIVE MESSAGES (POST) — multi-tenant + bot
// ─────────────────────────────────────────────────────────────
app.post('/webhook', async (req: Request, res: Response) => {
  if (!verifyMetaSignature(req)) {
    console.warn('🚫 Webhook signature check failed — payload rejected');
    return res.sendStatus(401);
  }
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  try {
    if (body.object !== 'whatsapp_business_account') return;
    const changeValue = body.entry?.[0]?.changes?.[0]?.value;
    const message = changeValue?.messages?.[0];
    if (!message) return; // status callbacks — ignore

    // Route to the owning merchant
    const phoneNumberId = changeValue?.metadata?.phone_number_id;
    const channel = phoneNumberId ? await channelByPhoneNumberId(phoneNumberId) : null;
    if (!channel) {
      console.warn(`⚠️ Message for unknown phone_number_id ${phoneNumberId} — ignored`);
      return;
    }
    const merchantId = channel.merchant_id;

    // The bot understands text + interactive; other types are chat-only
    const customerPhone = message.from;
    const contact = changeValue.contacts?.[0];
    const customerName = contact?.profile?.name || 'Unknown Customer';
    const inboundText = displayText(message);
    const whatsappMsgId = message.id;

    console.log(`\n📥 [merchant ${merchantId}] ${customerName} (${customerPhone}): "${inboundText}"`);

    // Find or create the customer (per merchant), keep name fresh
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
      if (customerName !== 'Unknown Customer' && customerRows[0].name !== customerName) {
        await pool.query('UPDATE customers SET name = ? WHERE id = ?', [customerName, customerId]);
      }
    }

    // Save inbound (duplicates from Meta retries are dropped here)
    const isNew = await saveMessage(merchantId, customerId, 'inbound', inboundText, whatsappMsgId);
    if (!isNew) return;

    // ── THE BOT TAKES A LOOK ──
    const handled = await handleIncomingMessage({
      channel, merchantId, customerId, customerPhone, customerName, message,
      emit: (event, payload) => emitToMerchant(merchantId, event, payload),
      logOutbound: async (text, wamid) => { await saveMessage(merchantId, customerId, 'outbound', text, wamid); },
    });

    // Not an ordering interaction ➜ one neutral hint, then it's
    // the merchant's conversation on the dashboard.
    if (!handled && message.type === 'text') {
      try {
        const hint = 'Thanks for your message! 🙏 Reply *menu* anytime to browse products and place an order. Our team will get back to you shortly.';
        const wamid = await sendText(channel, customerPhone, hint);
        await saveMessage(merchantId, customerId, 'outbound', hint, wamid);
      } catch (ackError: any) {
        console.error('❌ Hint reply failed:', ackError.response?.data?.error?.message || ackError.message);
      }
    }
  } catch (error) {
    console.error('❌ Error processing webhook payload:', error);
  }
});

// ─────────────────────────────────────────────────────────────
// 4. RAZORPAY WEBHOOK — flips orders to PAID
// ─────────────────────────────────────────────────────────────
app.post('/webhook/razorpay', async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  if (!verifyRazorpaySignature((req as any).rawBody, signature)) {
    console.warn('🚫 Razorpay webhook signature failed — rejected');
    return res.sendStatus(400);
  }
  res.status(200).json({ ok: true });

  try {
    console.log(`🔔 Razorpay webhook received: ${req.body?.event || 'unknown-event'}`);
    if (req.body?.event !== 'payment_link.paid') return;
    const linkEntity = req.body?.payload?.payment_link?.entity;
    const paymentEntity = req.body?.payload?.payment?.entity;
    const orderNo = linkEntity?.reference_id || '';
    const orderIdFromNotes = Number(linkEntity?.notes?.order_id || 0);

    const [rows]: any = await pool.query(
      `SELECT o.id, o.order_no, o.merchant_id, o.customer_id, o.total_amount, o.payment_status,
              c.whatsapp_id
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = ? OR o.order_no = ? LIMIT 1`,
      [orderIdFromNotes, orderNo]
    );
    if (!rows.length) {
      console.warn(`⚠️ Razorpay paid event for unknown order ${orderNo}`);
      return;
    }
    const order = rows[0];
    if (order.payment_status === 'paid') return; // idempotent — Razorpay may retry

    await pool.query('UPDATE orders SET payment_status = ? WHERE id = ?', ['paid', order.id]);
    await pool.query(
      'INSERT INTO payments (order_id, gateway, gateway_payment_id, amount, status, raw_json) VALUES (?, ?, ?, ?, ?, ?)',
      [order.id, 'razorpay', paymentEntity?.id || null, Number(order.total_amount), 'paid', JSON.stringify(req.body)]
    );

    emitToMerchant(order.merchant_id, 'order:paid', {
      id: order.id, order_no: order.order_no, total_amount: order.total_amount,
    });

    const channel = await channelByMerchantId(order.merchant_id);
    if (channel) {
      const txt = `✅ Payment received for order *${order.order_no}*. Your order is confirmed — we will update you as it is processed. 🙏`;
      try {
        const wamid = await sendText(channel, order.whatsapp_id, txt);
        await saveMessage(order.merchant_id, order.customer_id, 'outbound', txt, wamid);
      } catch (e: any) {
        console.error('❌ Paid-notification failed:', e.message);
      }
    }
    console.log(`💰 [merchant ${order.merchant_id}] PAYMENT received for ${order.order_no}`);
  } catch (e) {
    console.error('❌ Razorpay webhook error:', e);
  }
});

// ─────────────────────────────────────────────────────────────
// AUTH (public) + PROTECTION for everything below
// ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);

// ─────────────────────────────────────────────────────────────
// FRONTEND API — merchant-scoped
// ─────────────────────────────────────────────────────────────
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

// Conversation board (customers + latest message)
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

// REAL orders (created by the bot) — with their items
app.get('/api/orders/real', async (req: AuthedRequest, res: Response) => {
  try {
    const [orders]: any = await pool.query(
      `SELECT o.id, o.order_no, o.total_amount, o.status, o.payment_status,
              o.created_at, c.name AS customer_name, c.whatsapp_id
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.merchant_id = ?
       ORDER BY o.created_at DESC LIMIT 100`,
      [req.merchantId]
    );
    const [items]: any = orders.length
      ? await pool.query(
          `SELECT order_id, name_snap, qty, unit_price, line_total
           FROM order_items WHERE order_id IN (?)`,
          [orders.map((o: any) => o.id)]
        )
      : [[]];
    const byOrder: Record<number, any[]> = {};
    for (const it of items) (byOrder[it.order_id] ||= []).push(it);
    res.json(orders.map((o: any) => ({ ...o, items: byOrder[o.id] || [] })));
  } catch (error) {
    console.error('Error fetching real orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// REAL order lifecycle: received ➜ processing ➜ fulfilled ➜ closed
// Marking 'fulfilled' also notifies the customer on WhatsApp.
app.patch('/api/orders/real/:id/status', async (req: AuthedRequest, res: Response) => {
  const { status } = req.body;
  const allowed = ['received', 'processing', 'fulfilled', 'closed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const [rows]: any = await pool.query(
      `SELECT o.id, o.order_no, o.customer_id, c.whatsapp_id
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = ? AND o.merchant_id = ?`,
      [req.params.id, req.merchantId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const order = rows[0];

    await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
    emitToMerchant(req.merchantId!, 'order:real_status', { id: order.id, status });

    if (status === 'fulfilled') {
      const channel = await channelByMerchantId(req.merchantId!);
      if (channel) {
        const txt = `📦 Update: your order *${order.order_no}* has been fulfilled. Thank you for shopping with us! 🙏`;
        try {
          const wamid = await sendText(channel, order.whatsapp_id, txt);
          await saveMessage(req.merchantId!, order.customer_id, 'outbound', txt, wamid);
        } catch (e: any) {
          console.error('❌ Fulfilled-notification failed:', e.message);
        }
      }
    }
    console.log(`🔄 [merchant ${req.merchantId}] order ${order.order_no} → ${status}`);
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Status on the conversation board (customers.status)
app.patch('/api/orders/:id/status', async (req: AuthedRequest, res: Response) => {
  const { status } = req.body;
  const allowed = ['pending', 'processing', 'fulfilled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const [result]: any = await pool.query(
      'UPDATE customers SET status = ? WHERE id = ? AND merchant_id = ?',
      [status, req.params.id, req.merchantId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    emitToMerchant(req.merchantId!, 'order:status', { id: Number(req.params.id), status });
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Manual send from the dashboard — Meta first, save on success
app.post('/api/chat/send', async (req: AuthedRequest, res: Response) => {
  const { customerId, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Empty message' });
  try {
    const [customerRows]: any = await pool.query(
      'SELECT whatsapp_id FROM customers WHERE id = ? AND merchant_id = ?',
      [customerId, req.merchantId]
    );
    if (customerRows.length === 0) return res.status(404).json({ error: 'Customer not found.' });

    const channel = await channelByMerchantId(req.merchantId!);
    if (!channel) return res.status(400).json({ error: 'No active WhatsApp channel for this merchant.' });

    const wamid = await sendText(channel as Channel, customerRows[0].whatsapp_id, text);
    await saveMessage(req.merchantId!, customerId, 'outbound', text, wamid);

    res.json({ success: true, message: 'Message sent.' });
  } catch (error: any) {
    const errorDetail = error.response?.data?.error?.message || error.message;
    console.error('❌ Send failed:', errorDetail);
    res.status(500).json({ error: 'Failed to send message', details: errorDetail });
  }
});

// ─────────────────────────────────────────────────────────────
server.listen(PORT, async () => {
  console.log(`🚀 Server + Socket.IO running on port ${PORT}`);
  if (!APP_SECRET) console.warn('⚠️  META_APP_SECRET not set — webhook signature checks are OFF (fine for local dev).');
  if (process.env.DISABLE_AUTH === 'true') console.warn('⚠️  DISABLE_AUTH=true — never use in production.');
  await testDbConnection();
});
