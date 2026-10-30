import { useState } from "react";

/* ─── Global Styles ──────────────────────────────────────────────────────── */
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
    *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
    :root {
      --bg:#0a0d14; --sf:#111520; --s2:#171c2e; --s3:#1d2235;
      --bd:rgba(255,255,255,.07); --bd2:rgba(255,255,255,.13);
      --gold:#c9a84c; --gl:#e8c97a; --gd:rgba(201,168,76,.15);
      --tx:#e8eaf0; --mu:#6b7280; --mu2:#9ca3af;
      --green:#22c55e; --red:#ef4444; --blue:#3b82f6;
      --purple:#a855f7; --orange:#f97316; --teal:#14b8a6;
      --fd:'Cormorant Garamond',serif; --fb:'DM Sans',sans-serif; --fm:'DM Mono',monospace;
    }
    * { font-family:var(--fb); color:var(--tx); }
    body { background:var(--bg); }
    input { font-family:var(--fb); }
    ::-webkit-scrollbar { width:4px; }
    ::-webkit-scrollbar-track { background:var(--sf); }
    ::-webkit-scrollbar-thumb { background:var(--gd); border-radius:4px; }
    @keyframes fadeUp  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
    @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
    @keyframes scaleIn { from{opacity:0;transform:scale(.93)} to{opacity:1;transform:scale(1)} }
    @keyframes pulseG  { 0%{box-shadow:0 0 0 0 rgba(201,168,76,.5)} 70%{box-shadow:0 0 0 14px rgba(201,168,76,0)} 100%{box-shadow:0 0 0 0 rgba(201,168,76,0)} }
    @keyframes popIn   { 0%{transform:scale(0)} 70%{transform:scale(1.15)} 100%{transform:scale(1)} }
    @keyframes spin    { to{transform:rotate(360deg)} }
    .au  { animation:fadeUp  .45s ease both }
    .ai  { animation:fadeIn  .35s ease both }
    .asi { animation:scaleIn .32s ease both }
  `}</style>
);

/* ─── Bank & Society Config ─────────────────────────────────────────────── */
const SOCIETY = "Maple Apartment";
const BANK = {
  name: "State Bank of India",
  branch: "Andheri West Branch, Mumbai",
  accountName: "Maple Apartment Society",
  accountNo: "00112345678901",
  ifsc: "SBIN0001234",
  accountType: "Current Account",
  micr: "400002001",
};
const ADMIN_EMAIL = "admin@mapleapartment.in";
const WA_ADMIN = "919876543210";

/* ─── Users ──────────────────────────────────────────────────────────────── */
const USERS = [
  { id: 1, username: "flat101", password: "pass101", name: "Sanjay Singh", flat: "101", email: "sanjayk.singh7797@gmail.com", phone: "7738997797", avatar: "SS" },
  { id: 1, username: "flat101", password: "pass101", name: "Sanjay Singh", flat: "101", email: "sanjayk.singh7797@gmail.com", phone: "7738997797", avatar: "AP" },
  { id: 2, username: "flat202", password: "pass202", name: "Priya Patel", flat: "202", wing: "B", email: "priya.patel@email.com", phone: "919876543002", avatar: "PP" },
  { id: 3, username: "flat303", password: "pass303", name: "Arun Kumar", flat: "303", wing: "A", email: "arun.kumar@email.com", phone: "919876543003", avatar: "AK" },
  { id: 4, username: "admin", password: "admin123", name: "Admin", flat: "—", wing: "—", email: ADMIN_EMAIL, phone: WA_ADMIN, avatar: "AD", isAdmin: true },
];

const mkBills = (flat, wing) => [
  { id: `${flat}-m`, type: "Maintenance", icon: "⚙️", clr: "var(--blue)", amount: 3500, due: "31 Mar 2026", status: "unpaid", desc: "Monthly society maintenance charges" },
  { id: `${flat}-p`, type: "Property Tax", icon: "🏛️", clr: "var(--purple)", amount: 8800, due: "15 Apr 2026", status: "unpaid", desc: "Quarterly municipal property tax" },
  { id: `${flat}-pk`, type: "Parking", icon: "🚗", clr: "var(--orange)", amount: 800, due: "31 Mar 2026", status: "unpaid", desc: `Covered parking slot ${wing}-14` },
  {
    id: `${flat}-l`, type: "Lift Loading", icon: "🛗", clr: "var(--teal)", amount: 400, due: "31 Mar 2026", status: "paid",
    paidOn: "10 Mar 2026 · 02:45 PM", refNo: "SBIN325874291043", mode: "NEFT", desc: "Lift usage & goods-loading charges"
  },
];

const BILLS_INIT = {
  flat101: mkBills("101", "A"),
  flat202: mkBills("202", "B"),
  flat303: mkBills("303", "A"),
  admin: [],
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const fmt = n => `₹${Number(n).toLocaleString("en-IN")}`;
const nowStr = () => {
  const d = new Date();
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    + " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

/* ─── Atoms ──────────────────────────────────────────────────────────────── */
const Chip = ({ color, children }) => (
  <span style={{ padding: "3px 11px", borderRadius: 20, background: `${color}20`, color, fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{children}</span>
);

const Btn = ({ onClick, disabled, v = "gold", children, full, s = {} }) => {
  const map = {
    gold: { background: "linear-gradient(135deg,#c9a84c,#a07728)", color: "#0a0d14", border: "none" },
    ghost: { background: "transparent", color: "var(--mu)", border: "1px solid var(--bd)" },
    green: { background: "rgba(34,197,94,.1)", color: "var(--green)", border: "1px solid rgba(34,197,94,.25)" },
    red: { background: "rgba(239,68,68,.08)", color: "var(--red)", border: "1px solid rgba(239,68,68,.2)" },
    bank: { background: "rgba(59,130,246,.1)", color: "var(--blue)", border: "1px solid rgba(59,130,246,.25)" },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: "10px 20px", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? .5 : 1, transition: "all .2s", letterSpacing: ".02em", width: full ? "100%" : "auto", ...map[v], ...s
      }}>
      {children}
    </button>
  );
};

const Field = ({ label, value, copyable }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 10, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>{label}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "var(--s2)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--bd)" }}>
        <p style={{ fontFamily: "var(--fm)", fontSize: 14, color: "var(--tx)", letterSpacing: ".03em", wordBreak: "break-all" }}>{value}</p>
        {copyable && (
          <button onClick={copy}
            style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 7, border: "1px solid var(--bd)", background: copied ? "rgba(34,197,94,.15)" : "transparent", color: copied ? "var(--green)" : "var(--mu)", fontSize: 11, cursor: "pointer", fontWeight: 600, transition: "all .2s", whiteSpace: "nowrap" }}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
};

const Inp = ({ label, value, onChange, type = "text", placeholder, mono, onKeyDown }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <label style={{ display: "block", fontSize: 11, color: "var(--mu)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</label>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown}
      style={{ width: "100%", background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 10, padding: "11px 14px", fontSize: 13, outline: "none", fontFamily: mono ? "var(--fm)" : "var(--fb)", color: "var(--tx)" }}
      onFocus={e => e.target.style.borderColor = "var(--gold)"}
      onBlur={e => e.target.style.borderColor = "var(--bd)"} />
  </div>
);

const Modal = ({ onClose, children, wide }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn .25s ease" }}>
    <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: wide ? 660 : 500, background: "var(--sf)", border: "1px solid var(--bd2)", borderRadius: 22, overflow: "hidden", maxHeight: "92vh", overflowY: "auto", animation: "scaleIn .3s ease" }}>
      {children}
    </div>
  </div>
);

const MHead = ({ title, sub, onClose }) => (
  <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <div>
      <p style={{ fontSize: 11, color: "var(--gold)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 3 }}>{sub}</p>
      <h3 style={{ fontFamily: "var(--fd)", fontSize: 22, fontWeight: 600 }}>{title}</h3>
    </div>
    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--bd)", background: "var(--s2)", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mu)" }}>×</button>
  </div>
);

/* ─── Bank Transfer Modal ────────────────────────────────────────────────── */
function BankTransferModal({ bill, user, onClose, onSuccess }) {
  const [step, setStep] = useState("details");   // details | confirm | verifying | done
  const [mode, setMode] = useState("NEFT");       // NEFT | RTGS | IMPS
  const [refNo, setRefNo] = useState("");
  const [date, setDate] = useState("");
  const [remark, setRemark] = useState(`Flat ${user.flat} Wing ${user.wing} - ${bill.type} - ${SOCIETY}`);
  const [busy, setBusy] = useState(false);

  const transferModes = [
    { id: "NEFT", label: "NEFT", sub: "2–4 hrs · Any time", icon: "🏦" },
    { id: "RTGS", label: "RTGS", sub: "Instant · Min ₹2 Lakh", icon: "⚡" },
    { id: "IMPS", label: "IMPS", sub: "Instant · 24×7", icon: "🚀" },
  ];

  const submit = () => {
    if (!refNo.trim() || !date) return;
    setBusy(true);
    setTimeout(() => { setStep("done"); onSuccess(bill.id, refNo.trim(), mode, date); }, 1400);
  };

  /* Step 1 – Bank details + choose mode */
  if (step === "details") return (
    <Modal onClose={onClose} wide>
      <MHead title={`Pay ${bill.type}`} sub={`🏦 Bank Transfer · ${fmt(bill.amount)}`} onClose={onClose} />
      <div style={{ padding: 24 }} className="ai">

        {/* Amount banner */}
        <div style={{ background: "linear-gradient(135deg,rgba(201,168,76,.12),rgba(201,168,76,.05))", border: "1px solid rgba(201,168,76,.25)", borderRadius: 14, padding: "16px 20px", marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Amount to Transfer</p>
            <p style={{ fontFamily: "var(--fm)", fontSize: 28, color: "var(--gl)", fontWeight: 500 }}>{fmt(bill.amount)}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 11, color: "var(--mu)" }}>Due Date</p>
            <p style={{ fontSize: 13, color: "var(--mu2)", marginTop: 3 }}>{bill.due}</p>
          </div>
        </div>

        {/* Choose transfer mode */}
        <p style={{ fontSize: 11, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Select Transfer Mode</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 22 }}>
          {transferModes.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{
                padding: "13px 10px", borderRadius: 12, border: `1px solid ${mode === m.id ? "var(--gold)" : "var(--bd)"}`,
                background: mode === m.id ? "var(--gd)" : "var(--s2)", cursor: "pointer", textAlign: "center", transition: "all .2s"
              }}
              onMouseEnter={e => { if (mode !== m.id) { e.currentTarget.style.borderColor = "rgba(201,168,76,.4)" } }}
              onMouseLeave={e => { if (mode !== m.id) { e.currentTarget.style.borderColor = "var(--bd)" } }}>
              <div style={{ fontSize: 20, marginBottom: 5 }}>{m.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: mode === m.id ? "var(--gold)" : "var(--tx)" }}>{m.label}</div>
              <div style={{ fontSize: 10, color: "var(--mu)", marginTop: 3, lineHeight: 1.3 }}>{m.sub}</div>
            </button>
          ))}
        </div>

        {/* Bank details */}
        <p style={{ fontSize: 11, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Society Bank Account Details</p>
        <div style={{ background: "var(--s2)", border: "1px solid var(--bd2)", borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>

          {/* Bank name header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--bd)" }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏛️</div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600 }}>{BANK.name}</p>
              <p style={{ fontSize: 12, color: "var(--mu)", marginTop: 2 }}>{BANK.branch}</p>
            </div>
          </div>

          <Field label="Account Name" value={BANK.accountName} copyable />
          <Field label="Account Number" value={BANK.accountNo} copyable />
          <Field label="IFSC Code" value={BANK.ifsc} copyable />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Account Type" value={BANK.accountType} />
            <Field label="MICR Code" value={BANK.micr} copyable />
          </div>

          <div style={{ marginTop: 6, padding: "10px 14px", background: "rgba(201,168,76,.07)", border: "1px solid rgba(201,168,76,.15)", borderRadius: 10 }}>
            <p style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, marginBottom: 3 }}>📝 Remarks / Narration (copy this)</p>
            <p style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--mu2)", lineHeight: 1.5 }}>{remark}</p>
            <button onClick={() => { navigator.clipboard?.writeText(remark) }}
              style={{ marginTop: 8, padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(201,168,76,.25)", background: "var(--gd)", color: "var(--gold)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              Copy Remarks
            </button>
          </div>
        </div>

        <div style={{ padding: "10px 14px", background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.15)", borderRadius: 10, marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: "#93c5fd", lineHeight: 1.6 }}>
            ℹ️ Transfer the exact amount using your bank's net banking, mobile banking app, or visit the branch. After transfer, click <strong>Next</strong> to submit your transaction reference number.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Btn v="ghost" onClick={onClose} s={{ flex: 1 }}>Cancel</Btn>
          <Btn onClick={() => setStep("confirm")} s={{ flex: 2 }}>I Have Transferred → Next</Btn>
        </div>
      </div>
    </Modal>
  );

  /* Step 2 – Enter reference number */
  if (step === "confirm") return (
    <Modal onClose={onClose}>
      <MHead title="Confirm Transfer" sub={`${mode} · ${fmt(bill.amount)}`} onClose={onClose} />
      <div style={{ padding: 24 }} className="ai">

        <div style={{ background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 14, padding: "14px 18px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--bd)" }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--mu)" }}>Bill</p>
              <p style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{bill.icon} {bill.type}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 11, color: "var(--mu)" }}>Amount</p>
              <p style={{ fontFamily: "var(--fm)", fontSize: 18, color: "var(--gold)", marginTop: 2 }}>{fmt(bill.amount)}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: 10, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".06em" }}>To Account</p>
              <p style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--mu2)", marginTop: 3 }}>{BANK.accountNo}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".06em" }}>IFSC</p>
              <p style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--mu2)", marginTop: 3 }}>{BANK.ifsc}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".06em" }}>Mode</p>
              <p style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--gold)", marginTop: 3 }}>{mode}</p>
            </div>
          </div>
        </div>

        <Inp
          label="Transaction Reference / UTR Number"
          value={refNo}
          onChange={e => setRefNo(e.target.value)}
          placeholder={mode === "NEFT" ? "e.g. SBIN325874291043" : mode === "RTGS" ? "e.g. RTGS2024031900001234" : "e.g. 425612789631"}
          mono
          onKeyDown={e => e.key === "Enter" && submit()}
        />

        <Inp
          label="Date of Transfer"
          value={date}
          onChange={e => setDate(e.target.value)}
          type="date"
        />

        <div style={{ padding: "10px 14px", background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.15)", borderRadius: 10, marginBottom: 18 }}>
          <p style={{ fontSize: 11, color: "#93c5fd", lineHeight: 1.6 }}>
            📋 Find your <strong>UTR / Reference Number</strong> in your bank's transaction history, SMS alert, or email confirmation after the transfer.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Btn v="ghost" onClick={() => setStep("details")} s={{ flex: 1 }}>← Back</Btn>
          <Btn onClick={submit} disabled={!refNo.trim() || !date || busy} s={{ flex: 2 }}>
            {busy ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ width: 14, height: 14, border: "2px solid #0a0d14", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }} />
                Verifying…
              </span>
            ) : "Submit & Confirm ✓"}
          </Btn>
        </div>
      </div>
    </Modal>
  );

  return null;
}

/* ─── Success Modal ──────────────────────────────────────────────────────── */
function SuccessModal({ bill, user, onClose }) {
  const [mode, setMode] = useState(null);
  if (mode === "email") return <EmailModal bill={bill} user={user} onClose={() => setMode(null)} />;
  if (mode === "wa") return <WAModal bill={bill} user={user} onClose={() => setMode(null)} />;

  const ABtn = ({ emoji, label, sub, onClick, color }) => (
    <button onClick={onClick} style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1px solid ${color}30`, background: `${color}10`, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left", transition: "all .2s", marginBottom: 10 }}
      onMouseEnter={e => e.currentTarget.style.background = `${color}1e`}
      onMouseLeave={e => e.currentTarget.style.background = `${color}10`}>
      <span style={{ fontSize: 24 }}>{emoji}</span>
      <div>
        <p style={{ fontWeight: 600, fontSize: 14, color }}>{label}</p>
        <p style={{ fontSize: 11, color: "var(--mu)", marginTop: 2 }}>{sub}</p>
      </div>
    </button>
  );

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: "36px 28px", textAlign: "center", animation: "fadeUp .4s ease" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(34,197,94,.1)", border: "2px solid rgba(34,197,94,.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 36, animation: "popIn .5s ease" }}>✅</div>
        <h2 style={{ fontFamily: "var(--fd)", fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Transfer Confirmed!</h2>
        <p style={{ color: "var(--mu)", fontSize: 13, marginBottom: 4 }}>{bill.type} · Flat {user.flat} Wing {user.wing}</p>
        <p style={{ fontFamily: "var(--fm)", fontSize: 26, color: "var(--gold)", marginBottom: 4 }}>{fmt(bill.amount)}</p>
        <div style={{ display: "inline-flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginBottom: 8 }}>
          <Chip color="var(--blue)">{bill.mode}</Chip>
          <Chip color="var(--green)">Submitted</Chip>
        </div>
        <p style={{ fontSize: 12, color: "var(--mu)", marginBottom: 4 }}>Ref: <span style={{ fontFamily: "var(--fm)", color: "var(--mu2)" }}>{bill.refNo}</span></p>
        <p style={{ fontSize: 11, color: "var(--mu)", marginBottom: 28 }}>{bill.paidOn}</p>

        <p style={{ fontSize: 11, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 16 }}>Share confirmation</p>
        <ABtn emoji="📧" label="Email Receipt" sub={`Send to ${user.email}`} onClick={() => setMode("email")} color="#c9a84c" />
        <ABtn emoji="💬" label="WhatsApp Notification" sub="Notify admin or yourself" onClick={() => setMode("wa")} color="#25d366" />
        <Btn v="ghost" onClick={onClose} full s={{ marginTop: 4 }}>Back to Dashboard</Btn>
      </div>
    </Modal>
  );
}

/* ─── Email Receipt Modal ────────────────────────────────────────────────── */
function EmailModal({ bill, user, onClose }) {
  const [email, setEmail] = useState(user.email);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const receipt = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `  ${SOCIETY}`,
    "  BANK TRANSFER RECEIPT",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `  Bill Type   : ${bill.type}`,
    `  Resident    : ${user.name}`,
    `  Flat        : ${user.flat} · Wing ${user.wing}`,
    `  Amount      : ${fmt(bill.amount)}`,
    `  Transfer Mode: ${bill.mode || "NEFT"}`,
    `  Ref / UTR   : ${bill.refNo || "N/A"}`,
    `  Date        : ${bill.paidOn || "—"}`,
    `  Status      : ✅ SUBMITTED`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `  Bank  : ${BANK.name}`,
    `  A/C   : ${BANK.accountNo}`,
    `  IFSC  : ${BANK.ifsc}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "  Thank you for your payment!",
    `  Queries: ${ADMIN_EMAIL}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");

  const send = () => { setBusy(true); setTimeout(() => setSent(true), 1400); };

  return (
    <Modal onClose={onClose} wide>
      <MHead title="Email Receipt" sub="📧 Send Payment Proof" onClose={onClose} />
      <div style={{ padding: 24 }}>
        {sent ? (
          <div style={{ textAlign: "center", padding: "28px 0", animation: "fadeUp .4s ease" }}>
            <div style={{ fontSize: 54, marginBottom: 14 }}>📨</div>
            <h3 style={{ fontFamily: "var(--fd)", fontSize: 24, marginBottom: 8 }}>Receipt Sent!</h3>
            <p style={{ color: "var(--mu)", fontSize: 13, marginBottom: 6 }}>Payment receipt delivered to</p>
            <p style={{ color: "var(--gold)", fontFamily: "var(--fm)", fontSize: 14, marginBottom: 24 }}>{email}</p>
            <Btn onClick={onClose}>Done ✓</Btn>
          </div>
        ) : (
          <>
            <div style={{ background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 20px", marginBottom: 20, fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--mu2)", whiteSpace: "pre", lineHeight: 1.9, overflowX: "auto" }}>{receipt}</div>
            <Inp label="Send To (Email Address)" value={email} onChange={e => setEmail(e.target.value)} placeholder="resident@email.com" />
            <div style={{ display: "flex", gap: 10 }}>
              <Btn v="ghost" onClick={onClose} s={{ flex: 1 }}>Cancel</Btn>
              <Btn onClick={send} disabled={!email || busy} s={{ flex: 2 }}>{busy ? "Sending…" : "📧 Send Receipt →"}</Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ─── WhatsApp Modal ─────────────────────────────────────────────────────── */
function WAModal({ bill, user, onClose }) {
  const adminMsg = `🏢 *${SOCIETY}*\n✅ *Bank Transfer Received*\n\nResident: ${user.name}\nFlat: ${user.flat} · Wing ${user.wing}\nBill: ${bill.type}\nAmount: ${fmt(bill.amount)}\nMode: ${bill.mode || "NEFT"}\nRef / UTR: ${bill.refNo || "N/A"}\nDate: ${bill.paidOn || "—"}\n\n_Via Resident Portal_`;
  const selfMsg = `🏢 *${SOCIETY}*\n✅ Transfer submitted!\n\nBill: *${bill.type}*\nAmount: *${fmt(bill.amount)}*\nMode: ${bill.mode || "NEFT"}\nRef: ${bill.refNo || "N/A"}\nDate: ${bill.paidOn || "—"}`;

  const Row = ({ icon, title, sub, href }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "block", marginBottom: 12 }}>
      <div style={{ background: "rgba(37,211,102,.07)", border: "1px solid rgba(37,211,102,.18)", borderRadius: 12, padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "all .2s" }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(37,211,102,.14)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(37,211,102,.07)"}>
        <span style={{ fontSize: 26 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: "#4ade80" }}>{title}</p>
          <p style={{ fontSize: 12, color: "var(--mu)", marginTop: 3 }}>{sub}</p>
        </div>
        <span style={{ fontSize: 18, color: "#4ade80" }}>↗</span>
      </div>
    </a>
  );

  return (
    <Modal onClose={onClose}>
      <MHead title="WhatsApp Notification" sub="💬 Notify via WhatsApp" onClose={onClose} />
      <div style={{ padding: 24 }}>
        <div style={{ background: "rgba(37,211,102,.06)", border: "1px solid rgba(37,211,102,.15)", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: "#4ade80", fontWeight: 600, marginBottom: 4 }}>✅ {bill.type} — {fmt(bill.amount)} submitted</p>
          <p style={{ fontSize: 12, color: "var(--mu)" }}>Ref: <span style={{ fontFamily: "var(--fm)", color: "var(--mu2)" }}>{bill.refNo || "N/A"}</span></p>
        </div>
        <Row icon="🏢" title="Notify Society Admin" sub="Send confirmation to admin office" href={`https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(adminMsg)}`} />
        <Row icon="📱" title="Send to My WhatsApp" sub="Save receipt on your own number" href={`https://wa.me/${user.phone}?text=${encodeURIComponent(selfMsg)}`} />
        <div style={{ padding: "10px 14px", background: "rgba(59,130,246,.07)", border: "1px solid rgba(59,130,246,.15)", borderRadius: 10, marginBottom: 14 }}>
          <p style={{ fontSize: 11, color: "#93c5fd" }}>ℹ️ Opens WhatsApp with a pre-filled message. Just tap <strong>Send</strong>!</p>
        </div>
        <Btn v="ghost" onClick={onClose} full>Done</Btn>
      </div>
    </Modal>
  );
}

/* ─── Payment History Tab ────────────────────────────────────────────────── */
function HistoryTab({ bills, user }) {
  const paid = bills.filter(b => b.status === "paid");
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState(null);

  if (mode === "email" && sel) return <EmailModal bill={sel} user={user} onClose={() => { setMode(null); setSel(null); }} />;
  if (mode === "wa" && sel) return <WAModal bill={sel} user={user} onClose={() => { setMode(null); setSel(null); }} />;

  if (!paid.length) return (
    <div style={{ textAlign: "center", padding: "52px 20px", color: "var(--mu)" }}>
      <div style={{ fontSize: 42, marginBottom: 14 }}>📭</div>
      <p style={{ fontSize: 15 }}>No payment history yet.</p>
      <p style={{ fontSize: 12, marginTop: 8 }}>Completed bank transfers will appear here.</p>
    </div>
  );

  const total = paid.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="au">
      <div style={{ background: "rgba(34,197,94,.06)", border: "1px solid rgba(34,197,94,.14)", borderRadius: 16, padding: "18px 22px", marginBottom: 22, display: "flex", gap: 28, flexWrap: "wrap" }}>
        <div>
          <p style={{ fontSize: 10, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 5 }}>Total Paid</p>
          <p style={{ fontFamily: "var(--fm)", fontSize: 22, color: "var(--green)" }}>{fmt(total)}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 5 }}>Payments</p>
          <p style={{ fontFamily: "var(--fm)", fontSize: 22 }}>{paid.length}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 5 }}>Last Payment</p>
          <p style={{ fontSize: 13, color: "var(--mu2)", marginTop: 4 }}>{[...paid].sort((a, b) => a.paidOn > b.paidOn ? -1 : 1)[0]?.paidOn || "—"}</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[...paid].reverse().map((b, i) => (
          <div key={b.id} style={{ background: "var(--sf)", border: "1px solid rgba(34,197,94,.12)", borderRadius: 16, padding: "18px 20px", animation: `fadeUp ${.2 + i * .06}s ease` }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(34,197,94,.09)", border: "1px solid rgba(34,197,94,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{b.icon}</div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600 }}>{b.type}</p>
                  <p style={{ fontSize: 11, color: "var(--mu)", marginTop: 2 }}>{b.desc}</p>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontFamily: "var(--fm)", fontSize: 19, color: "var(--gold)" }}>{fmt(b.amount)}</p>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
                  {b.mode && <Chip color="var(--blue)">{b.mode}</Chip>}
                  <Chip color="var(--green)">✓ Paid</Chip>
                </div>
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--bd)", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <div>
                  <p style={{ fontSize: 9, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 3 }}>Date & Time</p>
                  <p style={{ fontSize: 12, color: "var(--mu2)", fontFamily: "var(--fm)" }}>{b.paidOn || "—"}</p>
                </div>
                {b.refNo && (
                  <div>
                    <p style={{ fontSize: 9, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 3 }}>Ref / UTR Number</p>
                    <p style={{ fontSize: 12, color: "var(--mu2)", fontFamily: "var(--fm)" }}>{b.refNo}</p>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setSel(b); setMode("email"); }} style={{ padding: "6px 12px", background: "var(--gd)", border: "1px solid rgba(201,168,76,.25)", borderRadius: 8, color: "var(--gold)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>📧 Email</button>
                <button onClick={() => { setSel(b); setMode("wa"); }} style={{ padding: "6px 12px", background: "rgba(37,211,102,.1)", border: "1px solid rgba(37,211,102,.2)", borderRadius: 8, color: "#4ade80", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>💬 WhatsApp</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Admin Panel ────────────────────────────────────────────────────────── */
function AdminPanel() {
  const allData = Object.entries(BILLS_INIT).filter(([k]) => k !== "admin");
  const allBills = allData.flatMap(([flat, bills]) => bills.map(b => ({ ...b, flatKey: flat })));
  const [filter, setFilter] = useState("all");

  const paid = allBills.filter(b => b.status === "paid");
  const unpaid = allBills.filter(b => b.status === "unpaid");
  const show = filter === "all" ? allBills : allBills.filter(b => b.status === filter);

  const stats = [
    { l: "Collected", v: fmt(paid.reduce((s, b) => s + b.amount, 0)), c: "var(--green)", e: "✅" },
    { l: "Pending", v: fmt(unpaid.reduce((s, b) => s + b.amount, 0)), c: "var(--red)", e: "⏳" },
    { l: "Paid", v: paid.length, c: "var(--gold)", e: "🟢" },
    { l: "Unpaid", v: unpaid.length, c: "var(--mu)", e: "🔴" },
    { l: "Residents", v: allData.length, c: "var(--blue)", e: "👥" },
    { l: "Total Bills", v: allBills.length, c: "var(--purple)", e: "📋" },
  ];

  return (
    <div className="au">
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "var(--fd)", fontSize: 26, fontWeight: 700 }}>Society Overview</h2>
          <p style={{ fontSize: 12, color: "var(--mu)", marginTop: 3 }}>Bank: {BANK.name} · A/C: {BANK.accountNo} · IFSC: {BANK.ifsc}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 28 }}>
        {stats.map(s => (
          <div key={s.l} style={{ background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 14, padding: "16px 18px" }}>
            <p style={{ fontSize: 10, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>{s.e} {s.l}</p>
            <p style={{ fontFamily: "var(--fm)", fontSize: 20, color: s.c, fontWeight: 500 }}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* Bank Account Card */}
      <div style={{ background: "linear-gradient(135deg,rgba(59,130,246,.08),rgba(59,130,246,.03))", border: "1px solid rgba(59,130,246,.2)", borderRadius: 16, padding: "18px 22px", marginBottom: 24 }}>
        <p style={{ fontSize: 11, color: "var(--blue)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12, fontWeight: 600 }}>🏦 Society Bank Account</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14 }}>
          {[
            { l: "Account Name", v: BANK.accountName },
            { l: "Account Number", v: BANK.accountNo },
            { l: "IFSC Code", v: BANK.ifsc },
            { l: "Bank & Branch", v: `${BANK.name}, ${BANK.branch}` },
          ].map(item => (
            <div key={item.l}>
              <p style={{ fontSize: 10, color: "var(--mu)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 }}>{item.l}</p>
              <p style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--mu2)", lineHeight: 1.4 }}>{item.v}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ fontFamily: "var(--fd)", fontSize: 20 }}>All Resident Bills</h3>
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "unpaid", "paid"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px", borderRadius: 8, border: `1px solid ${filter === f ? "var(--gold)" : "var(--bd)"}`,
                background: filter === f ? "var(--gd)" : "transparent", color: filter === f ? "var(--gold)" : "var(--mu)",
                fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize"
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {show.map(b => (
          <div key={b.id} style={{ background: "var(--sf)", border: `1px solid ${b.status === "paid" ? "rgba(34,197,94,.1)" : "var(--bd)"}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 18 }}>{b.icon}</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{b.type}</p>
                <p style={{ fontSize: 11, color: "var(--mu)" }}>
                  Flat {b.flatKey.replace("flat", "").toUpperCase()} · Due {b.due}
                  {b.paidOn ? " · Paid " + b.paidOn : ""}
                </p>
                {b.refNo && <p style={{ fontSize: 10, color: "var(--mu)", fontFamily: "var(--fm)", marginTop: 1 }}>Ref: {b.refNo}</p>}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {b.mode && <Chip color="var(--blue)">{b.mode}</Chip>}
              <p style={{ fontFamily: "var(--fm)", fontSize: 15, color: "var(--gold)" }}>{fmt(b.amount)}</p>
              <Chip color={b.status === "paid" ? "var(--green)" : "var(--red)"}>{b.status === "paid" ? "✓ Paid" : "Pending"}</Chip>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Dashboard ──────────────────────────────────────────────────────────── */
function Dashboard({ user, onLogout }) {
  const [bills, setBills] = useState(BILLS_INIT[user.username] || []);
  const [paying, setPaying] = useState(null);
  const [success, setSucc] = useState(null);
  const [tab, setTab] = useState("bills");

  const unpaid = bills.filter(b => b.status === "unpaid");
  const paid = bills.filter(b => b.status === "paid");
  const totalDue = unpaid.reduce((s, b) => s + b.amount, 0);

  const onPaySuccess = (id, refNo, mode, dateStr) => {
    const paidOn = nowStr();
    const updated = { ...bills.find(b => b.id === id), status: "paid", paidOn, refNo, mode };
    setBills(prev => prev.map(b => b.id === id ? updated : b));
    setPaying(null);
    setSucc({ bill: updated });
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Styles />
      <nav style={{ background: "var(--sf)", borderBottom: "1px solid var(--bd)", padding: "0 22px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#c9a84c,#8b6914)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏢</div>
          <div>
            <p style={{ fontFamily: "var(--fd)", fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{SOCIETY}</p>
            <p style={{ fontSize: 9, color: "var(--mu)", letterSpacing: ".07em", textTransform: "uppercase" }}>Resident Portal</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 13, fontWeight: 500 }}>{user.name}</p>
            <p style={{ fontSize: 11, color: "var(--mu)" }}>Flat {user.flat}{user.wing !== "—" ? ` · Wing ${user.wing}` : ""}</p>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#c9a84c,#8b6914)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#0a0d14" }}>{user.avatar}</div>
          <button onClick={onLogout} style={{ padding: "7px 14px", background: "transparent", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--mu)", fontSize: 12, cursor: "pointer" }}>Logout</button>
        </div>
      </nav>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px" }}>
        {user.isAdmin ? <AdminPanel /> : (
          <>
            {/* Hero */}
            <div style={{ background: "linear-gradient(135deg,#17213a,#1a1008)", border: "1px solid rgba(201,168,76,.22)", borderRadius: 20, padding: "26px 30px", marginBottom: 24, position: "relative", overflow: "hidden", animation: "fadeUp .4s ease" }}>
              <div style={{ position: "absolute", right: -40, top: -40, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle,rgba(201,168,76,.1) 0%,transparent 70%)", pointerEvents: "none" }} />
              <p style={{ fontSize: 11, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Total Outstanding</p>
              <p style={{ fontFamily: "var(--fm)", fontSize: 38, color: totalDue > 0 ? "var(--gl)" : "var(--green)", fontWeight: 500, lineHeight: 1, marginBottom: 12 }}>{fmt(totalDue)}</p>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--mu)" }}>🟢 {paid.length} paid</span>
                <span style={{ fontSize: 13, color: totalDue > 0 ? "#fca5a5" : "var(--mu)" }}>🔴 {unpaid.length} pending</span>
                <span style={{ fontSize: 13, color: "var(--mu)" }}>🏠 Flat {user.flat} · Wing {user.wing}</span>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 12, padding: 4, marginBottom: 22, width: "fit-content", animation: "fadeUp .5s ease" }}>
              {[["bills", "📋 My Bills"], ["history", "🕐 Payment History"]].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)}
                  style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: tab === k ? "linear-gradient(135deg,#c9a84c,#a07728)" : "transparent", color: tab === k ? "#0a0d14" : "var(--mu)", fontWeight: tab === k ? 700 : 400, fontSize: 13, cursor: "pointer", transition: "all .2s" }}>
                  {l}
                </button>
              ))}
            </div>

            {tab === "bills" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {bills.map((bill, i) => (
                  <div key={bill.id}
                    style={{ background: "var(--sf)", border: `1px solid ${bill.status === "paid" ? "rgba(34,197,94,.13)" : "var(--bd)"}`, borderRadius: 16, padding: "20px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, animation: `fadeUp ${.3 + i * .07}s ease`, transition: "box-shadow .2s" }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 30px rgba(0,0,0,.3)"}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 50, height: 50, borderRadius: 13, background: bill.status === "paid" ? "rgba(34,197,94,.1)" : `${bill.clr}18`, border: `1px solid ${bill.status === "paid" ? "rgba(34,197,94,.15)" : `${bill.clr}28`}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{bill.icon}</div>
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>{bill.type}</p>
                        <p style={{ fontSize: 12, color: "var(--mu)" }}>{bill.desc}</p>
                        <p style={{ fontSize: 11, marginTop: 4, color: bill.status === "unpaid" ? "#fca5a5" : "var(--mu)" }}>
                          {bill.status === "paid" ? `✓ Paid on ${bill.paidOn}` : `Due: ${bill.due}`}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <p style={{ fontFamily: "var(--fm)", fontSize: 20, color: "var(--gold)", fontWeight: 500 }}>{fmt(bill.amount)}</p>
                      {bill.status === "paid"
                        ? <Chip color="var(--green)">✓ PAID</Chip>
                        : <Btn onClick={() => setPaying(bill)}>Transfer Now →</Btn>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "history" && <HistoryTab bills={bills} user={user} />}
          </>
        )}
      </div>

      {paying && <BankTransferModal bill={paying} user={user} onClose={() => setPaying(null)} onSuccess={onPaySuccess} />}
      {success && <SuccessModal bill={success.bill} user={user} onClose={() => setSucc(null)} />}
    </div>
  );
}

/* ─── Login ──────────────────────────────────────────────────────────────── */
function Login({ onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const login = () => {
    if (!u || !p) return;
    setBusy(true); setErr("");
    setTimeout(() => {
      const user = USERS.find(x => x.username === u && x.password === p);
      if (user) onLogin(user);
      else { setErr("Invalid username or password."); setBusy(false); }
    }, 900);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative", overflow: "hidden" }}>
      <Styles />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(ellipse 60% 50% at 70% 20%,rgba(201,168,76,.07) 0%,transparent 60%),radial-gradient(ellipse 40% 60% at 20% 80%,rgba(59,130,246,.05) 0%,transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c9a84c' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E")`, pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 440, animation: "fadeUp .55s ease" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 76, height: 76, borderRadius: "50%", background: "linear-gradient(135deg,#c9a84c,#8b6914)", margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, animation: "pulseG 3s infinite" }}>🏢</div>
          <h1 style={{ fontFamily: "var(--fd)", fontSize: 30, fontWeight: 700, letterSpacing: "-.5px" }}>{SOCIETY}</h1>
          <p style={{ color: "var(--mu)", marginTop: 8, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>Resident Portal · Bill Payments</p>
        </div>

        <div style={{ background: "var(--sf)", border: "1px solid var(--bd2)", borderRadius: 20, padding: "32px 30px" }}>
          <p style={{ fontSize: 11, color: "var(--gold)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 22, fontWeight: 600 }}>Sign In to Your Account</p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, color: "var(--mu)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>Flat / Username</label>
            <input value={u} onChange={e => setU(e.target.value)} placeholder="e.g. flat101" onKeyDown={e => e.key === "Enter" && login()}
              style={{ width: "100%", background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 10, padding: "11px 14px", fontSize: 13, outline: "none", color: "var(--tx)" }}
              onFocus={e => e.target.style.borderColor = "var(--gold)"} onBlur={e => e.target.style.borderColor = "var(--bd)"} />
          </div>

          <div style={{ marginBottom: 16, position: "relative" }}>
            <label style={{ display: "block", fontSize: 11, color: "var(--mu)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>Password</label>
            <input type={show ? "text" : "password"} value={p} onChange={e => setP(e.target.value)} placeholder="Enter your password" onKeyDown={e => e.key === "Enter" && login()}
              style={{ width: "100%", background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 10, padding: "11px 40px 11px 14px", fontSize: 13, outline: "none", color: "var(--tx)" }}
              onFocus={e => e.target.style.borderColor = "var(--gold)"} onBlur={e => e.target.style.borderColor = "var(--bd)"} />
            <button onClick={() => setShow(!show)} style={{ position: "absolute", right: 14, top: 34, background: "none", border: "none", cursor: "pointer", fontSize: 15, opacity: .45 }}>{show ? "🙈" : "👁️"}</button>
          </div>

          {err && <div style={{ padding: "10px 14px", background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 8, marginBottom: 14, fontSize: 13, color: "var(--red)" }}>⚠️ {err}</div>}

          <button onClick={login} disabled={busy || !u || !p}
            style={{
              width: "100%", padding: "13px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 14,
              background: busy || !u || !p ? "var(--gd)" : "linear-gradient(135deg,#c9a84c,#a07728)",
              color: busy || !u || !p ? "var(--mu)" : "#0a0d14", cursor: busy || !u || !p ? "not-allowed" : "pointer", transition: "all .2s", marginBottom: 20
            }}>
            {busy ? "Signing in…" : "Sign In →"}
          </button>

          <div style={{ padding: "14px 16px", background: "rgba(201,168,76,.05)", border: "1px solid rgba(201,168,76,.1)", borderRadius: 12 }}>
            <p style={{ fontSize: 10, color: "var(--mu)", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 10 }}>Demo Accounts — click to fill</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[{ u: "flat101", p: "pass101" }, { u: "flat202", p: "pass202" }, { u: "flat303", p: "pass303" }, { u: "admin", p: "admin123" }].map(d => (
                <button key={d.u} onClick={() => { setU(d.u); setP(d.p); }}
                  style={{ padding: "5px 13px", background: "var(--gd)", border: "1px solid rgba(201,168,76,.2)", borderRadius: 6, fontSize: 12, cursor: "pointer", color: "var(--gold)", fontWeight: 500 }}>
                  {d.u}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p style={{ textAlign: "center", marginTop: 18, fontSize: 11, color: "var(--mu)" }}>Forgot password? Contact office · {ADMIN_EMAIL}</p>
      </div>
    </div>
  );
}

/* ─── Root ───────────────────────────────────────────────────────────────── */
export default function App() {
  const [user, setUser] = useState(null);
  return user
    ? <Dashboard user={user} onLogout={() => setUser(null)} />
    : <Login onLogin={setUser} />;
}
