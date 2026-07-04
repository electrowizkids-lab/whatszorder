// src/wa.ts — WhatsApp Cloud API send helpers + channel lookups
// Used by both server.ts (manual sends) and bot.ts (ordering flow).
import axios from 'axios';
import pool from './db';

export type Channel = {
  id: number;
  merchant_id: number;
  phone_number_id: string;
  access_token: string | null;
  display_number: string | null;
};

// Which merchant owns this WhatsApp number? (multi-tenant routing)
export async function channelByPhoneNumberId(phoneNumberId: string): Promise<Channel | null> {
  const [rows]: any = await pool.query(
    'SELECT * FROM merchant_channels WHERE phone_number_id = ? AND status = ? LIMIT 1',
    [phoneNumberId, 'active']
  );
  return rows.length ? rows[0] : null;
}

export async function channelByMerchantId(merchantId: number): Promise<Channel | null> {
  const [rows]: any = await pool.query(
    'SELECT * FROM merchant_channels WHERE merchant_id = ? AND status = ? LIMIT 1',
    [merchantId, 'active']
  );
  return rows.length ? rows[0] : null;
}

// Phase 1: per-merchant token is NULL ➜ fall back to env token.
// Phase 3 (Embedded Signup) fills channel.access_token per merchant.
function tokenFor(channel: Channel): string {
  return channel.access_token || process.env.META_ACCESS_TOKEN || '';
}

async function post(channel: Channel, payload: any): Promise<string | null> {
  try {
    const resp = await axios.post(
      `https://graph.facebook.com/v21.0/${channel.phone_number_id}/messages`,
      { messaging_product: 'whatsapp', recipient_type: 'individual', ...payload },
      { headers: { Authorization: `Bearer ${tokenFor(channel)}`, 'Content-Type': 'application/json' } }
    );
    return resp.data?.messages?.[0]?.id || null; // wamid
  } catch (e: any) {
    // One readable, token-free line in the logs instead of a full
    // axios dump (which would leak the Bearer token into log files).
    const detail = e.response?.data?.error?.message || e.message;
    throw new Error(`WhatsApp send failed: ${detail}`);
  }
}

// ── Plain text ───────────────────────────────────────────────
export function sendText(channel: Channel, to: string, text: string) {
  return post(channel, { to, type: 'text', text: { preview_url: false, body: text } });
}

// ── Interactive LIST (the product catalog) ──────────────────
// WhatsApp limits: max 10 rows, title ≤ 24 chars, description ≤ 72.
export function sendList(
  channel: Channel, to: string,
  opts: { header: string; body: string; buttonLabel: string;
          rows: { id: string; title: string; description?: string }[] }
) {
  return post(channel, {
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: opts.header.slice(0, 60) },
      body: { text: opts.body.slice(0, 1024) },
      footer: { text: 'Whatszorder' },
      action: {
        button: opts.buttonLabel.slice(0, 20),
        sections: [{
          title: 'Catalog',
          rows: opts.rows.slice(0, 10).map(r => ({
            id: r.id,
            title: r.title.slice(0, 24),
            description: (r.description || '').slice(0, 72),
          })),
        }],
      },
    },
  });
}

// ── Interactive REPLY BUTTONS (max 3, title ≤ 20 chars) ─────
export function sendButtons(
  channel: Channel, to: string, body: string,
  buttons: { id: string; title: string }[]
) {
  return post(channel, {
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body.slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}