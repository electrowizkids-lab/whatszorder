// src/razorpay.ts — Razorpay Payment Links + webhook verification
// ─────────────────────────────────────────────────────────────
// Needs three .env values (Razorpay Dashboard ➜ Settings):
//   RAZORPAY_KEY_ID=rzp_test_xxxxx        (API Keys)
//   RAZORPAY_KEY_SECRET=xxxxx             (API Keys)
//   RAZORPAY_WEBHOOK_SECRET=xxxxx         (Webhooks ➜ your chosen secret)
//
// If the keys are absent, the bot simply skips payment links and
// confirms orders as before — nothing breaks.
// ─────────────────────────────────────────────────────────────
import axios from 'axios';
import crypto from 'crypto';

export const razorpayEnabled = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

export async function createPaymentLink(opts: {
  orderNo: string;
  orderId: number;
  amount: number;          // rupees
  customerName: string;
  customerPhone: string;   // digits, e.g. 918882614689
  description: string;
}): Promise<{ id: string; short_url: string } | null> {
  if (!razorpayEnabled()) return null;
  try {
    const resp = await axios.post(
      'https://api.razorpay.com/v1/payment_links',
      {
        amount: Math.round(opts.amount * 100), // Razorpay wants paise
        currency: 'INR',
        reference_id: opts.orderNo,
        description: opts.description,
        customer: { name: opts.customerName, contact: `+${opts.customerPhone}` },
        notify: { sms: false, email: false }, // WE deliver the link on WhatsApp
        reminder_enable: false,
        notes: { order_id: String(opts.orderId) },
      },
      {
        auth: {
          username: process.env.RAZORPAY_KEY_ID!,
          password: process.env.RAZORPAY_KEY_SECRET!,
        },
      }
    );
    return { id: resp.data.id, short_url: resp.data.short_url };
  } catch (e: any) {
    const detail = e.response?.data?.error?.description || e.message;
    console.error('❌ Razorpay link creation failed:', detail);
    return null; // order still goes through, just without a link
  }
}

// Razorpay signs webhooks: X-Razorpay-Signature = HMAC-SHA256(rawBody, webhook secret)
export function verifyRazorpaySignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
