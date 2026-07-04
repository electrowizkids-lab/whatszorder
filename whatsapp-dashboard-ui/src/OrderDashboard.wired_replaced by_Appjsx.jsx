import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Send, Package, Clock, Loader, CheckCircle2, X, Phone, ChevronRight } from 'lucide-react';

// ─── Point this at your backend. For production, use an env var instead. ───
const API = 'http://localhost:3000';

const STATUS = {
  pending:    { label: 'Pending',    color: '#B45309', bg: '#FEF3C7', dot: '#F59E0B', icon: Clock },
  processing: { label: 'Processing', color: '#1D4ED8', bg: '#DBEAFE', dot: '#3B82F6', icon: Loader },
  fulfilled:  { label: 'Fulfilled',  color: '#047857', bg: '#D1FAE5', dot: '#10B981', icon: CheckCircle2 },
};
const NEXT_STATUS = { pending: 'processing', processing: 'fulfilled', fulfilled: 'pending' };

// Rough "time ago" from a timestamp string.
function timeAgo(ts) {
  if (!ts) return '';
  const then = new Date(ts).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

export default function OrderDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [chat, setChat] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);
  const prevIdsRef = useRef(new Set());

  const open = orders.find(o => o.id === openId) || null;

  // ── Fetch orders (called on mount + every 5s poll) ──
  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/orders`);
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setOrders(data);
      setError(null);
    } catch (e) {
      setError('Cannot reach the server. Is the backend running on port 3000?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const poll = setInterval(loadOrders, 5000); // live-ish updates
    return () => clearInterval(poll);
  }, [loadOrders]);

  // ── Load chat history when an order is opened ──
  useEffect(() => {
    if (!openId) return;
    fetch(`${API}/api/chat/${openId}`)
      .then(r => r.json())
      .then(setChat)
      .catch(() => setChat([]));
  }, [openId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.length, openId]);

  const counts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    fulfilled: orders.filter(o => o.status === 'fulfilled').length,
  };
  const visible = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  // ── Advance status: optimistic UI + PATCH to server ──
  const cycleStatus = async (id, current, e) => {
    e.stopPropagation();
    const next = NEXT_STATUS[current];
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: next } : o)); // optimistic
    try {
      const res = await fetch(`${API}/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: current } : o)); // revert on failure
    }
  };

  const openChat = (id) => setOpenId(id);

  // ── Send a reply through the real endpoint ──
  const send = async () => {
    if (!reply.trim() || !open || sending) return;
    const text = reply;
    setReply('');
    setSending(true);
    setChat(prev => [...prev, { id: `tmp-${Date.now()}`, direction: 'outbound', message_text: text, timestamp: new Date().toISOString() }]);
    try {
      const res = await fetch(`${API}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: open.id, text }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        setChat(prev => [...prev, { id: `err-${Date.now()}`, direction: 'system',
          message_text: detail.details || 'Message could not be sent. The 24-hour reply window may have closed.', timestamp: new Date().toISOString() }]);
      }
    } catch {
      setChat(prev => [...prev, { id: `err-${Date.now()}`, direction: 'system', message_text: 'Network error — message not sent.', timestamp: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
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
      <header style={{ background: '#075E54', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Package size={24} />
        <div style={{ fontWeight: 700, fontSize: 18 }}>Whatszorder</div>
        <div style={{ fontSize: 13, opacity: 0.8 }}>Order Board</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'rgba(255,255,255,0.12)', padding: '5px 12px', borderRadius: 20 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: error ? '#EF4444' : '#25D366', boxShadow: `0 0 0 3px ${error ? 'rgba(239,68,68,0.3)' : 'rgba(37,211,102,0.3)'}` }} />
          {error ? 'Offline' : 'Live'}
        </div>
      </header>

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
            <div style={{ textAlign: 'center', color: '#B45309', background: '#FEF3C7', borderRadius: 12, padding: '20px', fontSize: 14 }}>
              {error}
            </div>
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
              <div key={o.id} className="order-row" onClick={() => openChat(o.id)}
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {chat.map((m) => {
                if (m.direction === 'system') {
                  return <div key={m.id} style={{ alignSelf: 'center', background: '#FFF3CD', color: '#7A5B00', fontSize: 12.5, padding: '6px 12px', borderRadius: 8, textAlign: 'center', maxWidth: '85%' }}>{m.message_text}</div>;
                }
                return (
                  <div key={m.id} style={{ alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start', maxWidth: '78%',
                    background: m.direction === 'outbound' ? '#DCF8C6' : '#fff', padding: '8px 11px', borderRadius: 8,
                    boxShadow: '0 1px 1px rgba(11,20,26,0.1)', fontSize: 14, lineHeight: 1.4 }}>
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
