/* PRSN institutional index tear sheet (Rules v3). React 18 + Recharts + Tailwind, written with htm (no build step).
   Data comes from data/index.json, rebuilt by the engine/ package on GitHub Actions. */
const { useState, useEffect, useMemo, useRef } = React;
const { ResponsiveContainer, ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, ReferenceLine } = Recharts;
const html = htm.bind(React.createElement);
const DATA_URL = window.PRSN_DATA_URL || "data/index.json";
const EMBED = !!window.PRSN_EMBED || window.self !== window.top;
const FULL_URL = window.PRSN_FULL_URL || location.href.split("#")[0];
const SHARE_URL = window.PRSN_SHARE_URL || FULL_URL;
const ASSET = window.PRSN_ASSET_BASE || "";
const REPO = "https://github.com/parsaara01-stack/prsn-index";
const NOMINATE_URL = REPO + "/issues/new?template=nominate-leader.yml";
const TIER = {
  core: { label: "Core Anchor", kind: "good" },
  build: { label: "Compounder", kind: "accent" },
  toehold: { label: "Catalyst Sleeve", kind: "" },
  wildcard: { label: "Wildcard", kind: "accent" }
};

// ---------- palette: institutional navy, emerald for PRSN, crimson for S&P 500
const C = { prsn: "#157535", spx: "#B92B24", spxSoft: "#E5A5A1", navy: "#14264B", fg: "#121C2B", dim: "#647082", line: "#D8DEE6", gain: "#157535", loss: "#B92B24" };

// ---------- formatters
const pct = (x, d = 1) => x == null ? "–" : (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(d) + "%";
const pctU = (x, d = 1) => x == null ? "–" : (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(d) + "%";
const pts = (x, d = 1) => x == null ? "–" : (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(d) + " pts";
const dec = (x, d = 2) => x == null ? "–" : (x < 0 ? "−" : "") + Math.abs(x).toFixed(d);
const money = (x, d = 2) => x == null ? "–" : "$" + x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const tone = x => x == null ? "text-silver" : x >= 0 ? "text-emerald" : "text-coral";
const date = (s, o = { month: "short", day: "numeric", year: "numeric" }) => s ? new Date(s.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { ...o, timeZone: "UTC" }) : "–";
const asofLabel = D => D.live && D.live.intraday ? `Live (${D.live.time_et}, 15-min delay)` : `As of ${date(D.asof)} market close`;
const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const ratingText = r => ({ strong_buy: "Strong buy", buy: "Buy", hold: "Hold", sell: "Sell", strong_sell: "Strong sell" }[r] || "No rating");
const cleanName = n => (n || "").replace(/\s*\(.*?\)/, "");

const goTo = (id, focusId) => {
  const el = document.getElementById(id);
  if (!el) return;
  if (EMBED) {
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    const f = document.getElementById(focusId || id);
    if (f) setTimeout(() => f.focus({ preventScroll: true }), reduced ? 0 : 600);
    return;
  }
  const target = () => Math.max(0, el.getBoundingClientRect().top + window.scrollY - 76);
  window.scrollTo({ top: target(), behavior: reduced ? "auto" : "smooth" });
  const f = document.getElementById(focusId || id);
  if (f) setTimeout(() => f.focus({ preventScroll: true }), 400);
};
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

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

const ICONS = {
  check: '<polyline points="20 6 9 17 4 12"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
};
const Icon = ({ n, size = 14, className = "" }) => ICONS[n] ? html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className=${"shrink-0 " + className} dangerouslySetInnerHTML=${{ __html: ICONS[n] }}></svg>` : null;
const FlagBar = ({ w = 18 }) => html`<span aria-hidden="true" className="inline-flex flex-col overflow-hidden ring-1 ring-line shrink-0" style=${{ width: w + "px", height: Math.round(w * 0.6) + "px" }}><span className="flex-1" style=${{ background: C.prsn }}></span><span className="flex-1 bg-white"></span><span className="flex-1" style=${{ background: C.spx }}></span></span>`;

const Card = ({ className = "", children, id }) => html`<section id=${id} className=${"surface p-5 sm:p-6 min-w-0 " + className}>${children}</section>`;
const Head = ({ title, aside, id }) => html`
  <div className="flex items-baseline justify-between gap-3 pb-3 mb-5 border-b border-fg/15 flex-wrap">
    <h2 id=${id} className="serif text-[22px] sm:text-[25px] font-semibold tracking-tight leading-snug text-fg m-0">${title}</h2>
    ${aside && html`<span className="text-[12.5px] text-dim">${aside}</span>`}
  </div>`;
const Pill = ({ active, onClick, children, href, primary, label }) => {
  const cls = "inline-flex items-center gap-1.5 rounded-[2px] border px-3 py-1 text-[12.5px] font-medium transition-colors whitespace-nowrap " +
    (active || primary ? "border-accent bg-accent text-white hover:bg-accent/90" : "border-line bg-white text-silver hover:border-fg/40 hover:text-fg");
  return href
    ? html`<a href=${href} aria-current=${active ? "true" : undefined} target=${href.startsWith("http") || (EMBED && !href.startsWith("#")) ? "_blank" : undefined} rel="noopener" className=${cls}>${children}</a>`
    : html`<button type="button" onClick=${onClick} aria-label=${label} aria-pressed=${active == null ? undefined : !!active} className=${cls}>${children}</button>`;
};
const Label = ({ children }) => html`<div className="text-[12px] font-semibold text-silver tracking-tight">${children}</div>`;
const Chip = ({ children, kind = "" }) => {
  const k = { good: "border-emerald/30 bg-emerald/[0.07] text-emerald", bad: "border-coral/30 bg-coral/[0.07] text-coral", accent: "border-accent/25 bg-accent/[0.06] text-accent", "": "border-line bg-page text-silver" }[kind];
  return html`<span className=${"inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap " + k}>${children}</span>`;
};
const KV = ({ k, v, cls = "", tip }) => html`<div><div className=${"num text-[15px] font-semibold text-fg " + cls}>${v}</div><div className="text-[11.5px] text-dim mt-0.5 flex items-center gap-1">${k}${tip}</div></div>`;
const Math_ = ({ children }) => html`<div className="bg-page border border-line px-3.5 py-2.5 text-[14.5px] text-fg serif">${children}</div>`;
const Logo = ({ h = 28 }) => html`<img src=${ASSET + "logo.png"} alt="PRSN" width=${Math.round(h * 3.38)} height=${h} style=${{ height: h + "px", width: "auto" }} className="block select-none" draggable="false" />`;

function InfoTip({ label, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const openedAt = useRef(0);
  const open = () => { const r = ref.current.getBoundingClientRect(); openedAt.current = Date.now(); setPos({ x: Math.max(12, Math.min(r.left - 120, window.innerWidth - 272)), y: r.bottom + 6 }); };
  const close = () => setPos(null);
  return html`<span className="inline-flex align-middle">
    <button ref=${ref} type="button" aria-label=${"What is " + label + "?"} aria-expanded=${!!pos}
      onClick=${e => { e.stopPropagation(); pos && Date.now() - openedAt.current > 400 ? close() : open(); }} onFocus=${open} onBlur=${close} onMouseEnter=${open} onMouseLeave=${close}
      className="group/tip -my-1.5 w-6 h-6 grid place-items-center"><span className="w-[14px] h-[14px] rounded-[2px] border border-fg/25 text-[9.5px] font-semibold leading-none text-dim grid place-items-center group-hover/tip:text-fg group-hover/tip:border-fg/50">?</span></button>
    ${pos && ReactDOM.createPortal(html`<div role="tooltip" style=${{ position: "fixed", left: pos.x + "px", top: pos.y + "px", zIndex: 70 }}
      className="w-[260px] bg-white border border-fg/20 shadow-[0_6px_20px_rgba(18,28,43,.12)] p-3 text-[12.5px] leading-snug text-silver normal-case tracking-normal font-normal">${children}</div>`, document.body)}
  </span>`;
}
const TIPS = {
  sharpe: "Sharpe ratio: annualized return above the T-bill rate, divided by annualized volatility.",
  beta: "Beta: how much the index tends to move when the S&P 500 moves 1%.",
  hurdle: "Return on invested capital (ROIC) minus weighted average cost of capital (WACC). Positive values indicate the business earns above its cost of capital.",
  vol: "Annualized volatility: standard deviation of daily returns scaled to one year.",
  conviction: "Conviction = 45% Quality + 30% Catalyst + 25% Rerate, ranked 0–100 among eligible companies.",
  tier: "Core Anchor: top 5 profitable compounders (~13.5% base, max 16%). Compounder (Build): next 5 profitable compounders (~5.5% base, max 8%). Catalyst Sleeve: up to 4 scaled growth/compounder positions (~2.5% base, max 3.5%).",
};

// ---------- company logos
const logoCache = {};
function useLogo(t) {
  const [url, setUrl] = useState(logoCache[t] === undefined ? undefined : logoCache[t]);
  useEffect(() => {
    if (!t) return;
    if (logoCache[t] !== undefined) { setUrl(logoCache[t]); return; }
    let live = true;
    const img = new Image();
    img.onload = () => { logoCache[t] = ASSET + "logos/" + t + ".png"; live && setUrl(logoCache[t]); };
    img.onerror = () => { logoCache[t] = null; live && setUrl(null); };
    img.src = ASSET + "logos/" + t + ".png";
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

const initials = n => { const w = cleanName(n).trim().split(/\s+/); return w.length ? (w[0][0] + w[w.length - 1][0]).toUpperCase() : "PR"; };
function Avatar({ h, size = 64, lazy }) {
  const L = h.leader || {};
  const [err, setErr] = useState(false);
  const st = { width: size + "px", height: size + "px" };
  return L.photo && !err
    ? html`<img src=${ASSET + L.photo} alt=${"Portrait of " + cleanName(h.ceo)} width=${size} height=${size} style=${st} loading=${lazy ? "lazy" : undefined} onError=${() => setErr(true)} className="rounded-full object-cover shrink-0 bg-page ring-1 ring-line" />`
    : html`<span style=${{ ...st, fontSize: Math.round(size * 0.34) + "px" }} className="rounded-full shrink-0 grid place-items-center font-bold tracking-wide text-accent bg-accent/[0.07] ring-1 ring-line" role="img" aria-label=${cleanName(h.ceo)}>${initials(h.ceo)}</span>`;
}

const GlassTip = ({ active, payload, fmt }) => {
  if (!active || !payload || !payload.length) return null;
  return html`<div className="px-3 py-2 text-[12px] num bg-white border border-fg/20 shadow-[0_6px_20px_rgba(18,28,43,.12)]">${fmt(payload[0].payload)}</div>`;
};
const SpxSwatch = () => html`<span className="inline-block w-4 border-t-2 border-dashed shrink-0" style=${{ borderColor: C.spx }}></span>`;
const PrsnSwatch = () => html`<span className="inline-block w-4 h-[3px] shrink-0" style=${{ background: C.prsn }}></span>`;

// ---------- why PRSN: the objective, before anything else
function Why({ D }) {
  const top = [...D.holdings].sort((a, b) => (b.metrics.mcap_b || 0) - (a.metrics.mcap_b || 0)).slice(0, 3).map(h => cleanName(h.name).replace(/ (Technologies|Group|Inc\.?)$/, ""));
  return html`
    <section className="col-span-12 surface relative overflow-hidden px-5 py-4 sm:px-6 sm:py-5" id="why" aria-labelledby="why-title">
      <div aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[4px] flex flex-col"><span className="flex-1" style=${{ background: C.prsn }}></span><span className="flex-1 bg-white"></span><span className="flex-1" style=${{ background: C.spx }}></span></div>
      <h2 id="why-title" className="m-0 serif text-[20px] sm:text-[23px] font-semibold tracking-tight leading-tight text-fg">The research question</h2>
      <p className="mt-1.5 mb-0 max-w-[76ch] text-[14.5px] sm:text-[15.5px] leading-relaxed text-silver">Persian and Iranian founders and CEOs lead some of the world's biggest companies, including ${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}. PRSN puts them in one place, and tests whether clear rules for picking and weighting can turn their companies into a worthwhile portfolio. <span className="font-semibold text-fg">For a free Iran.</span></p>
      <p className="mt-2 mb-0 text-[12px] text-dim leading-snug">A research project, not a fund, and not investment advice. I invest personally in these companies. <button type="button" onClick=${() => goTo("evidence")} className="text-accent font-semibold underline underline-offset-2">Read the evidence</button></p>
    </section>`;
}

// ---------- Hero & Side KPIs
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

  return html`
    <${Card} className="col-span-12 lg:col-span-8 flex flex-col" id="overview">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line">
        <div className="inline-flex items-center gap-2.5 text-[12.5px] font-medium text-silver">
          <${FlagBar} />
          <span className="font-semibold text-fg">PRSN</span>
          <span>Persian-Led US Equity Index</span>
          <span className="text-dim">|</span>
          <span className="num text-[12px] font-semibold text-accent">Rules v${D.rules.version}</span>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Chart period">
          ${[["1M", 21], ["3M", 63], ["1Y", 252], ["3Y", 756], ["Max (2021–2026)", 0]].map(([l, n]) => html`<${Pill} key=${l} active=${range === n} onClick=${() => setRange(n)}>${l}<//>`)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className=${"serif font-semibold tracking-tight leading-[1.08] text-fg m-0 " + (EMBED ? "text-[28px] sm:text-[36px]" : "text-[30px] sm:text-[40px]")}>
            Persian-Led US Equity Index
          </h1>
          <p className="mt-1.5 mb-0 text-[13.5px] text-silver max-w-[68ch]">
            High-conviction compounder and catalyst index tracking ${D.holdings.length} active US-listed positions out of ${D.universe_size} monitored Persian-led public companies.
          </p>
        </div>
        <div className="text-left sm:text-right">
          <div className="flex items-baseline gap-2.5 sm:justify-end">
            <span className="num text-[34px] sm:text-[42px] font-semibold leading-none tracking-tight text-fg">${D.level.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className=${"num text-[13px] font-semibold px-2 py-0.5 border " + (D.day_change >= 0 ? "border-emerald/30 bg-emerald/[0.07] text-emerald" : "border-coral/30 bg-coral/[0.07] text-coral")}>${pct(D.day_change, 2)}</span>
          </div>
          <div className="text-[12px] text-dim mt-1">${asofLabel(D)}</div>
        </div>
      </div>

      <div className="relative mt-5 h-[230px] sm:h-[280px]" role="img" aria-label=${`PRSN ${pct(end.a / 100 - 1)} versus S&P 500 ${pct(end.b / 100 - 1)} since ${date(data[0].d)}`}>
        <${ResponsiveContainer} width="100%" height="100%">
          <${ComposedChart} data=${data} margin=${{ top: 14, right: 4, bottom: 0, left: 0 }}>
            <defs><linearGradient id="fillPrsn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor=${C.prsn} stopOpacity="0.15" /><stop offset="100%" stopColor=${C.prsn} stopOpacity="0" /></linearGradient></defs>
            <${XAxis} dataKey="d" hide />
            <${YAxis} hide domain=${[lo - (hi - lo) * 0.06, hi + (hi - lo) * 0.06]} />
            <${ReferenceLine} y=${100} stroke="rgba(18,28,43,0.12)" strokeDasharray="2 6" />
            <${Tooltip} cursor=${{ stroke: "rgba(18,28,43,0.22)" }} content=${html`<${GlassTip} fmt=${p => html`
              <div className="font-semibold text-fg mb-0.5">${date(p.d)}</div>
              <div className="text-emerald font-semibold">PRSN ${p.lvl.toFixed(2)} (${pct(p.a / 100 - 1)})</div>
              ${showBench && html`<div className="text-coral">S&P 500 (${pct(p.b / 100 - 1)})</div>`}
            `} />`} />
            <${Area} type="monotone" dataKey="a" stroke=${C.prsn} strokeWidth=${2} fill="url(#fillPrsn)" dot=${false} activeDot=${{ r: 4, fill: C.prsn, stroke: "#fff" }} isAnimationActive=${!reduced} animationDuration=${600} />
            ${showBench && html`<${Line} type="monotone" dataKey="b" stroke=${C.spx} strokeWidth=${1.6} strokeDasharray="5 4" dot=${false} activeDot=${{ r: 3.5, fill: C.spx, stroke: "#fff" }} isAnimationActive=${false} />`}
          <//>
        <//>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]">
          <span className="flex items-center gap-1.5"><${PrsnSwatch} /><span className="text-silver">PRSN</span><span className="num font-semibold text-fg">${pct(end.a / 100 - 1, 1)}</span></span>
          <span className="flex items-center gap-1.5"><${SpxSwatch} /><span className="text-silver">S&P 500</span><span className="num font-semibold text-fg">${pct(end.b / 100 - 1, 1)}</span></span>
          <span className="text-dim">${date(data[0].d)} – ${date(end.d)}</span>
        </div>
        <${Pill} active=${showBench} onClick=${() => setShowBench(!showBench)}>Compare S&P 500<//>
      </div>

      <div className="mt-4 pt-4 border-t border-line grid grid-cols-2 sm:grid-cols-4 gap-4">
        <${KV} k=${"Annualized vol (S&P " + pctU(S.vol_bench) + ")"} v=${pctU(S.vol)} tip=${html`<${InfoTip} label="volatility">${TIPS.vol}<//>`} />
        <${KV} k=${"Max drawdown (S&P " + pctU(S.max_dd_bench.depth) + ")"} v=${pctU(S.max_dd.depth)} cls="!text-coral" />
        <${KV} k="Beta vs. S&P 500" v=${dec(S.beta)} tip=${html`<${InfoTip} label="beta">${TIPS.beta}<//>`} />
        <${KV} k="Active constituents" v=${`${D.holdings.length} positions`} />
      </div>
    <//>`;
}

function Side({ D }) {
  const S = D.stats, G = D.growth_10k, C_ = D.chars || {};
  const big_ = "num font-semibold leading-none mt-2 tracking-tight text-[28px] sm:text-[34px] ";
  const vs = v => html`<div className="mt-2 flex items-center gap-2 text-[12.5px] text-silver"><${SpxSwatch} />S&P 500 <span className="num font-semibold text-fg">${v}</span></div>`;
  const coreW = D.holdings.filter(h => h.tier === "core").reduce((a, b) => a + b.weight, 0);
  const buildW = D.holdings.filter(h => h.tier === "build").reduce((a, b) => a + b.weight, 0);
  const catW = D.holdings.filter(h => h.tier === "toehold" || h.wildcard).reduce((a, b) => a + b.weight, 0);

  return html`
    <div className="col-span-12 lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 content-start">
      <${Card} className="!p-4 sm:!p-5 border-l-4 !border-l-emerald">
        <div className="flex items-center justify-between gap-2">
          <${Label}>$10,000 From Base (${date(D.index.base_date, { month: "short", year: "numeric" })})<//>
          <${Chip} kind="good">${pts((G.prsn - G.bench) / 100, 0)} vs. S&P<//>
        </div>
        <div className=${big_ + "text-fg"}>${money(G.prsn, 0)}</div>
        ${vs(money(G.bench, 0))}
      <//>

      <${Card} className="!p-4 sm:!p-5">
        <div className="flex items-center justify-between">
          <${Label}>Annualized Return & Sharpe Ratio<//>
          <${InfoTip} label="the Sharpe ratio">${TIPS.sharpe}<//>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          <div>
            <div className="num text-[26px] font-semibold text-emerald leading-none">${pct(S.ann_return)}</div>
            <div className="text-[11.5px] text-dim mt-1">Annualized (S&P ${pct(S.ann_return_bench)})</div>
          </div>
          <div className="border-l border-line pl-3">
            <div className="num text-[26px] font-semibold text-fg leading-none">${dec(S.sharpe)}</div>
            <div className="text-[11.5px] text-dim mt-1">Sharpe (S&P ${dec(S.sharpe_bench)})</div>
          </div>
        </div>
      <//>

      <${Card} className="!p-4 sm:!p-5">
        <div className="flex items-center justify-between">
          <${Label}>Rules v3 Tier Architecture<//>
          <${InfoTip} label="tiers">${TIPS.tier}<//>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 pt-1">
          <div className="bg-page border border-line p-2.5">
            <div className="num text-[17px] font-semibold text-emerald leading-none">${pctU(coreW, 0)}</div>
            <div className="text-[11px] text-dim mt-1">5 Core Anchors</div>
          </div>
          <div className="bg-page border border-line p-2.5">
            <div className="num text-[17px] font-semibold text-accent leading-none">${pctU(buildW, 0)}</div>
            <div className="text-[11px] text-dim mt-1">5 Compounders</div>
          </div>
          <div className="bg-page border border-line p-2.5">
            <div className="num text-[17px] font-semibold text-fg leading-none">${pctU(catW, 0)}</div>
            <div className="text-[11px] text-dim mt-1">${D.holdings.filter(h => h.tier === "toehold" || h.wildcard).length} Catalysts</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-2 text-[12px]">
          <div><span className="text-dim">Weighted Op Margin:</span> <span className="num font-semibold text-fg">${pctU(C_.op_margin, 1)}</span></div>
          <div><span className="text-dim">Weighted Rev Growth:</span> <span className="num font-semibold text-emerald">${pct(C_.rev_growth, 1)}</span></div>
        </div>
      <//>
    </div>`;
}

// ---------- Constituents & Leadership Grid
function Leaders({ D, selTicker, pick }) {
  const mx = Math.max(...D.holdings.map(h => h.weight));
  return html`
    <${Card} className="col-span-12" id="leaders">
      <${Head} title=${`Index Constituents & Leadership (${D.holdings.length} Active Positions)`} aside="Select any constituent to inspect fundamentals, price action, and conviction breakdown" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-line border border-line">
        ${D.holdings.map((h, i) => {
          const on = h.ticker === selTicker;
          const tierObj = TIER[h.wildcard ? "wildcard" : (h.tier || "toehold")];
          return html`
          <button key=${h.ticker} id=${"leader-" + h.ticker} type="button" onClick=${() => pick(i)} aria-pressed=${on}
            className=${"text-left transition-colors p-3.5 sm:p-4 flex gap-3 items-start " + (on ? "bg-emerald/[0.06] ring-1 ring-inset ring-emerald" : "bg-white hover:bg-page/70")}>
            <div className="relative shrink-0">
              <${Avatar} h=${h} size=${48} lazy=${true} />
              <span className="absolute -bottom-1 -right-1"><${CoLogo} t=${h.ticker} size=${20} /></span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className="num text-[12px] font-bold text-accent">${h.ticker}</span>
                <${Chip} kind=${tierObj.kind}>${tierObj.label}<//>
              </div>
              <div className="text-[14px] font-semibold text-fg leading-snug truncate mt-0.5">${h.name}</div>
              <div className="text-[12px] text-silver truncate">${cleanName(h.ceo)}</div>
              <div className="mt-2.5 flex items-center gap-2 num text-[12px]">
                <span className="w-12 h-1.5 bg-fg/[0.08] overflow-hidden"><span className="block h-full bg-emerald" style=${{ width: (h.weight / mx * 100) + "%" }}></span></span>
                <span className="font-semibold text-fg">${pctU(h.weight)}</span>
                <span className=${"ml-auto " + tone(h.day_change)}>${pct(h.day_change, 1)}</span>
              </div>
            </div>
          </button>`;
        })}
      </div>
    <//>`;
}

// ---------- Candles & Constituent Detail
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
        <span className="text-dim">${kind === "1d" ? date(h[0]) : h[0].slice(5).replace(" ", ", ")}</span>
        <span>O <b className="font-semibold text-fg">${h[1].toFixed(2)}</b></span><span>H <b className="font-semibold text-fg">${h[2].toFixed(2)}</b></span>
        <span>L <b className="font-semibold text-fg">${h[3].toFixed(2)}</b></span><span>C <b className=${"font-semibold " + (h[4] >= h[1] ? "text-emerald" : "text-coral")}>${h[4].toFixed(2)}</b></span>
        ${kind === "1d" && h[5] && html`<span className="text-accent">200d SMA <b className="font-semibold">${h[5].toFixed(2)}</b></span>`}
      </div>
      <div ref=${ref} className="relative w-full" onMouseMove=${onMove} onTouchMove=${onMove} onMouseLeave=${() => setHover(null)}>
        <svg viewBox=${`0 0 ${W} ${H}`} width="100%" height=${H} role="img" aria-label=${(kind === "1d" ? "Daily" : "4-hour") + " price chart"}>
          ${ticks.map(v => html`<g key=${v}><line x1=${m.l} x2=${W - m.r} y1=${y(v)} y2=${y(v)} stroke="rgba(18,28,43,0.08)" strokeDasharray="2 5" /><text x=${W - m.r + 6} y=${y(v) + 4} fontSize="11" fill=${C.dim} fontFamily="JetBrains Mono, monospace">${v.toFixed(v > 100 ? 0 : 2)}</text></g>`)}
          ${data.map((r, i) => {
            const up = r[4] >= r[1], col = up ? C.gain : C.loss;
            const top = y(Math.max(r[1], r[4])), bot = y(Math.min(r[1], r[4]));
            return html`<g key=${r[0]}><line x1=${x(i)} x2=${x(i)} y1=${y(r[2])} y2=${y(r[3])} stroke=${col} strokeWidth="1" /><rect x=${x(i) - bw / 2} y=${top} width=${bw} height=${Math.max(1, bot - top)} fill=${col} fillOpacity="0.85" rx="0.5" /></g>`;
          })}
          ${kind === "1d" && html`<path d=${line(5)} fill="none" stroke=${C.navy} strokeWidth="1.8" />`}
          ${hover != null && html`<line x1=${x(hover)} x2=${x(hover)} y1=${m.t} y2=${m.t + ih} stroke="rgba(18,28,43,0.25)" strokeDasharray="3 3" />`}
          <text x=${m.l} y=${H - 4} fontSize="11" fill=${C.dim} fontFamily="JetBrains Mono, monospace">${lbl(data[0][0])}</text>
          <text x=${W - m.r} y=${H - 4} textAnchor="end" fontSize="11" fill=${C.dim} fontFamily="JetBrains Mono, monospace">${lbl(data[data.length - 1][0])}</text>
        </svg>
      </div>
      <div className="mt-1 text-[11.5px] text-dim">${kind === "1d" ? html`<span className="inline-flex items-center gap-1.5"><span className="w-3 h-[2px] bg-accent"></span>200-day moving average; green and red bars denote daily close vs. open.</span>` : "4-hour bars during US regular sessions."}</div>
    </div>`;
}

function Detail({ D, h, back }) {
  const [kind, setKind] = useState("1d");
  const w = h.why || {}, m = h.metrics || {}, a = h.analysis || {}, t = h.tech || {};
  const F = D.rules.scores.conviction, L = D.rules.factor_labels;
  const loT = Math.min(m.target_low || Infinity, h.price || Infinity);
  const hiT = Math.max(m.target_high || 0, h.price || 0);
  const span = hiT - loT;
  const pos = v => span > 0 ? Math.max(2, Math.min(98, (v - loT) / span * 100)) : 50;
  const fl = a.filings || {};
  const rb = date(h.target_date, { month: "short", day: "numeric", year: "numeric" });
  const since = h.ceo_since ? (h.founder ? `, founded ${h.ceo_since}` : `, leading since ${h.ceo_since}`) : "";
  const tierObj = TIER[h.wildcard ? "wildcard" : (h.tier || "toehold")];

  return html`
    <${Card} className="col-span-12" id="detail">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-5 border-b border-fg/15">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="self-center"><${CoLogo} t=${h.ticker} size=${30} /></span>
          <span className="num text-[14px] font-semibold text-emerald">${h.ticker}</span>
          <h3 id="detail-title" tabIndex="-1" className="serif text-[22px] sm:text-[25px] font-semibold tracking-tight leading-none text-fg m-0 outline-none">${h.name}</h3>
          <span className="self-center"><${Chip} kind=${tierObj.kind}>${tierObj.label}<//></span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          ${back && html`<${Pill} onClick=${back}>Back to constituents<//>`}
          ${[["Daily (1D)", "1d"], ["Intraday (4H)", "4h"]].map(([l, k]) => html`<${Pill} key=${k} active=${kind === k} onClick=${() => setKind(k)}>${l}<//>`)}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7 min-w-0">
          ${(kind === "4h" && (!h.candles_4h || !h.candles_4h.length)) ? html`<p className="text-dim text-[13px] py-16 text-center">4-hour bars are not available for this security right now.</p>`
            : html`<${Candles} key=${h.ticker + kind} rows=${kind === "1d" ? t.candles_1d : h.candles_4h} kind=${kind} />`}
          <p className="mt-5 mb-0 text-[14.5px] leading-relaxed text-silver">${h.thesis}</p>
          ${w.tier && html`
            <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border border-line overflow-hidden">
                ${[[tierObj.label, html`<span className="inline-flex items-center">Tier<${InfoTip} label="tiers">${TIPS.tier}<//></span>`],
                   [(w.conviction || h.composite || 0).toFixed(1), html`<span className="inline-flex items-center">Conviction<${InfoTip} label="conviction">${TIPS.conviction}<//></span>`],
                   [pctU(w.raw), "Tier base, tilted"],
                   [pctU(h.weight), "Portfolio weight"]].map(([v, k], i) => html`
                  <div key=${i} className="bg-white px-3 py-2.5 min-w-0"><div className=${"num text-[14px] sm:text-[15px] font-semibold " + (i === 3 ? "text-emerald" : "text-fg")}>${v}</div><div className="text-[11px] text-dim mt-0.5 leading-tight">${k}</div></div>`)}
              </div>
            </div>`}
        </div>
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-5 min-w-0">
          <div className="flex items-center gap-4">
            <${Avatar} h=${h} size=${76} />
            <div className="min-w-0">
              <div className="text-[17px] font-bold text-fg leading-tight">${cleanName(h.ceo)}</div>
              <div className="text-[12.5px] text-dim mt-0.5">${h.role}, ${h.name}${since}</div>
              <div className="text-[12px] text-silver mt-1">${h.sector} · Market cap ${m.mcap_b ? "$" + m.mcap_b.toFixed(1) + "B" : "–"}</div>
            </div>
          </div>
          ${h.leader && h.leader.story && html`<p className="m-0 text-[13.5px] leading-relaxed text-silver">${h.leader.story}</p>`}
          <div className="border-t border-line pt-4">
            <${Label}>Fundamental & Capital Efficiency Metrics<//>
            <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3">
              <${KV} k="Return on capital" v=${pctU(a.roic)} />
              <${KV} k="Cost of capital" v=${pctU(a.wacc)} />
              <${KV} k="ROIC – WACC spread" v=${a.spread == null ? "–" : pts(a.spread)} cls=${tone(a.spread)} tip=${html`<${InfoTip} label="the hurdle">${TIPS.hurdle}<//>`} />
              <${KV} k="Operating margin" v=${pctU(m.op_margin)} cls=${tone(m.op_margin)} />
              <${KV} k="Revenue growth" v=${pct(m.rev_growth, 0)} cls=${tone(m.rev_growth)} />
              <${KV} k="FCF margin" v=${pctU(m.fcf_margin)} cls=${tone(m.fcf_margin)} />
            </div>
          </div>
          <div className="grid gap-2 border-t border-line pt-4">
            ${Object.keys(F).map(k => html`
              <div key=${k} className="grid grid-cols-[110px_1fr_30px] items-center gap-3 text-[12.5px]">
                <span className="text-silver">${L[k] || k} <span className="text-dim">(${Math.round(F[k] * 100)}%)</span></span>
                <div className="h-1.5 bg-fg/[0.08] overflow-hidden"><div className="h-full bg-emerald" style=${{ width: (h.scores[k] || 0) + "%" }}></div></div>
                <span className="num text-right font-semibold text-fg">${h.scores[k] == null ? "–" : h.scores[k].toFixed(0)}</span>
              </div>`)}
            <div className="text-[11px] text-dim">Percentile ranks (0–100) across the eligible Persian-led public universe, as of ${rb}.</div>
          </div>
          ${(m.target_high > 0 && m.target_low > 0) && html`
            <div className="border-t border-line pt-4">
              <div className="flex items-baseline justify-between"><${Label}>Consensus Price Target Range<//><span className="text-[12px] text-dim">${ratingText(m.rating)} (${m.analysts || 0} analysts)</span></div>
              <div className="mt-3 relative h-2 bg-fg/[0.08] rounded-[1px]">
                <div className="absolute -top-1 w-1 h-4 bg-accent" style=${{ left: pos(h.price) + "%" }} title=${"Current price: " + money(h.price, 2)}></div>
                <div className="absolute -top-1 w-1 h-4 bg-emerald" style=${{ left: pos(m.target_mean) + "%" }} title=${"Mean target: " + money(m.target_mean, 0)}></div>
              </div>
              <div className="mt-2 flex justify-between num text-[11px] text-dim"><span>Low ${money(m.target_low, 0)}</span><span className="text-emerald font-semibold">Mean ${money(m.target_mean, 0)}</span><span>High ${money(m.target_high, 0)}</span></div>
              <div className="mt-1 text-[11px] text-dim">Navy tick marks current price (${money(h.price, 2)}); emerald tick marks consensus mean target.</div>
            </div>`}
          <div className="flex flex-wrap gap-2 mt-auto pt-2">
            ${fl.annual && html`<${Pill} href=${fl.annual.url}>SEC ${fl.annual.form} (${date(fl.annual.date, { month: "short", year: "numeric" })})<//>`}
            ${fl.quarterly && html`<${Pill} href=${fl.quarterly.url}>SEC ${fl.quarterly.form} (${date(fl.quarterly.date, { month: "short", year: "numeric" })})<//>`}
            ${fl.proxy && html`<${Pill} href=${fl.proxy.url}>DEF 14A Proxy<//>`}
            <${Pill} href=${h.links.ir}>Investor Relations<//>
          </div>
        </div>
      </div>
    <//>`;
}

// ---------- Portfolio Allocation & Weights (Institutional Navy / Emerald Palette)
const arc = (cx, cy, r0, r1, a0, a1) => {
  const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const big = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  return `M${x0} ${y0}A${r1} ${r1} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${big} 0 ${x3} ${y3}Z`;
};
const ALLOC_PALETTE = [
  "#14264B", "#157535", "#1F3B6E", "#1E8E45", "#2B4F8C",
  "#2EA358", "#39619E", "#48B570", "#4A73AF", "#68C48A",
  "#5D85BF", "#85D1A2", "#7498CE", "#9FDDBA"
];
function SliceLogo({ t, x, y, size }) {
  const url = useLogo(t);
  const id = "clip-" + t.replace(/[^A-Za-z0-9]/g, "");
  if (size < 14) return null;
  return html`<g pointerEvents="none">
    <circle cx=${x} cy=${y} r=${size / 2 + 1.5} fill="#fff" />
    ${url ? html`<clipPath id=${id}><circle cx=${x} cy=${y} r=${size / 2} /></clipPath><image href=${url} x=${x - size / 2} y=${y - size / 2} width=${size} height=${size} clipPath=${"url(#" + id + ")"} preserveAspectRatio="xMidYMid slice" />`
      : html`<text x=${x} y=${y + 3} textAnchor="middle" fontSize="8.5" fontWeight="700" fill=${C.fg}>${t}</text>`}
  </g>`;
}
function Breakdown({ D, selTicker, pick }) {
  const [hov, setHov] = useState(null);
  const H = D.holdings.map((h, i) => ({ h, i })).sort((a, b) => b.h.weight - a.h.weight);
  const tot = H.reduce((s, x) => s + x.h.weight, 0);
  const cx = 170, cy = 170, R1 = 158, R0 = 98, gap = 0.008;
  let a = 0;
  const sl = H.map((x, k) => {
    const sweep = x.h.weight / tot * Math.PI * 2, a0 = a, a1 = a + sweep; a = a1;
    const mid = (a0 + a1) / 2, rm = (R0 + R1) / 2;
    return { ...x, k, a0, a1, color: ALLOC_PALETTE[k % ALLOC_PALETTE.length], lx: cx + rm * Math.sin(mid), ly: cy - rm * Math.cos(mid), size: Math.min(30, sweep * rm * 0.58) };
  });
  const focus = sl.find(x => x.h.ticker === (hov || selTicker));
  const rb = date(D.last_rebalance, { month: "short", day: "numeric", year: "numeric" });
  return html`
    <${Card} className="col-span-12" id="breakdown">
      <${Head} title="Portfolio Allocation & Conviction Sizing" aside=${`Active Rules v${D.rules.version} schedule (${rb})`} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-4 flex justify-center">
          <svg viewBox="0 0 340 340" className="w-full max-w-[320px] h-auto" role="img" aria-label="Portfolio allocation donut chart">
            ${sl.map(x => {
              const on = x.h.ticker === (hov || selTicker);
              return html`<path key=${x.h.ticker} d=${arc(cx, cy, R0, on ? R1 + 6 : R1, x.a0 + gap, x.a1 - gap)} fill=${x.color} stroke="#fff" strokeWidth="1"
                className="cursor-pointer transition-[d] duration-150" onMouseEnter=${() => setHov(x.h.ticker)} onMouseLeave=${() => setHov(null)} onClick=${() => pick(x.i)}><title>${x.h.name} ${pctU(x.h.weight)}</title></path>`;
            })}
            ${sl.map(x => html`<${SliceLogo} key=${"l" + x.h.ticker} t=${x.h.ticker} x=${x.lx} y=${x.ly} size=${x.size} />`)}
            <circle cx=${cx} cy=${cy} r=${R0 - 6} fill="#fff" />
            ${focus ? html`<g>
                <text x=${cx} y=${cy - 16} textAnchor="middle" fontSize="12.5" fontWeight="600" fill=${C.dim}>${focus.h.ticker} · ${TIER[focus.h.tier || "toehold"].label}</text>
                <text x=${cx} y=${cy + 14} textAnchor="middle" fontSize="28" fontWeight="700" fill=${C.fg} fontFamily="JetBrains Mono, monospace">${pctU(focus.h.weight)}</text>
                <text x=${cx} y=${cy + 34} textAnchor="middle" fontSize="11.5" fill=${C.dim}>Conviction ${(focus.h.composite || 0).toFixed(1)}</text></g>`
              : html`<text x=${cx} y=${cy + 6} textAnchor="middle" fontSize="16" fontWeight="700" fill=${C.fg}>${H.length} positions</text>`}
          </svg>
        </div>
        <div className="lg:col-span-8 overflow-x-auto">
          <table className="w-full text-[12.5px] sm:text-[13px]">
            <thead>
              <tr className="text-[11px] text-dim border-b border-line">
                <th className="text-left font-semibold pb-2">Constituent</th>
                <th className="text-left font-semibold pb-2 px-2">Leader</th>
                <th className="text-left font-semibold pb-2 px-2">Sleeve</th>
                <th className="text-right font-semibold pb-2 px-2">Conviction</th>
                <th className="text-right font-semibold pb-2 px-2">Weight</th>
                <th className="text-right font-semibold pb-2 pl-2">$10,000 Model</th>
              </tr>
            </thead>
            <tbody>
              ${sl.map(x => {
                const h = x.h, tObj = TIER[h.wildcard ? "wildcard" : (h.tier || "toehold")];
                return html`
                <tr key=${h.ticker} onClick=${() => pick(x.i)} onMouseEnter=${() => setHov(h.ticker)} onMouseLeave=${() => setHov(null)}
                  className=${"cursor-pointer border-b border-line transition-colors " + (h.ticker === (hov || selTicker) ? "bg-page" : "hover:bg-page/50")}>
                  <td className="py-2 pr-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 shrink-0" style=${{ background: x.color }}></span>
                      <${CoLogo} t=${h.ticker} size=${22} />
                      <span className="num font-semibold text-fg">${h.ticker}</span>
                      <span className="text-silver truncate max-w-[140px] sm:max-w-[180px]">${h.name}</span>
                    </span>
                  </td>
                  <td className="py-2 px-2 text-silver truncate max-w-[140px]">${cleanName(h.ceo)}</td>
                  <td className="py-2 px-2"><${Chip} kind=${tObj.kind}>${tObj.label}<//></td>
                  <td className="py-2 px-2 text-right num text-fg">${(h.composite || 0).toFixed(1)}</td>
                  <td className="py-2 px-2 text-right num font-semibold text-emerald">${pctU(h.weight)}</td>
                  <td className="py-2 pl-2 text-right num font-semibold text-fg">${money(10000 * h.weight, 0)}</td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>
      </div>
    <//>`;
}

// ---------- Rulebook v3
function Research({ D }) {
  const R = D.rules, Q = D.research, G = R.gates, T = R.tiers, SC = R.scores, EX = R.rebalance.execution;
  const PLAINF = { roic_spread: "ROIC minus WACC spread", op_margin: "operating margin", fcf_margin: "FCF margin", gross_margin: "gross margin", roe: "return on equity", leverage: "low net debt/EBITDA",
    fwd_eps_growth: "forward EPS growth", rev_growth: "revenue growth", beat_rate: "earnings beat rate", surprise: "surprise magnitude", insider_net: "net insider buying", buyback_yield: "buyback yield", momentum: "12-1M momentum",
    cheap_pe: "forward P/E (EV/EBITDA for REITs)", fcf_yield: "FCF yield", upside: "consensus target upside", peg: "PEG ratio", off_high: "room below 52W high" };
  const pctW = o => Object.entries(o).map(([k, v]) => `${PLAINF[k] || k} (${Math.round(v * 100)}%)`).join(", ");
  const Step = ({ n, t, children }) => html`
    <div className="flex flex-col gap-3 border border-line bg-page/50 p-4 sm:p-5">
      <div className="flex items-baseline justify-between border-b border-line pb-2">
        <span className="serif text-[19px] font-semibold text-fg">${t}</span>
        <span className="num text-[12px] font-semibold text-emerald">Stage ${n}</span>
      </div>
      ${children}
    </div>`;
  const P = ({ children }) => html`<p className="m-0 text-[13.5px] leading-relaxed text-silver">${children}</p>`;
  const Res = ({ children }) => html`<div className="mt-auto text-[12.5px] leading-snug font-medium text-fg border-l-2 border-emerald pl-3 pt-1">${children}</div>`;
  const Gates = ({ rows }) => html`<ul className="m-0 p-0 list-none grid gap-1.5 text-[13px] text-fg">
    ${rows.map(([k, v]) => html`<li key=${k} className="flex gap-3"><span className="w-[82px] shrink-0 text-dim">${k}</span><span className="num text-[12.5px]">${v}</span></li>`)}</ul>`;
  return html`
    <${Card} className="col-span-12" id="research">
      <${Head} title="Index Construction & Rulebook (v3)" aside="Ackman-style high-conviction compounder & catalyst architecture" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <${Step} n=${1} t="1. Universe & Fundamental Shield">
          <${P}>Every US-listed company led by a Persian or Iranian CEO, co-CEO, or executive chair documented by a verifiable public source is screened weekly:<//>
          <${Gates} rows=${[
            ["Listing", `${G.exchanges.join(", ")}; price ≥ $${G.min_price}`],
            ["Size", `Market cap ≥ $${Math.round(G.min_mcap_b * 1000)}M`],
            ["Liquidity", `ADV ≥ $${G.min_adv_musd}M/day ($${G.min_adv_small_musd}M small caps)`],
            ["Quality Shield", "Profitable compounders are exempt from 3M relative price stops"],
            ["Trend Brake", `Unprofitable names trailing S&P 500 by ${Math.abs(G.stop_rel_3m * 100)}+ pts over 3M are paused`]
          ]} />
          <${Res}>${D.universe_size} US-listed companies monitored; ${D.holdings.length} active positions.<//>
        <//>
        <${Step} n=${2} t="2. Multi-Factor Conviction Rank">
          <${P}>Eligible companies are scored 0–100 across three institutional pillars. Qualification requires either Track A (profitable operating compounder in the top half on Quality) or Track B (scaled $3B+ innovator with positive FCF or 30%+ revenue growth).<//>
          ${[["Quality", "Moat, ROIC spread & margins", SC.quality], ["Catalyst", "Operating & capital-allocation momentum", SC.catalyst], ["Rerate", "Valuation & cash-flow yield", SC.rerate]].map(([k, q, o]) => html`
            <div key=${k} className="text-[12.5px] leading-snug"><b className="text-fg">${k}</b> <span className="text-dim">(${q})</span><div className="mt-0.5 text-silver">${pctW(o)}.</div></div>`)}
          <${Math_}>Conviction = ${SC.conviction.quality} Quality + ${SC.conviction.catalyst} Catalyst + ${SC.conviction.rerate} Rerate<//>
          <${Res}>Weighted ROIC across active holdings is ${pctU(Q.roic)} vs. ${pctU(Q.wacc)} cost of capital.<//>
        <//>
        <${Step} n=${3} t="3. Tier Sizing & Execution">
          <${P}>Capital is concentrated in dominant compounders while maintaining disciplined multi-sector exposure across up to ${T.core.count + T.build.count + (T.toehold.count || 4)} names:<//>
          <${Gates} rows=${[
            ["Core Anchor", `Top ${T.core.count} large-cap compounders (~${pctU(T.core.base, 1)}, max ${pctU(T.core.max, 0)})`],
            ["Compounder", `Next ${T.build.count} profitable compounders (~${pctU(T.build.base, 1)}, max ${pctU(T.build.max, 0)})`],
            ["Catalyst", `Up to ${T.toehold.count || 4} scaled growth/value sleeves (~${pctU(T.toehold.base, 1)}, max ${pctU(T.toehold.max, 1)})`],
            ["Execution", `Calm-session VIX gate (< ${EX.vix_max}); ${R.cost_bps} bps turnover cost`]
          ]} />
          <${Res}>Hard single-name cap of ${pctU(R.cap, 0)} prevents top-3 crowding while preserving conviction weight.<//>
        <//>
      </div>
    <//>`;
}

function Years({ D }) {
  const data = Object.entries(D.years).map(([y, v]) => ({ y: y + (v.partial ? " YTD" : ""), p: v.prsn, b: v.bench }));
  const lab = { fill: C.fg, fontSize: 11, fontFamily: "JetBrains Mono, monospace" };
  const fmtL = v => (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(0) + "%";
  const all = data.flatMap(d => [d.p, d.b, 0]), lo = Math.min(...all), hi = Math.max(...all);
  return html`
    <${Card} className="col-span-12">
      <${Head} title="Calendar-Year Returns" aside=${html`<span className="inline-flex gap-4 items-center"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5" style=${{ background: C.prsn }}></span>PRSN</span><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5" style=${{ background: C.spxSoft }}></span>S&P 500</span></span>`} />
      <div className="h-[180px] sm:h-[200px]">
        <${ResponsiveContainer} width="100%" height="100%">
          <${BarChart} data=${data} margin=${{ top: 22, right: 0, bottom: 0, left: 0 }} barGap=${3}>
            <${XAxis} dataKey="y" axisLine=${false} tickLine=${false} tick=${{ fill: C.dim, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} />
            <${YAxis} hide domain=${[lo - (hi - lo) * 0.16, hi]} />
            <${ReferenceLine} y=${0} stroke="rgba(18,28,43,0.14)" />
            <${Bar} dataKey="p" radius=${[1, 1, 1, 1]} maxBarSize=${34} fill=${C.prsn} isAnimationActive=${!reduced}><${LabelList} dataKey="p" position="top" formatter=${fmtL} style=${lab} /><//>
            <${Bar} dataKey="b" radius=${[1, 1, 1, 1]} maxBarSize=${34} fill=${C.spxSoft} isAnimationActive=${!reduced}><${LabelList} dataKey="b" position="top" formatter=${fmtL} style=${{ ...lab, fill: C.dim }} /><//>
          <//>
        <//>
      </div>
    <//>`;
}

// ---------- Private Market Benchmark
const bil = b => b >= 1000 ? "$" + (b / 1000).toFixed(2) + "T" : "$" + Math.round(b) + "B";
function RoundsChart({ vals }) {
  const ref = useRef(null);
  const W = Math.max(280, useWidth(ref)), H = 190, m = { l: 28, r: 28, t: 26, b: 26 };
  const t = d => new Date(d + "T12:00:00Z").getTime();
  const x0 = t(vals[0].date), x1 = t(vals[vals.length - 1].date), hi = Math.max(...vals.map(v => v.valuation_b));
  const x = d => m.l + (t(d) - x0) / Math.max(1, x1 - x0) * (W - m.l - m.r), y = v => m.t + (1 - v / hi) * (H - m.t - m.b);
  const path = vals.map((v, i) => i ? `H${x(v.date).toFixed(1)}V${y(v.valuation_b).toFixed(1)}` : `M${x(v.date).toFixed(1)} ${y(v.valuation_b).toFixed(1)}`).join("");
  return html`<div ref=${ref} className="w-full"><svg viewBox=${`0 0 ${W} ${H}`} width="100%" height=${H} role="img" aria-label="Databricks primary round valuation step chart">
    <line x1=${m.l} x2=${W - m.r} y1=${H - m.b} y2=${H - m.b} stroke=${C.line} />
    <path d=${path + `H${W - m.r}`} fill="none" stroke=${C.navy} strokeWidth="2.2" strokeLinejoin="round" />
    ${vals.map((v, i) => html`<g key=${v.date}>
      <circle cx=${x(v.date)} cy=${y(v.valuation_b)} r="4" fill="#fff" stroke=${C.navy} strokeWidth="2" />
      <text x=${x(v.date)} y=${y(v.valuation_b) - 10} textAnchor=${i === 0 ? "start" : i === vals.length - 1 ? "end" : "middle"} fontSize="12" fontWeight="700" fill=${C.fg} fontFamily="JetBrains Mono, monospace">${bil(v.valuation_b)}</text>
      ${(i === 0 || v.date.slice(0, 4) !== vals[i - 1].date.slice(0, 4)) && html`<text x=${x(v.date)} y=${H - 8} textAnchor=${i === 0 ? "start" : i === vals.length - 1 ? "end" : "middle"} fontSize="11" fill=${C.dim} fontFamily="JetBrains Mono, monospace">${v.date.slice(0, 4)}</text>`}</g>`)}
  </svg></div>`;
}
function Honorable({ D }) {
  if (!D.private || !D.private.length) return null;
  return html`
    <${Card} className="col-span-12" id="honorable">
      <${Head} title="Private Market Benchmark: Databricks" aside="Tracked across primary institutional financing rounds" />
      <div className="grid gap-6">
        ${D.private.map(p => {
          const bars = [[p.name + " valuation", p.mult, C.navy], ["PRSN", p.prsn_mult, C.prsn], ["S&P 500", p.bench_mult, C.spx]];
          const mx = Math.max(...bars.map(b => b[1]));
          return html`
          <div key=${p.id} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 min-w-0 flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <${Avatar} h=${p} size=${72} lazy=${true} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><${CoLogo} t=${p.id} size=${22} /><span className="text-[17px] font-bold text-fg leading-tight">${p.name}</span></div>
                  <div className="text-[12.5px] text-dim mt-1">${cleanName(p.ceo)}, ${p.role}${p.founder ? " (co-founder)" : ""} — ${p.sector}</div>
                </div>
              </div>
              <p className="m-0 text-[13.5px] leading-relaxed text-silver">${(p.leader || {}).story}</p>
              <p className="m-0 text-[12px] leading-snug text-dim">${p.note}</p>
            </div>
            <div className="lg:col-span-7 min-w-0 grid gap-4">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div><div className="num text-[34px] sm:text-[40px] font-semibold leading-none text-accent">${bil(p.latest.valuation_b)}</div><div className="text-[11.5px] text-dim mt-1">${p.latest.round} valuation (${date(p.latest.date, { month: "short", year: "numeric" })})</div></div>
                <div><div className="num text-[22px] font-semibold leading-none text-fg">${pct(p.ann, 0)}<span className="text-[13px] text-dim font-normal">/yr</span></div><div className="text-[11.5px] text-dim mt-1">Since ${date(p.since, { month: "short", year: "numeric" })} at primary round marks</div></div>
              </div>
              <${RoundsChart} vals=${p.valuations} />
              <div className="grid gap-2">
                ${bars.map(([k, v, c]) => html`
                  <div key=${k} className="grid grid-cols-[140px_1fr_52px] sm:grid-cols-[170px_1fr_56px] items-center gap-3 text-[12.5px]">
                    <span className="text-silver truncate">${k}</span>
                    <div className="h-2 bg-fg/[0.06] overflow-hidden"><div className="h-full" style=${{ width: (v / mx * 100) + "%", background: c }}></div></div>
                    <span className="num text-right font-semibold text-fg">${v.toFixed(2)}×</span>
                  </div>`)}
              </div>
            </div>
          </div>`;
        })}
      </div>
    <//>`;
}

// ---------- Unified Executive & Company Directory (Eliminates duplicate sections)
const initialsOf = s => (s || "").replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
function Directory({ D, pick }) {
  const all = D.directory || [];
  const benchMap = useMemo(() => {
    const m = {};
    (D.bench || []).forEach(b => { m[b.ticker] = b; });
    return m;
  }, [D.bench]);
  const heldMap = useMemo(() => {
    const m = {};
    (D.holdings || []).forEach((h, i) => { m[h.ticker] = { h, i }; });
    return m;
  }, [D.holdings]);

  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");

  const rows = all.filter(r => {
    if (tab === "held" && !r.in_index) return false;
    if (tab === "watch" && (r.type !== "public" || r.in_index)) return false;
    if (tab === "private" && r.type !== "private") return false;
    if (tab === "public" && r.type !== "public") return false;
    if (q) {
      const hay = (r.name + " " + r.company + " " + r.sector + " " + (r.ticker || "") + " " + (r.hq || "")).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const nHeld = all.filter(r => r.in_index).length;
  const nPub = all.filter(r => r.type === "public").length;
  const nPriv = all.filter(r => r.type === "private").length;

  return html`
    <${Card} className="col-span-12" id="directory">
      <${Head} title="Persian Executive & Company Directory" aside=${`${all.length} verified leaders (${nPub} public, ${nPriv} private & unicorn founders)`} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Directory filter">
          <${Pill} active=${tab === "all"} onClick=${() => setTab("all")}>All Leaders (${all.length})<//>
          <${Pill} active=${tab === "held"} onClick=${() => setTab("held")}>In PRSN Index (${nHeld})<//>
          <${Pill} active=${tab === "public"} onClick=${() => setTab("public")}>All Public (${nPub})<//>
          <${Pill} active=${tab === "watch"} onClick=${() => setTab("watch")}>Public Watchlist (${nPub - nHeld})<//>
          <${Pill} active=${tab === "private"} onClick=${() => setTab("private")}>Private & Unicorns (${nPriv})<//>
        </div>
        <input type="search" value=${q} onInput=${e => setQ(e.target.value)} placeholder="Search executive, company, ticker, or sector…" aria-label="Search the directory"
          className="ml-auto w-full sm:w-[280px] rounded-[2px] border border-line bg-white px-3 py-1.5 text-[13px] text-fg placeholder:text-dim focus:outline-none focus:border-accent" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-line border border-line">
        ${rows.map(r => {
          const hm = r.ticker ? heldMap[r.ticker] : null;
          const bm = r.ticker ? benchMap[r.ticker] : null;
          return html`
          <div key=${r.name + r.company} className="bg-white p-4 flex flex-col gap-2.5 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <${Avatar} h=${{ ceo: r.name, leader: { photo: r.photo } }} size=${46} lazy=${true} />
                ${r.ticker && html`<span className="absolute -bottom-1 -right-1"><${CoLogo} t=${r.ticker} size=${18} /></span>`}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-bold text-fg leading-tight truncate">${r.name}</div>
                <div className="text-[12px] text-dim leading-tight truncate mt-0.5">${r.title}, <a href=${r.website} target="_blank" rel="noopener" className="hover:text-fg underline-offset-2 hover:underline">${r.company}</a>${r.ticker ? html` (<span className="num font-semibold text-fg">${r.ticker}</span>)` : ""}</div>
              </div>
              ${hm ? html`<button type="button" onClick=${() => pick(hm.i)}><${Chip} kind="good">In PRSN · ${pctU(hm.h.weight)}<//></button>`
                : bm ? html`<${Chip}>${bm.rule}<//>`
                : html`<${Chip} kind="accent">Private<//>`}
            </div>
            <p className="m-0 text-[12.5px] leading-snug text-silver">${r.background}</p>
            ${bm && bm.detail && html`<div className="text-[11.5px] text-dim bg-page px-2.5 py-1 border border-line">${bm.detail}</div>`}
            <div className="mt-auto pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-dim">
              <span>${r.sector}</span><span>· ${r.hq}</span>
              <a href=${r.source} target="_blank" rel="noopener" className="ml-auto text-accent font-semibold hover:underline">Source ↗</a>
            </div>
          </div>`;
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line">
        <p className="m-0 text-[12px] text-dim leading-snug">Know a Persian or Iranian CEO, co-CEO, or executive chair leading a public or $10M+ institutional-backed private company? Submit a verified public source to add them.</p>
        <${Pill} primary href=${NOMINATE_URL}>Nominate a leader<//>
      </div>
    <//>`;
}

// ---------- Decision Log & Model Evolution (Documents AppLovin Post-Mortem & V1->V2->V3)
const TRIGGER = {
  "v3 launch": ["Rules v3 Reconstitution", "good"],
  "v2 launch": ["Rules v2 Launch", "accent"],
  "monthly reconstitution": ["Monthly Reset", "good"],
  "event exit": ["Rule Breach", "bad"],
  drift: ["Weight Drift", "accent"],
  "no change": ["No Trades", ""]
};
function Decisions({ D }) {
  const M = D.macro || {}, R = D.rules;
  const [open, setOpen] = useState(0);
  const nm = t => ((D.holdings.find(h => h.ticker === t) || D.bench.find(b => b.ticker === t) || {}).name || t);
  const tk = ts => ts.map(t => html`<span key=${t} className="inline-flex items-center gap-1.5 rounded-[2px] border border-line bg-white pl-1 pr-2 py-0.5"><${CoLogo} t=${t} size=${16} /><span className="num text-[11.5px] font-semibold text-fg">${t}</span></span>`);
  return html`
    <${Card} className="col-span-12" id="decisions">
      <${Head} title="Decision Log & Model Evolution" aside="Weekly audit trail, AppLovin post-mortem, and version history" />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pb-4 mb-4 border-b border-line">
        <${KV} k="Market regime" v=${M.regime || "–"} cls=${M.regime === "Risk-off" ? "!text-coral" : M.regime === "Risk-on" ? "!text-emerald" : ""} />
        <${KV} k=${`VIX (calm gate < ${R.rebalance.execution.vix_max})`} v=${dec(M.vix, 1)} />
        <${KV} k="10Y Treasury (3M chg)" v=${M.ten_year == null ? "–" : `${pctU(M.ten_year, 2)} (${pts(M.ten_year_chg_3m, 2)})`} />
        <${KV} k="US Dollar Index (3M)" v=${pct(M.dollar_chg_3m)} />
        <${KV} k="S&P 500 vs. 200d SMA" v=${pct(M.spx_vs_sma200)} cls=${tone(M.spx_vs_sma200)} />
      </div>

      <div className="mb-5 bg-page border border-line p-4">
        <div className="text-[13px] font-bold text-fg">Research Post-Mortem: Why Rules v3 Removed the 3-Month Relative Stop on Profitable Compounders</div>
        <p className="mt-1.5 mb-0 text-[12.5px] leading-relaxed text-silver">
          Under the prior v2 rulebook (effective Oct 9, 2026), any stock trailing the S&P 500 by 20+ percentage points over three months was mechanically exited, even if its underlying business fundamentals were pristine. On Oct 9, that rule forced the exit of <strong className="text-fg">AppLovin (APP)</strong> (97th percentile Quality, 78% operating margin, +129% ROIC minus WACC spread) and <strong className="text-fg">Novo Nordisk (NVO)</strong> (85th percentile Quality, 51% operating margin) right at their short-term pullback lows, rotating capital into high-volatility small caps. Between Oct 13 and Nov 18, AppLovin rallied <span className="num font-semibold text-emerald">+45.0%</span> while the S&P 500 declined <span className="num font-semibold text-coral">−6.4%</span>. Furthermore, when 2 holdings exited on Nov 5, mid-month freeze rules forced 81.7% of the index into just 3 stocks. <strong className="text-fg">Rules v3</strong> resolves both structural flaws: profitable compounders are protected by a Fundamental Quality Shield (exempting them from short-term price stops), and Ackman-style sizing distributes capital across ${D.holdings.length} high-conviction compounders and scaled catalysts capped at 16% per name.
        </p>
      </div>

      <ol className="m-0 p-0 list-none">
        ${(D.decisions || []).map((d, i) => {
          const [lab, kind] = TRIGGER[d.trigger] || [d.trigger, ""];
          const on = open === i;
          const hasTrades = d.trigger !== "no change";
          return html`<li key=${d.date + d.rules} className="py-3 border-t border-line">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="num text-[12.5px] font-semibold text-fg w-[96px] shrink-0">${date(d.date)}</span>
              <${Chip} kind=${kind}>${lab}<//>
              <span className="text-[11.5px] text-dim num">Rules v${d.rules} · VIX ${dec(d.vix, 1)} · ${d.regime || ""}</span>
              ${d.targets && d.targets.length > 0 && html`<button type="button" onClick=${() => setOpen(on ? null : i)} aria-expanded=${on} className="ml-auto text-[12px] font-semibold text-accent hover:underline">${on ? "Hide target schedule" : "Show target schedule"}</button>`}
            </div>
            <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-silver max-w-[95ch]">${d.summary}</p>
            ${hasTrades && (d.adds.length > 0 || d.drops.length > 0) && html`<div className="mt-2 flex flex-wrap items-center gap-1.5">
              ${d.adds.length > 0 && html`<span className="text-[11px] font-semibold text-emerald mr-0.5">Added:</span>`}${tk(d.adds)}
              ${d.drops.length > 0 && html`<span className="text-[11px] font-semibold text-coral ml-2 mr-0.5">Removed:</span>`}${tk(d.drops)}
            </div>`}
            ${d.exits && d.exits.length > 0 && html`<ul className="mt-2 mb-0 pl-0 list-none grid gap-1 text-[12px] text-silver">${d.exits.map(e => html`<li key=${e.ticker}><b className="text-fg">${nm(e.ticker)}</b> (${e.rule}): ${e.detail}</li>`)}</ul>`}
            ${on && d.targets && d.targets.length > 0 && html`<div className="mt-3 overflow-x-auto"><table className="w-full text-[12.5px] num">
              <thead><tr className="text-[11px] text-dim border-b border-line"><th className="text-left font-semibold pb-1.5">Constituent</th><th className="text-left font-semibold pb-1.5 px-2">Sleeve</th><th className="text-right font-semibold pb-1.5 px-2">Conviction</th><th className="text-right font-semibold pb-1.5 px-2">Prior Weight</th><th className="text-right font-semibold pb-1.5">Target Weight</th></tr></thead>
              <tbody>${d.targets.map(t => html`<tr key=${t.ticker} className="border-t border-line"><td className="py-1.5 font-semibold text-fg">${t.ticker} <span className="font-normal text-silver font-sans">(${nm(t.ticker)})</span></td><td className="py-1.5 px-2">${TIER[t.tier] ? TIER[t.tier].label : t.tier}</td><td className="py-1.5 px-2 text-right">${t.conviction.toFixed(1)}</td><td className="py-1.5 px-2 text-right text-dim">${pctU(t.from)}</td><td className="py-1.5 text-right font-semibold text-emerald">${pctU(t.target)}</td></tr>`)}</tbody>
            </table></div>`}
          </li>`;
        })}
      </ol>
    <//>`;
}

// ---------- Academic Literature & Empirical Evidence
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
  ["dy03", "Donohue, C., & Yip, K. (2003). Optimal portfolio rebalancing with transaction costs. Journal of Portfolio Management, 29(4), 49–63.", "10.3905/jpm.2003.319894"],
  ["ff93", "Fama, E. F., & French, K. R. (1993). Common risk factors in the returns on stocks and bonds. Journal of Financial Economics, 33(1), 3–56.", "10.1016/0304-405X(93)90023-5"],
  ["ff15", "Fama, E. F., & French, K. R. (2015). A five-factor asset pricing model. Journal of Financial Economics, 116(1), 1–22.", "10.1016/j.jfineco.2014.10.010"],
  ["ilv95", "Ikenberry, D., Lakonishok, J., & Vermaelen, T. (1995). Market underreaction to open market share repurchases. Journal of Financial Economics, 39(2–3), 181–208.", "10.1016/0304-405X(95)00826-Z"],
  ["jt93", "Jegadeesh, N., & Titman, S. (1993). Returns to buying winners and selling losers: Implications for stock market efficiency. Journal of Finance, 48(1), 65–91.", "10.1111/j.1540-6261.1993.tb04702.x"],
  ["kgw20", "Koller, T., Goedhart, M., & Wessels, D. (2020). Valuation: Measuring and managing the value of companies (7th ed.). McKinsey & Company / Wiley.", null],
  ["ll01", "Lakonishok, J., & Lee, I. (2001). Are insider trades informative? Review of Financial Studies, 14(1), 79–111.", "10.1093/rfs/14.1.79"],
  ["markowitz52", "Markowitz, H. (1952). Portfolio selection. Journal of Finance, 7(1), 77–91.", "10.2307/2975974"],
  ["mm58", "Modigliani, F., & Miller, M. H. (1958). The cost of capital, corporation finance and the theory of investment. American Economic Review, 48(3), 261–297.", null, "https://www.jstor.org/stable/1809766"],
  ["nm13", "Novy-Marx, R. (2013). The other side of value: The gross profitability premium. Journal of Financial Economics, 108(1), 1–28.", "10.1016/j.jfineco.2013.01.003"],
  ["pw08", "Pontiff, J., & Woodgate, A. (2008). Share issuance and cross-sectional returns. Journal of Finance, 63(2), 921–945.", "10.1111/j.1540-6261.2008.01335.x"],
  ["sharpe64", "Sharpe, W. F. (1964). Capital asset prices: A theory of market equilibrium under conditions of risk. Journal of Finance, 19(3), 425–442.", "10.1111/j.1540-6261.1964.tb02865.x"],
  ["sharpe66", "Sharpe, W. F. (1966). Mutual fund performance. Journal of Business, 39(1), 119–138.", "10.1086/294846"],
  ["sharpe94", "Sharpe, W. F. (1994). The Sharpe ratio. Journal of Portfolio Management, 21(1), 49–58.", "10.3905/jpm.1994.409501"],
  ["statman87", "Statman, M. (1987). How many stocks make a diversified portfolio? Journal of Financial and Quantitative Analysis, 22(3), 353–363.", "10.2307/2330969"],
];
const REF_LABEL = { ar03: "Anderson & Reeb 2003", afp19: "Asness, Frazzini & Pedersen 2019", ajkm22: "Azoulay et al. 2022", ahm05: "Arnott, Hsu & Moore 2005", bblz14: "Bailey et al. 2014", bt89: "Bernard & Thomas 1989", bgir92: "Brown et al. 1992", chs08: "Campbell, Hilscher & Szilagyi 2008", carhart97: "Carhart 1997", dy03: "Donohue & Yip 2003", ff93: "Fama & French 1993", ff15: "Fama & French 2015", ilv95: "Ikenberry, Lakonishok & Vermaelen 1995", jt93: "Jegadeesh & Titman 1993", kgw20: "Koller, Goedhart & Wessels 2020", ll01: "Lakonishok & Lee 2001", markowitz52: "Markowitz 1952", mm58: "Modigliani & Miller 1958", nm13: "Novy-Marx 2013", pw08: "Pontiff & Woodgate 2008", sharpe64: "Sharpe 1964", sharpe66: "Sharpe 1966", sharpe94: "Sharpe 1994", statman87: "Statman 1987" };
const RULES_WHY = [
  ["Quality & Profitability Shield", "High-ROIC, cash-generative businesses earn a persistent risk-adjusted premium and should never be liquidated on short-term price noise.", ["afp19", "nm13", "ff15"]],
  ["ROIC Minus WACC Spread", "Economic value is created only when return on invested capital exceeds the opportunity cost of capital.", ["kgw20", "sharpe64", "mm58"]],
  ["Operating & Capital-Allocation Catalysts", "Post-earnings announcement drift, insider net purchases, and share buybacks systematically precede excess returns.", ["bt89", "ll01", "ilv95", "pw08"]],
  ["High-Conviction Ackman-Style Sizing (12–15 Names)", "Twelve to fifteen uncorrelated compounders capture the vast majority of diversification benefits while preserving active conviction weights.", ["statman87", "markowitz52"]],
  ["Valuation & Free-Cash-Flow Rerate", "Quality compounders acquired at reasonable FCF yields and PEG multiples outperform pure momentum or deep value traps.", ["ff93", "ahm05"]],
  ["Calm-VIX Execution & Drift Bands", "Trading only when weights drift past 5 percentage points and VIX is calm minimizes bid-ask slippage and turnover drag.", ["dy03", "sharpe94"]],
];
const refOf = k => REFS.find(r => r[0] === k) || [];
const SrcChip = ({ k }) => {
  const [, full, doi, url] = refOf(k);
  return html`<a href=${doi ? "https://doi.org/" + doi : url} target="_blank" rel="noopener" title=${full}
    className="inline-flex items-center rounded-[2px] border border-line bg-white px-2 py-0.5 text-[11.5px] text-silver hover:text-accent hover:border-accent/40 whitespace-nowrap">${REF_LABEL[k]}</a>`;
};

function Evidence({ D }) {
  const S = D.stats, T = D.trailing, R = D.rules, G = D.growth_10k;
  const bm = S.months.map(m => m[2]);
  const ext = (arr, f) => arr.reduce((a, b) => f(a, b) ? a : b);
  const rows = [
    ["$10,000 from Dec 2021", G.prsn, G.bench, v => money(v, 0), true],
    ["Annualized return (2021–2026)", S.ann_return, S.ann_return_bench, v => pct(v), true],
    ["Trailing 12 months", T["1Y"].prsn, T["1Y"].bench, v => pct(v), true],
    ["Sharpe ratio", S.sharpe, S.sharpe_bench, v => dec(v), true],
    ["Sortino ratio", S.sortino, S.sharpe_bench, v => dec(v), true],
    ["Positive months (%)", S.pct_up_months, bm.filter(x => x > 0).length / bm.length, v => pctU(v, 0), true],
  ];
  const credits = [...D.holdings, ...(D.private || [])].filter(h => h.leader && h.leader.credit);

  return html`
    <${Card} className="col-span-12" id="evidence">
      <${Head} title="Empirical Evidence, Methodology History & References" aside="Benchmark attribution, rulebook evolution (v1 → v2 → v3), and academic citations" />
      <div className="grid gap-8">
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
            ${rows.map(([k, a, b, f, hi]) => {
              const pw = hi ? a > b : a < b, m = Math.max(Math.abs(a), Math.abs(b)) || 1;
              return html`
              <div key=${k} className="py-3 border-b border-line">
                <div className="text-[12px] text-dim">${k}</div>
                <div className="mt-1.5 grid grid-cols-2 gap-3">
                  ${[[a, C.prsn, pw, "PRSN"], [b, C.spx, !pw, "S&P 500"]].map(([v, c, w, lbl], i) => html`
                    <div key=${i} className="min-w-0">
                      <div className=${"num text-[16px] sm:text-[17px] leading-none flex items-center gap-1 " + (w ? "font-bold text-fg" : "font-medium text-dim")}>${f(v)}${w && html`<${Icon} n="check" size=${13} className=${i ? "text-coral" : "text-emerald"} />`}</div>
                      <div className="text-[10.5px] text-dim mt-0.5">${lbl}</div>
                      <div className="mt-1 h-1.5 bg-fg/[0.05] overflow-hidden"><div className="h-full" style=${{ width: Math.max(3, Math.abs(v) / m * 100) + "%", background: c, opacity: w ? 1 : 0.45 }}></div></div>
                    </div>`)}
                </div>
              </div>`;
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
          ${RULES_WHY.map(([rule, why, ks]) => html`
            <div key=${rule} className="py-2.5 border-b border-line min-w-0">
              <p className="m-0 text-[13px] text-silver leading-snug"><b className="text-fg">${rule}:</b> ${why}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">${ks.map(k => html`<${SrcChip} key=${k} k=${k} />`)}</div>
            </div>`)}
        </div>

        <div className="bg-page border border-line p-4 grid gap-2">
          <${Label}>Model Version Lineage & Historical Provenance<//>
          ${[...(R.changelog || [])].reverse().map(c => html`<p key=${c.version} className="m-0 text-[12.5px] text-silver leading-snug"><b className="num text-fg">v${c.version}</b> (${date(c.date)}): ${c.note}</p>`)}
          <p className="m-0 text-[11.5px] text-dim leading-relaxed pt-1 border-t border-line">
            Note on historical record: Pre-October 2026 series values reflect the v1 historical simulation from December 31, 2021; v2 ran live from October 9 to November 17, 2026; v3 governs the live portfolio from November 18, 2026 forward. All rule parameters are open-source in <a className="underline underline-offset-2 hover:text-fg" href=${REPO + "/blob/main/engine/config/rules.yaml"} target="_blank" rel="noopener">engine/config/rules.yaml</a>. Portrait credits: ${credits.map((h, i) => html`<span key=${h.ticker || h.id}>${i ? "; " : ""}${cleanName(h.ceo)}, ${h.leader.credit_url ? html`<a className="underline underline-offset-2" href=${h.leader.credit_url} target="_blank" rel="noopener">${h.leader.credit.replace(/^Photo:\s*/, "")}</a>` : h.leader.credit.replace(/^Photo:\s*/, "")}</span>`)}.
          </p>
        </div>
      </div>
    <//>`;
}

function useSelection(D) {
  const [sel, setSel] = useState(0);
  const [from, setFrom] = useState(null);
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    if (!D) return;
    const m = location.hash.match(/^#h-([A-Z.]+)$/);
    const t = m ? m[1] : store.get("prsn-selected");
    const i = D.holdings.findIndex(h => h.ticker === t);
    if (i >= 0) { setSel(i); if (m) setTimeout(() => goTo("detail", "detail-title"), 300); }
  }, [D]);
  const select = (i, scroll, fromLeader) => {
    const h = D.holdings[i];
    if (!h) return;
    setSel(i); setFrom(fromLeader ? h.ticker : null);
    store.set("prsn-selected", h.ticker);
    setAnnounce(`Showing ${h.name}, led by ${cleanName(h.ceo)}.`);
    if (scroll) setTimeout(() => goTo("detail", "detail-title"), 40);
  };
  const back = from ? () => goTo("leader-" + from) : null;
  return { sel, select, back, announce };
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

function App() {
  const [D, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [range, setRange] = useState(0);
  const [bench, setBench] = useState(true);
  useEffect(() => {
    fetch(DATA_URL, { cache: "no-store" }).then(r => { if (!r.ok) throw 0; return r.json(); }).then(setD).catch(() => setErr(true));
  }, []);
  const [shared, setShared] = useState("");
  const share = async () => {
    const data = { title: "PRSN — Persian-Led US Equity Index", text: "PRSN: Persian-Led US Equity Index (Rules v3)", url: SHARE_URL };
    try { if (navigator.share) { await navigator.share(data); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(SHARE_URL); setShared("Link copied"); } catch (e) { setShared(SHARE_URL); }
    setTimeout(() => setShared(""), 2400);
  };
  useEffect(() => {
    if (!EMBED) return;
    let last = 0;
    const root = document.getElementById("root");
    const send = () => { const h = Math.ceil(root.getBoundingClientRect().height); if (Math.abs(h - last) > 2) { last = h; window.parent.postMessage({ type: "prsn-height", height: h }, "*"); } };
    const ro = new ResizeObserver(send);
    ro.observe(root);
    send();
    return () => ro.disconnect();
  }, []);
  const S = useSelection(D);
  const active = useActiveSection(["leaders", "breakdown", "detail", "research", "directory", "decisions", "evidence"]);
  if (err) return html`<div className="p-10 text-dim">Index data did not load. Run <span className="num">python -m engine daily</span>, then reload the page.</div>`;
  if (!D) return html`<div className="p-10 text-dim">Loading PRSN tear sheet…</div>`;
  const curHolding = D.holdings[S.sel] || D.holdings[0];
  const nav = [["leaders", "Constituents"], ["breakdown", "Allocation"], ["research", "Rulebook v3"], ["directory", "Directory"], ["decisions", "Decisions"], ["evidence", "Evidence"]];
  return html`
    <div className="relative min-h-screen overflow-x-clip">
      <a href="#leaders" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:px-3 focus:py-2 focus:bg-white">Skip to constituents</a>
      <header className=${(EMBED ? "" : "sticky ") + "z-30 border-b border-line bg-white/95 backdrop-blur"} style=${EMBED ? null : { top: "env(safe-area-inset-top, 0px)" }}>
        <div aria-hidden="true" className="flex h-[3px]"><span className="flex-1" style=${{ background: C.prsn }}></span><span className="flex-1 bg-white"></span><span className="flex-1" style=${{ background: C.spx }}></span></div>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick=${() => goTo("why")} className="shrink-0" aria-label="PRSN, back to top"><${Logo} h=${28} /></button>
            <span className="hidden sm:inline text-[12px] text-dim border-l border-line pl-3">Rules v${D.rules.version} · ${D.holdings.length} Active Holdings · ${D.directory.length} Verified Leaders</span>
          </div>
          <nav aria-label="Sections" className="flex items-center gap-1.5">
            ${nav.map(([id, l]) => html`<span key=${id} className="hidden lg:inline-flex"><${Pill} onClick=${() => goTo(id)} active=${active === id || (id === "breakdown" && active === "detail")}>${l}<//></span>`)}
            ${EMBED && html`<span className="hidden sm:inline-flex"><${Pill} href=${FULL_URL}>Full page ↗<//></span>`}
            <${Pill} primary onClick=${share} label="Share this page"><${Icon} n="share" size=${13} />${shared ? (shared === "Link copied" ? "Copied" : "Share") : "Share"}<//>
          </nav>
        </div>
      </header>
      <div className="sr-only" aria-live="polite">${S.announce}${shared ? " " + shared : ""}</div>

      <main className="relative max-w-[1280px] mx-auto px-4 sm:px-6 py-5 sm:py-7 grid grid-cols-12 gap-3 sm:gap-4">
        <${Why} D=${D} />
        <${Hero} D=${D} range=${range} setRange=${setRange} showBench=${bench} setShowBench=${setBench} />
        <${Side} D=${D} />
        <${Leaders} D=${D} selTicker=${curHolding.ticker} pick=${i => S.select(i, true, true)} />
        <${Breakdown} D=${D} selTicker=${curHolding.ticker} pick=${i => S.select(i, true)} />
        <${Detail} D=${D} h=${curHolding} back=${S.back} />
        <${Research} D=${D} />
        <${Years} D=${D} />
        <${Honorable} D=${D} />
        <${Directory} D=${D} pick=${i => S.select(i, true)} />
        <${Decisions} D=${D} />
        <${Evidence} D=${D} />
      </main>

      <footer className="relative max-w-[1280px] mx-auto px-4 sm:px-6 pb-12 text-[11.5px] text-dim leading-relaxed">
        <div className="border-t border-line pt-5 grid gap-1.5">
          <p className="m-0 max-w-[960px]">PRSN is an independent rules-based equity research index, not an investment fund or investment advice. The author holds personal positions in constituent securities. Market prices: ${D.sources.prices} (${asofLabel(D)}). Fundamentals: ${D.sources.fundamentals} (as of ${date(D.fundamentals_asof)}). Regulatory filings: ${D.sources.filings}.</p>
          <p className="m-0">© Parsa Ara · <a className="text-silver hover:text-fg underline underline-offset-2" href="https://parsaara.com" target="_blank" rel="noopener">parsaara.com</a> · <a className="text-silver hover:text-fg underline underline-offset-2" href="https://www.linkedin.com/in/parsaara/" target="_blank" rel="noopener">LinkedIn</a> · <a className="text-silver hover:text-fg underline underline-offset-2" href=${REPO} target="_blank" rel="noopener">GitHub Repository</a></p>
        </div>
      </footer>
    </div>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
