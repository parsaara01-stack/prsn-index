"""The PRSN method, v2: who is eligible, how each company scores, and how much each one gets."""
import pandas as pd

from .common import CONFIG, read_yaml


def events():
    """Manual event exclusions (going-concern, signed takeover, interim leader...). See engine/config/events.yaml."""
    try:
        return {e["ticker"]: e for e in (read_yaml(CONFIG / "events.yaml") or {}).get("exclude", [])}
    except FileNotFoundError:
        return {}


def screen(rec, R):
    """Return (eligible, rule, detail, sleeve). Rule names show on the site's watch list."""
    g, m = R["gates"], rec.get("metrics") or {}
    ev = events().get(rec["ticker"])
    if ev:
        return False, "Event", ev.get("detail", ""), None
    if rec.get("price") is None:
        return False, "No price", "No trading data.", None
    if rec.get("exchange") not in g["exchanges"]:
        return False, "Not US-listed", f"Trades in {rec.get('exchange')}.", None
    mcap = m.get("mcap_b")
    if mcap is None or mcap < g["min_mcap_b"]:
        return False, "Too small", f"Market cap {'unknown' if mcap is None else f'${mcap * 1000:.0f}M'}, under ${g['min_mcap_b'] * 1000:.0f}M.", None
    small = mcap < g["small_cap_below_b"]
    adv = rec.get("adv_musd")
    need = g["min_adv_small_musd"] if small else g["min_adv_musd"]
    if adv is None or adv < need:
        return False, "Thin trading", f"${0 if adv is None else adv:.1f}M a day, needs ${need:g}M.", None
    if rec["price"] < g["min_price"]:
        return False, "Under $1", f"Price ${rec['price']:.2f}.", None
    if rec.get("rel_3m") is not None and rec["rel_3m"] < g["stop_rel_3m"]:
        return False, "Relative stop", f"Trails the S&P 500 by {abs(rec['rel_3m']) * 100:.0f} pts over 3 months.", None
    return True, None, None, "small" if small else "core"


def _inputs(rec):
    m, a, t = rec.get("metrics") or {}, rec.get("analysis") or {}, rec.get("tech") or {}
    pe = m.get("ev_ebitda") if rec.get("reit") else m.get("fwd_pe")
    g = a.get("fwd_eps_growth")
    q = a.get("quarters") or 0
    return {
        # quality
        "roic_spread": a.get("spread"), "op_margin": m.get("op_margin"), "fcf_margin": m.get("fcf_margin"),
        "gross_margin": m.get("gross_margin"), "roe": m.get("roe"),
        "leverage": None if m.get("net_debt_ebitda") is None else -m["net_debt_ebitda"],
        # catalyst
        "fwd_eps_growth": g, "rev_growth": m.get("rev_growth"), "beat_rate": a.get("beats") / q if q else None,
        "surprise": a.get("avg_surprise"), "insider_net": a.get("insider_net_pct"), "buyback_yield": a.get("buyback_yield"),
        "momentum": rec.get("momentum_12_1"),
        # rerate: cheaper and more room = higher
        "cheap_pe": -pe if pe and pe > 0 else None, "fcf_yield": m.get("fcf_yield"), "upside": m.get("upside"),
        "peg": -(pe / (g * 100)) if pe and pe > 0 and g and g > 0 else None,
        "off_high": None if t.get("off_high") is None else -t["off_high"],
    }


# Missing data: quality must be shown, so a gap scores low; catalysts and rerating default to neutral.
MISSING = {"quality": 0.25, "catalyst": 0.5, "rerate": 0.4}


def score(recs, R):
    """Percentile scores 0-100 within the eligible list, plus conviction and quality percentile."""
    df = pd.DataFrame({r["ticker"]: _inputs(r) for r in recs}).T.astype(float)
    out = {r["ticker"]: {} for r in recs}
    for block in ["quality", "catalyst", "rerate"]:
        w = R["scores"][block]
        parts = pd.DataFrame({k: df[k].rank(pct=True).fillna(MISSING[block]) for k in w})
        s = sum(parts[k] * v for k, v in w.items()) / sum(w.values()) * 100
        for t in s.index:
            out[t][block] = float(s[t])
    cw = R["scores"]["conviction"]
    for t, s in out.items():
        s["conviction"] = sum(s[k] * v for k, v in cw.items())
    qs = pd.Series({t: s["quality"] for t, s in out.items()})
    for t, p in qs.rank(pct=True).items():
        out[t]["quality_pct"] = float(p * 100)
    return out


def _fill(weights, caps, total):
    """Scale weights to `total`, never past each name's cap; spread the excess over names with room."""
    w = dict(weights)
    fixed = {}
    for _ in range(50):
        free = {k: v for k, v in w.items() if k not in fixed}
        room = total - sum(fixed.values())
        s = sum(free.values())
        if not free or s <= 0:
            break
        scaled = {k: v * room / s for k, v in free.items()}
        over = {k for k, v in scaled.items() if v > caps[k] + 1e-12}
        if not over:
            fixed.update(scaled)
            break
        for k in over:
            fixed[k] = caps[k]
        w = {**w, **{k: caps[k] for k in over}}
    return fixed


def targets(recs, R):
    """Full decision: eligibility, scores, tiers and target weights. Returns (held, watch)."""
    elig, watch = [], []
    for r in recs:
        ok, rule, detail, sleeve = screen(r, R)
        if ok:
            r["sleeve"] = sleeve
            elig.append(r)
        else:
            watch.append({"ticker": r["ticker"], "rule": rule, "detail": detail})
    if not elig:
        return [], watch
    S = score(elig, R)
    gate = R["scores"]["quality_gate_pct"]

    def profitable(r):   # quality also has to be real: an operating profit
        return not R["scores"].get("require_profit") or ((r.get("metrics") or {}).get("op_margin") or -1) > 0

    qual = [r for r in elig if S[r["ticker"]]["quality_pct"] >= gate and profitable(r)]
    fail = [r for r in elig if r not in qual]
    # wildcard: best catalyst among fast growers that miss the quality cut
    wc = R.get("wildcard") or {}
    cands = [r for r in fail if ((r.get("metrics") or {}).get("rev_growth") or 0) >= wc.get("min_rev_growth", 9)]
    wild = max(cands, key=lambda r: S[r["ticker"]]["catalyst"], default=None) if wc.get("weight") else None
    for r in fail:
        if r is not wild:
            s = S[r["ticker"]]
            why = "below the top half" if s["quality_pct"] < gate else "no operating profit yet"
            watch.append({"ticker": r["ticker"], "rule": "Quality cut", "detail": f"Quality {s['quality']:.0f}, {why}. Catalyst {s['catalyst']:.0f}, rerate {s['rerate']:.0f}.", "scores": s})
    # tiers, in conviction order
    T = R["tiers"]
    qual.sort(key=lambda r: -S[r["ticker"]]["conviction"])
    n_core = n_build = 0
    for r in qual:
        s = S[r["ticker"]]
        if r["sleeve"] == "small":
            r["tier"] = "toehold"
        elif n_core < T["core"]["count"] and s["catalyst"] >= T["core"]["min_catalyst"]:
            r["tier"], n_core = "core", n_core + 1
        elif n_build < T["build"]["count"]:
            r["tier"], n_build = "build", n_build + 1
        else:
            r["tier"] = "toehold"
    raw, caps = {}, {}
    for tier in ["core", "build", "toehold"]:
        grp = [r for r in qual if r["tier"] == tier]
        if not grp:
            continue
        mean = sum(S[r["ticker"]]["conviction"] for r in grp) / len(grp)
        for r in grp:
            c = S[r["ticker"]]["conviction"]
            raw[r["ticker"]] = T[tier]["base"] * max(0.5, 1 + T["tilt"] * (c - mean) / 50)
            caps[r["ticker"]] = min(R["cap"], T[tier].get("max", R["cap"]), R["small_cap"]["max_each"] if r["sleeve"] == "small" else 1)
    total = 1 - (wc["weight"] if wild else 0)
    w = _fill(raw, caps, total)
    small = [r["ticker"] for r in qual if r["sleeve"] == "small"]
    st = sum(w[t] for t in small)
    if st > R["small_cap"]["max_total"]:   # shrink the sleeve, hand the rest to the larger names
        f = R["small_cap"]["max_total"] / st
        for t in small:
            w[t] *= f
        big = {k: v for k, v in w.items() if k not in small}
        w.update(_fill(big, caps, total - R["small_cap"]["max_total"]))
    held = []
    for r in qual:
        t = r["ticker"]
        held.append({"ticker": t, "tier": r["tier"], "sleeve": r["sleeve"], "target": w[t], "wildcard": False, "scores": S[t],
                     "why": {"tier": r["tier"], "base": T[r["tier"]]["base"], "raw": raw[t], "final": w[t], "conviction": S[t]["conviction"],
                             "binding": "cap" if abs(w[t] - caps[t]) < 1e-9 else None}})
    if wild:
        t = wild["ticker"]
        held.append({"ticker": t, "tier": "wildcard", "sleeve": wild["sleeve"], "target": wc["weight"], "wildcard": True, "scores": S[t],
                     "why": {"tier": "wildcard", "base": wc["weight"], "raw": wc["weight"], "final": wc["weight"], "conviction": S[t]["conviction"], "binding": None}})
    held.sort(key=lambda h: -h["target"])
    return held, watch
