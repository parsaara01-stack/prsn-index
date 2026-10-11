/* PRSN dashboard. React 18 + Recharts + Tailwind, written with htm (JSX-style tagged templates, no build step).
   Data comes from data/index.json, rebuilt by the engine/ package on GitHub Actions (hourly in market hours, after every close, and the weekly decision on Fridays).
   To host the page somewhere else but keep live data, set window.PRSN_DATA_URL before this script loads. */
const { useState, useEffect, useMemo, useRef } = React;
const { ResponsiveContainer, ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, ReferenceLine } = Recharts;
const html = htm.bind(React.createElement);
const DATA_URL = window.PRSN_DATA_URL || "data/index.json";
const EMBED = !!window.PRSN_EMBED || window.self !== window.top;   // inside an iframe (Adobe Portfolio): no sticky header, report height
const FULL_URL = window.PRSN_FULL_URL || location.href.split("#")[0];   // "Open" link when embedded
const SHARE_URL = window.PRSN_SHARE_URL || FULL_URL;   // set window.PRSN_SHARE_URL in index.html to share parsaara.com/index instead
const ASSET = window.PRSN_ASSET_BASE || "";
const REPO = "https://github.com/parsaara01-stack/prsn-index";
const NOMINATE_URL = REPO + "/issues/new?template=nominate-leader.yml";   // the public intake form
const TIER = { core: { label: "Core", kind: "good" }, build: { label: "Build", kind: "accent" }, toehold: { label: "Toehold", kind: "" }, wildcard: { label: "Wildcard", kind: "accent" } };

// ---------- palette: white surfaces, navy type and buttons, Iran's flag green for PRSN and red for the S&P 500
const C = { prsn: "#178A3E", spx: "#C8322B", spxSoft: "#EBA9A4", navy: "#14264B", fg: "#17243A", dim: "#66748A", line: "#E2E8F0", gain: "#178A3E", loss: "#C8322B" };

// ---------- format
const pct = (x, d = 1) => x == null ? "–" : (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(d) + "%";
const pctU = (x, d = 1) => x == null ? "–" : (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(d) + "%";
const pts = (x, d = 1) => x == null ? "–" : (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(d) + " pts";
const mult = (x, d = 1) => x == null || x <= 0 ? "–" : x.toFixed(d) + "×";
const dec = (x, d = 2) => x == null ? "–" : (x < 0 ? "−" : "") + Math.abs(x).toFixed(d);
const money = (x, d = 2) => x == null ? "–" : "$" + x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const big = x => x == null ? "–" : x >= 1000 ? "$" + (x / 1000).toFixed(2) + "T" : "$" + x.toFixed(x >= 100 ? 0 : 1) + "B";
const tone = x => x == null ? "text-silver" : x >= 0 ? "text-emerald" : "text-coral";
const date = (s, o = { month: "short", day: "numeric", year: "numeric" }) => new Date(s.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
const asofLabel = D => D.live && D.live.intraday ? `Live · ${D.live.time_et} · 15-min delay` : `${date(D.asof)} close`;
const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const ratingText = r => ({ strong_buy: "Strong buy", buy: "Buy", hold: "Hold", sell: "Sell", strong_sell: "Strong sell" }[r] || "No rating");
const cleanName = n => n.replace(/\s*\(.*?\)/, "");
const goTo = (id, focusId) => {
  const el = document.getElementById(id);
  if (!el) return;
  if (EMBED) {   // the frame doesn't scroll itself; scrollIntoView moves the host page instead
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    const f = document.getElementById(focusId || id);
    if (f) setTimeout(() => f.focus({ preventScroll: true }), reduced ? 0 : 600);
    return;
  }
  const target = () => Math.max(0, el.getBoundingClientRect().top + window.scrollY - 76);   // clear the sticky header
  window.scrollTo({ top: target(), behavior: reduced ? "auto" : "smooth" });
  // Once the scroll settles (or stalls, as smooth scroll can in background tabs), re-measure and land exactly
  const settle = (tries, last) => setTimeout(() => {
    const y = window.scrollY;
    if (y !== last && tries < 20) return settle(tries + 1, y);
    if (Math.abs(y - target()) > 4) window.scrollTo({ top: target(), behavior: "auto" });
    const f = document.getElementById(focusId || id);
    if (f) f.focus({ preventScroll: true });
  }, 100);
  settle(0, -1);
};
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const useMedia = q => {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mm = window.matchMedia(q); const f = () => setM(mm.matches); mm.addEventListener("change", f); return () => mm.removeEventListener("change", f); }, []);
  return m;
};
function useWidth(ref) {
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return w;
}

// ---------- icons (inline strokes, 24px grid)
const ICONS = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  dollar: '<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bars: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  flask: '<path d="M9 3h6"/><path d="M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  pulse: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  wave: '<path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/>',
  drop: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  scale: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7l-3 7a4 4 0 0 0 6 0z"/><path d="M19 7l-3 7a4 4 0 0 0 6 0z"/>',
};
const Icon = ({ n, size = 16, className = "" }) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className=${"shrink-0 " + className} dangerouslySetInnerHTML=${{ __html: ICONS[n] }}></svg>`;
const IconBadge = ({ n }) => html`<span className="w-8 h-8 rounded-lg bg-emerald/10 text-emerald grid place-items-center shrink-0"><${Icon} n=${n} size=${16} /></span>`;
// The flag in three bars: green, white, red
const FlagBar = ({ w = 18 }) => html`<span aria-hidden="true" className="inline-flex flex-col rounded-[2px] overflow-hidden ring-1 ring-line shrink-0" style=${{ width: w + "px", height: Math.round(w * 0.6) + "px" }}><span className="flex-1" style=${{ background: C.prsn }}></span><span className="flex-1 bg-white"></span><span className="flex-1" style=${{ background: C.spx }}></span></span>`;

// ---------- primitives
const Card = ({ className = "", children, id }) => html`<section id=${id} className=${"surface rounded-2xl p-5 sm:p-6 min-w-0 " + className}>${children}</section>`;
const Head = ({ title, aside, id, icon }) => html`
  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
    <h2 id=${id} className="flex items-center gap-2.5 text-[20px] sm:text-[23px] font-extrabold tracking-tight leading-none text-fg">${icon && html`<${IconBadge} n=${icon} />`}${title}</h2>
    ${aside && html`<span className="text-[12px] text-dim">${aside}</span>`}
  </div>`;
const Pill = ({ active, onClick, children, href, primary, label }) => {
  const cls = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors whitespace-nowrap " +
    (active || primary ? "bg-accent text-white hover:bg-accent/90" : "bg-fg/[0.05] text-silver hover:bg-fg/[0.10] hover:text-fg");
  return href
    ? html`<a href=${href} aria-current=${active ? "true" : undefined} target=${href.startsWith("http") || (EMBED && !href.startsWith("#")) ? "_blank" : undefined} rel="noopener" className=${cls}>${children}</a>`
    : html`<button type="button" onClick=${onClick} aria-label=${label} aria-pressed=${active == null ? undefined : !!active} className=${cls}>${children}</button>`;
};
const Label = ({ children, icon }) => html`<div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">${icon && html`<${Icon} n=${icon} size=${13} className="text-emerald" />`}${children}</div>`;
const Chip = ({ children, kind = "" }) => {
  const k = { good: "bg-emerald/10 text-emerald", bad: "bg-coral/10 text-coral", accent: "bg-accent/[0.07] text-accent", "": "bg-fg/[0.05] text-silver" }[kind];
  return html`<span className=${"inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap " + k}>${children}</span>`;
};
const KV = ({ k, v, cls = "", tip, icon }) => html`<div><div className=${"num text-[14.5px] font-semibold text-fg " + cls}>${v}</div><div className="text-[11px] text-dim mt-0.5 flex items-center gap-1">${icon && html`<${Icon} n=${icon} size=${12} className="text-emerald" />`}${k}${tip}</div></div>`;
const Math_ = ({ children }) => html`<div className="rounded-xl bg-page border border-line px-3.5 py-2.5 text-[15px] text-fg" style=${{ fontFamily: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif" }}>${children}</div>`;
const Sub = ({ children }) => html`<sub style=${{ fontSize: "0.7em" }}>${children}</sub>`;
const Logo = ({ h = 28 }) => html`<img src=${ASSET + "logo.png"} alt="PRSN" width=${Math.round(h * 3.38)} height=${h} style=${{ height: h + "px", width: "auto" }} className="block select-none" draggable="false" />`;

// Explanations open on hover, tap and keyboard focus; rendered in a portal so tables can't clip them.
function InfoTip({ label, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const openedAt = useRef(0);   // a tap fires hover, focus and click together; don't let the click close what the tap just opened
  const open = () => { const r = ref.current.getBoundingClientRect(); openedAt.current = Date.now(); setPos({ x: Math.max(12, Math.min(r.left - 120, window.innerWidth - 272)), y: r.bottom + 6 }); };
  const close = () => setPos(null);
  return html`<span className="inline-flex align-middle">
    <button ref=${ref} type="button" aria-label=${"What is " + label + "?"} aria-expanded=${!!pos}
      onClick=${e => { e.stopPropagation(); pos && Date.now() - openedAt.current > 400 ? close() : open(); }} onFocus=${open} onBlur=${close} onMouseEnter=${open} onMouseLeave=${close}
      className="group/tip -my-1.5 w-7 h-7 grid place-items-center"><span className="w-[15px] h-[15px] rounded-full border border-fg/25 text-[9.5px] font-bold leading-none text-dim grid place-items-center group-hover/tip:text-fg group-hover/tip:border-fg/50">?</span></button>
    ${pos && ReactDOM.createPortal(html`<div role="tooltip" style=${{ position: "fixed", left: pos.x + "px", top: pos.y + "px", zIndex: 70 }}
      className="w-[260px] rounded-xl bg-white border border-line shadow-[0_8px_24px_rgba(23,36,58,.12)] p-3 text-[12.5px] leading-snug text-silver normal-case tracking-normal font-normal">${children}</div>`, document.body)}
  </span>`;
}
const TIPS = {
  sharpe: "Sharpe ratio: return above the T-bill rate, divided by volatility. Higher means more return for each unit of risk.",
  beta: "Beta: how much the index tends to move when the S&P 500 moves 1%. 1.25 means about 1.25%.",
  hurdle: "Return on invested capital (ROIC) minus the weighted average cost of capital (WACC). Positive means the business earns more than its capital costs.",
  score: "A 0–100 composite of quality, value, growth, momentum, alignment and balance sheet. It tilts an equal starting weight up or down.",
  vol: "Volatility: how widely returns swing over a year, annualized from daily moves.",
  conviction: "Conviction = 40% quality + 30% catalyst + 30% rerate, each a 0–100 rank among eligible companies. It decides the tier and nudges size within it.",
  tier: "Core: top 4 by conviction with a confirmed catalyst, up to 20% each. Build: next 6, up to 8%. Toehold: the rest and all small caps, up to 3%.",
};

// ---------- company logos: logos/TICKER.png (square, 128px), else the ticker as a monogram
const logoCache = {};
function useLogo(t) {
  const [url, setUrl] = useState(logoCache[t] === undefined ? undefined : logoCache[t]);
  useEffect(() => {
    if (logoCache[t] !== undefined) { setUrl(logoCache[t]); return; }
    let live = true;
    const tryExt = ([ext, ...rest]) => {
      if (!ext) { logoCache[t] = null; live && setUrl(null); return; }
      const img = new Image();
      img.onload = () => { logoCache[t] = ASSET + "logos/" + t + "." + ext; live && setUrl(logoCache[t]); };
      img.onerror = () => tryExt(rest);
      img.src = ASSET + "logos/" + t + "." + ext;
    };
    tryExt(["png"]);
    return () => { live = false; };
  }, [t]);
  return url;
}
function CoLogo({ t, size = 28 }) {
  const url = useLogo(t);
  const st = { width: size + "px", height: size + "px" };
  return url
    ? html`<img src=${url} alt="" width=${size} height=${size} style=${st} className="rounded-full object-cover bg-white ring-1 ring-line shrink-0" />`
    : html`<span style=${{ ...st, fontSize: Math.max(8, Math.round(size * 0.3)) + "px" }} className="rounded-full grid place-items-center bg-page ring-1 ring-line font-bold text-fg shrink-0" aria-hidden="true">${t}</span>`;
}

// ---------- leaders
const initials = n => { const w = cleanName(n).trim().split(/\s+/); return (w[0][0] + w[w.length - 1][0]).toUpperCase(); };
function Avatar({ h, size = 72, lazy }) {
  const L = h.leader || {};
  const [err, setErr] = useState(false);
  const st = { width: size + "px", height: size + "px" };
  return L.photo && !err
    ? html`<img src=${ASSET + L.photo} alt=${"Portrait of " + cleanName(h.ceo)} width=${size} height=${size} style=${st} loading=${lazy ? "lazy" : undefined} onError=${() => setErr(true)} className="rounded-full object-cover shrink-0 bg-page ring-1 ring-line" />`
    : html`<span style=${{ ...st, fontSize: Math.round(size * 0.34) + "px" }} className="rounded-full shrink-0 grid place-items-center font-bold tracking-wide text-accent bg-accent/[0.07] ring-1 ring-line" role="img" aria-label=${cleanName(h.ceo)}>${initials(h.ceo)}</span>`;
}

function LeaderHover({ h, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  if (!h.leader) return children;
  const show = () => {
    const r = ref.current.getBoundingClientRect();
    const up = r.bottom + 240 > window.innerHeight;
    setPos({ x: Math.max(12, Math.min(r.left, window.innerWidth - 332)), y: up ? r.top - 8 : r.bottom + 8, up });
  };
  return html`<span ref=${ref} onMouseEnter=${show} onMouseLeave=${() => setPos(null)} className="underline decoration-dotted decoration-fg/25 underline-offset-[3px]">${children}${pos && ReactDOM.createPortal(html`
    <div role="tooltip" style=${{ position: "fixed", left: pos.x + "px", top: pos.y + "px", transform: pos.up ? "translateY(-100%)" : "none", zIndex: 60 }}
         className="w-[320px] pointer-events-none rounded-xl bg-white border border-line shadow-[0_12px_32px_rgba(23,36,58,.14)] p-4">
      <div className="flex items-center gap-3"><${Avatar} h=${h} size=${56} />
        <div className="min-w-0"><div className="text-[14.5px] font-bold text-fg leading-tight">${cleanName(h.ceo)}</div><div className="text-[12px] text-dim">${h.role}, ${h.name}</div></div></div>
      <p className="mt-3 mb-0 text-[12.5px] leading-snug text-silver">${h.leader.story}</p>
    </div>`, document.body)}</span>`;
}

// Leaders double as the holdings list: each card carries its company's weight and today's move.
function Leaders({ D, selTicker, pick }) {
  const mx = Math.max(...D.holdings.map(h => h.weight));
  return html`
    <${Card} className="col-span-12" id="leaders">
      <${Head} title="The Leaders" icon="users" aside="Tap a leader for their company" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        ${D.holdings.map((h, i) => {
          const on = h.ticker === selTicker;
          return html`
          <button key=${h.ticker} id=${"leader-" + h.ticker} type="button" onClick=${() => pick(i)} aria-pressed=${on}
            className=${"text-left rounded-xl border transition-colors px-3 py-2.5 sm:p-4 flex gap-3 items-center lg:items-start " + (on ? "border-emerald bg-emerald/[0.04]" : "border-line bg-white hover:border-emerald/50")}>
            <span className="lg:hidden"><${Avatar} h=${h} size=${44} lazy=${true} /></span>
            <span className="hidden lg:block"><${Avatar} h=${h} size=${64} lazy=${true} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] sm:text-[15px] font-bold text-fg leading-tight">${cleanName(h.ceo)}</div>
              <div className="text-[11.5px] text-dim mt-0.5 leading-snug truncate">${h.name}${h.wildcard ? " · Wildcard" : h.tier ? " · " + TIER[h.tier].label : ""}</div>
              ${h.leaving && html`<div className="mt-1"><${Chip} kind="bad">Leaving · ${h.leaving.rule}<//></div>`}
              <div className="hidden lg:flex mt-2 items-center gap-2 num text-[12px]">
                <span className="w-12 h-1.5 rounded-full bg-fg/[0.07] overflow-hidden"><span className="block h-full rounded-full bg-emerald" style=${{ width: (h.weight / mx * 100) + "%" }}></span></span>
                <span className="font-semibold text-fg">${pctU(h.weight)}</span>
                <span className=${tone(h.day_change)}>${pct(h.day_change, 1)}</span>
              </div>
              <div className="hidden lg:block text-[12.5px] text-silver mt-2 leading-snug">${(h.leader || {}).line || ""}</div>
            </div>
            <div className="lg:hidden text-right num text-[12px] shrink-0">
              <div className="font-semibold text-fg text-[13px]">${pctU(h.weight)}</div>
              <div className=${tone(h.day_change)}>${pct(h.day_change, 1)}</div>
            </div>
          </button>`;
        })}
      </div>
    <//>`;
}

const GlassTip = ({ active, payload, fmt }) => {
  if (!active || !payload || !payload.length) return null;
  return html`<div className="rounded-xl px-3 py-2 text-[12px] num bg-white border border-line shadow-[0_8px_24px_rgba(23,36,58,.12)]">${fmt(payload[0].payload)}</div>`;
};
const BacktestNote = ({ D }) => html`<span className="inline-flex items-center rounded-full bg-fg/[0.05] text-silver px-2 py-0.5 text-[11px] font-medium">Backtest before ${date(D.index.launch_date, { month: "short", year: "numeric" })}</span>`;
const SpxSwatch = () => html`<span className="inline-block w-4 border-t-2 border-dashed shrink-0" style=${{ borderColor: C.spx }}></span>`;
const PrsnSwatch = () => html`<span className="inline-block w-4 h-[3px] rounded shrink-0" style=${{ background: C.prsn }}></span>`;

// ---------- hero
function Hero({ D, range, setRange, showBench, setShowBench }) {
  const S = D.stats;
  const data = useMemo(() => {
    const s = range ? D.series.slice(-range - 1) : D.series;
    const a0 = s[0][1], b0 = s[0][2];
    return s.map(r => ({ d: r[0], lvl: r[1], a: r[1] / a0 * 100, b: r[2] / b0 * 100 }));
  }, [D, range]);
  const end = data[data.length - 1];
  const vals = data.flatMap(p => showBench ? [p.a, p.b] : [p.a]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const launchIn = data.some(p => p.d === D.index.launch_date);
  return html`
    <${Card} className="col-span-12 lg:col-span-8 flex flex-col" id="overview">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-silver"><${FlagBar} />PRSN Index</div>
        <div className="flex gap-1.5" role="group" aria-label="Chart range">
          ${[["1Y", 252], ["3Y", 756], ["All", 0]].map(([l, n]) => html`<${Pill} key=${l} active=${range === n} onClick=${() => setRange(n)}>${l}<//>`)}
        </div>
      </div>
      <h1 className=${"mt-5 font-black tracking-[-0.035em] leading-[1.0] text-fg max-w-[15ch] " + (EMBED ? "text-[34px] sm:text-[50px]" : "text-[34px] sm:text-[56px] xl:text-[64px]")}><span className="text-emerald">World's First</span> Persian Led <span className="text-coral">Equity Index</span></h1>
      <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-2">
        <div className="num text-[42px] sm:text-[52px] font-semibold leading-none tracking-tight text-fg">${D.level.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className="flex items-center gap-2 pb-1.5">
          <span className=${"num text-[13px] font-semibold rounded-full px-2.5 py-1 " + (D.day_change >= 0 ? "bg-emerald/10 text-emerald" : "bg-coral/10 text-coral")}>${pct(D.day_change, 2)}</span>
          <span className="text-[12.5px] text-dim">${asofLabel(D)}</span>
        </div>
      </div>
      <div className="relative mt-4 h-[200px] sm:h-[270px]" role="img" aria-label=${`PRSN ${pct(end.a / 100 - 1)} versus S&P 500 ${pct(end.b / 100 - 1)} since ${date(data[0].d)}`}>
        <${ResponsiveContainer} width="100%" height="100%">
          <${ComposedChart} data=${data} margin=${{ top: 16, right: 0, bottom: 0, left: 0 }}>
            <defs><linearGradient id="fillPrsn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor=${C.prsn} stopOpacity="0.16" /><stop offset="100%" stopColor=${C.prsn} stopOpacity="0" /></linearGradient></defs>
            <${XAxis} dataKey="d" hide />
            <${YAxis} hide domain=${[lo - (hi - lo) * 0.06, hi + (hi - lo) * 0.06]} />
            <${ReferenceLine} y=${100} stroke="rgba(23,36,58,0.10)" strokeDasharray="2 6" />
            ${launchIn && html`<${ReferenceLine} x=${D.index.launch_date} stroke=${C.navy} strokeOpacity=${0.3} label=${{ value: "Launch", position: "insideTopRight", fill: C.dim, fontSize: 11 }} />`}
            <${Tooltip} cursor=${{ stroke: "rgba(23,36,58,0.2)" }} content=${html`<${GlassTip} fmt=${p => html`<div className="text-dim">${date(p.d)}${p.d < D.index.launch_date ? " · backtest" : ""}</div><div className="text-emerald font-semibold">PRSN ${p.lvl.toFixed(2)} · ${pct(p.a / 100 - 1)}</div>${showBench && html`<div className="text-coral">S&P 500 ${pct(p.b / 100 - 1)}</div>`}`} />`} />
            <${Area} type="monotone" dataKey="a" stroke=${C.prsn} strokeWidth=${2.2} fill="url(#fillPrsn)" dot=${false} activeDot=${{ r: 4, fill: C.prsn, stroke: "#fff" }} isAnimationActive=${!reduced} animationDuration=${800} />
            ${showBench && html`<${Line} type="monotone" dataKey="b" stroke=${C.spx} strokeWidth=${1.6} strokeDasharray="5 4" dot=${false} activeDot=${{ r: 3.5, fill: C.spx, stroke: "#fff" }} isAnimationActive=${false} />`}
          <//>
        <//>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <span className="flex items-center gap-1.5"><${PrsnSwatch} /><span className="text-dim">PRSN</span><span className="num font-semibold text-fg">${pct(end.a / 100 - 1)}</span></span>
          <span className="flex items-center gap-1.5"><${SpxSwatch} /><span className="text-dim">S&P 500</span><span className="num font-semibold text-fg">${pct(end.b / 100 - 1)}</span></span>
          <span className="text-dim">since ${date(data[0].d, { month: "short", year: "numeric" })}</span>
          <${BacktestNote} D=${D} />
        </div>
        <${Pill} active=${showBench} onClick=${() => setShowBench(!showBench)}>vs S&P 500<//>
      </div>
      <div className="mt-5 pt-4 border-t border-line grid grid-cols-2 sm:grid-cols-4 gap-4">
        <${KV} icon="wave" k=${"Swings · S&P " + pctU(S.vol_bench)} v=${pctU(S.vol)} tip=${html`<${InfoTip} label="volatility">${TIPS.vol}<//>`} />
        <${KV} icon="drop" k=${"Worst drop · S&P " + pctU(S.max_dd_bench.depth)} v=${pctU(S.max_dd.depth)} cls="!text-coral" />
        <${KV} icon="pulse" k="Moves vs market" v=${dec(S.beta)} tip=${html`<${InfoTip} label="beta">${TIPS.beta}<//>`} />
        <${KV} icon="calendar" k=${D.pending ? "Trade pending" : "Next weekly check"} v=${date(D.pending ? D.pending.window_end : D.next_rebalance, { month: "short", day: "numeric" })} />
      </div>
    <//>`;
}

function Side({ D }) {
  const S = D.stats, G = D.growth_10k;
  const big_ = "num font-semibold leading-none mt-3 sm:mt-4 tracking-tight text-[30px] sm:text-[40px] xl:text-[46px] ";
  const vs = v => html`<div className="mt-2.5 sm:mt-3 flex items-center gap-2 text-[12.5px] sm:text-[13px] text-silver"><${SpxSwatch} />S&P 500 <span className="num font-semibold text-fg">${v}</span></div>`;
  return html`
    <div className="col-span-12 lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4 content-start">
      <${Card} className="col-span-2 lg:col-span-1 !p-4 sm:!p-6">
        <${Label} icon="dollar">$10,000 Invested ${date(D.index.base_date, { month: "short", year: "numeric" })}<//>
        <div className=${big_ + "text-emerald"}>${money(G.prsn, 0)}</div>
        ${vs(money(G.bench, 0))}
      <//>
      <${Card} className="!p-4 sm:!p-6">
        <${Label} icon="trend">Per Year<//>
        <div className=${big_ + "text-emerald"}>${pct(S.ann_return)}</div>
        ${vs(pct(S.ann_return_bench))}
      <//>
      <${Card} className="!p-4 sm:!p-6">
        <div className="flex items-center"><${Label} icon="shield">Sharpe Ratio<//><${InfoTip} label="the Sharpe ratio">${TIPS.sharpe}<//></div>
        <div className=${big_ + "text-fg"}>${dec(S.sharpe)}</div>
        ${vs(dec(S.sharpe_bench))}
      <//>
      <${Card} className="col-span-2 lg:col-span-1 !p-4 sm:!p-6">
        <${Label} icon="eye">How To Read It<//>
        <div className="mt-3 flex flex-col gap-1.5 text-[15px] font-bold text-fg leading-tight">
          <span className="flex items-center gap-2"><${PrsnSwatch} />Green Is PRSN</span>
          <span className="flex items-center gap-2"><${SpxSwatch} />Dashed Red Is The S&P 500</span>
        </div>
        <p className="mt-2.5 mb-0 text-[13px] leading-relaxed text-silver">Both start at $10,000 on ${date(D.index.base_date)}. Before ${date(D.index.launch_date)} it's a backtest. Tap a leader below to see why they're in.</p>
      <//>
    </div>`;
}

// ---------- candles (green/red here mean up/down days)
function Candles({ rows, kind }) {
  const ref = useRef(null);
  const W = useWidth(ref);
  const [hover, setHover] = useState(null);
  const data = kind === "1d" ? rows.slice(-130) : rows;
  const H = W < 500 ? 190 : 250, m = { l: 4, r: 52, t: 10, b: 20 };
  const iw = Math.max(W - m.l - m.r, 50), ih = H - m.t - m.b;
  const ys = data.flatMap(r => [r[2], r[3], ...(kind === "1d" ? [r[5]].filter(Boolean) : [])]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const x = i => m.l + (i + 0.5) * iw / data.length, y = v => m.t + (hi - v) / (hi - lo) * ih;
  const bw = Math.max(1.5, iw / data.length * 0.62);
  const line = k => data.map((r, i) => r[k] ? `${i && data[i - 1][k] ? "L" : "M"}${x(i).toFixed(1)} ${y(r[k]).toFixed(1)}` : "").join("");
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  const h = hover != null ? data[hover] : data[data.length - 1];
  const onMove = e => {
    const r = ref.current.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    setHover(Math.max(0, Math.min(data.length - 1, Math.floor((cx - m.l) / iw * data.length))));
  };
  const lbl = s => kind === "1d" ? date(s, { month: "short", day: "numeric" }) : s.slice(5, 10);
  return html`
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 num text-[12px] mb-2 text-silver">
        <span className="text-dim">${kind === "1d" ? date(h[0]) : h[0].slice(5).replace(" ", " · ")}</span>
        <span>O <b className="font-semibold text-fg">${h[1].toFixed(2)}</b></span><span>H <b className="font-semibold text-fg">${h[2].toFixed(2)}</b></span>
        <span>L <b className="font-semibold text-fg">${h[3].toFixed(2)}</b></span><span>C <b className=${"font-semibold " + (h[4] >= h[1] ? "text-emerald" : "text-coral")}>${h[4].toFixed(2)}</b></span>
        ${kind === "1d" && h[5] && html`<span className="text-accent">200-day <b className="font-semibold">${h[5].toFixed(2)}</b></span>`}
      </div>
      <div ref=${ref} className="relative w-full" onMouseMove=${onMove} onTouchMove=${onMove} onMouseLeave=${() => setHover(null)}>
        <svg viewBox=${`0 0 ${W} ${H}`} width="100%" height=${H} role="img" aria-label=${(kind === "1d" ? "Daily" : "4-hour") + " price chart"}>
          ${ticks.map(v => html`<g key=${v}><line x1=${m.l} x2=${W - m.r} y1=${y(v)} y2=${y(v)} stroke="rgba(23,36,58,0.08)" strokeDasharray="2 5" /><text x=${W - m.r + 6} y=${y(v) + 4} fontSize="11" fill=${C.dim} fontFamily="JetBrains Mono, monospace">${v.toFixed(v > 100 ? 0 : 2)}</text></g>`)}
          ${data.map((r, i) => {
            const up = r[4] >= r[1], col = up ? C.gain : C.loss;
            const top = y(Math.max(r[1], r[4])), bot = y(Math.min(r[1], r[4]));
            return html`<g key=${r[0]}><line x1=${x(i)} x2=${x(i)} y1=${y(r[2])} y2=${y(r[3])} stroke=${col} strokeWidth="1" /><rect x=${x(i) - bw / 2} y=${top} width=${bw} height=${Math.max(1, bot - top)} fill=${col} fillOpacity="0.85" rx="0.5" /></g>`;
          })}
          ${kind === "1d" && html`<path d=${line(5)} fill="none" stroke=${C.navy} strokeWidth="1.8" />`}
          ${hover != null && html`<line x1=${x(hover)} x2=${x(hover)} y1=${m.t} y2=${m.t + ih} stroke="rgba(23,36,58,0.25)" strokeDasharray="3 3" />`}
          <text x=${m.l} y=${H - 4} fontSize="11" fill=${C.dim} fontFamily="JetBrains Mono, monospace">${lbl(data[0][0])}</text>
          <text x=${W - m.r} y=${H - 4} textAnchor="end" fontSize="11" fill=${C.dim} fontFamily="JetBrains Mono, monospace">${lbl(data[data.length - 1][0])}</text>
        </svg>
      </div>
      <div className="mt-1 text-[11.5px] text-dim">${kind === "1d" ? html`<span className="inline-flex items-center gap-1.5"><span className="w-3 h-[2px] bg-accent"></span>200-day average · green/red = up/down day</span>` : "4-hour bars, US session · green/red = up/down"}</div>
    </div>`;
}

function Detail({ D, h, back }) {
  const [kind, setKind] = useState("1d");
  const w = h.why, m = h.metrics, a = h.analysis, t = h.tech;
  const v2 = !!(w && w.tier), V1 = D.rules_v1 || {};
  const F = v2 ? D.rules.scores.conviction : (V1.factors || {}), L = v2 ? D.rules.factor_labels : (V1.factor_labels || {});
  const WW = (v2 ? D.rules.wildcard : (V1.wildcard || D.rules.wildcard)).weight;
  const span = (m.target_high || 0) - (m.target_low || 0);
  const pos = v => span > 0 ? Math.max(0, Math.min(100, (v - m.target_low) / span * 100)) : 50;
  const fl = a.filings || {};
  const rb = date(h.target_date, { month: "short", day: "numeric", year: "numeric" });
  const since = h.ceo_since ? (h.founder ? ` · founded ${h.ceo_since}` : ` · leading since ${h.ceo_since}`) : "";
  return html`
    <${Card} className="col-span-12" id="detail">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="self-center"><${CoLogo} t=${h.ticker} size=${32} /></span>
          <span className="num text-[14px] font-semibold text-emerald">${h.ticker}</span>
          <h3 id="detail-title" tabIndex="-1" className="text-[23px] font-extrabold tracking-tight leading-none text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">${h.name}</h3>
          ${h.tier && html`<span className="self-center"><${Chip} kind=${TIER[h.tier].kind}>${TIER[h.tier].label}<//></span>`}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          ${back && html`<${Pill} onClick=${back}>← Leaders<//>`}
          ${[["1D", "1d"], ["4H", "4h"]].map(([l, k]) => html`<${Pill} key=${k} active=${kind === k} onClick=${() => setKind(k)} label=${(k === "1d" ? "Daily" : "4-hour") + " chart"}>${l}<//>`)}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7 min-w-0">
          ${(kind === "4h" && !h.candles_4h.length) ? html`<p className="text-dim text-[13px] py-16 text-center">4-hour bars aren't available right now.</p>`
            : html`<${Candles} key=${h.ticker + kind} rows=${kind === "1d" ? t.candles_1d : h.candles_4h} kind=${kind} />`}
          <p className="mt-5 mb-0 text-[14.5px] leading-relaxed text-silver">${h.thesis}</p>
          ${h.leaving && html`
            <div className="mt-4 rounded-xl bg-coral/[0.06] border border-coral/20 p-4 text-[13px] text-silver leading-snug"><b className="text-coral">Leaving at the next trade: ${h.leaving.rule}.</b> ${h.leaving.detail}</div>`}
          ${h.wildcard ? html`
            <div className="mt-4 rounded-xl bg-emerald/[0.05] border border-line p-4 text-[13px] text-silver leading-snug"><b className="text-fg">Wildcard, fixed at ${pctU(WW, 0)}.</b> One fast grower that misses the quality cut gets in on its catalysts: revenue up ${pct(m.rev_growth, 0)} on the year. Weight now ${pctU(h.weight)}.</div>`
            : v2 ? html`
            <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line rounded-xl border border-line overflow-hidden">
                ${[[TIER[w.tier].label, html`<span className="inline-flex items-center">Tier<${InfoTip} label="tiers">${TIPS.tier}<//></span>`],
                   [w.conviction.toFixed(0), html`<span className="inline-flex items-center">Conviction<${InfoTip} label="conviction">${TIPS.conviction}<//></span>`],
                   [pctU(w.raw), "Tier base, tilted"], [pctU(h.target), w.binding ? "Target, at the cap" : "Target"]].map(([v, k], i) => html`
                  <div key=${i} className="bg-white px-3 py-2.5 min-w-0"><div className=${"num text-[14px] sm:text-[15px] font-semibold " + (i === 3 ? "text-emerald" : "text-fg")}>${v}</div><div className="text-[11px] text-dim mt-0.5 leading-tight">${k}</div></div>`)}
              </div>
              <div className="mt-2 text-[12px] text-dim">Target set ${rb}. Weight now <span className="num font-semibold text-fg">${pctU(h.weight)}</span> after price moves.</div>
            </div>`
            : w && html`
            <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line rounded-xl border border-line overflow-hidden">
                ${[[pctU(w.size_share), "Equal start"], [w.tilt.toFixed(2) + "×", html`<span className="inline-flex items-center">Score ${h.composite.toFixed(0)} tilt<${InfoTip} label="the score">${TIPS.score}<//></span>`],
                   [pctU(w.final), w.binding ? `After ${w.binding === "floor" ? pctU(V1.floor, 0) + " floor" : pctU(V1.cap, 0) + " cap"}` : "After limits"], [pctU(h.target), "Target"]].map(([v, k], i) => html`
                  <div key=${i} className="bg-white px-3 py-2.5 min-w-0"><div className=${"num text-[14px] sm:text-[15px] font-semibold " + (i === 3 ? "text-emerald" : "text-fg")}>${v}</div><div className="text-[11px] text-dim mt-0.5 leading-tight">${k}</div></div>`)}
              </div>
              <div className="mt-2 text-[12px] text-dim">Target set ${rb}. Weight now <span className="num font-semibold text-fg">${pctU(h.weight)}</span> after price moves.</div>
            </div>`}
        </div>
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-5 min-w-0">
          <div className="flex items-center gap-4">
            <span className="sm:hidden"><${Avatar} h=${h} size=${60} /></span><span className="hidden sm:block"><${Avatar} h=${h} size=${96} /></span>
            <div className="min-w-0">
              <div className="text-[17px] font-bold text-fg leading-tight">${cleanName(h.ceo)}</div>
              <div className="text-[12.5px] text-dim mt-0.5">${h.role}, ${h.name}${since}</div>
            </div>
          </div>
          ${h.leader && html`<p className="m-0 text-[13.5px] leading-relaxed text-silver">${h.leader.story}</p>`}
          <div>
            <${Label} icon="target">The Numbers<//>
            <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3">
              <${KV} k="Return on capital" v=${pctU(a.roic)} />
              <${KV} k="Cost of capital" v=${pctU(a.wacc)} />
              <${KV} k="Beats hurdle" v=${a.spread == null ? "–" : pts(a.spread)} cls=${tone(a.spread)} tip=${html`<${InfoTip} label="the hurdle">${TIPS.hurdle}<//>`} />
              <${KV} k="Revenue growth" v=${pct(a.rev_growth, 0)} cls=${tone(a.rev_growth)} />
              <${KV} k="EPS growth" v=${pct(a.eps_growth, 0)} cls=${tone(a.eps_growth)} />
              <${KV} k="Beat estimates" v=${a.quarters ? `${a.beats} of ${a.quarters}` : "–"} />
            </div>
          </div>
          <div className="hidden sm:grid gap-2">
            ${Object.keys(F).map(k => html`
              <div key=${k} className="grid grid-cols-[104px_1fr_30px] items-center gap-3 text-[12.5px]">
                <span className="text-silver">${L[k] || k} <span className="text-dim">${Math.round(F[k] * 100)}</span></span>
                <div className="h-1.5 rounded-full bg-fg/[0.07] overflow-hidden"><div className="h-full rounded-full bg-emerald" style=${{ width: (h.scores[k] || 0) + "%" }}></div></div>
                <span className="num text-right font-semibold text-fg">${h.scores[k] == null ? "–" : h.scores[k].toFixed(0)}</span>
              </div>`)}
            <div className="text-[11px] text-dim">${v2 ? "Ranks out of 100 among eligible companies" : "Scores out of 100 under the v1 rules"}, set ${rb}</div>
          </div>
          ${span > 0 && html`
            <div>
              <div className="flex items-baseline justify-between"><${Label}>Analyst Target<//><span className="text-[12px] text-dim">${ratingText(m.rating)} · ${m.analysts || 0} analysts</span></div>
              <div className="mt-3 relative h-1.5 rounded-full bg-fg/[0.07]">
                <div className="absolute -top-1 w-0.5 h-3.5 bg-fg/50 rounded" style=${{ left: pos(h.price) + "%" }} title="Price today"></div>
                <div className="absolute -top-1 w-0.5 h-3.5 bg-emerald rounded" style=${{ left: pos(m.target_mean) + "%" }} title="Average target"></div>
              </div>
              <div className="mt-2 flex justify-between num text-[11px] text-dim"><span>${money(m.target_low, 0)}</span><span className="text-emerald font-semibold">${money(m.target_mean, 0)} average</span><span>${money(m.target_high, 0)}</span></div>
              <div className="mt-1 text-[11px] text-dim">Gray tick = today</div>
            </div>`}
          <div className="flex flex-wrap gap-2 mt-auto">
            ${fl.annual && html`<${Pill} href=${fl.annual.url}>${fl.annual.form} · ${date(fl.annual.date, { month: "short", year: "numeric" })} ↗<//>`}
            ${fl.quarterly && html`<${Pill} href=${fl.quarterly.url}>${fl.quarterly.form} · ${date(fl.quarterly.date, { month: "short", year: "numeric" })} ↗<//>`}
            ${fl.proxy && html`<${Pill} href=${fl.proxy.url}>Proxy ↗<//>`}
            <${Pill} href=${h.links.ir}>Investor relations ↗<//>
          </div>
        </div>
      </div>
    <//>`;
}

function Years({ D }) {
  const data = Object.entries(D.years).map(([y, v]) => ({ y: y + (v.partial ? " YTD" : ""), p: v.prsn, b: v.bench }));
  const lab = { fill: C.fg, fontSize: 11, fontFamily: "JetBrains Mono, monospace" };
  const fmtL = v => (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(0) + "%";
  const all = data.flatMap(d => [d.p, d.b, 0]), lo = Math.min(...all), hi = Math.max(...all);   // room under negative bars for their labels
  return html`
    <${Card} className="col-span-12">
      <${Head} title="Year By Year" icon="bars" aside=${html`<span className="inline-flex gap-4 items-center"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style=${{ background: C.prsn }}></span>PRSN</span><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style=${{ background: C.spxSoft }}></span>S&P 500</span></span>`} />
      <div className="h-[180px] sm:h-[200px]">
        <${ResponsiveContainer} width="100%" height="100%">
          <${BarChart} data=${data} margin=${{ top: 22, right: 0, bottom: 0, left: 0 }} barGap=${3}>
            <${XAxis} dataKey="y" axisLine=${false} tickLine=${false} tick=${{ fill: C.dim, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} />
            <${YAxis} hide domain=${[lo - (hi - lo) * 0.16, hi]} />
            <${ReferenceLine} y=${0} stroke="rgba(23,36,58,0.14)" />
            <${Bar} dataKey="p" radius=${[4, 4, 4, 4]} maxBarSize=${34} fill=${C.prsn} isAnimationActive=${!reduced}><${LabelList} dataKey="p" position="top" formatter=${fmtL} style=${lab} /><//>
            <${Bar} dataKey="b" radius=${[4, 4, 4, 4]} maxBarSize=${34} fill=${C.spxSoft} isAnimationActive=${!reduced}><${LabelList} dataKey="b" position="top" formatter=${fmtL} style=${{ ...lab, fill: C.dim }} /><//>
          <//>
        <//>
      </div>
    <//>`;
}

// ---------- research: how companies are chosen, with the math in view
function Research({ D }) {
  const R = D.rules, Q = D.research, G = R.gates, T = R.tiers, SC = R.scores, EX = R.rebalance.execution;
  const held = D.holdings.filter(h => !h.wildcard).length;
  const PLAINF = { roic_spread: "return on capital over its cost", op_margin: "operating margin", fcf_margin: "free-cash-flow margin", gross_margin: "gross margin", roe: "return on equity", leverage: "low debt",
    fwd_eps_growth: "earnings growth expected", rev_growth: "revenue growth", beat_rate: "quarters beating estimates", surprise: "size of the beats", insider_net: "insider buying", buyback_yield: "buybacks", momentum: "12-month momentum",
    cheap_pe: "low forward P/E", fcf_yield: "free-cash-flow yield", upside: "analyst upside", peg: "P/E for the growth", off_high: "room below the 52-week high" };
  const pctW = o => Object.entries(o).map(([k, v]) => `${PLAINF[k] || k} ${Math.round(v * 100)}`).join(" · ");
  const Step = ({ n, t, icon, children }) => html`
    <div className="min-w-[86%] sm:min-w-[60%] lg:min-w-0 snap-start flex flex-col gap-3 rounded-xl border border-line bg-page/60 p-4 sm:p-5">
      <div className="flex items-center gap-2.5"><${IconBadge} n=${icon} /><span className="num text-[12px] font-semibold text-emerald">Step ${n}</span></div>
      <div className="text-[20px] font-extrabold tracking-tight text-fg leading-none">${t}</div>
      ${children}
    </div>`;
  const P = ({ children }) => html`<p className="m-0 text-[13.5px] leading-relaxed text-silver">${children}</p>`;
  const Res = ({ children }) => html`<div className="mt-auto text-[13px] leading-snug font-medium text-fg border-l-2 border-emerald pl-3">${children}</div>`;
  const Gates = ({ rows }) => html`<ul className="m-0 p-0 list-none grid gap-1.5 text-[13px] text-fg">
    ${rows.map(([k, v]) => html`<li key=${k} className="flex gap-3"><span className="w-[70px] shrink-0 text-dim">${k}</span><span className="num text-[12.5px]">${v}</span></li>`)}</ul>`;
  return html`
    <${Card} className="col-span-12 relative overflow-hidden" id="research">
      <div aria-hidden="true" className="absolute top-0 left-0 right-0 flex h-[3px]"><span className="flex-1" style=${{ background: C.prsn }}></span><span className="flex-1 bg-white"></span><span className="flex-1" style=${{ background: C.spx }}></span></div>
      <${Head} title="How Companies Are Chosen" icon="flask" aside=${`Rules v${R.version} · checked every week`} />
      <p className="-mt-1 mb-5 max-w-[70ch] text-[14px] leading-relaxed text-silver">Heritage decides who can be considered. After that, only the numbers decide who gets in and how much each one gets. Nobody picks stocks by hand, me included.</p>
      <div className="-mx-5 px-5 sm:mx-0 sm:px-0 flex lg:grid lg:grid-cols-3 gap-3 sm:gap-4 overflow-x-auto lg:overflow-visible snap-x snap-mandatory scroll-px-5 overscroll-x-contain pb-1">
        <${Step} n=${1} t="Select" icon="search">
          <${P}>Every US-listed company led by a Persian or Iranian CEO, co-CEO or executive chair, documented by a public source. Each one must clear every gate.<//>
          <${Gates} rows=${[["Size", `market cap > $${Math.round(G.min_mcap_b * 1000)}M`], ["Liquidity", `> $${G.min_adv_musd}M a day ($${G.min_adv_small_musd}M small caps)`], ["Listing", `${G.exchanges.join(", ")}, price ≥ $${G.min_price}`],
            ["Trend", `not ${Math.abs(G.stop_rel_3m * 100)}+ pts behind the S&P 500 over 3 months`], ["Record", "no going-concern, signed takeover or interim leader"]]} />
          <${Res}>${D.universe_size} tracked. ${held} held now, plus ${D.holdings.some(h => h.wildcard) ? "one wildcard" : "no wildcard"}.<//>
        <//>
        <${Step} n=${2} t="Score" icon="pulse">
          <${P}>Three scores, each a 0–100 rank among the companies that passed. Quality must be in the top half, with an operating profit, before the others count.<//>
          ${[["Quality", "Is it a great business?", SC.quality], ["Catalyst", "Is there a reason it moves soon?", SC.catalyst], ["Rerate", "Is it priced for less than it is?", SC.rerate]].map(([k, q, o]) => html`
            <div key=${k} className="text-[12.5px] leading-snug"><b className="text-fg">${k}</b> <span className="text-dim">· ${q}</span><div className="mt-0.5 text-silver">${pctW(o)}</div></div>`)}
          <${Math_}>Conviction = ${SC.conviction.quality} Q + ${SC.conviction.catalyst} C + ${SC.conviction.rerate} R<//>
          <${Res}>${Q.clear_hurdle} of ${Q.core} earn more than their cost of capital: ${pctU(Q.roic)} return on capital vs a ${pctU(Q.wacc)} cost.<//>
        <//>
        <${Step} n=${3} t="Size & Trade" icon="pie">
          <${P}>Concentrate in the best ideas. Within a tier, conviction moves weight up or down by up to ${Math.round(T.tilt * 100)}%.<//>
          <${Gates} rows=${[["Core", `top ${T.core.count} with catalyst ≥ ${T.core.min_catalyst}: ~${pctU(T.core.base, 0)}, max ${pctU(T.core.max, 0)}`], ["Build", `next ${T.build.count}: ~${pctU(T.build.base, 0)}, max ${pctU(T.build.max, 0)}`],
            ["Toehold", `the rest: ~${pctU(T.toehold.base, 0)}, max ${pctU(T.toehold.max, 0)}`], ["Small caps", `under $${Math.round(G.small_cap_below_b * 1000)}M: ≤ ${pctU(R.small_cap.max_each, 0)} each, ≤ ${pctU(R.small_cap.max_total, 0)} total`],
            ["Wildcard", `${pctU(R.wildcard.weight, 0)}, best catalyst among fast growers`], ["Cash", "whatever is left sits in T-bills"]]} />
          <${P}>Checked every Friday. New names enter at the monthly reset; a broken rule or a ${Math.round(R.rebalance.drift_band * 100)}-pt drift triggers a trade any week. Trades wait for the first calm day (VIX under ${EX.vix_max}, not ${Math.round(EX.vix_spike * 100)}%+ above its 5-day average), then fill at the next close.<//>
          <${Res}>${D.pending ? `Trade pending: decided ${date(D.pending.decided, { month: "short", day: "numeric" })}, executes by ${date(D.pending.window_end, { month: "short", day: "numeric" })}.` : `Last trade ${date(D.last_rebalance, { month: "short", day: "numeric" })}. Next check ${date(D.next_rebalance, { month: "short", day: "numeric" })}.`}<//>
        <//>
      </div>
      <div className="lg:hidden mt-2 text-[11.5px] text-dim">Swipe for all three steps →</div>
    <//>`;
}

// ---------- holdings breakdown: a donut in the flag's colors, green through white to red, with each company's logo on its slice
const arc = (cx, cy, r0, r1, a0, a1) => {
  const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const big = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  return `M${x0} ${y0}A${r1} ${r1} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${big} 0 ${x3} ${y3}Z`;
};
const FLAG_RAMP = ["#178A3E", "#3A9C59", "#64B07C", "#9DCDAA", "#ECB8B3", "#DD857D", "#D2594F", "#C8322B"];
const rampColor = (i, n) => FLAG_RAMP[n <= 1 ? 0 : Math.round(i * (FLAG_RAMP.length - 1) / (n - 1))];
function SliceLogo({ t, x, y, size }) {
  const url = useLogo(t);
  const id = "clip-" + t.replace(/[^A-Za-z0-9]/g, "");
  return html`<g pointerEvents="none">
    <circle cx=${x} cy=${y} r=${size / 2 + 2} fill="#fff" />
    ${url ? html`<clipPath id=${id}><circle cx=${x} cy=${y} r=${size / 2} /></clipPath><image href=${url} x=${x - size / 2} y=${y - size / 2} width=${size} height=${size} clipPath=${"url(#" + id + ")"} preserveAspectRatio="xMidYMid slice" />`
      : html`<text x=${x} y=${y + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="700" fill=${C.fg}>${t}</text>`}
  </g>`;
}
function Breakdown({ D, selTicker, pick }) {
  const [hov, setHov] = useState(null);
  const cash = D.cash > 0.005 ? [{ h: { ticker: "CASH", name: "Cash in T-bills", weight: D.cash, sector: "Weight the rules didn't place" }, i: -1 }] : [];
  const H = [...D.holdings.map((h, i) => ({ h, i })), ...cash].sort((a, b) => b.h.weight - a.h.weight);
  const tot = H.reduce((s, x) => s + x.h.weight, 0);
  const cx = 170, cy = 170, R1 = 158, R0 = 100, gap = 0.012;
  let a = 0;
  const sl = H.map((x, k) => {
    const sweep = x.h.weight / tot * Math.PI * 2, a0 = a, a1 = a + sweep; a = a1;
    const mid = (a0 + a1) / 2, rm = (R0 + R1) / 2;
    return { ...x, k, a0, a1, color: rampColor(k, H.length), lx: cx + rm * Math.sin(mid), ly: cy - rm * Math.cos(mid), size: Math.max(18, Math.min(36, sweep * rm * 0.62)) };
  });
  const focus = sl.find(x => x.h.ticker === (hov || selTicker));
  const rb = date(D.last_rebalance, { month: "short", day: "numeric" });
  return html`
    <${Card} className="col-span-12" id="breakdown">
      <${Head} title="Holdings Breakdown" icon="pie" aside=${`Weights now · targets set ${rb}`} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-5 flex justify-center">
          <svg viewBox="0 0 340 340" className="w-full max-w-[340px] h-auto" role="img" aria-label=${"Holdings by weight: " + sl.map(x => `${x.h.name} ${pctU(x.h.weight)}`).join(", ")}>
            ${sl.map(x => {
              const on = x.h.ticker === (hov || selTicker);
              return html`<path key=${x.h.ticker} d=${arc(cx, cy, R0, on ? R1 + 6 : R1, x.a0 + gap, x.a1 - gap)} fill=${x.color} stroke="#fff" strokeWidth="1"
                className="cursor-pointer transition-[d] duration-150" onMouseEnter=${() => setHov(x.h.ticker)} onMouseLeave=${() => setHov(null)} onClick=${() => x.i >= 0 && pick(x.i)}><title>${x.h.name} ${pctU(x.h.weight)}</title></path>`;
            })}
            ${sl.map(x => html`<${SliceLogo} key=${"l" + x.h.ticker} t=${x.h.ticker} x=${x.lx} y=${x.ly} size=${x.size} />`)}
            <circle cx=${cx} cy=${cy} r=${R0 - 8} fill="#fff" />
            ${focus ? html`<g>
                <text x=${cx} y=${cy - 14} textAnchor="middle" fontSize="13" fontWeight="600" fill=${C.dim}>${focus.h.ticker}</text>
                <text x=${cx} y=${cy + 16} textAnchor="middle" fontSize="30" fontWeight="700" fill=${C.fg} fontFamily="JetBrains Mono, monospace">${pctU(focus.h.weight)}</text>
                <text x=${cx} y=${cy + 36} textAnchor="middle" fontSize="11.5" fill=${C.dim}>${focus.h.name.length > 22 ? focus.h.ticker : focus.h.name}</text></g>`
              : html`<text x=${cx} y=${cy + 6} textAnchor="middle" fontSize="16" fontWeight="700" fill=${C.fg}>${H.length} holdings</text>`}
          </svg>
        </div>
        <ul className="lg:col-span-7 m-0 p-0 list-none grid grid-cols-2 gap-x-4 sm:gap-x-6">
          ${sl.map(x => html`
            <li key=${x.h.ticker}>
              <button type="button" onClick=${() => x.i >= 0 && pick(x.i)} onMouseEnter=${() => setHov(x.h.ticker)} onMouseLeave=${() => setHov(null)}
                className=${"w-full text-left flex items-center gap-2 sm:gap-3 py-2 sm:py-2.5 border-b border-line rounded-sm transition-colors " + (x.h.ticker === (hov || selTicker) ? "bg-page" : "")}>
                <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0" style=${{ background: x.color }}></span>
                <${CoLogo} t=${x.h.ticker} size=${26} />
                <span className="min-w-0 flex-1"><span className="sm:hidden num text-[13px] font-semibold text-fg">${x.h.ticker}</span><span className="hidden sm:block text-[13.5px] font-semibold text-fg leading-tight truncate">${x.h.name}</span><span className="hidden sm:block text-[11.5px] text-dim leading-tight truncate">${x.h.sector || ""}</span></span>
                <span className="num text-[13.5px] font-semibold text-fg">${pctU(x.h.weight)}</span>
              </button>
            </li>`)}
        </ul>
      </div>
    <//>`;
}

// ---------- beyond the index: private honorable mentions, candidates to watch, and every Persian led company tracked
const bil = b => b >= 1000 ? "$" + (b / 1000).toFixed(2) + "T" : "$" + Math.round(b) + "B";
function RoundsChart({ vals }) {
  const ref = useRef(null);
  const W = Math.max(260, useWidth(ref)), H = 190, m = { l: 8, r: 22, t: 26, b: 26 };   // drawn at real width so labels stay readable on phones
  const t = d => new Date(d + "T12:00:00Z").getTime();
  const x0 = t(vals[0].date), x1 = t(vals[vals.length - 1].date), hi = Math.max(...vals.map(v => v.valuation_b));
  const x = d => m.l + (t(d) - x0) / Math.max(1, x1 - x0) * (W - m.l - m.r), y = v => m.t + (1 - v / hi) * (H - m.t - m.b);
  const path = vals.map((v, i) => i ? `H${x(v.date).toFixed(1)}V${y(v.valuation_b).toFixed(1)}` : `M${x(v.date).toFixed(1)} ${y(v.valuation_b).toFixed(1)}`).join("");
  return html`<div ref=${ref} className="w-full"><svg viewBox=${`0 0 ${W} ${H}`} width="100%" height=${H} role="img" aria-label=${"Valuation at each round: " + vals.map(v => `${v.round} ${bil(v.valuation_b)}`).join(", ")}>
    <line x1=${m.l} x2=${W - m.r} y1=${H - m.b} y2=${H - m.b} stroke=${C.line} />
    <path d=${path + `H${W - m.r}`} fill="none" stroke=${C.navy} strokeWidth="2.2" strokeLinejoin="round" />
    ${vals.map((v, i) => html`<g key=${v.date}>
      <circle cx=${x(v.date)} cy=${y(v.valuation_b)} r="4" fill="#fff" stroke=${C.navy} strokeWidth="2" />
      <text x=${x(v.date)} y=${y(v.valuation_b) - 10} textAnchor=${i === vals.length - 1 ? "end" : "middle"} fontSize="12" fontWeight="700" fill=${C.fg} fontFamily="JetBrains Mono, monospace">${bil(v.valuation_b)}</text>
      ${(i === 0 || v.date.slice(0, 4) !== vals[i - 1].date.slice(0, 4)) && html`<text x=${x(v.date)} y=${H - 8} textAnchor=${i === 0 ? "start" : i === vals.length - 1 ? "end" : "middle"} fontSize="11" fill=${C.dim} fontFamily="JetBrains Mono, monospace">${v.date.slice(0, 4)}</text>`}</g>`)}
  </svg></div>`;
}
function Honorable({ D }) {
  if (!D.private || !D.private.length) return null;
  return html`
    <${Card} className="col-span-12" id="honorable">
      <${Head} title="Honorable Mention" icon="target" aside="Private, so not in the index" />
      <div className="grid gap-6">
        ${D.private.map(p => {
          const bars = [["Databricks valuation", p.mult, C.navy], ["PRSN", p.prsn_mult, C.prsn], ["S&P 500", p.bench_mult, C.spx]].map(([k, v, c]) => [k === "Databricks valuation" ? p.name + " valuation" : k, v, c]);
          const mx = Math.max(...bars.map(b => b[1]));
          return html`
          <div key=${p.id} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 min-w-0 flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <${Avatar} h=${p} size=${72} lazy=${true} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><${CoLogo} t=${p.id} size=${22} /><span className="text-[17px] font-bold text-fg leading-tight">${p.name}</span></div>
                  <div className="text-[12.5px] text-dim mt-1">${cleanName(p.ceo)}, ${p.role}${p.founder ? " · co-founder" : ""} · ${p.sector}</div>
                </div>
              </div>
              <p className="m-0 text-[13.5px] leading-relaxed text-silver">${(p.leader || {}).story}</p>
              <p className="m-0 text-[12px] leading-snug text-dim">${p.note}</p>
            </div>
            <div className="lg:col-span-7 min-w-0 grid gap-4">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div><div className="num text-[34px] sm:text-[40px] font-semibold leading-none text-accent">${bil(p.latest.valuation_b)}</div><div className="text-[11.5px] text-dim mt-1">${p.latest.round} valuation, ${date(p.latest.date, { month: "short", year: "numeric" })}</div></div>
                <div><div className="num text-[22px] font-semibold leading-none text-fg">${pct(p.ann, 0)}<span className="text-[13px] text-dim font-normal"> a year</span></div><div className="text-[11.5px] text-dim mt-1">since ${date(p.since, { month: "short", year: "numeric" })}, at round prices</div></div>
              </div>
              <${RoundsChart} vals=${p.valuations} />
              <div className="grid gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Growth Since ${date(p.since, { month: "short", year: "numeric" })}</div>
                ${bars.map(([k, v, c]) => html`
                  <div key=${k} className="grid grid-cols-[132px_1fr_52px] sm:grid-cols-[170px_1fr_56px] items-center gap-3 text-[12.5px]">
                    <span className="text-silver truncate">${k}</span>
                    <div className="h-2 rounded-full bg-fg/[0.06] overflow-hidden"><div className="h-full rounded-full" style=${{ width: (v / mx * 100) + "%", background: c }}></div></div>
                    <span className="num text-right font-semibold text-fg">${v.toFixed(2)}×</span>
                  </div>`)}
                <div className="text-[11px] text-dim leading-snug">Private valuations are set by investors in funding deals, not daily trading, so they move in steps and can't be bought like a stock. Sources: ${p.valuations.map((v, i) => html`<span key=${v.date}>${i ? ", " : ""}<a className="underline underline-offset-2 hover:text-fg" href=${v.source} target="_blank" rel="noopener">${v.round}</a></span>`)}.</div>
              </div>
            </div>
          </div>`;
        })}
      </div>
    <//>`;
}
function AllCompanies({ D, pick }) {
  const inIdx = [...D.holdings].map((h, i) => ({ h, i })).sort((a, b) => b.h.weight - a.h.weight);
  const watch = D.bench || [], priv = D.private || [];
  const total = inIdx.length + watch.length + priv.length;
  const Row = ({ t, name, ceo, role, chip, sub, onClick }) => {
    const inner = html`
      <${CoLogo} t=${t} size=${30} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-fg leading-tight truncate">${name}</span>
        <span className="block text-[11.5px] text-dim leading-tight truncate">${cleanName(ceo)}, ${role}${sub ? html`<span className="hidden sm:inline"> · ${sub}</span>` : ""}</span>
      </span>
      ${chip}`;
    const cls = "w-full text-left flex items-center gap-3 py-2.5 border-b border-line min-w-0";
    return onClick ? html`<button type="button" onClick=${onClick} className=${cls + " hover:bg-page transition-colors rounded-sm"}>${inner}</button>` : html`<div className=${cls}>${inner}</div>`;
  };
  const Group = ({ title, n, children }) => html`
    <div className="min-w-0">
      <div className="flex items-baseline gap-2 mb-1"><span className="text-[14px] font-bold text-fg">${title}</span><span className="num text-[12px] text-dim">${n}</span></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">${children}</div>
    </div>`;
  return html`
    <${Card} className="col-span-12" id="all">
      <${Head} title="Every Persian Led Company We Track" icon="users" aside=${`${total} companies · ${inIdx.length} in PRSN · ${watch.length} to watch · ${priv.length} private`} />
      <div className="grid gap-6">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 mb-2"><span className="text-[14px] font-bold text-fg">In The Index</span><span className="num text-[12px] text-dim">${inIdx.length}</span></div>
          <div className="flex flex-wrap gap-2">
            ${inIdx.map(({ h, i }) => html`<button key=${h.ticker} type="button" onClick=${() => pick(i)} title=${`${h.name}, ${cleanName(h.ceo)}`}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-white hover:border-emerald/50 pl-1 pr-3 py-1 transition-colors">
              <${CoLogo} t=${h.ticker} size=${24} /><span className="num text-[12.5px] font-semibold text-fg">${h.ticker}</span><span className="num text-[12px] text-emerald font-semibold">${pctU(h.weight)}</span></button>`)}
          </div>
        </div>
        <${Group} title="Candidates To Watch" n=${watch.length}>
          ${watch.map(b => html`<${Row} key=${b.ticker} t=${b.ticker} name=${b.name} ceo=${b.ceo} role=${b.role} sub=${b.detail}
            chip=${html`<span className=${"shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap " + (b.rule === "Joining" ? "bg-emerald/10 text-emerald" : "bg-fg/[0.05] text-silver")}>${b.rule}</span>`} />`)}
        <//>
        ${priv.length > 0 && html`<${Group} title="Honorable Mentions, Private" n=${priv.length}>
          ${priv.map(p => html`<${Row} key=${p.id} t=${p.id} name=${p.name} ceo=${p.ceo} role=${p.role} sub=${p.sector} onClick=${() => goTo("honorable")}
            chip=${html`<span className="shrink-0 rounded-full bg-accent/[0.07] text-accent px-2 py-0.5 text-[11.5px] font-semibold num">${bil(p.latest.valuation_b)}</span>`} />`)}
        <//>`}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[11.5px] text-dim leading-snug max-w-[70ch]">Candidates are re-screened every Friday and join at the monthly reset once they clear every gate. Know a Persian or Iranian CEO we're missing? Anyone can nominate a leader, including themselves.</p>
        <${Pill} primary href=${NOMINATE_URL}>Nominate a leader ↗<//>
      </div>
    <//>`;
}

// ---------- decision log: every weekly run, what it decided and why
const TRIGGER = { "v2 launch": ["Rules v2", "accent"], "monthly reconstitution": ["Monthly reset", "good"], "event exit": ["Rule broken", "bad"], drift: ["Drift", "accent"], "no change": ["No trades", ""] };
function Decisions({ D }) {
  const M = D.macro || {}, P = D.pending, R = D.rules;
  const [open, setOpen] = useState(null);
  const nm = t => ((D.holdings.find(h => h.ticker === t) || D.bench.find(b => b.ticker === t) || {}).name || t);
  const tk = ts => ts.map(t => html`<span key=${t} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white pl-0.5 pr-2 py-0.5"><${CoLogo} t=${t} size=${18} /><span className="num text-[11.5px] font-semibold text-fg">${t}</span></span>`);
  return html`
    <${Card} className="col-span-12" id="decisions">
      <${Head} title="Decision Log" icon="calendar" aside="Every Friday, after the close. Nobody overrides it." />
      ${P && html`<div className="mb-5 rounded-xl border border-emerald/30 bg-emerald/[0.05] p-4">
        <div className="flex flex-wrap items-center gap-2"><${Chip} kind="good">Trade pending<//><span className="text-[12.5px] text-dim">Decided ${date(P.decided)} · executes by ${date(P.window_end)}${P.signal ? ` · calm-day signal ${date(P.signal, { month: "short", day: "numeric" })}, fills at the next close` : " · waiting for a calm day"}</span></div>
        <p className="mt-2 mb-0 text-[13.5px] leading-relaxed text-fg">${P.summary}</p>
      </div>`}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pb-5 mb-1 border-b border-line">
        <${KV} k="Market regime" v=${M.regime || "–"} cls=${M.regime === "Risk-off" ? "!text-coral" : M.regime === "Risk-on" ? "!text-emerald" : ""} />
        <${KV} k=${`VIX · trades wait if ≥ ${R.rebalance.execution.vix_max}`} v=${dec(M.vix, 1)} />
        <${KV} k="10-year yield, 3-mo change" v=${M.ten_year == null ? "–" : `${pctU(M.ten_year, 2)} (${pts(M.ten_year_chg_3m, 2)})`} />
        <${KV} k="Dollar, 3 months" v=${pct(M.dollar_chg_3m)} />
        <${KV} k="S&P 500 vs 200-day" v=${pct(M.spx_vs_sma200)} cls=${tone(M.spx_vs_sma200)} />
      </div>
      <p className="mt-2 mb-3 text-[11.5px] text-dim">Macro readings are shown and logged. They don't change weights until a test shows they help.</p>
      <ol className="m-0 p-0 list-none">
        ${(D.decisions || []).map((d, i) => {
          const [lab, kind] = TRIGGER[d.trigger] || [d.trigger, ""];
          const on = open === i;
          return html`<li key=${d.date} className="py-3 border-t border-line">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="num text-[12.5px] font-semibold text-fg w-[92px] shrink-0">${date(d.date)}</span>
              <${Chip} kind=${kind}>${lab}<//>
              <span className="text-[11.5px] text-dim num">v${d.rules} · VIX ${dec(d.vix, 1)} · ${d.regime || ""}</span>
              ${d.targets && d.targets.length > 0 && html`<button type="button" onClick=${() => setOpen(on ? null : i)} aria-expanded=${on} className="ml-auto text-[12px] font-semibold text-accent hover:underline">${on ? "Hide targets" : "Show targets"}</button>`}
            </div>
            <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-silver max-w-[90ch]">${d.summary}</p>
            ${(d.adds.length > 0 || d.drops.length > 0) && html`<div className="mt-2 flex flex-wrap items-center gap-1.5">
              ${d.adds.length > 0 && html`<span className="text-[11px] font-semibold text-emerald mr-0.5">In</span>`}${tk(d.adds)}
              ${d.drops.length > 0 && html`<span className="text-[11px] font-semibold text-coral ml-2 mr-0.5">Out</span>`}${tk(d.drops)}
            </div>`}
            ${d.exits && d.exits.length > 0 && html`<ul className="mt-2 mb-0 pl-0 list-none grid gap-1 text-[12px] text-silver">${d.exits.map(e => html`<li key=${e.ticker}><b className="text-fg">${nm(e.ticker)}</b> · ${e.rule}: ${e.detail}</li>`)}</ul>`}
            ${on && html`<div className="mt-3 overflow-x-auto"><table className="w-full text-[12.5px] num">
              <thead><tr className="text-[10.5px] uppercase tracking-[0.08em] text-dim"><th className="text-left font-semibold pb-1.5">Company</th><th className="text-left font-semibold pb-1.5 px-2">Tier</th><th className="text-right font-semibold pb-1.5 px-2">Conviction</th><th className="text-right font-semibold pb-1.5 px-2">Was</th><th className="text-right font-semibold pb-1.5">Target</th></tr></thead>
              <tbody>${d.targets.map(t => html`<tr key=${t.ticker} className="border-t border-line"><td className="py-1.5 font-semibold text-fg">${t.ticker}</td><td className="py-1.5 px-2">${TIER[t.tier] ? TIER[t.tier].label : t.tier}</td><td className="py-1.5 px-2 text-right">${t.conviction.toFixed(0)}</td><td className="py-1.5 px-2 text-right text-dim">${pctU(t.from)}</td><td className="py-1.5 text-right font-semibold text-emerald">${pctU(t.target)}</td></tr>`)}</tbody>
            </table></div>`}
          </li>`;
        })}
      </ol>
      <div className="mt-4 pt-4 border-t border-line grid gap-1.5">
        <${Label} icon="book">Rulebook versions<//>
        ${[...(R.changelog || [])].reverse().map(c => html`<p key=${c.version} className="m-0 text-[12.5px] text-silver leading-snug"><b className="num text-fg">v${c.version}</b> · ${date(c.date)} · ${c.note}</p>`)}
        <p className="m-0 text-[11.5px] text-dim">Every rule lives in one public file, <a className="underline underline-offset-2 hover:text-fg" href=${REPO + "/blob/main/engine/config/rules.yaml"} target="_blank" rel="noopener">rules.yaml ↗</a>. A change means a new version, logged here.</p>
      </div>
    <//>`;
}

// ---------- directory: every documented Persian or Iranian leader we know of, public and private
const initialsOf = s => s.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
function Directory({ D }) {
  const all = D.directory || [];
  const [tab, setTab] = useState("public");
  const [q, setQ] = useState("");
  const rows = all.filter(r => r.type === tab).filter(r => !q || (r.name + " " + r.company + " " + r.sector + " " + r.ticker).toLowerCase().includes(q.toLowerCase()));
  const n = k => all.filter(r => r.type === k).length;
  return html`
    <${Card} className="col-span-12" id="directory">
      <${Head} title="Leader Directory" icon="building" aside=${`${n("public")} public · ${n("private")} private · each with a public source`} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1.5" role="group" aria-label="Directory list">
          <${Pill} active=${tab === "public"} onClick=${() => setTab("public")}>Public companies<//>
          <${Pill} active=${tab === "private"} onClick=${() => setTab("private")}>Private companies<//>
        </div>
        <input type="search" value=${q} onInput=${e => setQ(e.target.value)} placeholder="Search name, company, sector" aria-label="Search the directory"
          className="ml-auto w-full sm:w-[260px] rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] text-fg placeholder:text-dim focus:outline-none focus:border-accent" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        ${rows.map(r => html`
          <div key=${r.name + r.company} className="rounded-xl border border-line bg-white p-4 flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              ${r.ticker ? html`<${CoLogo} t=${r.ticker} size=${36} />` : html`<span className="w-9 h-9 rounded-full grid place-items-center bg-accent/[0.07] ring-1 ring-line text-[12px] font-bold text-accent shrink-0" aria-hidden="true">${initialsOf(r.company)}</span>`}
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-bold text-fg leading-tight truncate">${r.name}</div>
                <div className="text-[12px] text-dim leading-tight truncate">${r.title}, <a href=${r.website} target="_blank" rel="noopener" className="hover:text-fg underline-offset-2 hover:underline">${r.company}</a>${r.ticker ? html` · <span className="num">${r.ticker}</span>` : ""}</div>
              </div>
              ${r.in_index && html`<${Chip} kind="good">In PRSN<//>`}
            </div>
            <p className="m-0 text-[12.5px] leading-snug text-silver">${r.background}</p>
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-dim">
              <span>${r.sector}</span><span>${r.hq}</span>
              <a href=${r.source} target="_blank" rel="noopener" className="ml-auto text-accent font-semibold hover:underline">Source ↗</a>
              ${r.confidence !== "confirmed" && html`<span title="Heritage documented by a weaker or indirect source" className="text-silver">· thin source</span>`}
            </div>
          </div>`)}
        ${rows.length === 0 && html`<p className="m-0 text-[13px] text-dim">No one matches that search.</p>`}
      </div>
      <div className="mt-5 rounded-xl bg-page border border-line p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-silver leading-snug max-w-[75ch]"><b className="text-fg">Missing someone, or are you one of them?</b> Nominate a CEO, co-CEO or executive chair of Persian or Iranian heritage, including yourself. Public companies over $${Math.round(D.rules.gates.min_mcap_b * 1000)}M, or private companies at Series A or $10M+ raised. Each entry needs a public source; nobody is added based on their name.</p>
        <${Pill} primary href=${NOMINATE_URL}>Nominate a leader ↗<//>
      </div>
    <//>`;
}

// ---------- live account: my real-money account following the rules, in percentages only
function Account({ D }) {
  const A = D.account;
  if (!A || !A.series || A.series.length < 2) return null;
  const data = A.series.map(r => ({ d: r[0], a: r[1], p: r[2] }));
  const end = data[data.length - 1];
  return html`
    <${Card} className="col-span-12" id="account">
      <${Head} title="Live Account" icon="dollar" aside=${`Real money, following the rules since ${date(A.since)} · updated ${date(A.updated)}`} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 h-[220px]">
          <${ResponsiveContainer} width="100%" height="100%">
            <${ComposedChart} data=${data} margin=${{ top: 10, right: 0, bottom: 0, left: 0 }}>
              <${XAxis} dataKey="d" hide /><${YAxis} hide domain=${["auto", "auto"]} />
              <${ReferenceLine} y=${100} stroke="rgba(23,36,58,0.10)" strokeDasharray="2 6" />
              <${Tooltip} content=${html`<${GlassTip} fmt=${p => html`<div className="text-dim">${date(p.d)}</div><div className="text-accent font-semibold">Account ${pct(p.a / 100 - 1)}</div><div className="text-emerald">PRSN ${pct(p.p / 100 - 1)}</div>`} />`} />
              <${Line} type="monotone" dataKey="p" stroke=${C.prsn} strokeWidth=${1.6} dot=${false} isAnimationActive=${false} />
              <${Line} type="monotone" dataKey="a" stroke=${C.navy} strokeWidth=${2.2} dot=${false} isAnimationActive=${false} />
            <//>
          <//>
        </div>
        <div className="lg:col-span-4 grid grid-cols-2 gap-4 content-start">
          <${KV} k="Account, time-weighted" v=${pct(end.a / 100 - 1)} cls=${tone(end.a - 100)} />
          <${KV} k="PRSN, same dates" v=${pct(end.p / 100 - 1)} cls=${tone(end.p - 100)} />
          <${KV} k="Gap (costs, timing, cash)" v=${pts(end.a / 100 - end.p / 100)} />
          <${KV} k="Positions" v=${A.positions.length} />
        </div>
      </div>
      <p className="mt-4 mb-0 text-[11.5px] text-dim leading-snug">I own these positions. Shown in percentages only. Trades follow the published decision; I approve the orders but don't choose them. Not investment advice.</p>
    <//>`;
}

// ---------- why PRSN: the objective, before anything else
function Why({ D }) {
  const top = [...D.holdings].sort((a, b) => (b.metrics.mcap_b || 0) - (a.metrics.mcap_b || 0)).slice(0, 3).map(h => cleanName(h.name).replace(/ (Technologies|Group|Inc\.?)$/, ""));
  return html`
    <section className="col-span-12 surface rounded-2xl relative overflow-hidden px-5 py-5 sm:px-7 sm:py-6" id="why" aria-labelledby="why-title">
      <div aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[4px] flex flex-col"><span className="flex-1" style=${{ background: C.prsn }}></span><span className="flex-1 bg-white"></span><span className="flex-1" style=${{ background: C.spx }}></span></div>
      <h2 id="why-title" className="m-0 text-[20px] sm:text-[24px] font-extrabold tracking-tight leading-tight text-fg">Fund Objective</h2>
      <p className="mt-2 mb-0 max-w-[70ch] text-[15px] sm:text-[16px] leading-relaxed text-silver">Persian and Iranian founders and CEOs lead some of the world's biggest companies, including ${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}. PRSN puts them in one place, and tests whether clear rules for picking and weighting can turn their companies into a worthwhile portfolio. <span className="font-semibold text-fg">For a free Iran.</span></p>
      <p className="mt-2.5 mb-0 text-[12px] text-dim leading-snug">A research project, not a fund, and not investment advice. I invest personally in these companies. <button type="button" onClick=${() => goTo("evidence")} className="text-accent font-semibold underline underline-offset-2">See the evidence ↓</button></p>
    </section>`;
}

// ---------- sources behind each rule (DOIs checked against Crossref)
const REFS = [
  ["ar03", "Anderson, R. C., & Reeb, D. M. (2003). Founding-family ownership and firm performance: Evidence from the S&P 500. Journal of Finance, 58(3), 1301–1328.", "10.1111/1540-6261.00567"],
  ["afp19", "Asness, C. S., Frazzini, A., & Pedersen, L. H. (2019). Quality minus junk. Review of Accounting Studies, 24(1), 34–112.", "10.1007/s11142-018-9470-2"],
  ["ajkm22", "Azoulay, P., Jones, B. F., Kim, J. D., & Miranda, J. (2022). Immigration and entrepreneurship in the United States. American Economic Review: Insights, 4(1), 71–88.", "10.1257/aeri.20200588"],
  ["ahm05", "Arnott, R. D., Hsu, J., & Moore, P. (2005). Fundamental indexation. Financial Analysts Journal, 61(2), 83–99.", "10.2469/faj.v61.n2.2718"],
  ["bblz14", "Bailey, D. H., Borwein, J. M., López de Prado, M., & Zhu, Q. J. (2014). Pseudo-mathematics and financial charlatanism: The effects of backtest overfitting on out-of-sample performance. Notices of the AMS, 61(5), 458–471.", "10.1090/noti1105"],
  ["bt89", "Bernard, V. L., & Thomas, J. K. (1989). Post-earnings-announcement drift: Delayed price response or risk premium? Journal of Accounting Research, 27, 1–36.", "10.2307/2491062"],
  ["bgir92", "Brown, S. J., Goetzmann, W., Ibbotson, R. G., & Ross, S. A. (1992). Survivorship bias in performance studies. Review of Financial Studies, 5(4), 553–580.", "10.1093/rfs/5.4.553"],
  ["chs08", "Campbell, J. Y., Hilscher, J., & Szilagyi, J. (2008). In search of distress risk. Journal of Finance, 63(6), 2899–2939.", "10.1111/j.1540-6261.2008.01416.x"],
  ["carhart97", "Carhart, M. M. (1997). On persistence in mutual fund performance. Journal of Finance, 52(1), 57–82.", "10.1111/j.1540-6261.1997.tb03808.x"],
  ["ckl03", "Chan, L. K. C., Karceski, J., & Lakonishok, J. (2003). The level and persistence of growth rates. Journal of Finance, 58(2), 643–684.", "10.1111/1540-6261.00540"],
  ["damodaran", "Damodaran, A. Equity risk premiums (ERP): Determinants, estimation and implications. Annual update, NYU Stern.", null, "https://pages.stern.nyu.edu/~adamodar/"],
  ["dgu09", "DeMiguel, V., Garlappi, L., & Uppal, R. (2009). Optimal versus naive diversification: How inefficient is the 1/N portfolio strategy? Review of Financial Studies, 22(5), 1915–1953.", "10.1093/rfs/hhm075"],
  ["dy03", "Donohue, C., & Yip, K. (2003). Optimal portfolio rebalancing with transaction costs. Journal of Portfolio Management, 29(4), 49–63.", "10.3905/jpm.2003.319894"],
  ["fahl09", "Fahlenbrach, R. (2009). Founder-CEOs, investment decisions, and stock market performance. Journal of Financial and Quantitative Analysis, 44(2), 439–466.", "10.1017/S0022109009090139"],
  ["ff93", "Fama, E. F., & French, K. R. (1993). Common risk factors in the returns on stocks and bonds. Journal of Financial Economics, 33(1), 3–56.", "10.1016/0304-405X(93)90023-5"],
  ["ff15", "Fama, E. F., & French, K. R. (2015). A five-factor asset pricing model. Journal of Financial Economics, 116(1), 1–22.", "10.1016/j.jfineco.2014.10.010"],
  ["ilv95", "Ikenberry, D., Lakonishok, J., & Vermaelen, T. (1995). Market underreaction to open market share repurchases. Journal of Financial Economics, 39(2–3), 181–208.", "10.1016/0304-405X(95)00826-Z"],
  ["jt93", "Jegadeesh, N., & Titman, S. (1993). Returns to buying winners and selling losers: Implications for stock market efficiency. Journal of Finance, 48(1), 65–91.", "10.1111/j.1540-6261.1993.tb04702.x"],
  ["jm76", "Jensen, M. C., & Meckling, W. H. (1976). Theory of the firm: Managerial behavior, agency costs and ownership structure. Journal of Financial Economics, 3(4), 305–360.", "10.1016/0304-405X(76)90026-X"],
  ["kgw20", "Koller, T., Goedhart, M., & Wessels, D. (2020). Valuation: Measuring and managing the value of companies (7th ed.). McKinsey & Company / Wiley.", null],
  ["ll01", "Lakonishok, J., & Lee, I. (2001). Are insider trades informative? Review of Financial Studies, 14(1), 79–111.", "10.1093/rfs/14.1.79"],
  ["lintner65", "Lintner, J. (1965). The valuation of risk assets and the selection of risky investments in stock portfolios and capital budgets. Review of Economics and Statistics, 47(1), 13–37.", "10.2307/1924119"],
  ["markowitz52", "Markowitz, H. (1952). Portfolio selection. Journal of Finance, 7(1), 77–91.", "10.2307/2975974"],
  ["mm58", "Modigliani, F., & Miller, M. H. (1958). The cost of capital, corporation finance and the theory of investment. American Economic Review, 48(3), 261–297.", null, "https://www.jstor.org/stable/1809766"],
  ["nm13", "Novy-Marx, R. (2013). The other side of value: The gross profitability premium. Journal of Financial Economics, 108(1), 1–28.", "10.1016/j.jfineco.2013.01.003"],
  ["pw08", "Pontiff, J., & Woodgate, A. (2008). Share issuance and cross-sectional returns. Journal of Finance, 63(2), 921–945.", "10.1111/j.1540-6261.2008.01335.x"],
  ["sharpe64", "Sharpe, W. F. (1964). Capital asset prices: A theory of market equilibrium under conditions of risk. Journal of Finance, 19(3), 425–442.", "10.1111/j.1540-6261.1964.tb02865.x"],
  ["sharpe66", "Sharpe, W. F. (1966). Mutual fund performance. Journal of Business, 39(1), 119–138.", "10.1086/294846"],
  ["sharpe94", "Sharpe, W. F. (1994). The Sharpe ratio. Journal of Portfolio Management, 21(1), 49–58.", "10.3905/jpm.1994.409501"],
  ["statman87", "Statman, M. (1987). How many stocks make a diversified portfolio? Journal of Financial and Quantitative Analysis, 22(3), 353–363.", "10.2307/2330969"],
];
const REF_LABEL = { ar03: "Anderson & Reeb 2003", afp19: "Asness, Frazzini & Pedersen 2019", ajkm22: "Azoulay et al. 2022", ahm05: "Arnott, Hsu & Moore 2005", bblz14: "Bailey et al. 2014", bt89: "Bernard & Thomas 1989", bgir92: "Brown et al. 1992", chs08: "Campbell, Hilscher & Szilagyi 2008", carhart97: "Carhart 1997", ckl03: "Chan, Karceski & Lakonishok 2003", damodaran: "Damodaran", dgu09: "DeMiguel, Garlappi & Uppal 2009", dy03: "Donohue & Yip 2003", fahl09: "Fahlenbrach 2009", ff93: "Fama & French 1993", ff15: "Fama & French 2015", ilv95: "Ikenberry, Lakonishok & Vermaelen 1995", jt93: "Jegadeesh & Titman 1993", jm76: "Jensen & Meckling 1976", kgw20: "Koller, Goedhart & Wessels 2020", ll01: "Lakonishok & Lee 2001", lintner65: "Lintner 1965", markowitz52: "Markowitz 1952", mm58: "Modigliani & Miller 1958", nm13: "Novy-Marx 2013", pw08: "Pontiff & Woodgate 2008", sharpe64: "Sharpe 1964", sharpe66: "Sharpe 1966", sharpe94: "Sharpe 1994", statman87: "Statman 1987" };
const RULES_WHY = [
  ["Quality first, and only profitable companies", "Profitable, well-run companies have earned a persistent premium over unprofitable ones at similar prices.", ["afp19", "nm13", "ff15"]],
  ["Return on capital above its cost", "A business creates value only when it earns more than its capital costs. The cost of equity comes from the CAPM.", ["kgw20", "sharpe64", "mm58"]],
  ["Catalysts come from data, not stories", "Earnings surprises keep moving prices for weeks; insider buying and buybacks have preceded better returns, heavy share issuance worse ones.", ["bt89", "ll01", "ilv95", "pw08"]],
  ["Momentum confirms the catalyst", "Recent winners have tended to keep winning for 3 to 12 months, and losers to keep losing.", ["jt93", "carhart97"]],
  ["Rerating room: cheap on earnings and cash flow", "Cheaper stocks have beaten expensive ones over the long run, but cheap alone can be a trap, so quality comes first.", ["ff93", "ahm05"]],
  ["Low debt", "Highly indebted, distress-prone firms have earned less, not more.", ["chs08"]],
  ["Concentrate in the best ideas, capped at 20%", "A handful of stocks already removes most single-company risk, so conviction can drive size within limits.", ["statman87", "markowitz52"]],
  ["Cut what isn't working", "A name that trails the market by 20 points in 3 months leaves until the next monthly reset.", ["jt93"]],
  ["Check weekly, reset monthly, trade on calm days", "Keeps the design on target while trading less, and avoids paying wide spreads in a panic.", ["dy03"]],
  ["Judged per unit of risk", "The Sharpe ratio: return above cash, divided by volatility.", ["sharpe66", "sharpe94"]],
  ["Backtests flatter the past", "Applying today's winners to old prices adds hindsight. Only the live record is clean, so v2 has no backtest: its record starts the day it went live.", ["bgir92", "bblz14"]],
];
const PLAIN = { "PRSN method": "PRSN, our method", "Same, no momentum": "PRSN without momentum", "√cap × score": "Size × score", "Equal weight": "Equal weight", "Market-cap weight": "By company size", "√ market cap": "By size, softened", "Inverse volatility": "Calmer stocks weigh more",
  "Monthly + 5-pt drift": "PRSN: monthly + drift", "Monthly": "Monthly", "Quarterly": "Quarterly", "Annual": "Once a year", "Buy and hold": "Never reset" };
const refOf = k => REFS.find(r => r[0] === k) || [];
const SrcChip = ({ k }) => {
  const [, full, doi, url] = refOf(k);
  return html`<a href=${doi ? "https://doi.org/" + doi : url} target="_blank" rel="noopener" title=${full}
    className="inline-flex items-center rounded-full border border-line bg-white px-2 py-0.5 text-[11.5px] text-silver hover:text-accent hover:border-accent/40 whitespace-nowrap">${REF_LABEL[k]} ↗</a>`;
};

function Evidence({ D }) {
  const S = D.stats, T = D.trailing, L = D.lab, R = D.rules, G = D.growth_10k;
  const bm = S.months.map(m => m[2]);
  const ext = (arr, f) => arr.reduce((a, b) => f(a, b) ? a : b);
  const rows = [
    ["$10,000 became", G.prsn, G.bench, v => money(v, 0), true],
    ["Return per year", S.ann_return, S.ann_return_bench, v => pct(v), true],
    ["Last 12 months", T["1Y"].prsn, T["1Y"].bench, v => pct(v), true],
    ["Return per unit of risk", S.sharpe, S.sharpe_bench, v => dec(v), true],
    ["Volatility", S.vol, S.vol_bench, v => pctU(v), false],
    ["Worst drop", S.max_dd.depth, S.max_dd_bench.depth, v => pctU(v), true],
    ["Best month", S.best_month[1], ext(bm, (a, b) => a > b), v => pct(v), true],
    ["Worst month", S.worst_month[1], ext(bm, (a, b) => a < b), v => pct(v), true],
    ["Months up", S.pct_up_months, bm.filter(x => x > 0).length / bm.length, v => pctU(v, 0), true],
  ];
  const wins = rows.filter(([, a, b, , hi]) => hi ? a > b : a < b).length;
  const core = D.holdings.filter(h => !h.wildcard);
  const name = t => (D.holdings.find(h => h.ticker === t) || D.bench.find(b => b.ticker === t) || {}).name || t;
  const plan = D.pending ? Object.entries(D.pending.meta).map(([t, m]) => ({ ticker: t, ...m })) : D.holdings.filter(h => h.tier || h.wildcard).map(h => ({ ticker: h.ticker, tier: h.wildcard ? "wildcard" : h.tier, composite: h.composite, target: h.target }));
  const mock = [...plan].sort((a, b) => b.target - a.target);
  const mockCash = Math.max(0, 1 - mock.reduce((a, h) => a + h.target, 0));
  const rb = date(D.last_rebalance, { month: "short", day: "numeric", year: "numeric" });
  const schemes = [...L.schemes].sort((a, b) => b.sharpe - a.sharpe), cads = [...L.cadences].sort((a, b) => b.sharpe - a.sharpe);
  const mxS = Math.max(...schemes.map(x => x.sharpe), ...cads.map(x => x.sharpe));
  const ours = L.schemes.find(x => x.name === "PRSN method") || schemes[0], eq = L.schemes.find(x => x.name === "Equal weight") || {};
  const credits = [...D.holdings, ...(D.private || [])].filter(h => h.leader && h.leader.credit);
  const Sub3 = ({ n, title, note, children }) => html`
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 flex-wrap"><h3 className="m-0 flex items-baseline gap-2 text-[17px] sm:text-[18px] font-extrabold tracking-tight text-fg"><span className="num text-[12px] font-semibold text-emerald">${n}</span>${title}</h3>${note && html`<span className="text-[12px] text-dim">${note}</span>`}</div>
      <div className="mt-3">${children}</div>
    </div>`;
  const Bars = ({ list, hl }) => html`<div className="grid gap-2">${list.map(x => html`
    <div key=${x.name} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] sm:grid-cols-[13rem_1fr_auto] items-center gap-2.5 sm:gap-3 text-[12.5px]">
      <span className=${"truncate " + (x.name === hl ? "font-bold text-emerald" : "text-silver")}>${PLAIN[x.name] || x.name}</span>
      <div className="h-2.5 rounded-full bg-fg/[0.06] overflow-hidden"><div className="h-full rounded-full" style=${{ width: Math.max(2, x.sharpe / mxS * 100) + "%", background: x.name === hl ? C.prsn : "#AEB7C6" }}></div></div>
      <span className="num text-right whitespace-nowrap"><b className="text-fg">${dec(x.sharpe)}</b><span className="text-dim hidden sm:inline"> · ${pct(x.ann)}/yr</span></span>
    </div>`)}</div>`;
  return html`
    <${Card} className="col-span-12" id="evidence">
      <${Head} title="The Evidence" icon="scale" aside="Side by side, a mock run, and the sources" />
      <div className="grid gap-10">

        <${Sub3} n="01" title="Head To Head" note=${`${date(D.index.base_date, { month: "short", year: "numeric" })} to today · PRSN ahead on ${wins} of ${rows.length}`}>
          <div className="flex items-center gap-4 text-[12px] text-dim mb-2"><span className="inline-flex items-center gap-1.5"><${PrsnSwatch} />PRSN</span><span className="inline-flex items-center gap-1.5"><${SpxSwatch} />S&P 500</span></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8">
            ${rows.map(([k, a, b, f, hi]) => {
              const pw = hi ? a > b : a < b, m = Math.max(Math.abs(a), Math.abs(b)) || 1;
              return html`
              <div key=${k} className="py-3 border-b border-line">
                <div className="text-[12px] text-dim">${k}</div>
                <div className="mt-1.5 grid grid-cols-2 gap-3">
                  ${[[a, C.prsn, pw], [b, C.spx, !pw]].map(([v, c, w], i) => html`
                    <div key=${i} className="min-w-0">
                      <div className=${"num text-[17px] sm:text-[18px] leading-none flex items-center gap-1 " + (w ? "font-bold text-fg" : "font-medium text-dim")}>${f(v)}${w && html`<${Icon} n="check" size=${13} className=${i ? "text-coral" : "text-emerald"} />`}</div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-fg/[0.05] overflow-hidden"><div className="h-full rounded-full" style=${{ width: Math.max(3, Math.abs(v) / m * 100) + "%", background: c, opacity: w ? 1 : 0.45 }}></div></div>
                    </div>`)}
                </div>
              </div>`;
            })}
          </div>
          <p className="mt-3 mb-0 text-[12.5px] text-silver leading-relaxed max-w-[80ch]">The short version: more return, for more risk. PRSN moves about ${dec(S.beta)}× as much as the market, so it wins big in good stretches and hurts more in bad ones.</p>
        <//>

        <${Sub3} n="02" title="Mock Run: $10,000 Through The Rules" note=${D.pending ? `Next trade, decided ${date(D.pending.decided, { month: "short", day: "numeric", year: "numeric" })}` : `Rebalance of ${rb}`}>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] mb-4">
            ${[[D.universe_size, "tracked"], [mock.filter(h => h.tier !== "wildcard").length + (mock.some(h => h.tier === "wildcard") ? "+1" : ""), "held"], ["Q·C·R", "scored"], ["tiers", "sized"], ["$10k", "split"]].map(([v, k], i, arr) => html`
              <span key=${k} className="inline-flex items-center gap-1.5"><span className="inline-flex items-baseline gap-1 rounded-full bg-page border border-line px-2.5 py-1"><b className="num text-fg">${v}</b><span className="text-dim">${k}</span></span>${i < arr.length - 1 && html`<span className="text-dim">→</span>`}</span>`)}
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-[12.5px] sm:text-[13px]">
              <thead><tr className="text-[10.5px] uppercase tracking-[0.08em] text-dim">
                <th className="text-left font-semibold pb-2">Company</th><th className="text-left font-semibold pb-2 px-1.5">Tier</th><th className="text-right font-semibold pb-2 px-1.5">Conviction</th><th className="text-right font-semibold pb-2 px-1.5">Weight</th><th className="text-right font-semibold pb-2 pl-1.5">$</th>
              </tr></thead>
              <tbody>
                ${mock.map(h => html`<tr key=${h.ticker}>
                  <td className="py-2 border-t border-line"><span className="inline-flex items-center gap-2 min-w-0"><${CoLogo} t=${h.ticker} size=${22} /><span className="num font-semibold text-fg">${h.ticker}</span><span className="hidden sm:inline text-dim truncate">${name(h.ticker)}</span></span></td>
                  <td className="py-2 px-1.5 border-t border-line">${h.tier ? html`<${Chip} kind=${TIER[h.tier].kind}>${TIER[h.tier].label}<//>` : "–"}</td>
                  <td className="py-2 px-1.5 border-t border-line text-right num text-fg">${h.composite == null ? "–" : h.composite.toFixed(0)}</td>
                  <td className="py-2 px-1.5 border-t border-line text-right num font-semibold text-emerald">${pctU(h.target)}</td>
                  <td className="py-2 pl-1.5 border-t border-line text-right num font-semibold text-fg">${money(10000 * h.target, 0)}</td>
                </tr>`)}
                ${mockCash > 0.0005 && html`<tr><td className="py-2 border-t border-line text-silver" colSpan="3">Cash in T-bills</td><td className="py-2 px-1.5 border-t border-line text-right num text-silver">${pctU(mockCash)}</td><td className="py-2 pl-1.5 border-t border-line text-right num text-silver">${money(10000 * mockCash, 0)}</td></tr>`}
                <tr><td className="pt-2 border-t-2 border-fg/20 font-semibold text-fg" colSpan="4">Total</td><td className="pt-2 border-t-2 border-fg/20 text-right num font-bold text-fg">${money(10000, 0)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 mb-0 text-[12.5px] text-silver leading-relaxed max-w-[80ch]">Each company that passes gets a tier from its conviction rank. The tier sets a starting weight (core ~${pctU(R.tiers.core.base, 0)}, build ~${pctU(R.tiers.build.base, 0)}, toehold ~${pctU(R.tiers.toehold.base, 0)}), conviction nudges it up to ${Math.round(R.tiers.tilt * 100)}% either way, the weights are scaled up to fill the fund without passing any tier's cap, and whatever can't be placed stays in T-bills. Between trades, weights drift with prices.</p>
        <//>

        <${Sub3} n="03" title="Other Ways To Build It" note=${`Tested on the v1 rules and companies, 2022–2026 · return per unit of risk · after ${L.cost_bps} bp costs`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
            <div><div className="text-[12.5px] font-bold text-fg mb-2.5">How Much Of Each</div><${Bars} list=${schemes} hl="PRSN method" /></div>
            <div><div className="text-[12.5px] font-bold text-fg mb-2.5">How Often To Reset</div><${Bars} list=${cads} hl="Monthly + 5-pt drift" /></div>
          </div>
          <p className="mt-3 mb-0 text-[12.5px] text-silver leading-relaxed max-w-[80ch]">Honest read: the score tilts beat plain equal weighting only slightly (${dec(ours.sharpe)} vs ${dec(eq.sharpe)}). The big win is not weighting by company size. Annual resets scored best on this one stretch of history, which looks more like luck than a rule worth switching to.</p>
        <//>

        <${Sub3} n="04" title="Why The Math Holds Up" note="Each rule, the reason, and the research behind it">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
            ${RULES_WHY.map(([rule, why, ks]) => html`
              <div key=${rule} className="py-2.5 border-b border-line min-w-0">
                <p className="m-0 text-[13px] text-silver leading-snug"><b className="text-fg">${rule}:</b> ${why}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">${ks.map(k => html`<${SrcChip} key=${k} k=${k} />`)}</div>
              </div>`)}
          </div>
          <p className="mt-4 mb-0 text-[11.5px] text-dim leading-relaxed">Heritage decides who is eligible; it is not treated as a reason stocks go up. Photos: ${credits.map((h, i) => html`<span key=${h.ticker || h.id}>${i ? " · " : ""}${cleanName(h.ceo)}, ${h.leader.credit_url ? html`<a className="underline underline-offset-2" href=${h.leader.credit_url} target="_blank" rel="noopener">${h.leader.credit.replace(/^Photo:\s*/, "")}</a>` : h.leader.credit.replace(/^Photo:\s*/, "")}</span>`)}.</p>
        <//>
      </div>
    <//>`;
}

const SourceLine = ({ D }) => html`<p className="m-0 max-w-[900px]">Prices: ${D.sources.prices}, as of ${asofLabel(D)}. Fundamentals: ${D.sources.fundamentals}, as of ${date(D.fundamentals_asof)}. Filings: ${D.sources.filings}. Company logos are trademarks of their owners.</p>`;

// ---------- selection: one place that selects, scrolls, focuses, remembers and announces
function useSelection(D) {
  const [sel, setSel] = useState(0);
  const [pinned, setPinned] = useState(null);
  const [from, setFrom] = useState(null);
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    if (!D) return;
    const m = location.hash.match(/^#h-([A-Z.]+)$/);
    const t = m ? m[1] : store.get("prsn-selected");
    const i = D.holdings.findIndex(h => h.ticker === t);
    if (i >= 0) { setSel(i); setPinned(i); if (m) setTimeout(() => goTo("detail", "detail-title"), 300); }
  }, [D]);
  const select = (i, scroll, fromLeader) => {
    const h = D.holdings[i];
    setSel(i); setPinned(i); setFrom(fromLeader ? h.ticker : null);
    store.set("prsn-selected", h.ticker);
    setAnnounce(`Showing ${h.name}, led by ${cleanName(h.ceo)}.`);
    if (scroll) setTimeout(() => goTo("detail", "detail-title"), 40);
  };
  const back = from ? () => goTo("leader-" + from) : null;
  return { sel, setSel, pinned, select, back, announce };
}

function useActiveSection(ids) {
  const [active, setActive] = useState(null);
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }), { rootMargin: "-35% 0px -60% 0px" });
    const els = ids.map(id => document.getElementById(id)).filter(Boolean);
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  });
  return active;
}

// ---------- app: one page, the same everywhere. Inside an iframe (Adobe Portfolio) the header isn't sticky and the page reports its height.
function App() {
  const [D, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [range, setRange] = useState(0);
  const [bench, setBench] = useState(true);
  useEffect(() => {
    fetch(DATA_URL, { cache: "no-store" }).then(r => { if (!r.ok) throw 0; return r.json(); }).then(setD).catch(() => setErr(true));
  }, []);
  useEffect(() => { if (D && /^#(evidence|paper|methodology)$/.test(location.hash)) setTimeout(() => goTo("evidence"), 300); }, [D]);
  const [shared, setShared] = useState("");
  const share = async () => {
    const data = { title: "PRSN · World's First Persian Led Equity Index", text: "The world's first Persian led equity index", url: SHARE_URL };
    try { if (navigator.share) { await navigator.share(data); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(SHARE_URL); setShared("Link copied"); } catch (e) { setShared(SHARE_URL); }
    setTimeout(() => setShared(""), 2400);
  };
  // Tell the host page how tall this is, so the frame with the resize snippet (PASTE-INTO-ADOBE-PORTFOLIO.txt) fits exactly
  useEffect(() => {
    if (!EMBED) return;
    let last = 0;
    const root = document.getElementById("root");   // the content itself; the document is never shorter than the frame
    const send = () => { const h = Math.ceil(root.getBoundingClientRect().height); if (Math.abs(h - last) > 2) { last = h; window.parent.postMessage({ type: "prsn-height", height: h }, "*"); } };
    const ro = new ResizeObserver(send);
    ro.observe(root);
    send();
    return () => ro.disconnect();
  }, []);
  const S = useSelection(D);
  const active = useActiveSection(["leaders", "research", "breakdown", "detail", "decisions", "directory", "evidence"]);
  if (err) return html`<div className="p-10 text-dim">Data didn't load. Run <span className="num">python -m engine daily</span>, then reload.</div>`;
  if (!D) return html`<div className="p-10 text-dim">Loading PRSN…</div>`;
  const nav = [["leaders", "Leaders", "users"], ["research", "Research", "flask"], ["breakdown", "Holdings", "pie"], ["decisions", "Decisions", "calendar"], ["directory", "Directory", "building"]];
  return html`
    <div className="relative min-h-screen overflow-x-clip">
      <a href="#leaders" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:px-3 focus:py-2 focus:bg-white focus:rounded-lg">Skip to leaders</a>
      <header className=${(EMBED ? "" : "sticky ") + "z-30 border-b border-line bg-white/90 backdrop-blur"} style=${EMBED ? null : { top: "env(safe-area-inset-top, 0px)" }}>
        <div aria-hidden="true" className="flex h-[3px]"><span className="flex-1" style=${{ background: C.prsn }}></span><span className="flex-1 bg-white"></span><span className="flex-1" style=${{ background: C.spx }}></span></div>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <button type="button" onClick=${() => goTo("why")} className="shrink-0" aria-label="PRSN, back to top"><${Logo} h=${30} /></button>
          <nav aria-label="Sections" className="flex items-center gap-1.5">
            ${nav.map(([id, l, ic]) => html`<span key=${id} className="hidden lg:inline-flex"><${Pill} onClick=${() => goTo(id)} active=${active === id || (id === "breakdown" && active === "detail")}><${Icon} n=${ic} size=${14} />${l}<//></span>`)}
            ${EMBED && html`<span className="hidden sm:inline-flex"><${Pill} href=${FULL_URL}>Open ↗<//></span>`}
            <span className="hidden lg:inline-flex"><${Pill} onClick=${() => goTo("evidence")} active=${active === "evidence"}><${Icon} n="scale" size=${14} />Evidence<//></span>
            <${Pill} primary onClick=${share} label="Share this page"><${Icon} n="share" size=${14} />${shared ? (shared === "Link copied" ? "Copied" : "Share") : "Share"}<//>
          </nav>
        </div>
      </header>
      <div className="sr-only" aria-live="polite">${S.announce}${shared ? " " + shared : ""}</div>

      <main className="relative max-w-[1280px] mx-auto px-4 sm:px-6 py-5 sm:py-8 grid grid-cols-12 gap-3 sm:gap-4">
        <${Why} D=${D} />
        <${Hero} D=${D} range=${range} setRange=${setRange} showBench=${bench} setShowBench=${setBench} />
        <${Side} D=${D} />
        <${Leaders} D=${D} selTicker=${D.holdings[S.sel].ticker} pick=${i => S.select(i, true, true)} />
        <${Research} D=${D} />
        <${Breakdown} D=${D} selTicker=${D.holdings[S.sel].ticker} pick=${i => S.select(i, true)} />
        <${Detail} D=${D} h=${D.holdings[S.sel]} back=${S.back} />
        <${Years} D=${D} />
        <${Account} D=${D} />
        <${Decisions} D=${D} />
        <${Honorable} D=${D} />
        <${AllCompanies} D=${D} pick=${i => S.select(i, true)} />
        <${Directory} D=${D} />
        <${Evidence} D=${D} />
      </main>

      <footer className="relative max-w-[1280px] mx-auto px-4 sm:px-6 pb-12 text-[11.5px] text-dim leading-relaxed">
        <div className="border-t border-line pt-5 grid gap-2">
          <p className="m-0 max-w-[900px]">PRSN is a research index, not a fund, and not investment advice. I personally own positions in companies shown here. Results before ${date(D.index.launch_date)} are an illustrative backtest that benefits from hindsight; rules v${D.rules.version} apply from ${date(D.index.v2_date)}, with no backtest.</p>
          <${SourceLine} D=${D} />
          <p className="m-0">© Parsa Ara · <a className="text-silver hover:text-fg" href="https://www.linkedin.com/in/parsaara/" target="_blank" rel="noopener">LinkedIn</a> · <button type="button" onClick=${() => goTo("evidence")} className="text-silver hover:text-fg underline underline-offset-2">Evidence</button></p>
        </div>
      </footer>
    </div>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
