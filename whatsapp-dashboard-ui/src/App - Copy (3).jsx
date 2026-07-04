// src/App.jsx — Whatszorder frontend: Login + authenticated Order Board
// ─────────────────────────────────────────────────────────────
// Flow: no token ➜ LoginScreen (phone ➜ OTP ➜ JWT)
//       token    ➜ OrderDashboard (every request carries the JWT)
// Session persists in localStorage for 7 days (matches the JWT).
// Any 401 from the API logs the merchant out automatically.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Send, Package, Clock, Loader, CheckCircle2, X, Phone, ChevronRight, LogOut, MessageCircle, Bell } from 'lucide-react';
import { io } from 'socket.io-client';

const API = 'http://localhost:3000'; // ➜ env var when deploying

// localStorage, guarded so a restricted environment can't crash the app
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ═════════════════════════════════════════════════════════════
// ROOT
// ═════════════════════════════════════════════════════════════
export default function App() {
  const [token, setToken] = useState(() => store.get('wz_token'));
  const [merchant, setMerchant] = useState(() => {
    try { return JSON.parse(store.get('wz_merchant') || 'null'); } catch { return null; }
  });

  const handleLogin = (tok, m) => {
    store.set('wz_token', tok);
    store.set('wz_merchant', JSON.stringify(m));
    setToken(tok); setMerchant(m);
  };
  const handleLogout = useCallback(() => {
    store.del('wz_token'); store.del('wz_merchant');
    setToken(null); setMerchant(null);
  }, []);

  if (!token) return <LoginScreen onLogin={handleLogin} />;
  return <OrderDashboard token={token} merchant={merchant} onLogout={handleLogout} />;
}

// ═════════════════════════════════════════════════════════════
// LOGIN — WhatsApp-familiar: teal band, chat-style OTP step
// ═════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const cleanPhone = phone.replace(/\D/g, '');

  const requestOtp = async () => {
    setError('');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      setError('Enter your full WhatsApp number with country code, e.g. 91XXXXXXXXXX');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/auth/request-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not send the code.'); }
      else { setStep('code'); setCode(''); setResendIn(60); }
    } catch {
      setError('Cannot reach the server. Is the backend running?');
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setError('');
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/auth/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Verification failed.'); }
      else { onLogin(data.token, data.merchant); }
    } catch {
      setError('Cannot reach the server. Is the backend running?');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", minHeight: '100vh', background: '#F0F2F5', color: '#111B21' }}>
      {/* WhatsApp-Web-style teal band */}
      <div style={{ background: '#075E54', height: 210, width: '100%', position: 'absolute', top: 0, left: 0 }} />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 56 }}>
        {/* Brand row on the band */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', marginBottom: 34 }}>
          <Package size={26} />
          <span style={{ fontWeight: 700, fontSize: 20, letterSpacing: 0.3 }}>Whatszorder</span>
          <span style={{ fontSize: 13, opacity: 0.8, marginLeft: 4 }}>Merchant Login</span>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', width: 400, maxWidth: 'calc(100vw - 32px)', borderRadius: 14, boxShadow: '0 6px 30px rgba(11,20,26,0.18)', overflow: 'hidden' }}>

          {step === 'phone' && (
            <div style={{ padding: '30px 30px 26px' }}>
              <h1 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 6px' }}>Log in with your WhatsApp number</h1>
              <p style={{ fontSize: 13.5, color: '#54656F', margin: '0 0 22px', lineHeight: 1.5 }}>
                We'll send a 6-digit code to verify it's you. Use the WhatsApp Business number your shop runs on.
              </p>

              <label style={{ fontSize: 12, fontWeight: 700, color: '#075E54', textTransform: 'uppercase', letterSpacing: 0.5 }}>WhatsApp number</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !busy && requestOtp()}
                placeholder="91 98765 43210"
                inputMode="tel"
                autoFocus
                style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: '13px 15px', fontSize: 16, border: '1.5px solid #D1D7DB', borderRadius: 10, outline: 'none' }}
                onFocus={e => e.target.style.borderColor = '#25D366'}
                onBlur={e => e.target.style.borderColor = '#D1D7DB'}
              />
              <div style={{ fontSize: 12, color: '#8696A0', marginTop: 6 }}>Full number with country code, digits only is fine.</div>

              {error && <ErrorNote text={error} />}

              <button onClick={requestOtp} disabled={busy}
                style={{ width: '100%', marginTop: 18, padding: '13px', border: 'none', borderRadius: 10, cursor: busy ? 'default' : 'pointer',
                  background: busy ? '#9AD9B5' : '#25D366', color: '#fff', fontSize: 15, fontWeight: 700 }}>
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </div>
          )}

          {step === 'code' && (
            <div>
              {/* Chat-style header — the signature moment */}
              <div style={{ background: '#ECE5DD', padding: '18px 22px 14px' }}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#075E54', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <MessageCircle size={17} color="#fff" />
                  </div>
                  <div style={{ background: '#fff', borderRadius: '0 10px 10px 10px', padding: '9px 13px', fontSize: 13.5, lineHeight: 1.45, boxShadow: '0 1px 1px rgba(11,20,26,0.1)' }}>
                    We sent a 6-digit code to <b>+{cleanPhone}</b>. Enter it below to log in.
                  </div>
                </div>
              </div>

              <div style={{ padding: '22px 30px 26px' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#075E54', textTransform: 'uppercase', letterSpacing: 0.5 }}>6-digit code</label>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => e.key === 'Enter' && !busy && verify()}
                  placeholder="••••••"
                  inputMode="numeric"
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: '13px 15px', fontSize: 24, letterSpacing: 12, textAlign: 'center',
                    border: '1.5px solid #D1D7DB', borderRadius: 10, outline: 'none', fontVariantNumeric: 'tabular-nums' }}
                  onFocus={e => e.target.style.borderColor = '#25D366'}
                  onBlur={e => e.target.style.borderColor = '#D1D7DB'}
                />

                {error && <ErrorNote text={error} />}

                <button onClick={verify} disabled={busy}
                  style={{ width: '100%', marginTop: 18, padding: '13px', border: 'none', borderRadius: 10, cursor: busy ? 'default' : 'pointer',
                    background: busy ? '#9AD9B5' : '#25D366', color: '#fff', fontSize: 15, fontWeight: 700 }}>
                  {busy ? 'Checking…' : 'Verify and log in'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 13 }}>
                  <button onClick={() => { setStep('phone'); setError(''); }} style={{ background: 'none', border: 'none', color: '#54656F', cursor: 'pointer', padding: 0 }}>
                    ← Change number
                  </button>
                  <button onClick={requestOtp} disabled={resendIn > 0 || busy}
                    style={{ background: 'none', border: 'none', color: resendIn > 0 ? '#8696A0' : '#075E54', fontWeight: 600, cursor: resendIn > 0 ? 'default' : 'pointer', padding: 0 }}>
                    {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: '#8696A0', marginTop: 18, textAlign: 'center', maxWidth: 380, lineHeight: 1.5 }}>
          Testing tip: while OTP dev mode is on, the code prints in your backend terminal.
        </div>
      </div>
    </div>
  );
}

function ErrorNote({ text }) {
  return (
    <div style={{ marginTop: 12, background: '#FDECEC', color: '#B3261E', fontSize: 13, padding: '9px 12px', borderRadius: 8, lineHeight: 1.4 }}>
      {text}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// ORDER DASHBOARD — same board as before, now authenticated
// ═════════════════════════════════════════════════════════════
const STATUS = {
  pending:    { label: 'Pending',    color: '#B45309', bg: '#FEF3C7', dot: '#F59E0B', icon: Clock },
  processing: { label: 'Processing', color: '#1D4ED8', bg: '#DBEAFE', dot: '#3B82F6', icon: Loader },
  fulfilled:  { label: 'Fulfilled',  color: '#047857', bg: '#D1FAE5', dot: '#10B981', icon: CheckCircle2 },
};
const NEXT_STATUS = { pending: 'processing', processing: 'fulfilled', fulfilled: 'pending' };

const STATUS_REAL = {
  received:   { label: 'Received',   color: '#B45309', bg: '#FEF3C7', dot: '#F59E0B' },
  processing: { label: 'Processing', color: '#1D4ED8', bg: '#DBEAFE', dot: '#3B82F6' },
  fulfilled:  { label: 'Fulfilled',  color: '#047857', bg: '#D1FAE5', dot: '#10B981' },
  closed:     { label: 'Closed',     color: '#3B4A54', bg: '#E9EDEF', dot: '#8696A0' },
  cancelled:  { label: 'Cancelled',  color: '#B3261E', bg: '#FDECEC', dot: '#EF4444' },
};
const NEXT_REAL = { received: 'processing', processing: 'fulfilled', fulfilled: 'closed' };

function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

function OrderDashboard({ token, merchant, onLogout }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [chat, setChat] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null); // { kind, order_no, total }
  const [view, setView] = useState('orders'); // 'orders' | 'chats'
  const [realOrders, setRealOrders] = useState([]);
  const chatEndRef = useRef(null);
  const openIdRef = useRef(null);
  useEffect(() => { openIdRef.current = openId; }, [openId]);

  // Every API call carries the JWT; a 401 means the session ended.
  const authFetch = useCallback(async (url, opts = {}) => {
    const res = await fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { onLogout(); throw new Error('unauthorized'); }
    return res;
  }, [token, onLogout]);

  const open = orders.find(o => o.id === openId) || null;

  const loadOrders = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/orders`);
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      setOrders(await res.json());
      setError(null);
    } catch (e) {
      if (e.message !== 'unauthorized') setError('Cannot reach the server. Is the backend running on port 3000?');
    } finally { setLoading(false); }
  }, [authFetch]);

  const loadReal = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/orders/real`);
      if (res.ok) setRealOrders(await res.json());
    } catch (e) { /* handled by authFetch / offline banner */ }
  }, [authFetch]);

  const cycleRealStatus = async (id, current) => {
    const next = NEXT_REAL[current];
    if (!next) return; // closed/cancelled are terminal
    setRealOrders(prev => prev.map(o => o.id === id ? { ...o, status: next } : o));
    try {
      const res = await authFetch(`${API}/api/orders/real/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
    } catch (e) {
      if (e.message !== 'unauthorized') {
        setRealOrders(prev => prev.map(o => o.id === id ? { ...o, status: current } : o));
      }
    }
  };

  useEffect(() => {
    loadOrders();
    loadReal();
    const poll = setInterval(() => { loadOrders(); loadReal(); }, 15000); // fallback — socket is primary
    return () => clearInterval(poll);
  }, [loadOrders, loadReal]);

  // ── LIVE updates via Socket.IO ──
  useEffect(() => {
    const socket = io(API, { auth: { token } });

    socket.on('message:new', (m) => {
      loadOrders(); // refresh board ordering + latest message
      if (m.customer_id === openIdRef.current) {
        setChat(prev => {
          // replace our optimistic copy if this is its confirmation
          if (m.direction === 'outbound') {
            const i = [...prev].reverse().findIndex(x => String(x.id).startsWith('tmp-') && x.message_text === m.message_text);
            if (i !== -1) {
              const idx = prev.length - 1 - i;
              const copy = [...prev]; copy[idx] = m; return copy;
            }
          }
          return [...prev, m];
        });
      }
    });

    socket.on('order:new', (o) => {
      loadOrders();
      loadReal();
      setToast({ order_no: o.order_no, total: o.total_amount });
      setTimeout(() => setToast(null), 6000);
    });

    socket.on('order:status', () => loadOrders());
    socket.on('order:real_status', () => loadReal());
    socket.on('order:paid', (o) => {
      loadReal();
      setToast({ kind: 'paid', order_no: o.order_no, total: o.total_amount });
      setTimeout(() => setToast(null), 6000);
    });
    socket.on('connect_error', () => {/* fall back to polling silently */});

    return () => socket.disconnect();
  }, [token, loadOrders, loadReal]);

  useEffect(() => {
    if (!openId) return;
    authFetch(`${API}/api/chat/${openId}`)
      .then(r => r.json()).then(setChat).catch(() => setChat([]));
  }, [openId, authFetch]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.length, openId]);

  const counts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    fulfilled: orders.filter(o => o.status === 'fulfilled').length,
  };
  const visible = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const cycleStatus = async (id, current, e) => {
    e.stopPropagation();
    const next = NEXT_STATUS[current];
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: next } : o));
    try {
      const res = await authFetch(`${API}/api/orders/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
    } catch (e2) {
      if (e2.message !== 'unauthorized') {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status: current } : o));
      }
    }
  };

  const send = async () => {
    if (!reply.trim() || !open || sending) return;
    const text = reply;
    setReply(''); setSending(true);
    setChat(prev => [...prev, { id: `tmp-${Date.now()}`, direction: 'outbound', message_text: text, timestamp: new Date().toISOString() }]);
    try {
      const res = await authFetch(`${API}/api/chat/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: open.id, text }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        setChat(prev => [...prev, { id: `err-${Date.now()}`, direction: 'system',
          message_text: detail.details || 'Message could not be sent. The 24-hour reply window may have closed.', timestamp: new Date().toISOString() }]);
      }
    } catch (e2) {
      if (e2.message !== 'unauthorized') {
        setChat(prev => [...prev, { id: `err-${Date.now()}`, direction: 'system', message_text: 'Network error — message not sent.', timestamp: new Date().toISOString() }]);
      }
    } finally { setSending(false); }
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", height: '100vh', display: 'flex', flexDirection: 'column', background: '#F0F2F5', color: '#111B21' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .order-row:hover { background:#F5F6F6 !important; }
        .chip:hover { filter: brightness(0.97); }
        @media (max-width: 640px){ .chatpane{ width:100% !important; } }
      `}</style>

      {/* Top bar */}
      <header style={{ background: '#075E54', color: '#fff', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Package size={24} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.15 }}>Whatszorder</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{merchant?.business_name || 'Order Board'}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'rgba(255,255,255,0.12)', padding: '5px 12px', borderRadius: 20 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: error ? '#EF4444' : '#25D366', boxShadow: `0 0 0 3px ${error ? 'rgba(239,68,68,0.3)' : 'rgba(37,211,102,0.3)'}` }} />
            {error ? 'Offline' : 'Live'}
          </div>
          <button onClick={onLogout} title="Log out"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff',
              padding: '6px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer' }}>
            <LogOut size={14} /> Log out
          </button>
        </div>
      </header>

      {/* View switch: Orders | Chats */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 20px 0', background: '#fff', borderBottom: '1px solid #E9EDEF', flexShrink: 0 }}>
        {[['orders', '📦 Orders'], ['chats', '💬 Chats']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            style={{ border: 'none', cursor: 'pointer', padding: '9px 18px', fontSize: 13.5, fontWeight: 700,
              background: 'transparent', color: view === v ? '#075E54' : '#8696A0',
              borderBottom: view === v ? '2.5px solid #25D366' : '2.5px solid transparent' }}>
            {label}
          </button>
        ))}
      </div>

      {view === 'chats' && (<>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 20px', background: '#fff', borderBottom: '1px solid #E9EDEF', flexShrink: 0, overflowX: 'auto' }}>
        {['all', 'pending', 'processing', 'fulfilled'].map(f => {
          const active = filter === f;
          const c = f === 'all' ? { color: '#075E54', bg: '#D9F2EC', dot: '#075E54' } : STATUS[f];
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{ border: 'none', cursor: 'pointer', padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
                background: active ? c.bg : '#F0F2F5', color: active ? c.color : '#54656F',
                outline: active ? `1.5px solid ${c.dot}` : 'none' }}>
              {f === 'all' ? 'All Orders' : STATUS[f].label}
              <span style={{ background: active ? c.dot : '#8696A0', color: '#fff', borderRadius: 10, padding: '0 7px', fontSize: 11, minWidth: 18, textAlign: 'center' }}>{counts[f]}</span>
            </button>
          );
        })}
      </div>

      {/* Board */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ display: 'grid', gap: 10, maxWidth: 900, margin: '0 auto' }}>
          {loading && <div style={{ textAlign: 'center', color: '#8696A0', padding: 60 }}>Loading orders…</div>}
          {error && !loading && (
            <div style={{ textAlign: 'center', color: '#B45309', background: '#FEF3C7', borderRadius: 12, padding: 20, fontSize: 14 }}>{error}</div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div style={{ textAlign: 'center', color: '#8696A0', padding: '60px 20px', fontSize: 15 }}>
              No {filter !== 'all' ? STATUS[filter].label.toLowerCase() : ''} orders yet. New WhatsApp orders will appear here automatically.
            </div>
          )}
          {visible.map(o => {
            const s = STATUS[o.status] || STATUS.pending;
            const Icon = s.icon;
            return (
              <div key={o.id} className="order-row" onClick={() => setOpenId(o.id)}
                style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 2px rgba(11,20,26,0.06)', borderLeft: `4px solid ${s.dot}` }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#DFE5E7', display: 'grid', placeItems: 'center', color: '#075E54', fontWeight: 700, flexShrink: 0 }}>
                  {(o.name || '?').charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{o.name || 'Unknown'}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8696A0' }}>{timeAgo(o.latest_time)}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: '#3B4A54', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.latest_message || 'No messages yet'}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#8696A0', marginTop: 4 }}>+{o.whatsapp_id}</div>
                </div>
                <button className="chip" onClick={(e) => cycleStatus(o.id, o.status, e)} title="Tap to change status"
                  style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, background: s.bg, color: s.color,
                    padding: '7px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>
                  <Icon size={14} style={o.status === 'processing' ? { animation: 'spin 2s linear infinite' } : {}} />
                  {s.label}
                </button>
                <ChevronRight size={18} color="#C4CCD1" style={{ flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      </div>

      </>)}

      {view === 'orders' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ display: 'grid', gap: 10, maxWidth: 900, margin: '0 auto' }}>
            {realOrders.length === 0 && (
              <div style={{ textAlign: 'center', color: '#8696A0', padding: '60px 20px', fontSize: 15 }}>
                No orders yet. When a customer confirms a cart on WhatsApp, it appears here instantly.
              </div>
            )}
            {realOrders.map(o => {
              const s = STATUS_REAL[o.status] || STATUS_REAL.received;
              return (
                <div key={o.id} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px',
                  boxShadow: '0 1px 2px rgba(11,20,26,0.06)', borderLeft: `4px solid ${s.dot}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{o.order_no}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, padding: '3px 9px', borderRadius: 12,
                      background: o.payment_status === 'paid' ? '#D1FAE5' : '#FEF3C7',
                      color: o.payment_status === 'paid' ? '#047857' : '#B45309' }}>
                      {o.payment_status === 'paid' ? 'PAID' : 'UNPAID'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8696A0' }}>{timeAgo(o.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#54656F', marginTop: 3 }}>{o.customer_name} · +{o.whatsapp_id}</div>

                  <div style={{ marginTop: 10, borderTop: '1px solid #F0F2F5', paddingTop: 8 }}>
                    {(o.items || []).map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '3px 0', color: '#3B4A54' }}>
                        <span>{it.qty} × {it.name_snap}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>₹{Number(it.line_total).toFixed(0)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14, paddingTop: 8, marginTop: 4, borderTop: '1px solid #F0F2F5' }}>
                      <span>Total</span><span>₹{Number(o.total_amount).toFixed(0)}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <button className="chip" onClick={() => cycleRealStatus(o.id, o.status)} title="Tap to advance status"
                      style={{ border: 'none', cursor: NEXT_REAL[o.status] ? 'pointer' : 'default',
                        display: 'inline-flex', alignItems: 'center', gap: 6, background: s.bg, color: s.color,
                        padding: '7px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 700 }}>
                      {s.label}{NEXT_REAL[o.status] ? ' · tap to advance' : ''}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New-order toast */}
      {toast && (
        <div style={{ position: 'fixed', left: 20, bottom: 20, zIndex: 60, background: '#075E54', color: '#fff',
          borderRadius: 12, padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 11,
          boxShadow: '0 8px 24px rgba(11,20,26,0.35)' }}>
          <Bell size={18} color="#25D366" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{toast.kind === 'paid' ? `Payment received ${toast.order_no} 💰` : `New order ${toast.order_no} 🎉`}</div>
            <div style={{ fontSize: 12.5, opacity: 0.85 }}>Total ₹{Number(toast.total).toFixed(0)}</div>
          </div>
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div onClick={() => setOpenId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,20,26,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
          <div className="chatpane" onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', height: '100%', background: '#ECE5DD', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.2)' }}>
            <div style={{ background: '#075E54', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <button onClick={() => setOpenId(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={22} /></button>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#DFE5E7', display: 'grid', placeItems: 'center', color: '#075E54', fontWeight: 700 }}>{(open.name || '?').charAt(0)}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{open.name || 'Unknown'}</div>
                <div style={{ fontSize: 12, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={11} /> +{open.whatsapp_id}</div>
              </div>
              <button className="chip" onClick={(e) => cycleStatus(open.id, open.status, e)}
                style={{ marginLeft: 'auto', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700 }}>
                {(STATUS[open.status] || STATUS.pending).label} · tap
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {chat.map((m) => {
                if (m.direction === 'system') {
                  return <div key={m.id} style={{ alignSelf: 'center', background: '#FFF3CD', color: '#7A5B00', fontSize: 12.5, padding: '6px 12px', borderRadius: 8, textAlign: 'center', maxWidth: '85%' }}>{m.message_text}</div>;
                }
                return (
                  <div key={m.id} style={{ alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start', maxWidth: '78%',
                    background: m.direction === 'outbound' ? '#DCF8C6' : '#fff', padding: '8px 11px', borderRadius: 8,
                    whiteSpace: 'pre-wrap', boxShadow: '0 1px 1px rgba(11,20,26,0.1)', fontSize: 14, lineHeight: 1.4 }}>
                    {m.message_text}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: '10px 12px', background: '#F0F2F5', display: 'flex', gap: 8, flexShrink: 0 }}>
              <input value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Type a reply…"
                style={{ flex: 1, border: 'none', borderRadius: 20, padding: '10px 16px', fontSize: 14, outline: 'none' }} />
              <button onClick={send} disabled={sending} style={{ border: 'none', cursor: sending ? 'default' : 'pointer', width: 44, height: 44, borderRadius: '50%', background: sending ? '#9AD9B5' : '#25D366', color: '#fff', display: 'grid', placeItems: 'center' }}>
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
