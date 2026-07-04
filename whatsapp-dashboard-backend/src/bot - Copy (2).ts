// src/bot.ts — the ordering bot (Phase 2 + Razorpay payment links)
// ─────────────────────────────────────────────────────────────
// Flow: IDLE ─"hi/menu"─▶ catalog ─tap item─▶ QTY_WAIT ─number─▶
// CART (buttons) ─Confirm─▶ order created ➜ payment link sent
// (when Razorpay keys are configured) ➜ webhook marks it PAID.
// Without Razorpay keys, orders confirm exactly as before.
// ─────────────────────────────────────────────────────────────
import pool from './db';
import { Channel, sendText, sendList, sendButtons } from './wa';
import { createPaymentLink } from './razorpay';

const GREETING = /^(hi|hii+|hello|hey|namaste|namaskar|menu|order|start|catalog|catalogue)\b/i;

type CartItem = { product_id: number; name: string; unit: string; price: number; qty: number };
type BotState = { cart: CartItem[]; pending: Omit<CartItem, 'qty'> | null };

export type BotContext = {
  channel: Channel;
  merchantId: number;
  customerId: number;
  customerPhone: string;
  customerName: string;
  message: any; // the raw webhook message object
  logOutbound: (text: string, wamid: string | null) => Promise<void>;
  emit: (event: string, payload: any) => void;
};

// ── state persistence ────────────────────────────────────────
async function getState(customerId: number): Promise<{ state: string; data: BotState }> {
  const [rows]: any = await pool.query(
    'SELECT state, cart_json FROM conversation_state WHERE customer_id = ?', [customerId]
  );
  if (rows.length === 0) return { state: 'IDLE', data: { cart: [], pending: null } };
  let data: BotState = { cart: [], pending: null };
  const raw = rows[0].cart_json;
  if (raw) {
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { /* keep default */ }
  }
  data.cart = data.cart || [];
  data.pending = data.pending || null;
  return { state: rows[0].state || 'IDLE', data };
}

async function setState(customerId: number, state: string, data: BotState) {
  await pool.query(
    `INSERT INTO conversation_state (customer_id, state, cart_json) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE state = VALUES(state), cart_json = VALUES(cart_json)`,
    [customerId, state, JSON.stringify(data)]
  );
}

// ── pieces of the flow ───────────────────────────────────────
async function sendCatalog(ctx: BotContext) {
  const [products]: any = await pool.query(
    'SELECT id, name, unit, price FROM products WHERE merchant_id = ? AND active = 1 ORDER BY sort_order, id LIMIT 10',
    [ctx.merchantId]
  );
  if (products.length === 0) {
    const msg = 'Our catalog is being set up. Please check back soon!';
    const wamid = await sendText(ctx.channel, ctx.customerPhone, msg);
    await ctx.logOutbound(msg, wamid);
    return;
  }
  const wamid = await sendList(ctx.channel, ctx.customerPhone, {
    header: 'Our Products 🛒',
    body: 'Tap the button below, pick an item, and we will ask the quantity.',
    buttonLabel: 'View products',
    rows: products.map((p: any) => ({
      id: `prod_${p.id}`,
      title: p.name,
      description: `₹${Number(p.price).toFixed(0)} per ${p.unit}`,
    })),
  });
  await ctx.logOutbound('[Sent product catalog]', wamid);
}

function cartLines(cart: CartItem[]) {
  return cart.map(c => `• ${c.name} — ${c.qty} × ₹${c.price.toFixed(0)} = ₹${(c.qty * c.price).toFixed(0)}`).join('\n');
}
function cartTotal(cart: CartItem[]) {
  return cart.reduce((s, c) => s + c.qty * c.price, 0);
}

async function sendCartReview(ctx: BotContext, data: BotState) {
  const body = `🧺 *Your cart*\n${cartLines(data.cart)}\n\n*Total: ₹${cartTotal(data.cart).toFixed(0)}*\n\nWhat would you like to do?`;
  const wamid = await sendButtons(ctx.channel, ctx.customerPhone, body, [
    { id: 'cart_add', title: 'Add more' },
    { id: 'cart_confirm', title: 'Confirm ✅' },
    { id: 'cart_cancel', title: 'Cancel ❌' },
  ]);
  await ctx.logOutbound(`[Cart review] Total ₹${cartTotal(data.cart).toFixed(0)}`, wamid);
}

async function createOrder(ctx: BotContext, data: BotState) {
  const total = cartTotal(data.cart);
  const orderNo = `WZ${ctx.merchantId}-${Date.now().toString(36).toUpperCase()}`;

  const [orderResult]: any = await pool.query(
    `INSERT INTO orders (merchant_id, customer_id, order_no, total_amount, status, payment_status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ctx.merchantId, ctx.customerId, orderNo, total, 'received', 'unpaid']
  );
  const orderId = orderResult.insertId;

  for (const item of data.cart) {
    await pool.query(
      `INSERT INTO order_items (order_id, product_id, name_snap, qty, unit_price, line_total)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orderId, item.product_id, item.name, item.qty, item.price, item.qty * item.price]
    );
  }

  // ── Payment link (Razorpay) — sent when keys are configured ──
  const link = await createPaymentLink({
    orderNo, orderId, amount: total,
    customerName: ctx.customerName,
    customerPhone: ctx.customerPhone,
    description: `Order ${orderNo}`,
  });

  let confirmText: string;
  if (link) {
    await pool.query('UPDATE orders SET rzp_link_id = ? WHERE id = ?', [link.id, orderId]);
    confirmText =
      `🧾 *Order created!*\n\nOrder no: *${orderNo}*\n${cartLines(data.cart)}\n\n*Total: ₹${total.toFixed(0)}*\n\n💳 *Pay securely here:*\n${link.short_url}\n\nYour order will be confirmed as soon as payment completes. 🙏`;
  } else {
    confirmText =
      `✅ *Order confirmed!*\n\nOrder no: *${orderNo}*\n${cartLines(data.cart)}\n\n*Total: ₹${total.toFixed(0)}*\n\nWe will update you as it is processed. Thank you! 🙏`;
  }

  const wamid = await sendText(ctx.channel, ctx.customerPhone, confirmText);
  await ctx.logOutbound(confirmText, wamid);

  // Tell the merchant's dashboard, instantly.
  ctx.emit('order:new', {
    id: orderId, order_no: orderNo, customer_id: ctx.customerId,
    total_amount: total, status: 'received', payment_status: 'unpaid',
    payment_link: link?.short_url || null,
    items: data.cart,
  });

  console.log(`🧾 [merchant ${ctx.merchantId}] ORDER ${orderNo} — ₹${total.toFixed(0)} (${data.cart.length} items)${link ? ' + payment link' : ''}`);
}

// ── entry point: true = bot handled it, false = ordinary chat ─
export async function handleIncomingMessage(ctx: BotContext): Promise<boolean> {
  const { message } = ctx;
  const { state, data } = await getState(ctx.customerId);

  // 1) Interactive replies (list picks and button taps)
  if (message.type === 'interactive') {
    const kind = message.interactive?.type;

    if (kind === 'list_reply') {
      const rowId: string = message.interactive.list_reply?.id || '';
      if (rowId.startsWith('prod_')) {
        const productId = Number(rowId.slice(5));
        const [rows]: any = await pool.query(
          'SELECT id, name, unit, price FROM products WHERE id = ? AND merchant_id = ? AND active = 1',
          [productId, ctx.merchantId]
        );
        if (rows.length === 0) {
          const msg = 'That item is no longer available. Reply *menu* to see the current catalog.';
          const wamid = await sendText(ctx.channel, ctx.customerPhone, msg);
          await ctx.logOutbound(msg, wamid);
          return true;
        }
        const p = rows[0];
        data.pending = { product_id: p.id, name: p.name, unit: p.unit, price: Number(p.price) };
        await setState(ctx.customerId, 'QTY_WAIT', data);
        const ask = `How many *${p.unit}* of *${p.name}* would you like? Reply with a number (e.g. 2).`;
        const wamid = await sendText(ctx.channel, ctx.customerPhone, ask);
        await ctx.logOutbound(ask, wamid);
        return true;
      }
      return true;
    }

    if (kind === 'button_reply') {
      const btnId: string = message.interactive.button_reply?.id || '';

      if (btnId === 'cart_add') {
        await sendCatalog(ctx);
        await setState(ctx.customerId, 'CART', data);
        return true;
      }
      if (btnId === 'cart_confirm') {
        if (data.cart.length === 0) {
          await sendCatalog(ctx);
          return true;
        }
        await createOrder(ctx, data);
        await setState(ctx.customerId, 'IDLE', { cart: [], pending: null });
        return true;
      }
      if (btnId === 'cart_cancel') {
        await setState(ctx.customerId, 'IDLE', { cart: [], pending: null });
        const bye = 'Cart cleared. Reply *menu* anytime to start a new order. 👍';
        const wamid = await sendText(ctx.channel, ctx.customerPhone, bye);
        await ctx.logOutbound(bye, wamid);
        return true;
      }
      return true;
    }
    return true;
  }

  // 2) Text messages
  if (message.type === 'text') {
    const text: string = (message.text?.body || '').trim();

    if (state === 'QTY_WAIT' && data.pending) {
      const qty = parseInt(text.replace(/\D/g, ''), 10);
      if (!qty || qty < 1 || qty > 9999) {
        const ask = `Please reply with just a number for *${data.pending.name}* (e.g. 2).`;
        const wamid = await sendText(ctx.channel, ctx.customerPhone, ask);
        await ctx.logOutbound(ask, wamid);
        return true;
      }
      data.cart.push({ ...data.pending, qty });
      data.pending = null;
      await setState(ctx.customerId, 'CART', data);
      await sendCartReview(ctx, data);
      return true;
    }

    if (GREETING.test(text)) {
      await sendCatalog(ctx);
      await setState(ctx.customerId, data.cart.length > 0 ? 'CART' : 'IDLE', data);
      return true;
    }

    if (state === 'CART' && data.cart.length > 0) {
      const nudge = `You have ${data.cart.length} item(s) in your cart (₹${cartTotal(data.cart).toFixed(0)}). Tap a button above, or reply *menu* to add more.`;
      const wamid = await sendText(ctx.channel, ctx.customerPhone, nudge);
      await ctx.logOutbound(nudge, wamid);
      return true;
    }

    return false; // ordinary chat — merchant handles it
  }

  return false;
}
