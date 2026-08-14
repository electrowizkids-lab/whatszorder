// src/App.jsx — Yanvio · "The Pass"
// ─────────────────────────────────────────────────────────────
// Light-first editorial design (deliberate counter-programming to
// the dark + electric-accent default). 248px sidebar on desktop,
// native-feeling bottom tabs on mobile, ⌘K command palette,
// light/dark themes shipped together.
//
// Signature element: the DOCKET — spike hole, perforated tear,
// mono serial, status spine. Grounded in the merchant's counter.
//
// All API calls, socket handling and business logic are IDENTICAL
// to the previous version. This is a presentation rebuild.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search, Send, Clock, Loader, CheckCircle2, X, Phone, LogOut,
  Plus, Trash2, ArrowUp, ArrowDown, CreditCard, Store, Receipt,
  MessagesSquare, Tags, SlidersHorizontal, Sun, Moon, Command,
  TrendingUp, Inbox, ChevronRight, Circle, ImagePlus,
} from 'lucide-react';
import { io } from 'socket.io-client';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/* ═══════════════════════════════════════════════════════════
   DESIGN TOKENS + GLOBAL STYLE
   ═══════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

:root{
  --ink:#17191F; --paper:#F5F6F8; --card:#FFFFFF;
  --line:#E4E6EB; --line-soft:#EFF1F4;
  --muted:#5A6070; --faint:#8A90A0;
  --indigo:#4636E8; --indigo-soft:#EEEBFE;
  --ember:#E8552F; --ember-soft:#FDEEE9;
  --moss:#12855F; --moss-soft:#E4F4EE;
  --amber:#B26A00; --amber-soft:#FDF1DC;
  --sky:#1B5FD9; --sky-soft:#E7EFFC;
  --shadow:0 1px 2px rgba(23,25,31,.05), 0 4px 14px rgba(23,25,31,.05);
  --shadow-lg:0 12px 40px rgba(23,25,31,.16);
  --radius:14px;
}
.theme-dark{
  --ink:#ECEEF3; --paper:#0F1116; --card:#171A21;
  --line:#262A34; --line-soft:#1E222B;
  --muted:#9AA1B2; --faint:#6E7688;
  --indigo:#8A7BFF; --indigo-soft:#231F45;
  --ember:#FF7C57; --ember-soft:#38201A;
  --moss:#3CC08D; --moss-soft:#143026;
  --amber:#E0A44A; --amber-soft:#332616;
  --sky:#6BA5FF; --sky-soft:#17253D;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 4px 14px rgba(0,0,0,.3);
  --shadow-lg:0 12px 44px rgba(0,0,0,.55);
}

*{box-sizing:border-box;margin:0}
html,body{overflow-x:hidden;max-width:100%}
body{background:var(--paper)}
.yv{font-family:'Inter Tight',system-ui,sans-serif;color:var(--ink);background:var(--paper);
  -webkit-font-smoothing:antialiased}
.dsp{font-family:'Bricolage Grotesque','Inter Tight',sans-serif;letter-spacing:-.02em;font-weight:700}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.yv button{font-family:inherit}
.yv a{color:inherit}
:focus-visible{outline:2px solid var(--indigo);outline-offset:2px;border-radius:8px}

@keyframes lift{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes slideL{from{transform:translateX(100%)}to{transform:none}}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes shim{0%{background-position:-380px 0}100%{background-position:380px 0}}
.lift{animation:lift .34s cubic-bezier(.22,1,.36,1) both}
.pop{animation:pop .2s cubic-bezier(.22,1,.36,1) both}
.spin{animation:spin 1.1s linear infinite}
.skel{background:linear-gradient(90deg,var(--line-soft) 25%,var(--line) 37%,var(--line-soft) 63%);
  background-size:760px 100%;animation:shim 1.3s infinite linear;border-radius:8px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

.shell{display:flex;min-height:100vh}
.rail{width:248px;flex-shrink:0;background:var(--card);border-right:1px solid var(--line);
  display:flex;flex-direction:column;padding:18px 12px;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:9px;padding:4px 8px 18px}
.mark{width:30px;height:30px;border-radius:9px;background:var(--ink);color:var(--card);
  display:grid;place-items:center;font-size:15px;flex-shrink:0}
.navbtn{width:100%;display:flex;align-items:center;gap:11px;padding:9px 11px;border:none;
  background:none;color:var(--muted);border-radius:10px;font-size:14px;font-weight:500;
  cursor:pointer;text-align:left;transition:background .12s,color .12s}
.navbtn:hover{background:var(--line-soft);color:var(--ink)}
.navbtn.on{background:var(--indigo-soft);color:var(--indigo);font-weight:600}
.navcount{margin-left:auto;font-size:11px;font-weight:700;padding:1px 7px;border-radius:9px;
  background:var(--ember);color:#fff}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.topbar{display:flex;align-items:center;gap:10px;padding:14px 26px;border-bottom:1px solid var(--line);
  background:var(--card);position:sticky;top:0;z-index:20}
.page{flex:1;padding:24px 26px 90px;max-width:1180px;width:100%;margin:0 auto}

.iconbtn{width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:var(--card);
  color:var(--muted);display:grid;place-items:center;cursor:pointer;transition:.12s}
.iconbtn:hover{color:var(--ink);border-color:var(--faint)}
.iconbtn:disabled{opacity:.35;cursor:default}
.kbd{display:flex;align-items:center;gap:6px;padding:6px 11px;border:1px solid var(--line);
  border-radius:9px;background:var(--card);color:var(--faint);font-size:12.5px;cursor:pointer}
.kbd:hover{border-color:var(--faint);color:var(--muted)}

.kpis{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:12px;margin-bottom:22px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px}
.kpi .lab{font-size:11.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.kpi .val{font-size:26px;line-height:1.1;margin-top:7px}
.kpi.hero .val{font-size:40px}
.kpi .sub{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);margin-top:6px}

.dockets{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.docket{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
  position:relative;overflow:hidden;transition:box-shadow .16s,transform .16s}
.docket:hover{box-shadow:var(--shadow);transform:translateY(-1px)}
.spine{position:absolute;left:0;top:0;bottom:0;width:3px}
.spike{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:34px;height:5px;
  border-radius:3px;background:var(--line-soft);border:1px solid var(--line)}
.dhead{padding:24px 18px 11px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.serial{font-size:13.5px;font-weight:700;letter-spacing:.02em;overflow-wrap:anywhere}
.tag{font-size:10px;font-weight:700;letter-spacing:.07em;padding:3px 8px;border-radius:20px}
.tear{position:relative;border-top:1.5px dashed var(--line);margin:0 12px}
.tear::before,.tear::after{content:'';position:absolute;top:-9px;width:16px;height:16px;
  border-radius:50%;background:var(--paper)}
.tear::before{left:-20px}.tear::after{right:-20px}
.lines{padding:11px 18px 0;font-size:13.5px}
.lines .row{display:flex;justify-content:space-between;gap:12px;padding:3px 0;color:var(--muted);overflow-wrap:anywhere}
.total{display:flex;justify-content:space-between;padding:10px 18px 0;margin-top:8px;
  border-top:1px solid var(--line-soft);font-weight:700;font-size:15px}
.dfoot{padding:13px 18px 15px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.act{border:1px solid var(--ink);background:var(--ink);color:var(--card);border-radius:9px;
  padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;transition:.12s}
.act:hover{opacity:.86}

.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;
  font-size:12.5px;font-weight:600;border:1px solid var(--line);background:var(--card);
  color:var(--muted);cursor:pointer;white-space:nowrap;transition:.12s}
.chip:hover{border-color:var(--faint)}
.chip.on{background:var(--ink);color:var(--card);border-color:var(--ink)}
.inp{width:100%;padding:11px 13px;font-size:14.5px;font-family:inherit;border:1px solid var(--line);
  border-radius:10px;background:var(--card);color:var(--ink);outline:none;transition:border-color .12s}
.inp:focus{border-color:var(--indigo)}
.inp::placeholder{color:var(--faint)}
.btn{border:none;border-radius:10px;padding:11px 18px;font-size:14.5px;font-weight:600;
  background:var(--indigo);color:#fff;cursor:pointer;transition:.12s}
.btn:hover{filter:brightness(1.08)}
.btn:disabled{opacity:.55;cursor:default}
.empty{text-align:center;padding:56px 22px;color:var(--muted);font-size:14.5px;line-height:1.65}

.scrim{position:fixed;inset:0;background:rgba(15,17,22,.5);backdrop-filter:blur(3px);z-index:90}
.palette{position:fixed;top:14vh;left:50%;transform:translateX(-50%);width:560px;max-width:calc(100vw - 28px);
  background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-lg);
  z-index:91;overflow:hidden}
.pitem{display:flex;align-items:center;gap:11px;padding:11px 16px;cursor:pointer;font-size:14px;
  color:var(--muted);border-radius:9px}
.pitem.sel{background:var(--indigo-soft);color:var(--indigo)}

.drawer{position:fixed;inset:0;display:flex;justify-content:flex-end;z-index:80}
.drawer .scrim{z-index:1}
.drawer .pane{z-index:2}
.pane{width:440px;max-width:100%;background:var(--paper);display:flex;flex-direction:column;
  box-shadow:var(--shadow-lg);animation:slideL .24s cubic-bezier(.22,1,.36,1) both;position:relative;z-index:2}
.drawer .scrim{z-index:1}
.bub{max-width:78%;padding:9px 12px;border-radius:13px;font-size:14px;line-height:1.45;
  white-space:pre-wrap;overflow-wrap:anywhere}
.bub.in{background:var(--card);border:1px solid var(--line);border-bottom-left-radius:4px;align-self:flex-start}
.bub.out{background:var(--indigo);color:#fff;border-bottom-right-radius:4px;align-self:flex-end}
.bub.sys{align-self:center;background:var(--amber-soft);color:var(--amber);font-size:12.5px;
  border-radius:9px;text-align:center;max-width:88%}

/* ── products studio ── */
.studio{display:grid;grid-template-columns:1fr 340px;gap:22px;align-items:start}
.pcard{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;
  transition:box-shadow .16s,border-color .16s}
.pcard:hover{box-shadow:var(--shadow)}
.prow{display:flex;align-items:center;gap:14px;padding:14px 16px}
.pthumb{width:64px;height:64px;border-radius:12px;object-fit:cover;flex-shrink:0;background:var(--line-soft)}
.pthumb.ph{display:grid;place-items:center;color:var(--faint);border:1px dashed var(--line)}
.pname{font-size:16px;font-weight:700;letter-spacing:-.01em;line-height:1.25}
.pprice{font-size:15px;font-weight:700;margin-top:3px}
.pmeta{font-size:12.5px;color:var(--faint)}
.pacts{display:flex;align-items:center;gap:7px;margin-left:auto;flex-shrink:0}
.vrow{display:flex;align-items:center;gap:12px;padding:10px 16px 10px 34px;border-top:1px solid var(--line-soft);
  position:relative}
.vrow::before{content:'';position:absolute;left:20px;top:0;bottom:0;width:2px;background:var(--line)}
.badge-grp{font-size:10px;font-weight:800;letter-spacing:.07em;padding:3px 8px;border-radius:20px;
  background:var(--indigo-soft);color:var(--indigo)}
.pfoot{padding:10px 16px 13px 34px;border-top:1px solid var(--line-soft)}

/* live whatsapp preview */
.wapv{position:sticky;top:88px;background:var(--card);border:1px solid var(--line);border-radius:18px;
  overflow:hidden;box-shadow:var(--shadow)}
.wapv .bar{background:#075E54;color:#fff;padding:11px 14px;display:flex;align-items:center;gap:9px;font-size:13.5px}
.wapv .body{background:#ECE5DD;padding:14px 12px;min-height:260px;max-height:min(560px,60vh);overflow-y:auto}
.theme-dark .wapv .body{background:#0C1317}
.wamsg{background:#fff;border-radius:9px;padding:11px 12px;box-shadow:0 1px 1px rgba(11,20,26,.14);
  font-size:13px;color:#111B21;max-width:96%}
.theme-dark .wamsg{background:#1F2C34;color:#E9EDEF}
.wahdr{font-weight:700;font-size:13.5px;margin-bottom:4px}
.wabody{font-size:12.5px;line-height:1.5;opacity:.86}
.wabtn{margin-top:10px;border-top:1px solid rgba(0,0,0,.09);padding-top:8px;text-align:center;
  color:#00A5F4;font-weight:600;font-size:13px}
.theme-dark .wabtn{border-color:rgba(255,255,255,.12)}
.wasec{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8696A0;
  padding:11px 2px 5px}
.warow{display:flex;justify-content:space-between;gap:10px;padding:7px 2px;border-bottom:1px solid rgba(0,0,0,.06);
  font-size:12.5px;color:#111B21}
.theme-dark .warow{color:#E9EDEF;border-color:rgba(255,255,255,.08)}
.warow small{display:block;color:#667781;font-size:11.5px;margin-top:2px}
.theme-dark .warow small{color:#8696A0}
.pvnote{font-size:11.5px;color:var(--faint);padding:11px 14px;border-top:1px solid var(--line);line-height:1.5}

@media (max-width:1080px){ .studio{grid-template-columns:1fr} .wapv{position:static;max-width:400px} }

.tabbar{display:none}
@media (max-width:980px){ .kpis{grid-template-columns:1fr 1fr} .dockets{grid-template-columns:1fr} }
@media (max-width:760px){
  .rail{display:none}
  .page{padding:16px 14px 96px}
  .topbar{padding:12px 14px}
  .kpi.hero .val{font-size:32px}
  .kpi .val{font-size:21px}
  .tabbar{display:flex;position:fixed;left:0;right:0;bottom:0;background:var(--card);
    border-top:1px solid var(--line);padding:7px 6px calc(7px + env(safe-area-inset-bottom));z-index:40}
  .tabbtn{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;
    border:none;background:none;color:var(--faint);font-size:10.5px;font-weight:600;
    cursor:pointer;position:relative}
  .tabbtn.on{color:var(--indigo)}
  .pane{width:100%}
  .inp{font-size:16px}
  .palette{top:8vh}
}
@media (max-width:420px){ .kpis{grid-template-columns:1fr} }
@media (max-width:360px){
  .page{padding:12px 9px 96px}
  .topbar{padding:10px 10px}
  .kpi{padding:13px 14px}
  .kpi.hero .val{font-size:28px}
  .dhead,.lines,.total,.dfoot{padding-left:13px;padding-right:13px}
  .tabbtn{font-size:9.5px}
  .chip{padding:5px 10px;font-size:12px}
}
`;

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */
const gbp = (n) => '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gbp0 = (n) => '£' + Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 });

function ago(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
const clock = (ts) => ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
const today = (ts) => ts && new Date(ts).toDateString() === new Date().toDateString();

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// Conversation triage (customers.status)
const TRIAGE = {
  pending:    { label: 'New',     c: 'var(--amber)', bg: 'var(--amber-soft)' },
  processing: { label: 'In hand', c: 'var(--sky)',   bg: 'var(--sky-soft)' },
  fulfilled:  { label: 'Done',    c: 'var(--moss)',  bg: 'var(--moss-soft)' },
};
const NEXT_TRIAGE = { pending: 'processing', processing: 'fulfilled', fulfilled: 'pending' };

// Real order lifecycle (orders.status)
const LIFE = {
  received:   { label: 'Received',  c: 'var(--amber)', bg: 'var(--amber-soft)' },
  processing: { label: 'Preparing', c: 'var(--sky)',   bg: 'var(--sky-soft)' },
  fulfilled:  { label: 'Fulfilled', c: 'var(--moss)',  bg: 'var(--moss-soft)' },
  closed:     { label: 'Closed',    c: 'var(--faint)', bg: 'var(--line-soft)' },
  cancelled:  { label: 'Cancelled', c: 'var(--ember)', bg: 'var(--ember-soft)' },
};
const NEXT_LIFE = { received: 'processing', processing: 'fulfilled', fulfilled: 'closed' };
const ACTION = {
  received:   { label: 'Start preparing' },
  processing: { label: 'Mark fulfilled', note: 'Customer is texted automatically' },
  fulfilled:  { label: 'Close order' },
};

const NAV = [
  { id: 'orders',   label: 'Orders',   icon: Receipt },
  { id: 'chats',    label: 'Messages', icon: MessagesSquare },
  { id: 'products', label: 'Products', icon: Tags },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
];

function useTheme() {
  const [dark, setDark] = useState(() => store.get('yv_theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', dark);
    store.set('yv_theme', dark ? 'dark' : 'light');
  }, [dark]);
  return [dark, setDark];
}

function useCountUp(target, ms = 700) {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current, to = target, t0 = performance.now();
    if (from === to) return;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick); else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const Err = ({ text }) => (
  <div style={{ marginTop: 12, background: 'var(--ember-soft)', color: 'var(--ember)', fontSize: 13, padding: '9px 12px', borderRadius: 9, lineHeight: 1.45 }}>
    {text}
  </div>
);

/* ═══════════════════════════════════════════════════════════
   ROOT
   ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [token, setToken] = useState(() => store.get('wz_token'));
  const [merchant, setMerchant] = useState(() => {
    try { return JSON.parse(store.get('wz_merchant') || 'null'); } catch { return null; }
  });

  const onLogin = (tok, m) => {
    store.set('wz_token', tok); store.set('wz_merchant', JSON.stringify(m));
    setToken(tok); setMerchant(m);
  };
  const onLogout = useCallback(() => {
    store.del('wz_token'); store.del('wz_merchant');
    setToken(null); setMerchant(null);
  }, []);

  return (
    <div className="yv">
      <style>{CSS}</style>
      {token
        ? <Dashboard token={token} merchant={merchant} onLogout={onLogout} />
        : <Landing onLogin={onLogin} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DOCKET — the signature element
   ═══════════════════════════════════════════════════════════ */
function Docket({ o, onAdvance, demo }) {
  const s = LIFE[o.status] || LIFE.received;
  const a = ACTION[o.status];
  const paid = o.payment_status === 'paid';
  return (
    <div className="docket">
      <div className="spine" style={{ background: s.c }} />
      <div className="spike" />
      <div className="dhead">
        <span className="serial mono">{o.order_no}</span>
        <span className="tag mono" style={{ background: paid ? 'var(--moss-soft)' : 'var(--amber-soft)', color: paid ? 'var(--moss)' : 'var(--amber)' }}>
          {paid ? 'PAID' : 'UNPAID'}
        </span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--faint)' }}>
          {ago(o.created_at)} · {clock(o.created_at)}
        </span>
      </div>
      <div style={{ padding: '0 18px 10px', fontSize: 13, color: 'var(--muted)' }}>
        {o.customer_name} · <span className="mono">+{o.whatsapp_id}</span>
      </div>
      <div className="tear" />
      <div className="lines">
        {(o.items || []).map((it, i) => (
          <div className="row" key={i}>
            <span><b className="mono" style={{ color: 'var(--ink)' }}>{it.qty}</b> × {it.name_snap}</span>
            <span className="mono">{gbp(it.line_total)}</span>
          </div>
        ))}
      </div>
      <div className="total"><span>Total</span><span className="mono">{gbp(o.total_amount)}</span></div>
      <div className="dfoot">
        <span className="tag" style={{ background: s.bg, color: s.c, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Circle size={7} fill="currentColor" strokeWidth={0} />{s.label}
        </span>
        {!demo && a && <button className="act" onClick={() => onAdvance(o.id, o.status)}>{a.label}</button>}
        {!demo && a?.note && <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>{a.note}</span>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC SITE — Home · About · Services · Clients · Contact
   Content sourced from yanvio.com (genuine Yanvio copy).
   Identity details use YANVIO LTD's real UK registration.
   ═══════════════════════════════════════════════════════════ */
const SITE_NAV = [
  ['home', 'Home'], ['about', 'About'], ['services', 'Services'],
  ['clients', 'Clients'], ['contact', 'Contact'],
];

function Landing({ onLogin }) {
  const [page, setPage] = useState('home');
  const [menu, setMenu] = useState(false);
  const go = (p) => { setPage(p); setMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="sf">
      <style>{`
        .sf{
          --green:#14483A; --green-2:#1B5E4A; --green-ink:#0E3529;
          --cream:#FCFCFA; --amber:#F0A830; --amber-soft:#FDF3E1;
          --ink:#1A1D1B; --ink-2:#565C58; --ink-faint:#8E948F; --line:#E6E9E6;
          background:var(--cream); color:var(--ink); min-height:100vh; overflow-x:hidden;
        }
        .sf *{box-sizing:border-box}
        .sf .w{max-width:1080px;margin:0 auto;padding:0 24px}

        .awning{background:var(--green);color:#fff;position:relative}
        .awning.tall{padding-bottom:56px}
        .awning.short{padding-bottom:44px}
        .awning::after{content:'';position:absolute;left:0;right:0;bottom:-21px;height:22px;
          background:var(--green);z-index:1;
          -webkit-mask:radial-gradient(circle 21px at 50% 0,#0000 99%,#000) 50% 0/44px 100% repeat-x;
          mask:radial-gradient(circle 21px at 50% 0,#0000 99%,#000) 50% 0/44px 100% repeat-x;
          transform:scaleY(-1)}
        .sfnav{display:flex;align-items:center;gap:12px;padding:20px 0}
        .sflogo{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:800;
          letter-spacing:-.02em;color:#fff;cursor:pointer;background:none;border:none}
        .sflogo i{width:32px;height:32px;border-radius:9px;background:var(--amber);color:var(--green-ink);
          display:grid;place-items:center;font-style:normal;font-weight:800;font-size:16px}
        .menu{display:flex;gap:4px;margin-left:auto;align-items:center}
        .mlink{background:none;border:none;color:rgba(255,255,255,.78);font-size:14.5px;font-weight:600;
          padding:8px 13px;border-radius:8px;cursor:pointer;transition:.14s}
        .mlink:hover{color:#fff;background:rgba(255,255,255,.1)}
        .mlink.on{color:#fff;background:rgba(255,255,255,.16)}
        .navlink{padding:9px 18px;border-radius:9px;text-decoration:none;font-weight:700;font-size:14px;
          background:var(--amber);color:var(--green-ink);margin-left:8px;transition:.16s}
        .navlink:hover{filter:brightness(1.06)}
        .burger{display:none;margin-left:auto;background:rgba(255,255,255,.14);border:none;color:#fff;
          width:38px;height:38px;border-radius:9px;cursor:pointer;font-size:17px}

        .phead{padding:30px 0 6px}
        .phead h1{font-size:clamp(34px,5vw,52px);line-height:1.06;letter-spacing:-.03em;font-weight:800}
        .phead .kk{font-size:16.5px;color:rgba(255,255,255,.8);margin-top:14px;max-width:52ch;line-height:1.6}

        .hero{display:grid;grid-template-columns:1.1fr .9fr;gap:50px;align-items:center;padding:26px 0 10px}
        .hero h1{font-size:clamp(34px,5.2vw,55px);line-height:1.05;letter-spacing:-.032em;font-weight:800}
        .hero h1 u{text-decoration:none;color:var(--amber)}
        .hero p{font-size:17.5px;line-height:1.6;color:rgba(255,255,255,.82);margin-top:19px;max-width:44ch}
        .ticks{display:grid;gap:10px;margin-top:24px}
        .ticks div{display:flex;align-items:center;gap:11px;font-size:15px;color:rgba(255,255,255,.9)}
        .ticks i{width:21px;height:21px;border-radius:50%;background:rgba(255,255,255,.16);
          display:grid;place-items:center;font-style:normal;font-size:11px;color:var(--amber);flex-shrink:0}
        .logincard{background:#fff;border-radius:18px;padding:26px;box-shadow:0 22px 60px rgba(10,40,30,.32)}

        .sf .card{background:transparent;border:none;padding:0!important}
        .sf .inp{background:#fff;border:1.5px solid var(--line);color:var(--ink);border-radius:10px}
        .sf .inp:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(27,94,74,.12)}
        .sf .btn{background:var(--green);border-radius:10px}
        .sf .btn:hover{background:var(--green-2);filter:none}
        .sf .dsp{color:var(--ink)}

        .sec{padding:70px 0}
        .kick{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--green-2)}
        .sec h2{font-size:clamp(26px,3.5vw,37px);letter-spacing:-.028em;font-weight:800;margin:12px 0 12px;line-height:1.12}
        .sec .lead{font-size:16.5px;color:var(--ink-2);max-width:56ch;line-height:1.65}

        /* automation demo */
        .demo{display:grid;grid-template-columns:1fr 62px 1fr;align-items:center;margin-top:38px}
        .chatbox{background:#fff;border:1px solid var(--line);border-radius:16px;padding:17px;
          box-shadow:0 4px 18px rgba(20,72,58,.06);min-height:196px;display:flex;flex-direction:column}
        .chatbox .who{font-size:11.5px;color:var(--ink-faint);font-weight:700;letter-spacing:.06em;
          text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:8px}
        .lamp{width:7px;height:7px;border-radius:50%;background:#22C55E;animation:lamp 1.5s infinite}
        @keyframes lamp{50%{opacity:.3}}
        .m{max-width:92%;padding:11px 14px;border-radius:14px;font-size:14px;line-height:1.5;overflow-wrap:anywhere}
        .m.them{background:#F1F3F1;border-bottom-left-radius:4px}
        .m.us{background:var(--green);color:#fff;border-bottom-right-radius:4px;margin:9px 0 0 auto;max-width:88%;
          animation:popin .4s cubic-bezier(.22,1,.36,1) both}
        @keyframes popin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .cur{display:inline-block;width:2px;height:14px;background:var(--ink-2);vertical-align:-2px;
          animation:bl .85s step-end infinite}
        @keyframes bl{50%{opacity:0}}
        .arrow{display:grid;place-items:center;gap:6px;color:var(--ink-faint);font-size:10.5px;
          font-weight:800;letter-spacing:.1em;text-transform:uppercase}
        .arrow b{width:34px;height:34px;border-radius:50%;background:var(--amber-soft);color:var(--green);
          display:grid;place-items:center;font-size:16px;flex-shrink:0}
        .dk{background:#fff;border:1px solid var(--line);border-radius:16px;position:relative;overflow:hidden;
          box-shadow:0 10px 34px rgba(20,72,58,.1);min-height:196px}
        .dk.in{animation:slam .5s cubic-bezier(.34,1.3,.5,1) both}
        @keyframes slam{from{opacity:0;transform:translateY(18px) scale(.95)}to{opacity:1;transform:none}}
        .dk .sp{position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--amber)}
        .dk .hd{padding:16px 18px 8px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
        .dk .no{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:13px}
        .dk .pd{font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:800;letter-spacing:.08em;
          padding:3px 8px;border-radius:20px;background:#E4F4EE;color:#12855F}
        .dk .cu{padding:0 18px 10px;font-size:12.5px;color:var(--ink-2)}
        .dk .dash{border-top:1.5px dashed var(--line);margin:0 12px}
        .dk .li{display:flex;justify-content:space-between;padding:4px 18px;font-size:13.5px;color:var(--ink-2)}
        .dk .li:first-of-type{padding-top:11px}
        .dk .to{display:flex;justify-content:space-between;padding:10px 18px 15px;margin-top:6px;
          border-top:1px solid var(--line);font-weight:700;font-size:15px}
        .waiting{min-height:196px;display:grid;place-items:center;border:1.5px dashed var(--line);
          border-radius:16px;color:var(--ink-faint);font-size:13.5px}

        .three{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:40px}
        .three .c{padding:26px 22px;background:#fff;border:1px solid var(--line);border-radius:16px;transition:.2s}
        .three .c:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(20,72,58,.1)}
        .three .n{width:34px;height:34px;border-radius:10px;background:var(--green);color:#fff;
          display:grid;place-items:center;font-weight:800;font-size:15px;margin-bottom:15px}
        .three h3{font-size:17.5px;font-weight:700;margin-bottom:8px;letter-spacing:-.015em}
        .three p{font-size:14.5px;color:var(--ink-2);line-height:1.6}

        .inc{display:grid;grid-template-columns:1fr 1fr;gap:24px 42px;margin-top:36px}
        .inc .r h3{font-size:17px;font-weight:700;margin-bottom:7px;display:flex;gap:10px;align-items:baseline}
        .inc .r h3 span{color:var(--green-2)}
        .inc .r p{font-size:14.5px;color:var(--ink-2);line-height:1.6;padding-left:25px}

        .band{background:var(--green);color:#fff;padding:52px 0}
        .band h2{font-size:clamp(23px,3.1vw,32px);font-weight:800;letter-spacing:-.025em}
        .band p{color:rgba(255,255,255,.82);font-size:16px;margin-top:12px;max-width:56ch;line-height:1.6}
        .tags{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
        .tags span{padding:9px 17px;border-radius:24px;background:rgba(255,255,255,.13);font-size:14.5px}

        .soon{background:var(--amber-soft);border:1px solid #F3E2C0;border-radius:16px;padding:26px 24px;
          margin-top:36px;text-align:center}
        .soon h3{font-size:21px;font-weight:800;letter-spacing:-.02em}
        .soon p{font-size:15.5px;color:var(--ink-2);margin-top:9px;line-height:1.6}
        .soon a{color:var(--green-2);font-weight:700}

        .vals{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:36px}
        .val{padding:22px;background:#fff;border:1px solid var(--line);border-radius:14px}
        .val h4{font-size:16.5px;font-weight:700;margin-bottom:7px}
        .val p{font-size:14.5px;color:var(--ink-2);line-height:1.6}

        .split{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:start;margin-top:36px}
        .split p{font-size:15.5px;color:var(--ink-2);line-height:1.7;margin-bottom:14px}

        .cform{background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px;
          box-shadow:0 10px 34px rgba(20,72,58,.07)}
        .cform label{display:block;font-size:12px;font-weight:700;letter-spacing:.07em;
          text-transform:uppercase;color:var(--ink-faint);margin:14px 0 6px}
        .cform label:first-of-type{margin-top:0}
        .cform textarea{width:100%;padding:11px 13px;font-size:14.5px;font-family:inherit;
          border:1.5px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);
          outline:none;min-height:104px;resize:vertical}
        .cform textarea:focus{border-color:var(--green-2)}
        .cdetail{display:grid;gap:22px}
        .cdetail .d h4{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
          color:var(--green-2);margin-bottom:6px}
        .cdetail .d p{font-size:16px;line-height:1.6;color:var(--ink)}

        .close{text-align:center;padding:70px 0 78px}
        .close h2{font-size:clamp(26px,3.8vw,40px);letter-spacing:-.03em;font-weight:800;margin-bottom:13px}
        .close p{font-size:16.5px;color:var(--ink-2);max-width:48ch;margin:0 auto}
        .bigbtn{display:inline-block;margin-top:26px;background:var(--green);color:#fff;text-decoration:none;
          padding:15px 36px;border-radius:12px;font-size:16px;font-weight:700;transition:.16s;border:none;cursor:pointer}
        .bigbtn:hover{background:var(--green-2);transform:translateY(-2px)}

        .sffoot{border-top:1px solid var(--line);padding:34px 0 44px;display:grid;
          grid-template-columns:1.4fr 1fr 1fr;gap:32px;font-size:14px;color:var(--ink-2);line-height:1.7}
        .sffoot h5{font-size:11.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
          color:var(--ink-faint);margin-bottom:10px}
        .sffoot button{background:none;border:none;color:var(--ink-2);font-size:14px;cursor:pointer;
          padding:0 0 6px;display:block;font-family:inherit}
        .sffoot button:hover{color:var(--green-2)}
        .legal{border-top:1px solid var(--line);padding:20px 0 40px;font-size:12.5px;color:var(--ink-faint);
          line-height:1.7}

        @media (max-width:900px){
          .menu{display:none}
          .menu.open{display:flex;position:absolute;top:64px;left:16px;right:16px;flex-direction:column;
            align-items:stretch;background:#fff;border-radius:14px;padding:10px;z-index:30;
            box-shadow:0 18px 40px rgba(10,40,30,.28)}
          .menu.open .mlink{color:var(--ink);text-align:left}
          .menu.open .mlink.on{background:var(--amber-soft);color:var(--green)}
          .menu.open .navlink{margin:6px 0 0;text-align:center}
          .burger{display:block}
          .hero{grid-template-columns:1fr;gap:32px;padding:12px 0 4px}
          .logincol{order:-1}
          .demo{grid-template-columns:1fr;gap:16px}
          .arrow b{transform:rotate(90deg)}
          .three,.inc,.vals,.split,.sffoot{grid-template-columns:1fr}
          .sec{padding:52px 0}
        }
        /* tablets & large foldables: two columns beats one */
        @media (min-width:620px) and (max-width:900px){
          .three,.inc,.vals,.sffoot{grid-template-columns:1fr 1fr}
          .three .c:last-child:nth-child(odd),
          .inc .r:last-child:nth-child(odd){grid-column:1 / -1}
        }
        /* small phones */
        @media (max-width:430px){
          .sf .w{padding:0 16px}
          .logincard{padding:20px;border-radius:15px}
          .sec{padding:42px 0}
          .close{padding:48px 0 54px}
          .phead{padding:22px 0 4px}
          .hero p,.phead .kk{font-size:16px}
          .band{padding:38px 0}
          .band>div,.awning .band>div{padding:0 18px!important}
          .chatbox,.dk,.waiting{min-height:0}
          .cform{padding:20px}
          .tags span{font-size:13.5px;padding:8px 14px}
        }
        /* foldable cover screens (~280-360px) */
        @media (max-width:360px){
          .sf .w{padding:0 13px}
          .sflogo{font-size:18px}
          .sflogo i{width:29px;height:29px}
          .three .c,.val{padding:19px 17px}
          .dk .hd,.dk .cu,.dk .li,.dk .to{padding-left:14px;padding-right:14px}
          .m{font-size:13.5px}
        }
      `}</style>

      <div className={`awning ${page === 'home' ? 'tall' : 'short'}`} style={{ position: 'relative' }}>
        <div className="w">
          <nav className="sfnav">
            <button className="sflogo dsp" onClick={() => go('home')}><i>Y</i>Yanvio</button>
            <button className="burger" onClick={() => setMenu(m => !m)}>{menu ? '✕' : '☰'}</button>
            <div className={`menu${menu ? ' open' : ''}`}>
              {SITE_NAV.map(([id, label]) => (
                <button key={id} className={`mlink${page === id ? ' on' : ''}`} onClick={() => go(id)}>{label}</button>
              ))}
              <a href="#login" className="navlink" onClick={() => { setMenu(false); setPage('home'); }}>Log in</a>
            </div>
          </nav>

          {page === 'home' && (
            <section className="hero">
              <div>
                <h1 className="dsp">Turn conversations into <u>automated orders</u></h1>
                <p>Turn WhatsApp conversations into automated order workflows — simple, scalable, and built for SMEs.</p>
                <div className="ticks">
                  <div><i>✓</i>Nothing for your customers to download</div>
                  <div><i>✓</i>Payments settle straight to your bank</div>
                  <div><i>✓</i>Set up in an afternoon, not a fortnight</div>
                </div>
              </div>
              <div className="logincol">
                <div className="logincard" id="login" style={{ scrollMarginTop: 20 }}>
                  <LoginCard onLogin={onLogin} />
                </div>
              </div>
            </section>
          )}

          {page !== 'home' && (
            <div className="phead">
              <h1 className="dsp">{
                { about: 'About us', services: 'Our services', clients: 'Our clients', contact: 'Contact us' }[page]
              }</h1>
              <p className="kk">{
                {
                  about: 'Behind the scenes at Yanvio',
                  services: 'Just say the word — we can automate it',
                  clients: 'Built on trust and collaboration',
                  contact: "We'd love to hear from you",
                }[page]
              }</p>
            </div>
          )}
        </div>
      </div>

      <div className="w">
        {page === 'home' && <HomePage go={go} />}
        {page === 'about' && <AboutPage go={go} />}
        {page === 'services' && <ServicesPage go={go} />}
        {page === 'clients' && <ClientsPage go={go} />}
        {page === 'contact' && <ContactPage />}
      </div>

      <div className="w">
        <footer className="sffoot">
          <div>
            <div className="dsp" style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 10 }}>Yanvio</div>
            <div>Turn WhatsApp conversations into automated order workflows — simple, scalable, and built for SMEs.</div>
          </div>
          <div>
            <h5>Quick links</h5>
            {SITE_NAV.slice(1).map(([id, label]) => (
              <button key={id} onClick={() => go(id)}>{label}</button>
            ))}
          </div>
          <div>
            <h5>Get in touch</h5>
            <div><a href="mailto:info@yanvio.com" style={{ color: 'var(--green-2)', fontWeight: 600 }}>info@yanvio.com</a></div>
            <div>6 Winstanley Lane<br />Milton Keynes MK5 7BT<br />United Kingdom</div>
            <div style={{ marginTop: 8 }}>Open Mon–Fri, 9am–6pm</div>
          </div>
        </footer>
        <div className="legal">
          Yanvio is operated by YANVIO LTD, a company registered in England and Wales, company number 17382620.
          Registered office: 6 Winstanley Lane, Milton Keynes, MK5 7BT, United Kingdom. © 2026 YANVIO LTD. All rights reserved.
        </div>
      </div>
    </div>
  );
}

/* ── the automation demo: message in → docket out ── */
function AutoDemo() {
  const [typed, setTyped] = useState('');
  const [replied, setReplied] = useState(false);
  const [docket, setDocket] = useState(false);
  const MSG = 'Morning! 2 boxes of the large white plates and a cutlery pack for Saturday please 🙏';

  useEffect(() => {
    let alive = true;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const loop = async () => {
      while (alive) {
        setTyped(''); setReplied(false); setDocket(false);
        await wait(600);
        for (let i = 0; i <= MSG.length; i += 2) {
          if (!alive) return;
          setTyped(MSG.slice(0, i)); await wait(24);
        }
        await wait(560); if (!alive) return; setReplied(true);
        await wait(900); if (!alive) return; setDocket(true);
        await wait(4200);
      }
    };
    loop();
    return () => { alive = false; };
  }, []);

  return (
    <div className="demo">
      <div className="chatbox">
        <div className="who"><span className="lamp" />WhatsApp · Ellis Catering · 09:14</div>
        <div className="m them">{typed}{typed.length < MSG.length && <span className="cur" />}</div>
        {replied && (
          <div className="m us">
            2 × Plates (large white) · 1 × Cutlery pack<br />
            <b>Total £29.97</b> — tap to pay
          </div>
        )}
      </div>

      <div className="arrow"><b>→</b>becomes</div>

      {docket ? (
        <div className="dk in">
          <div className="sp" />
          <div className="hd">
            <span className="no">YV-4K2P8A</span>
            <span className="pd">PAID</span>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink-faint)' }}>09:15</span>
          </div>
          <div className="cu">Ellis Catering · +44 7700 900123</div>
          <div className="dash" />
          <div className="li"><span><b style={{ color: 'var(--ink)' }}>2</b> × Plates — large white</span><span>£17.98</span></div>
          <div className="li"><span><b style={{ color: 'var(--ink)' }}>1</b> × Cutlery pack</span><span>£11.99</span></div>
          <div className="to"><span>Total</span><span>£29.97</span></div>
        </div>
      ) : (
        <div className="waiting">waiting for the order…</div>
      )}
    </div>
  );
}

const PRODUCTS = [
  ['Yanvio ChatFlow', 'Run your WhatsApp Business on autopilot — automate customer support, marketing, and sales.'],
  ['Yanvio Connect', 'Create automated workflows and seamlessly transfer data between applications.'],
  ['Yanvio Orders', 'An intelligent workflow that captures, confirms, and manages orders from WhatsApp.'],
];

function SoonBox() {
  return (
    <div className="soon">
      <h3 className="dsp">Launching soon</h3>
      <p>Reach out for demos, details, and partnerships at <a href="mailto:info@yanvio.com">info@yanvio.com</a></p>
    </div>
  );
}

function HomePage({ go }) {
  return (
    <>
      <section className="sec">
        <div className="kick">See it work</div>
        <h2 className="dsp">A message on Saturday morning.<br />An order you can pack.</h2>
        <p className="lead">This is the whole product. A customer types the way they always do, and you get something you can actually work from.</p>
        <AutoDemo />
        <SoonBox />
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="kick">We solve real problems</div>
        <h2 className="dsp">What can we do for you?</h2>
        <div className="three">
          {PRODUCTS.map(([h, p], i) => (
            <div className="c" key={h}>
              <div className="n">{i + 1}</div>
              <h3 className="dsp">{h}</h3><p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="kick">How it runs</div>
        <h2 className="dsp">Three steps, then it looks after itself</h2>
        <div className="three">
          {[
            ['They say hello', 'Your price list opens in the chat — your items, your sizes, your prices, updated the moment you change them.'],
            ['They pick and pay', 'Yanvio builds the basket, adds it up and sends a secure payment link. Card, Apple Pay, Google Pay.'],
            ['You pack the order', 'It lands on your screen the second the money clears. One tap marks it done and lets your customer know.'],
          ].map(([h, p], i) => (
            <div className="c" key={h}>
              <div className="n">{i + 1}</div>
              <h3 className="dsp">{h}</h3><p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="close">
        <h2 className="dsp">Do you want to boost your business?</h2>
        <p>Drop us a line and keep in touch.</p>
        <button className="bigbtn" onClick={() => go('contact')}>Contact us</button>
      </section>
    </>
  );
}

function AboutPage({ go }) {
  return (
    <>
      <section className="sec">
        <div className="kick">Who we are</div>
        <h2 className="dsp">We go beyond</h2>
        <div className="split">
          <div>
            <p>In a world where software abounds, we don't merely build tools; we meticulously craft profound relationships with our clients.</p>
            <p>Our complete approach carefully studies your goals. This allows us to deliver results that not only meet, but also go beyond your expectations.</p>
          </div>
          <div>
            <h3 className="dsp" style={{ fontSize: 22, marginBottom: 12 }}>Digital lovers</h3>
            <p>Passionate about innovation, we thrive on using the latest tools and technologies to create solutions that inspire and connect with your audience.</p>
            <p>Our team constantly explores new ideas to keep your business ahead of the curve. Creativity is at the heart of everything we do.</p>
          </div>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="kick">How we work</div>
        <h2 className="dsp">Four things we hold to</h2>
        <div className="vals">
          {[
            ['We stop at nothing', 'Our dedication knows no bounds. We tackle every challenge head-on, turning obstacles into opportunities.'],
            ['We love to explore', 'Curiosity drives us to innovate. We\u2019re always looking for new ideas and better ways to serve your needs.'],
            ['We take it step-by-step', 'Success is a journey. We break down complex goals into manageable steps to ensure lasting results.'],
            ['We keep it simple', 'Simplicity is the key to clarity. We focus on what matters most to create impactful, streamlined solutions.'],
          ].map(([h, p]) => (
            <div className="val" key={h}><h4 className="dsp">{h}</h4><p>{p}</p></div>
          ))}
        </div>
      </section>

      <div className="band" style={{ borderRadius: 18 }}>
        <div style={{ padding: '0 28px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)' }}>
            Your dream. Our mission.
          </div>
          <h2 className="dsp" style={{ color: '#fff', fontSize: 'clamp(24px,3.2vw,33px)', margin: '12px 0 0', fontWeight: 800 }}>
            We believe in hard work and dedication
          </h2>
          <p>Your success is our mission. Every project we take on is driven by a commitment to excellence and a focus on achieving your goals.</p>
          <p style={{ marginTop: 10 }}>We pride ourselves on delivering exceptional results through collaboration, creativity, and perseverance.</p>
        </div>
      </div>

      <section className="close">
        <h2 className="dsp">Do you want to grow your business?</h2>
        <p>We can do it together.</p>
        <button className="bigbtn" onClick={() => go('contact')}>Contact us</button>
      </section>
    </>
  );
}

function ServicesPage({ go }) {
  return (
    <>
      <section className="sec">
        <div className="kick">A step-by-step roadmap to success</div>
        <h2 className="dsp">One place for WhatsApp automation</h2>
        <p className="lead">Partner with us for tailored workflows, practical automation, and measurable results. We guide you every step of the way to help your business thrive.</p>
        <div className="three">
          {PRODUCTS.map(([h, p], i) => (
            <div className="c" key={h}>
              <div className="n">{i + 1}</div>
              <h3 className="dsp">{h}</h3><p>{p}</p>
            </div>
          ))}
        </div>
        <SoonBox />
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="kick">What's included</div>
        <h2 className="dsp">Everything you need. Nothing you don't.</h2>
        <div className="inc">
          {[
            ['Answers on your own number', 'Price list, sizes, quantities, basket and confirmation — all inside the chat your customers already use.'],
            ['Every order on one screen', 'Works on the shop tablet, the office laptop, or your phone behind the counter.'],
            ['Money lands with you', 'Connect your own payment account. Payments settle straight to your bank. Yanvio never holds it.'],
            ['A price list you control', 'Add items, add sizes, change prices, hide what has sold out — it updates in the chat instantly.'],
          ].map(([h, p]) => (
            <div className="r" key={h}><h3 className="dsp"><span>✓</span>{h}</h3><p>{p}</p></div>
          ))}
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="kick">Rise to the top</div>
        <h2 className="dsp">Increase sales</h2>
        <div className="vals">
          {[
            ['Increase sales', 'Boost your business with proven workflows designed to capture every order, reduce mistakes, and get you paid faster.'],
            ['Count on us', 'We\u2019re your dedicated partner in success, offering expertise and personalised support every step of the way.'],
            ['Best practices', 'Innovation thrives on persistence. Let\u2019s work together to refine your approach and achieve exceptional results.'],
            ['Built for SMEs', 'Simple and scalable. Everything is designed around how small businesses actually work, not how software wishes they did.'],
          ].map(([h, p]) => (
            <div className="val" key={h}><h4 className="dsp">{h}</h4><p>{p}</p></div>
          ))}
        </div>
      </section>

      <section className="close">
        <h2 className="dsp">We strive to make our clients happy</h2>
        <p>So, let's be happy together.</p>
        <button className="bigbtn" onClick={() => go('clients')}>Meet our clients</button>
      </section>
    </>
  );
}

function ClientsPage({ go }) {
  return (
    <>
      <section className="sec">
        <div className="kick">Service with a smile</div>
        <h2 className="dsp">Built on trust and collaboration</h2>
        <p className="lead">We're proud to work with innovative partners who share our commitment to excellence. Together, we create solutions that make an impact.</p>
        <SoonBox />
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="kick">Who it's for</div>
        <h2 className="dsp">Made for businesses that already run on WhatsApp</h2>
        <div className="tags" style={{ marginTop: 24 }}>
          {['Corner shops', 'Wholesalers', 'Catering suppliers', 'Bakeries', 'Butchers',
            'Party & event supplies', 'Farm shops', 'Garden centres'].map(t => (
            <span key={t} style={{ background: 'var(--amber-soft)', color: 'var(--green)', border: '1px solid #F3E2C0' }}>{t}</span>
          ))}
        </div>
      </section>

      <div className="band" style={{ borderRadius: 18 }}>
        <div style={{ padding: '0 28px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)' }}>
            Tailor-made automation
          </div>
          <h2 className="dsp" style={{ color: '#fff', fontSize: 'clamp(24px,3.2vw,33px)', margin: '12px 0 0', fontWeight: 800 }}>
            Let's grow your business together
          </h2>
          <p>We believe in building partnerships that empower businesses to grow and thrive. Let's work together to craft innovative solutions tailored to your unique goals.</p>
          <p style={{ marginTop: 10 }}>Our dedicated team is ready to bring your vision to life, combining strategy, creativity, and cutting-edge technology to drive meaningful results.</p>
        </div>
      </div>

      <section className="close">
        <h2 className="dsp">Take a minute to get to know us</h2>
        <p>The people behind Yanvio.</p>
        <button className="bigbtn" onClick={() => go('about')}>About us</button>
      </section>
    </>
  );
}

function ContactPage() {
  const [f, setF] = useState({ name: '', phone: '', email: '', msg: '' });
  const send = () => {
    const body = `Name: ${f.name}%0D%0APhone: ${f.phone}%0D%0AEmail: ${f.email}%0D%0A%0D%0A${f.msg}`;
    window.location.href = `mailto:info@yanvio.com?subject=Enquiry from ${encodeURIComponent(f.name || 'the Yanvio site')}&body=${body}`;
  };
  return (
    <>
      <section className="sec">
        <div className="split">
          <div className="cform">
            <label>Name</label>
            <input className="inp" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Your name" />
            <label>Phone</label>
            <input className="inp" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="Your number" />
            <label>Email</label>
            <input className="inp" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="you@business.co.uk" />
            <label>Write us</label>
            <textarea value={f.msg} onChange={e => setF({ ...f, msg: e.target.value })} placeholder="How can we help?" />
            <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={send}>Send</button>
          </div>

          <div>
            <div className="kick">Get in touch with us</div>
            <h2 className="dsp" style={{ fontSize: 'clamp(23px,3vw,30px)', margin: '12px 0 12px' }}>
              Let's connect and talk about how we can help your business
            </h2>
            <p style={{ fontSize: 15.5, color: 'var(--ink-2)', lineHeight: 1.7, marginBottom: 26 }}>
              We're here to answer your questions, discuss your goals, and explore ways we can work together to bring your vision to life.
            </p>
            <div className="cdetail">
              <div className="d"><h4>Write us</h4><p><a href="mailto:info@yanvio.com" style={{ color: 'var(--green-2)', fontWeight: 600 }}>info@yanvio.com</a></p></div>
              <div className="d"><h4>We're on the map</h4><p>6 Winstanley Lane<br />Milton Keynes MK5 7BT<br />United Kingdom</p></div>
              <div className="d"><h4>Business hours</h4><p>Monday – Friday: 9am – 6pm</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="close" style={{ paddingTop: 0 }}>
        <h2 className="dsp">Want to learn more about our services?</h2>
        <p>Let's talk.</p>
        <a href="mailto:info@yanvio.com" className="bigbtn" style={{ textDecoration: 'none' }}>Email info@yanvio.com</a>
      </section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   LOGIN CARD
   ═══════════════════════════════════════════════════════════ */
function LoginCard({ onLogin }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const clean = phone.replace(/\D/g, '');

  const request = async () => {
    setErr('');
    if (clean.length < 10 || clean.length > 15) {
      setErr('Enter your full WhatsApp number including the country code, for example 447700900123.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/auth/request-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean }),
      });
      const d = await r.json();
      if (!r.ok) setErr(d.error || 'That code could not be sent. Try again in a moment.');
      else { setStep('code'); setCode(''); setWait(60); }
    } catch { setErr('Cannot reach Yanvio right now. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    setErr('');
    if (!/^\d{6}$/.test(code)) { setErr('Enter the 6-digit code.'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/auth/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, code }),
      });
      const d = await r.json();
      if (!r.ok) setErr(d.error || 'That code did not match. Check it and try again.');
      else onLogin(d.token, d.merchant);
    } catch { setErr('Cannot reach Yanvio right now. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div id="login" className="card" style={{ padding: 24, scrollMarginTop: 20 }}>
      {step === 'phone' ? (
        <>
          <div className="dsp" style={{ fontSize: 19 }}>Log in</div>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '6px 0 18px', lineHeight: 1.5 }}>
            We'll send a 6-digit code to your WhatsApp number.
          </p>
          <label style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--faint)' }}>
            WhatsApp number
          </label>
          <input className="inp mono" style={{ marginTop: 7 }} value={phone} inputMode="tel"
            onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && !busy && request()}
            placeholder="44 7700 900123" />
          {err && <Err text={err} />}
          <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={request} disabled={busy}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </>
      ) : (
        <>
          <div className="dsp" style={{ fontSize: 19 }}>Enter your code</div>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '6px 0 18px', lineHeight: 1.5 }}>
            Sent to <b className="mono">+{clean}</b> on WhatsApp.
          </p>
          <input className="inp mono" autoFocus inputMode="numeric" value={code}
            style={{ fontSize: 23, letterSpacing: 10, textAlign: 'center' }}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && !busy && verify()} placeholder="······" />
          {err && <Err text={err} />}
          <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={verify} disabled={busy}>
            {busy ? 'Checking…' : 'Log in'}
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 13 }}>
            <button onClick={() => { setStep('phone'); setErr(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}>
              Use a different number
            </button>
            <button onClick={request} disabled={wait > 0 || busy}
              style={{ background: 'none', border: 'none', color: wait > 0 ? 'var(--faint)' : 'var(--indigo)', fontWeight: 600, cursor: wait > 0 ? 'default' : 'pointer', padding: 0 }}>
              {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMMAND PALETTE (⌘K)
   ═══════════════════════════════════════════════════════════ */
function Palette({ open, close, actions }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = useMemo(() => actions.filter(a => a.label.toLowerCase().includes(q.toLowerCase())), [actions, q]);
  useEffect(() => { if (open) { setQ(''); setI(0); } }, [open]);
  if (!open) return null;
  const run = (a) => { a.run(); close(); };
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="palette pop" role="dialog">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <Search size={16} color="var(--faint)" />
          <input autoFocus value={q} placeholder="Jump to…"
            onChange={e => { setQ(e.target.value); setI(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(x + 1, list.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(x - 1, 0)); }
              if (e.key === 'Enter' && list[i]) run(list[i]);
              if (e.key === 'Escape') close();
            }}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 15.5, color: 'var(--ink)', fontFamily: 'inherit' }} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>ESC</span>
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
          {list.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--faint)', fontSize: 13.5 }}>Nothing matches that.</div>}
          {list.map((a, n) => (
            <div key={a.label} className={`pitem${n === i ? ' sel' : ''}`} onMouseEnter={() => setI(n)} onClick={() => run(a)}>
              <a.icon size={15} />{a.label}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════ */
function Dashboard({ token, merchant, onLogout }) {
  const [dark, setDark] = useTheme();
  const [view, setView] = useState('orders');
  const [cmd, setCmd] = useState(false);

  const [convos, setConvos] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [me, setMe] = useState(null);
  const [pay, setPay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState(null);

  const [oFilter, setOFilter] = useState('all');
  const [oQuery, setOQuery] = useState('');
  const [cFilter, setCFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [chat, setChat] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const [pForm, setPForm] = useState({ name: '', unit: '', price: '' });
  const [vFor, setVFor] = useState(null);
  const [vForm, setVForm] = useState({ name: '', unit: '', price: '' });
  const [imgFor, setImgFor] = useState(null);
  const [imgBusy, setImgBusy] = useState(null);
  const fileRef = useRef(null);

  const [payForm, setPayForm] = useState({ secret_key: '', webhook_secret: '' });
  const [payMsg, setPayMsg] = useState('');
  const [payBusy, setPayBusy] = useState(false);

  const endRef = useRef(null);
  const openRef = useRef(null);
  useEffect(() => { openRef.current = openId; }, [openId]);

  const authFetch = useCallback(async (url, opts = {}) => {
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
    if (r.status === 401) { onLogout(); throw new Error('unauthorized'); }
    return r;
  }, [token, onLogout]);

  /* loaders */
  const loadConvos = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/api/orders`);
      if (!r.ok) throw new Error();
      setConvos(await r.json()); setOffline(false);
    } catch (e) { if (e.message !== 'unauthorized') setOffline(true); }
    finally { setLoading(false); }
  }, [authFetch]);
  const loadOrders = useCallback(async () => {
    try { const r = await authFetch(`${API}/api/orders/real`); if (r.ok) setOrders(await r.json()); } catch {}
  }, [authFetch]);
  const loadProducts = useCallback(async () => {
    try { const r = await authFetch(`${API}/api/products`); if (r.ok) setProducts(await r.json()); } catch {}
  }, [authFetch]);
  const loadPay = useCallback(async () => {
    try { const r = await authFetch(`${API}/api/payment-account`); if (r.ok) setPay(await r.json()); } catch {}
  }, [authFetch]);
  const loadMe = useCallback(async () => {
    try { const r = await authFetch(`${API}/api/me`); if (r.ok) setMe(await r.json()); } catch {}
  }, [authFetch]);

  useEffect(() => {
    loadConvos(); loadOrders(); loadProducts(); loadPay(); loadMe();
    const t = setInterval(() => { loadConvos(); loadOrders(); }, 15000);
    return () => clearInterval(t);
  }, [loadConvos, loadOrders, loadProducts, loadPay, loadMe]);

  /* live */
  useEffect(() => {
    const s = io(API, { auth: { token } });
    s.on('message:new', (m) => {
      loadConvos();
      if (m.customer_id === openRef.current) {
        setChat(prev => {
          if (m.direction === 'outbound') {
            const rev = [...prev].reverse().findIndex(x => String(x.id).startsWith('tmp-') && x.message_text === m.message_text);
            if (rev !== -1) { const idx = prev.length - 1 - rev; const c = [...prev]; c[idx] = m; return c; }
          }
          return [...prev, m];
        });
      }
    });
    s.on('order:new', (o) => {
      loadConvos(); loadOrders();
      setToast({ kind: 'new', no: o.order_no, total: o.total_amount });
      setTimeout(() => setToast(null), 6000);
    });
    s.on('order:paid', (o) => {
      loadOrders();
      setToast({ kind: 'paid', no: o.order_no, total: o.total_amount });
      setTimeout(() => setToast(null), 6000);
    });
    s.on('order:status', () => loadConvos());
    s.on('order:real_status', () => loadOrders());
    s.on('connect_error', () => { /* the 15s poll covers it */ });
    return () => s.disconnect();
  }, [token, loadConvos, loadOrders]);

  useEffect(() => {
    if (!openId) return;
    authFetch(`${API}/api/chat/${openId}`).then(r => r.json()).then(setChat).catch(() => setChat([]));
  }, [openId, authFetch]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.length, openId]);

  /* ⌘K */
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd(c => !c); }
      if (e.key === 'Escape') setCmd(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /* actions */
  const advance = async (id, cur) => {
    const next = NEXT_LIFE[cur]; if (!next) return;
    setOrders(p => p.map(o => o.id === id ? { ...o, status: next } : o));
    try {
      const r = await authFetch(`${API}/api/orders/real/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
      });
      if (!r.ok) throw new Error();
    } catch (e) { if (e.message !== 'unauthorized') setOrders(p => p.map(o => o.id === id ? { ...o, status: cur } : o)); }
  };

  const triage = async (id, cur, e) => {
    e.stopPropagation();
    const next = NEXT_TRIAGE[cur];
    setConvos(p => p.map(c => c.id === id ? { ...c, status: next } : c));
    try {
      const r = await authFetch(`${API}/api/orders/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
      });
      if (!r.ok) throw new Error();
    } catch (e2) { if (e2.message !== 'unauthorized') setConvos(p => p.map(c => c.id === id ? { ...c, status: cur } : c)); }
  };

  const send = async () => {
    if (!reply.trim() || !openId || sending) return;
    const text = reply; setReply(''); setSending(true);
    setChat(p => [...p, { id: `tmp-${Date.now()}`, direction: 'outbound', message_text: text, timestamp: new Date().toISOString() }]);
    try {
      const r = await authFetch(`${API}/api/chat/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: openId, text }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setChat(p => [...p, { id: `e-${Date.now()}`, direction: 'system', message_text: d.details || 'Not sent — WhatsApp only allows free replies within 24 hours of the customer\u2019s last message.' }]);
      }
    } catch (e) {
      if (e.message !== 'unauthorized') setChat(p => [...p, { id: `e-${Date.now()}`, direction: 'system', message_text: 'Not sent — connection lost.' }]);
    } finally { setSending(false); }
  };

  const addProduct = async () => {
    if (!pForm.name.trim() || !pForm.price) return;
    try {
      const r = await authFetch(`${API}/api/products`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pForm.name, unit: pForm.unit || 'pc', price: Number(pForm.price) }),
      });
      if (r.ok) { setPForm({ name: '', unit: '', price: '' }); loadProducts(); }
    } catch {}
  };
  const addVariant = async (pid) => {
    if (!vForm.name.trim() || !vForm.price) return;
    try {
      const r = await authFetch(`${API}/api/products`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: pid, name: vForm.name, unit: vForm.unit || 'pc', price: Number(vForm.price) }),
      });
      if (r.ok) { setVForm({ name: '', unit: '', price: '' }); setVFor(null); loadProducts(); }
    } catch {}
  };
  const patchProduct = async (id, body) => {
    try {
      await authFetch(`${API}/api/products/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      loadProducts();
    } catch {}
  };
  const delProduct = async (id) => {
    try { await authFetch(`${API}/api/products/${id}`, { method: 'DELETE' }); loadProducts(); } catch {}
  };
  const move = (list, i, d) => {
    const a = list[i], b = list[i + d]; if (!a || !b) return;
    patchProduct(a.id, { sort_order: b.sort_order }); patchProduct(b.id, { sort_order: a.sort_order });
  };

  const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD;
  const PRESET = import.meta.env.VITE_CLOUDINARY_PRESET;
  const photosOn = Boolean(CLOUD && PRESET);
  const pickPhoto = (id) => { if (!photosOn) return; setImgFor(id); fileRef.current?.click(); };
  const onPhoto = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    const id = imgFor; setImgFor(null);
    if (!f || !id) return;
    setImgBusy(id);
    try {
      const fd = new FormData(); fd.append('file', f); fd.append('upload_preset', PRESET);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.secure_url) await patchProduct(id, { image_url: d.secure_url });
    } catch {} finally { setImgBusy(null); }
  };

  const savePay = async () => {
    setPayMsg(''); setPayBusy(true);
    try {
      const r = await authFetch(`${API}/api/payment-account`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payForm),
      });
      const d = await r.json();
      if (!r.ok) setPayMsg(d.error || 'Those keys were not accepted.');
      else { setPayForm({ secret_key: '', webhook_secret: '' }); loadPay(); }
    } catch { setPayMsg('Cannot reach Yanvio right now.'); }
    finally { setPayBusy(false); }
  };
  const dropPay = async () => {
    try { await authFetch(`${API}/api/payment-account`, { method: 'DELETE' }); loadPay(); } catch {}
  };

  /* derived */
  const paidToday = orders.filter(o => o.payment_status === 'paid' && today(o.created_at))
    .reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const nToday = orders.filter(o => today(o.created_at)).length;
  const queue = orders.filter(o => o.status === 'received' || o.status === 'processing').length;
  const allTime = orders.reduce((s, o) => s + (o.payment_status === 'paid' ? Number(o.total_amount || 0) : 0), 0);
  const money = useCountUp(paidToday);

  const oCounts = { all: orders.length };
  Object.keys(LIFE).forEach(k => { oCounts[k] = orders.filter(o => o.status === k).length; });
  const q = oQuery.trim().toLowerCase();
  const visOrders = orders
    .filter(o => oFilter === 'all' || o.status === oFilter)
    .filter(o => !q || (o.order_no || '').toLowerCase().includes(q) || (o.customer_name || '').toLowerCase().includes(q) || String(o.whatsapp_id || '').includes(q));

  const cCounts = { all: convos.length };
  Object.keys(TRIAGE).forEach(k => { cCounts[k] = convos.filter(c => c.status === k).length; });
  const visConvos = convos.filter(c => cFilter === 'all' || c.status === cFilter);

  const open = convos.find(c => c.id === openId) || null;
  const biz = me?.merchant?.business_name || merchant?.business_name || 'Your business';
  const channel = me?.channel || null;

  const cmdActions = [
    ...NAV.map(n => ({ label: `Go to ${n.label}`, icon: n.icon, run: () => setView(n.id) })),
    { label: dark ? 'Switch to light theme' : 'Switch to dark theme', icon: dark ? Sun : Moon, run: () => setDark(!dark) },
    { label: 'Show orders needing action', icon: Clock, run: () => { setView('orders'); setOFilter('received'); } },
    { label: 'Show all orders', icon: Receipt, run: () => { setView('orders'); setOFilter('all'); setOQuery(''); } },
    { label: 'Log out', icon: LogOut, run: onLogout },
  ];

  return (
    <div className="shell">
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPhoto} />
      <Palette open={cmd} close={() => setCmd(false)} actions={cmdActions} />

      <aside className="rail">
        <div className="brand">
          <div className="mark dsp">Y</div>
          <div style={{ minWidth: 0 }}>
            <div className="dsp" style={{ fontSize: 16, lineHeight: 1.1 }}>Yanvio</div>
            <div style={{ fontSize: 11.5, color: 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{biz}</div>
          </div>
        </div>
        <nav style={{ display: 'grid', gap: 2 }}>
          {NAV.map(n => (
            <button key={n.id} className={`navbtn${view === n.id ? ' on' : ''}`} onClick={() => setView(n.id)}>
              <n.icon size={17} />{n.label}
              {n.id === 'orders' && queue > 0 && <span className="navcount mono">{queue}</span>}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', fontSize: 12.5, color: 'var(--muted)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: offline ? 'var(--ember)' : 'var(--moss)' }} />
            {offline ? 'Reconnecting…' : 'Live'}
          </div>
          <button className="navbtn" onClick={onLogout}><LogOut size={17} />Log out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="dsp" style={{ fontSize: 17 }}>{NAV.find(n => n.id === view)?.label}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="kbd" onClick={() => setCmd(true)}><Command size={13} /><span className="mono">K</span></button>
            <button className="iconbtn" onClick={() => setDark(!dark)} title="Switch theme">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <div className="page">
          {/* ═══ ORDERS ═══ */}
          {view === 'orders' && (
            <>
              <div className="kpis">
                <div className="kpi hero lift">
                  <div className="lab">Taken today</div>
                  <div className="val dsp mono">{gbp(money)}</div>
                  <div className="sub"><TrendingUp size={13} color="var(--moss)" />{nToday} order{nToday === 1 ? '' : 's'} today</div>
                </div>
                <div className="kpi lift" style={{ animationDelay: '.05s' }}>
                  <div className="lab">Needs action</div>
                  <div className="val dsp mono" style={{ color: queue ? 'var(--ember)' : 'var(--ink)' }}>{queue}</div>
                  <div className="sub">to prepare or fulfil</div>
                </div>
                <div className="kpi lift" style={{ animationDelay: '.1s' }}>
                  <div className="lab">All orders</div>
                  <div className="val dsp mono">{orders.length}</div>
                  <div className="sub">since you started</div>
                </div>
                <div className="kpi lift" style={{ animationDelay: '.15s' }}>
                  <div className="lab">Total taken</div>
                  <div className="val dsp mono">{gbp0(allTime)}</div>
                  <div className="sub">paid orders</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {['all', 'received', 'processing', 'fulfilled', 'closed'].map(f => (
                  <button key={f} className={`chip${oFilter === f ? ' on' : ''}`} onClick={() => setOFilter(f)}>
                    {f === 'all' ? 'All' : LIFE[f].label}
                    <span className="mono" style={{ opacity: .65, fontSize: 11 }}>{oCounts[f]}</span>
                  </button>
                ))}
                <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 210, flex: '0 1 250px' }}>
                  <Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--faint)' }} />
                  <input className="inp" value={oQuery} onChange={e => setOQuery(e.target.value)}
                    placeholder="Search orders or customers" style={{ padding: '9px 12px 9px 34px', fontSize: 13.5, borderRadius: 20 }} />
                </div>
              </div>

              {loading && <div className="dockets">{[0, 1].map(i => <div key={i} className="skel" style={{ height: 210 }} />)}</div>}

              {!loading && orders.length === 0 && (
                <div className="card empty">
                  <Inbox size={26} style={{ opacity: .4 }} /><br /><br />
                  <b style={{ color: 'var(--ink)' }}>No orders yet.</b><br />
                  {channel
                    ? <>Share <b className="mono">{channel.display_number}</b> with your customers — dockets appear here the moment an order is paid.</>
                    : <>Dockets appear here the moment a customer pays.</>}
                </div>
              )}
              {!loading && orders.length > 0 && visOrders.length === 0 && (
                <div className="card empty">
                  Nothing matches that filter.
                  <button className="chip" style={{ marginLeft: 10 }} onClick={() => { setOFilter('all'); setOQuery(''); }}>Clear filters</button>
                </div>
              )}

              <div className="dockets">
                {visOrders.map((o, i) => (
                  <div key={o.id} className="lift" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <Docket o={o} onAdvance={advance} />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ═══ MESSAGES ═══ */}
          {view === 'chats' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {['all', 'pending', 'processing', 'fulfilled'].map(f => (
                  <button key={f} className={`chip${cFilter === f ? ' on' : ''}`} onClick={() => setCFilter(f)}>
                    {f === 'all' ? 'All' : TRIAGE[f].label}
                    <span className="mono" style={{ opacity: .65, fontSize: 11 }}>{cCounts[f]}</span>
                  </button>
                ))}
              </div>
              {loading && <div style={{ display: 'grid', gap: 9 }}>{[0, 1, 2].map(i => <div key={i} className="skel" style={{ height: 68 }} />)}</div>}
              {!loading && visConvos.length === 0 && (
                <div className="card empty">
                  {convos.length === 0 ? 'Conversations appear here as customers message you.' : 'Nothing matches that filter.'}
                </div>
              )}
              <div style={{ display: 'grid', gap: 9 }}>
                {visConvos.map((c, i) => {
                  const t = TRIAGE[c.status] || TRIAGE.pending;
                  return (
                    <div key={c.id} className="card lift" onClick={() => setOpenId(c.id)}
                      style={{ animationDelay: `${Math.min(i, 8) * 30}ms`, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--indigo-soft)', color: 'var(--indigo)', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0 }}>
                        {(c.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <b style={{ fontSize: 14.5 }}>{c.name || 'Unknown'}</b>
                          <span className="mono" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--faint)' }}>{ago(c.latest_time)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.latest_message || 'No messages yet'}
                        </div>
                      </div>
                      <button className="tag" onClick={(e) => triage(c.id, c.status, e)}
                        style={{ background: t.bg, color: t.c, border: 'none', cursor: 'pointer' }}>{t.label}</button>
                      <ChevronRight size={16} color="var(--faint)" />
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ═══ PRODUCTS ═══ */}
          {view === 'products' && (() => {
            const tops = products.filter(p => !p.parent_id);
            const kids = (id) => products.filter(p => p.parent_id === id);
            const Thumb = ({ p, s }) => p.image_url
              ? <img className="pthumb" src={p.image_url} alt="" style={{ width: s, height: s }} />
              : <div className="pthumb ph" style={{ width: s, height: s }}><Tags size={Math.round(s * .34)} /></div>;
            const Cam = ({ p }) => (
              <button className="iconbtn" onClick={() => pickPhoto(p.id)} disabled={!photosOn || imgBusy === p.id}
                title={photosOn ? (p.image_url ? 'Change photo' : 'Add photo') : 'Photo uploads are not configured'}>
                {imgBusy === p.id ? <Loader size={14} className="spin" /> : <ImagePlus size={15} />}
              </button>
            );

            // what the customer actually sees, 9 rows per page
            const entries = [];
            tops.filter(t => t.active).forEach(t => {
              const ks = kids(t.id).filter(k => k.active);
              if (ks.length) ks.forEach(k => entries.push({ sec: t.name, name: k.name, price: k.price, unit: k.unit }));
              else entries.push({ sec: 'Menu', name: t.name, price: t.price, unit: t.unit });
            });
            const page1 = entries.slice(0, 9);
            const pages = Math.max(1, Math.ceil(entries.length / 9));
            const secs = [];
            page1.forEach(e => {
              const last = secs[secs.length - 1];
              if (!last || last.title !== e.sec) secs.push({ title: e.sec, rows: [] });
              secs[secs.length - 1].rows.push(e);
            });

            return (
              <div className="studio">
                <div>
                  <div className="card lift" style={{ padding: 18, marginBottom: 14 }}>
                    <div className="dsp" style={{ fontSize: 15, marginBottom: 12 }}>Add an item</div>
                    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                      <div style={{ flex: '2 1 200px' }}>
                        <input className="inp" value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))} placeholder="Item name" />
                        <div className="mono" style={{ fontSize: 11, marginTop: 4, color: pForm.name.length > 24 ? 'var(--ember)' : 'var(--faint)' }}>
                          {pForm.name.length}/24 shown in WhatsApp
                        </div>
                      </div>
                      <input className="inp" style={{ flex: '1 1 130px', width: 'auto', alignSelf: 'flex-start' }} value={pForm.unit}
                        onChange={e => setPForm(f => ({ ...f, unit: e.target.value }))} placeholder="Unit (box of 50)" />
                      <input className="inp mono" style={{ flex: '0 1 110px', width: 'auto', alignSelf: 'flex-start' }} inputMode="decimal" value={pForm.price}
                        onChange={e => setPForm(f => ({ ...f, price: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="£ 0.00" />
                      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={addProduct}>Add</button>
                    </div>
                  </div>

                  {tops.length === 0 && (
                    <div className="card empty">
                      <Tags size={26} style={{ opacity: .4 }} /><br /><br />
                      <b style={{ color: 'var(--ink)' }}>Your price list is empty.</b><br />
                      Add your first item above — it appears in WhatsApp straight away.
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: 12 }}>
                    {tops.map((p, ti) => {
                      const ks = kids(p.id);
                      return (
                        <div key={p.id} className="pcard lift" style={{ animationDelay: `${Math.min(ti, 8) * 25}ms`, opacity: p.active ? 1 : .55 }}>
                          <div className="prow">
                            <div style={{ display: 'grid', gap: 1 }}>
                              <button className="iconbtn" style={{ width: 24, height: 19, border: 'none' }} onClick={() => move(tops, ti, -1)} disabled={ti === 0}><ArrowUp size={13} /></button>
                              <button className="iconbtn" style={{ width: 24, height: 19, border: 'none' }} onClick={() => move(tops, ti, 1)} disabled={ti === tops.length - 1}><ArrowDown size={13} /></button>
                            </div>
                            <Thumb p={p} s={64} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span className="pname dsp">{p.name}</span>
                                {ks.length > 0 && <span className="badge-grp">{ks.length} OPTIONS</span>}
                              </div>
                              {ks.length
                                ? <div className="pmeta" style={{ marginTop: 4 }}>Customers pick one option</div>
                                : <><div className="pprice mono">{gbp(p.price)}</div><div className="pmeta">per {p.unit}</div></>}
                            </div>
                            <div className="pacts">
                              <Cam p={p} />
                              <button className="chip" onClick={() => patchProduct(p.id, { active: p.active ? 0 : 1 })}>
                                {p.active ? 'Listed' : 'Hidden'}
                              </button>
                              <button className="iconbtn" style={{ color: 'var(--ember)' }}
                                onClick={() => { if (ks.length && !window.confirm(`Delete "${p.name}" and its ${ks.length} options?`)) return; delProduct(p.id); }}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>

                          {ks.map((k, ki) => (
                            <div className="vrow" key={k.id} style={{ opacity: k.active ? 1 : .5 }}>
                              <div style={{ display: 'grid', gap: 1 }}>
                                <button className="iconbtn" style={{ width: 21, height: 16, border: 'none' }} onClick={() => move(ks, ki, -1)} disabled={ki === 0}><ArrowUp size={11} /></button>
                                <button className="iconbtn" style={{ width: 21, height: 16, border: 'none' }} onClick={() => move(ks, ki, 1)} disabled={ki === ks.length - 1}><ArrowDown size={11} /></button>
                              </div>
                              <Thumb p={k} s={40} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{k.name}</div>
                                <div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{gbp(k.price)} · {k.unit}</div>
                              </div>
                              <div className="pacts">
                                <Cam p={k} />
                                <button className="chip" style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={() => patchProduct(k.id, { active: k.active ? 0 : 1 })}>
                                  {k.active ? 'Listed' : 'Hidden'}
                                </button>
                                <button className="iconbtn" style={{ color: 'var(--ember)', width: 29, height: 29 }} onClick={() => delProduct(k.id)}><Trash2 size={13} /></button>
                              </div>
                            </div>
                          ))}

                          <div className="pfoot">
                            {vFor === p.id ? (
                              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                <input className="inp" autoFocus style={{ flex: '2 1 140px', width: 'auto', padding: '8px 11px', fontSize: 13 }} value={vForm.name}
                                  onChange={e => setVForm(f => ({ ...f, name: e.target.value }))} placeholder="Option (e.g. Large)" />
                                <input className="inp" style={{ flex: '1 1 95px', width: 'auto', padding: '8px 11px', fontSize: 13 }} value={vForm.unit}
                                  onChange={e => setVForm(f => ({ ...f, unit: e.target.value }))} placeholder="Unit" />
                                <input className="inp mono" style={{ flex: '0 1 85px', width: 'auto', padding: '8px 11px', fontSize: 13 }} inputMode="decimal" value={vForm.price}
                                  onChange={e => setVForm(f => ({ ...f, price: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="£" />
                                <button className="btn" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => addVariant(p.id)}>Add</button>
                                <button className="chip" onClick={() => { setVFor(null); setVForm({ name: '', unit: '', price: '' }); }}>Cancel</button>
                              </div>
                            ) : (
                              <button className="chip" style={{ borderStyle: 'dashed', color: 'var(--indigo)' }}
                                onClick={() => { setVFor(p.id); setVForm({ name: '', unit: '', price: '' }); }}>
                                <Plus size={13} /> Add an option
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* live customer preview */}
                <div className="wapv lift">
                  <div className="bar">
                    <MessagesSquare size={15} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{biz}</div>
                      <div style={{ fontSize: 11, opacity: .75 }}>What your customers see</div>
                    </div>
                  </div>
                  <div className="body">
                    {entries.length === 0 ? (
                      <div className="wamsg" style={{ textAlign: 'center', opacity: .8 }}>
                        Nothing listed yet — add an item and it appears here.
                      </div>
                    ) : (
                      <div className="wamsg">
                        <div className="wahdr">Our Products 🛒{pages > 1 ? ` (1/${pages})` : ''}</div>
                        <div className="wabody">Tap <b>View products</b> below, choose what you need, and we’ll ask how many.</div>
                        <div style={{ marginTop: 10 }}>
                          {secs.map(s => (
                            <div key={s.title}>
                              <div className="wasec">{s.title.slice(0, 24)}</div>
                              {s.rows.map((r, i) => (
                                <div className="warow" key={i}>
                                  <span>{r.name.slice(0, 24)}<small>{gbp(r.price)} · {r.unit}</small></span>
                                </div>
                              ))}
                            </div>
                          ))}
                          {pages > 1 && (
                            <div className="warow"><span>➡️ More items<small>Page 2 of {pages}</small></span></div>
                          )}
                        </div>
                        <div className="wabtn">☰ View products</div>
                      </div>
                    )}
                  </div>
                  <div className="pvnote">
                    Names longer than 24 characters are cut off by WhatsApp. Hidden items and empty groups never appear.
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ═══ SETTINGS ═══ */}
          {view === 'settings' && (
            <div style={{ maxWidth: 720, display: 'grid', gap: 15 }}>
              <div className="card lift" style={{ padding: 20 }}>
                <div className="dsp" style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Store size={17} />Your WhatsApp number</div>
                <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '7px 0 14px', lineHeight: 1.55 }}>
                  Customers order by messaging this number. Your price list, basket and payment links all run on it.
                </p>
                {channel ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'var(--moss-soft)', borderRadius: 11, padding: '12px 15px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--moss)' }} />
                    <b className="mono" style={{ fontSize: 15 }}>{channel.display_number}</b>
                    <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--moss)' }}>Connected</span>
                  </div>
                ) : (
                  <div style={{ background: 'var(--line-soft)', borderRadius: 11, padding: '12px 15px', fontSize: 13.5, color: 'var(--muted)' }}>
                    No number connected yet. The Yanvio team sets this up with you during onboarding.
                  </div>
                )}
              </div>

              <div className="card lift" style={{ padding: 20, animationDelay: '.05s' }}>
                <div className="dsp" style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}><CreditCard size={17} />Getting paid</div>
                <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '7px 0 14px', lineHeight: 1.55 }}>
                  Connect your own payment account so customer payments settle directly to your bank. Yanvio never holds your money.
                </p>
                {pay?.connected ? (
                  <>
                    <div style={{ background: 'var(--moss-soft)', color: 'var(--moss)', borderRadius: 11, padding: '11px 15px', fontSize: 13.5, fontWeight: 600 }}>
                      Stripe connected — <span className="mono">{pay.account_id}</span>
                    </div>
                    {!pay.has_webhook && (
                      <div style={{ marginTop: 12, background: 'var(--amber-soft)', color: 'var(--amber)', borderRadius: 11, padding: '11px 15px', fontSize: 13 }}>
                        No signing secret saved yet — payments won't be marked paid until you add one below.
                      </div>
                    )}
                    <div style={{ marginTop: 14, fontSize: 13, color: 'var(--muted)', lineHeight: 1.75 }}>
                      <b style={{ color: 'var(--ink)' }}>One-time step in your Stripe dashboard</b><br />
                      1. Developers → Webhooks → <b>Add endpoint</b><br />
                      2. URL: <code className="mono" style={{ background: 'var(--line-soft)', padding: '2px 6px', borderRadius: 5, wordBreak: 'break-all' }}>{API}/webhook/stripe</code><br />
                      3. Event: <b>checkout.session.completed</b><br />
                      4. Copy the signing secret (<span className="mono">whsec_…</span>) and paste it here with your key.
                    </div>
                    <button className="chip" style={{ marginTop: 14, color: 'var(--ember)', borderColor: 'var(--ember)' }} onClick={dropPay}>Disconnect</button>
                  </>
                ) : (
                  <>
                    <label style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--faint)' }}>Stripe secret key</label>
                    <input className="inp mono" style={{ margin: '6px 0 12px' }} type="password" value={payForm.secret_key || ''}
                      onChange={e => setPayForm(f => ({ ...f, secret_key: e.target.value }))} placeholder="sk_live_… or sk_test_…" />
                    <label style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--faint)' }}>Webhook signing secret</label>
                    <input className="inp mono" style={{ marginTop: 6 }} type="password" value={payForm.webhook_secret || ''}
                      onChange={e => setPayForm(f => ({ ...f, webhook_secret: e.target.value }))} placeholder="whsec_…" />
                    {payMsg && <Err text={payMsg} />}
                    <button className="btn" style={{ marginTop: 13 }} onClick={savePay} disabled={payBusy}>
                      {payBusy ? 'Checking with Stripe…' : 'Connect Stripe'}
                    </button>
                    <p style={{ fontSize: 12.5, color: 'var(--faint)', marginTop: 11, lineHeight: 1.6 }}>
                      Find your key in Stripe: Developers → API keys. Create the webhook first (URL <span className="mono">{API}/webhook/stripe</span>, event <span className="mono">checkout.session.completed</span>) to get the signing secret. Both are encrypted and never shown again.
                    </p>
                  </>
                )}
              </div>

              <div className="card lift" style={{ padding: 20, animationDelay: '.1s' }}>
                <div className="dsp" style={{ fontSize: 16 }}>Appearance</div>
                <div style={{ display: 'flex', gap: 9, marginTop: 13 }}>
                  <button className={`chip${!dark ? ' on' : ''}`} onClick={() => setDark(false)}><Sun size={14} />Light</button>
                  <button className={`chip${dark ? ' on' : ''}`} onClick={() => setDark(true)}><Moon size={14} />Dark</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* mobile tabs */}
      <nav className="tabbar">
        {NAV.map(n => (
          <button key={n.id} className={`tabbtn${view === n.id ? ' on' : ''}`} onClick={() => setView(n.id)}>
            <n.icon size={19} />{n.label}
            {n.id === 'orders' && queue > 0 && (
              <span className="mono" style={{ position: 'absolute', top: 2, right: '50%', marginRight: -20, background: 'var(--ember)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8 }}>{queue}</span>
            )}
          </button>
        ))}
      </nav>

      {/* toast */}
      {toast && (
        <div className="card pop" style={{ position: 'fixed', left: 20, bottom: 20, zIndex: 70, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: toast.kind === 'paid' ? 'var(--moss-soft)' : 'var(--indigo-soft)', color: toast.kind === 'paid' ? 'var(--moss)' : 'var(--indigo)', display: 'grid', placeItems: 'center' }}>
            {toast.kind === 'paid' ? <CheckCircle2 size={17} /> : <Receipt size={17} />}
          </div>
          <div>
            <div className="dsp" style={{ fontSize: 14 }}>{toast.kind === 'paid' ? 'Payment received' : 'New order'}</div>
            <div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{toast.no} · {gbp(toast.total)}</div>
          </div>
        </div>
      )}

      {/* chat drawer */}
      {open && (
        <div className="drawer" onClick={() => setOpenId(null)}>
          <div className="scrim" />
          <div className="pane" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid var(--line)', background: 'var(--card)' }}>
              <button className="iconbtn" onClick={() => setOpenId(null)}><X size={17} /></button>
              <div>
                <b style={{ fontSize: 14.5 }}>{open.name || 'Unknown'}</b>
                <div className="mono" style={{ fontSize: 12, color: 'var(--faint)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Phone size={10} />+{open.whatsapp_id}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {chat.map(m => (
                <div key={m.id} className={`bub ${m.direction === 'outbound' ? 'out' : m.direction === 'system' ? 'sys' : 'in'}`}>
                  {m.message_text}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div style={{ padding: '11px 13px calc(11px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--line)', background: 'var(--card)', display: 'flex', gap: 9 }}>
              <input className="inp" value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()} placeholder="Write a reply…" style={{ borderRadius: 22 }} />
              <button className="btn" onClick={send} disabled={sending} style={{ width: 44, padding: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
