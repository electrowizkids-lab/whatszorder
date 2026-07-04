import { useState, useEffect, useRef } from 'react';
import { Search, Send, Package, Clock, Loader, CheckCircle2, X, Phone, ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// WhatsApp-familiar palette
//   Header teal:      #075E54
//   Accent green:     #25D366
//   Chat bg:          #ECE5DD  (the classic WhatsApp wallpaper tone)
//   Outbound bubble:  #DCF8C6
// Status colors chosen to read at a glance:
//   pending  = amber   processing = blue   fulfilled = green
// ─────────────────────────────────────────────────────────────

const STATUS = {
  pending:    { label: 'Pending',    color: '#B45309', bg: '#FEF3C7', dot: '#F59E0B', icon: Clock },
  processing: { label: 'Processing', color: '#1D4ED8', bg: '#DBEAFE', dot: '#3B82F6', icon: Loader },
  fulfilled:  { label: 'Fulfilled',  color: '#047857', bg: '#D1FAE5', dot: '#10B981', icon: CheckCircle2 },
};
const NEXT_STATUS = { pending: 'processing', processing: 'fulfilled', fulfilled: 'pending' };

// ── Mock data (stands in for /api/orders until real extraction is wired) ──
const seedOrders = [
  { id: 1, name: 'Rahul Traders',      phone: '919876543210', items: '50 kg Basmati Rice, 20 L Mustard Oil', amount: 8400, status: 'pending',    time: '2 min ago',  unread: 2,
    chat: [ {dir:'in', t:'Bhai 50 kg basmati rice chahiye'}, {dir:'in', t:'Aur 20 litre sarson ka tel'}, {dir:'out', t:'Ji, note kar liya. Total ₹8400 hoga.'} ] },
  { id: 2, name: 'Shri Ganesh Ji',     phone: '918882614689', items: '100 Coffee Cups, 5 kg Sugar',          amount: 2300, status: 'processing', time: '18 min ago', unread: 0,
    chat: [ {dir:'in', t:'I want to order 100 coffee cups'}, {dir:'in', t:'and 5 kg sugar'}, {dir:'out', t:'Your order has been received and we are working on it. 🙏'} ] },
  { id: 3, name: 'Meena General Store', phone: '919812345678', items: '12 Parle-G cartons, 6 Maggi boxes',    amount: 4150, status: 'pending',    time: '25 min ago', unread: 1,
    chat: [ {dir:'in', t:'12 carton parle-g bhej do'}, {dir:'in', t:'6 box maggi bhi'} ] },
  { id: 4, name: 'Anil Kirana',         phone: '919933221100', items: '2 Gas Cylinders',                     amount: 2200, status: 'fulfilled',  time: '1 hr ago',   unread: 0,
    chat: [ {dir:'in', t:'2 cylinder chahiye urgent'}, {dir:'out', t:'Bhej diya hai, 20 min me pahunch jayega'}, {dir:'in', t:'Thank you 🙏'} ] },
  { id: 5, name: 'Suresh Sweets',       phone: '919090909090', items: '10 kg Khoya, 5 kg Cashew',            amount: 6800, status: 'fulfilled',  time: '2 hr ago',   unread: 0,
    chat: [ {dir:'in', t:'10 kg khoya aur 5 kg kaju'}, {dir:'out', t:'Order fulfill kar diya hai ✅'} ] },
];

export default function OrderDashboard() {
  const [orders, setOrders] = useState(seedOrders);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [reply, setReply] = useState('');
  const [flash, setFlash] = useState(null); // id of newly-arrived order for pulse animation
  const chatEndRef = useRef(null);

  const open = orders.find(o => o.id === openId) || null;

  // ── Live-update simulation: a new order "arrives" after 6s ──
  useEffect(() => {
    const timer = setTimeout(() => {
      const incoming = { id: 99, name: 'Deepak Provisions', phone: '917788990011',
        items: '30 kg Atta, 10 kg Dal', amount: 3900, status: 'pending', time: 'just now', unread: 1,
        chat: [ {dir:'in', t:'30 kg atta aur 10 kg dal chahiye kal subah tak'} ] };
      setOrders(prev => prev.some(o => o.id === 99) ? prev : [incoming, ...prev]);
      setFlash(99);
      setTimeout(() => setFlash(null), 2200);
    }, 6000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [open?.chat?.length, openId]);

  const counts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    fulfilled: orders.filter(o => o.status === 'fulfilled').length,
  };

  const visible = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const cycleStatus = (id, e) => {
    e.stopPropagation();
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: NEXT_STATUS[o.status] } : o));
  };

  const openChat = (id) => {
    setOpenId(id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, unread: 0 } : o));
  };

  const send = () => {
    if (!reply.trim() || !open) return;
    setOrders(prev => prev.map(o => o.id === open.id
      ? { ...o, chat: [...o.chat, { dir: 'out', t: reply }] } : o));
    setReply('');
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", height: '100vh', display: 'flex', flexDirection: 'column', background: '#F0F2F5', color: '#111B21' }}>
      <style>{`
        @keyframes pulseIn { 0%{background:#DCF8C6;} 100%{background:#fff;} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .order-row:hover { background:#F5F6F6 !important; }
        .chip:hover { filter: brightness(0.97); }
        @media (max-width: 640px){ .chatpane{ width:100% !important; } }
      `}</style>

      {/* ── Top bar (WhatsApp teal) ── */}
      <header style={{ background: '#075E54', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Package size={24} />
        <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: 0.2 }}>Whatszorder</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginLeft: 4 }}>Order Board</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'rgba(255,255,255,0.12)', padding: '5px 12px', borderRadius: 20 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#25D366', boxShadow: '0 0 0 3px rgba(37,211,102,0.3)' }} />
          Live
        </div>
      </header>

      {/* ── Filter tabs ── */}
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

      {/* ── Order board ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ display: 'grid', gap: 10, maxWidth: 900, margin: '0 auto' }}>
          {visible.length === 0 && (
            <div style={{ textAlign: 'center', color: '#8696A0', padding: '60px 20px', fontSize: 15 }}>
              No {filter !== 'all' ? STATUS[filter].label.toLowerCase() : ''} orders right now.
            </div>
          )}
          {visible.map(o => {
            const s = STATUS[o.status];
            const Icon = s.icon;
            return (
              <div key={o.id} className="order-row" onClick={() => openChat(o.id)}
                style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 2px rgba(11,20,26,0.06)',
                  borderLeft: `4px solid ${s.dot}`,
                  animation: flash === o.id ? 'pulseIn 2.2s ease-out' : 'none' }}>
                {/* avatar */}
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#DFE5E7', display: 'grid', placeItems: 'center', color: '#075E54', fontWeight: 700, flexShrink: 0 }}>
                  {o.name.charAt(0)}
                </div>
                {/* body */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{o.name}</span>
                    {o.unread > 0 && <span style={{ background: '#25D366', color: '#fff', borderRadius: 10, fontSize: 11, padding: '0 6px', fontWeight: 700 }}>{o.unread} new</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8696A0' }}>{o.time}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: '#3B4A54', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.items}</div>
                  <div style={{ fontSize: 13, color: '#075E54', fontWeight: 700, marginTop: 4 }}>₹{o.amount.toLocaleString('en-IN')}</div>
                </div>
                {/* status chip — tap to advance */}
                <button className="chip" onClick={(e) => cycleStatus(o.id, e)} title="Tap to change status"
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

      {/* ── Slide-in chat panel ── */}
      {open && (
        <div onClick={() => setOpenId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,20,26,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
          <div className="chatpane" onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', height: '100%', background: '#ECE5DD', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.2)' }}>
            {/* chat header */}
            <div style={{ background: '#075E54', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <button onClick={() => setOpenId(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={22} /></button>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#DFE5E7', display: 'grid', placeItems: 'center', color: '#075E54', fontWeight: 700 }}>{open.name.charAt(0)}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{open.name}</div>
                <div style={{ fontSize: 12, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={11} /> +{open.phone}</div>
              </div>
            </div>
            {/* order summary strip */}
            <div style={{ background: '#F7F8FA', padding: '10px 16px', borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: '#8696A0', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Order</div>
              <div style={{ fontSize: 14, color: '#111B21', margin: '2px 0' }}>{open.items}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#075E54' }}>₹{open.amount.toLocaleString('en-IN')}</span>
                <button className="chip" onClick={(e) => cycleStatus(open.id, e)}
                  style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, background: STATUS[open.status].bg, color: STATUS[open.status].color, padding: '4px 10px', borderRadius: 16, fontSize: 12, fontWeight: 700, marginLeft: 'auto' }}>
                  {STATUS[open.status].label} · tap to advance
                </button>
              </div>
            </div>
            {/* messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {open.chat.map((m, i) => (
                <div key={i} style={{ alignSelf: m.dir === 'out' ? 'flex-end' : 'flex-start', maxWidth: '78%',
                  background: m.dir === 'out' ? '#DCF8C6' : '#fff', padding: '8px 11px', borderRadius: 8,
                  boxShadow: '0 1px 1px rgba(11,20,26,0.1)', fontSize: 14, lineHeight: 1.4 }}>
                  {m.t}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            {/* input */}
            <div style={{ padding: '10px 12px', background: '#F0F2F5', display: 'flex', gap: 8, flexShrink: 0 }}>
              <input value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Type a reply…"
                style={{ flex: 1, border: 'none', borderRadius: 20, padding: '10px 16px', fontSize: 14, outline: 'none' }} />
              <button onClick={send} style={{ border: 'none', cursor: 'pointer', width: 44, height: 44, borderRadius: '50%', background: '#25D366', color: '#fff', display: 'grid', placeItems: 'center' }}>
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
