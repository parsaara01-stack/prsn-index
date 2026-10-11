"""Orchestration: refresh fundamentals, chain the index, make the weekly decision, and write data/index.json."""
from datetime import date, datetime, timedelta, timezone

import pandas as pd

from . import company, market, method, series
from .common import (COMPANIES_JSON, CONFIG, DATA, DECISIONS_JSON, ACCOUNT_JSON, INDEX_JSON, fnum, log, now_et,
                     read_csv, read_json, rules, universe, write_json)

FACTOR_LABELS = {"quality": "Quality", "catalyst": "Catalyst", "rerate": "Rerate"}


def _all_universe():
    return read_csv(CONFIG / "universe.csv")


def _profiles():
    return read_json(CONFIG / "profiles.json", {})


def _rf(px):
    irx = px["Close"].get("^IRX")
    return float(irx.dropna().iloc[-1] / 100) if irx is not None and not irx.dropna().empty else 0.04


def prices(tickers):
    return market.daily(list(tickers) + [market.BENCH] + market.MACRO)


# ---------- weekly: fundamentals for every company in the universe
def refresh(px=None):
    R, U = rules(), universe()
    comps = read_json(COMPANIES_JSON, {})
    px = px or prices([u["ticker"] for u in U])
    rf = _rf(px)
    for u in U:
        t = u["ticker"]
        log.info("fundamentals %s", t)
        pb = company.price_block(px, t, rf=rf, erp=R["erp"])
        beta = (pb or {}).get("capm", {}) and pb["capm"]["beta"] if pb and pb.get("capm") else None
        f = market.fundamentals(t)
        if not f.get("info"):
            log.warning("no fundamentals for %s, keeping last", t)
            continue
        m, a = company.fundamental_block(f, rf, R["erp"], beta=beta, prev=comps.get(t))
        if market.sec_enabled():
            a["filings"] = market.latest_filings(t) or a.get("filings")
        comps[t] = {"metrics": m, "analysis": a, "fetched": now_et().strftime("%Y-%m-%d")}
    write_json(COMPANIES_JSON, comps, indent=1)
    return comps, px


# ---------- shared: one company record (fundamentals rolled forward to today's price)
def record(t, u, comps, pb):
    c = comps.get(t) or {}
    m = dict(c.get("metrics") or {})
    a = dict(c.get("analysis") or {})
    if pb:
        p = pb["price"]
        if m.get("mcap_b") and m.get("mcap_price"):
            m["mcap_b"] = m["mcap_b"] * p / m["mcap_price"]
        if m.get("target_mean"):
            m["upside"] = m["target_mean"] / p - 1
        m["price"], m["adv_musd"] = p, pb.get("adv_musd")
    return {"ticker": t, "exchange": u.get("exchange"), "reit": str(u.get("reit")).lower() == "true", "metrics": m, "analysis": a,
            **({k: pb.get(k) for k in ["price", "day_change", "ret_ytd", "ret_1y", "momentum_12_1", "rel_3m", "adv_musd", "tech", "capm"]} if pb else {"price": None})}


def regime(px):
    c = px["Close"]
    out = {}
    try:
        vix = c["^VIX"].dropna()
        tnx = c["^TNX"].dropna()
        dxy = c["DX-Y.NYB"].dropna()
        spx = c["^GSPC"].dropna()
        out = {"vix": float(vix.iloc[-1]), "vix_5d": float(vix.iloc[-6:-1].mean()), "ten_year": float(tnx.iloc[-1] / 100),
               "ten_year_chg_3m": float((tnx.iloc[-1] - tnx.iloc[-64]) / 100), "dollar_chg_3m": float(dxy.iloc[-1] / dxy.iloc[-64] - 1),
               "spx_vs_sma200": float(spx.iloc[-1] / spx.rolling(200).mean().iloc[-1] - 1), "t_bill": _rf(px)}
        score = (out["vix"] < 20) + (out["spx_vs_sma200"] > 0) + (out["ten_year_chg_3m"] < 0.0025) + (out["dollar_chg_3m"] < 0.02)
        out["regime"] = "Risk-on" if score >= 3 else "Risk-off" if score <= 1 else "Mixed"
    except (KeyError, IndexError) as e:
        log.warning("macro read failed: %s", e)
    return out


def _next_friday(d):
    return d + timedelta(days=(4 - d.weekday()) % 7 or 7)


# ---------- daily: extend the index through the latest close, then rebuild the page data
def daily(decide_today=False):
    R, U = rules(), universe()
    D = read_json(INDEX_JSON)
    comps = read_json(COMPANIES_JSON)
    held = [h["ticker"] for h in D["holdings"]]
    pend = list((D.get("pending") or {}).get("targets", {}))
    px = prices({u["ticker"] for u in U} | set(held) | set(pend))
    if not comps:
        comps, _ = refresh(px)
    _migrate(D)
    pmeta = (D.get("pending") or {}).get("meta")
    done = series.chain(D, px, R)
    if done:   # an executed rebalance: its targets become the holdings' targets
        D["targets"], D["targets_date"] = pmeta or D.get("targets"), done[-1]["date"]
    if decide_today:
        decide(D, comps, px, R, U)
    assemble(D, comps, px, R, U)
    write_json(INDEX_JSON, D)
    log.info("level %.2f on %s", D["level"], D["asof"])
    return D


def _migrate(D):
    """One-time: v1 holdings carry their v1 targets until the first v2 rebalance executes."""
    if "targets" not in D:
        D["targets"] = {h["ticker"]: {"target": h["target"], "tier": None, "wildcard": h.get("wildcard"), "scores": h.get("scores"),
                                      "composite": h.get("composite"), "why": h.get("why"), "rules": "1.0"} for h in D["holdings"]}
        D["targets_date"] = D.get("last_rebalance")
        D["rules_v1"] = D.get("rules")
        D["pending"] = None


# ---------- weekly (Friday): decide whether and how to rebalance
def decide(D, comps, px, R, U):
    asof = D["series"][-1][0]
    d = date.fromisoformat(asof)
    recs = []
    for u in U:
        pb = company.price_block(px, u["ticker"], rf=_rf(px), erp=R["erp"])
        recs.append(record(u["ticker"], u, comps, pb))
    held, watch = method.targets(recs, R)
    cur = D.get("_weights") or {h["ticker"]: h["weight"] for h in D["holdings"]}
    prev_t = {k: v["target"] for k, v in (D.get("targets") or {}).items()}
    first_v2 = not any(str(r.get("rules", "1")) >= "2" for r in D["rebalances"]) and not (D.get("pending") or {}).get("rules", "").startswith("2")
    monthly = d.weekday() == 4 and d.day <= 7
    new = {h["ticker"]: h["target"] for h in held}
    drops = [t for t in cur if cur[t] > 0 and t not in new]
    drift = max([abs(cur.get(t, 0) - prev_t.get(t, 0)) for t in set(cur) | set(prev_t)] or [0])
    trigger = ("v2 launch" if first_v2 else "monthly reconstitution" if monthly else "event exit" if drops
               else "drift" if drift > R["rebalance"]["drift_band"] else None)
    if trigger in ("event exit", "drift"):   # between monthly resets, nobody new comes in
        keep = [h for h in held if h["ticker"] in cur]
        s = sum(h["target"] for h in keep) or 1
        for h in keep:
            h["target"] = h["target"] / s
            h["why"]["final"] = h["target"]
        held = keep
        new = {h["ticker"]: h["target"] for h in held}
    mac = regime(px)
    names = {u["ticker"]: u for u in _all_universe()}
    rec = {"date": asof, "rules": R["version"], "trigger": trigger or "no change", "vix": mac.get("vix"), "regime": mac.get("regime"),
           "drift": round(drift, 4), "adds": sorted(t for t in new if cur.get(t, 0) == 0), "drops": sorted(drops),
           "targets": [{"ticker": h["ticker"], "tier": h["tier"], "target": round(h["target"], 4), "from": round(cur.get(h["ticker"], 0), 4),
                        "conviction": round(h["scores"]["conviction"], 1)} for h in held] if trigger else [],
           "exits": [{"ticker": w["ticker"], "rule": w["rule"], "detail": w["detail"]} for w in watch if w["ticker"] in drops]}
    rec["summary"] = _summary(rec, names)
    if trigger:
        window_end = (d + timedelta(days=7)).isoformat()
        meta = {h["ticker"]: {"target": h["target"], "tier": h["tier"], "sleeve": h["sleeve"], "wildcard": h["wildcard"], "scores": h["scores"],
                              "composite": h["scores"]["conviction"], "why": h["why"], "rules": R["version"]} for h in held}
        D["pending"] = {"decided": asof, "window_end": window_end, "type": trigger, "rules": R["version"], "targets": new, "signal": None,
                        "meta": meta, "exits": rec["exits"], "summary": rec["summary"]}
    D["watch_all"] = watch
    D["selection_asof"] = asof
    D["macro"] = mac
    log_ = read_json(DECISIONS_JSON, [])
    log_ = [x for x in log_ if x["date"] != asof] + [rec]
    write_json(DECISIONS_JSON, log_, indent=1)
    log.info("decision %s: %s", asof, rec["summary"])
    return rec


def _summary(rec, names):
    n = lambda t: names.get(t, {}).get("name", t)
    if rec["trigger"] == "no change":
        return f"No trades. Weights are within {rec['drift'] * 100:.1f} pts of target and nothing failed a rule."
    parts = [{"v2 launch": "Switch to the v2 rules", "monthly reconstitution": "Monthly reset", "event exit": "A holding broke a rule",
              "drift": "Weights drifted past 5 pts"}[rec["trigger"]] + "."]
    if rec["adds"]:
        parts.append("In: " + ", ".join(n(t) for t in rec["adds"]) + ".")
    if rec["drops"]:
        parts.append("Out: " + ", ".join(n(t) for t in rec["drops"]) + ".")
    parts.append("Trades on the first calm day (VIX under 30, no spike) in the next week, one close after the signal.")
    return " ".join(parts)


# ---------- the page data
def assemble(D, comps, px, R, U):
    names = {u["ticker"]: u for u in _all_universe()}
    prof = _profiles()
    rf = _rf(px)
    w = D.pop("_weights", None) or {h["ticker"]: h["weight"] for h in D["holdings"]}
    T = D.get("targets") or {}
    tdate = D.get("targets_date") or D.get("last_rebalance")
    hourly_needed = [t for t, x in w.items() if x > 1e-6]
    hold = []
    for t in sorted(hourly_needed, key=lambda k: -w[k]):
        u = names.get(t, {})
        p = prof.get(t, {})
        pb = company.price_block(px, t, rf=rf, erp=R["erp"])
        rec = record(t, u, comps, pb)
        meta = T.get(t, {})
        h = {"ticker": t, "name": p.get("name") or u.get("name", t), "ceo": u.get("ceo") or p.get("ceo", ""), "role": u.get("role") or p.get("role", ""),
             "founder": str(u.get("founder")).lower() == "true", "ceo_since": int(u["ceo_since"]) if (u.get("ceo_since") or "").isdigit() else None,
             "sector": u.get("sector") or p.get("sector"), "leader": p.get("leader"), "reit": rec["reit"],
             "wildcard": bool(meta.get("wildcard")), "tier": meta.get("tier"), "target": meta.get("target", w[t]), "target_date": tdate,
             "why": meta.get("why"), "scores": meta.get("scores") or {}, "composite": meta.get("composite") or 0, "rules": meta.get("rules"),
             "metrics": rec["metrics"], "analysis": rec["analysis"], "weight": w[t],
             "heritage_source": u.get("heritage_source_url") or None}
        if pb:
            h.update({k: pb[k] for k in ["price", "day_change", "ret_ytd", "ret_1y", "momentum_12_1", "tech", "capm"]})
        h["candles_4h"] = company.candles_4h(market.hourly(t))
        h["signals"], h["signal"] = company.signals(h)
        h["thesis"] = p.get("thesis") or _auto_thesis(h)
        h["links"] = {"sec": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={t}&type=10-K&dateb=&owner=include&count=40",
                      "ir": p.get("ir") or rec["metrics"].get("website") or f"https://finance.yahoo.com/quote/{t}",
                      "financials": f"https://finance.yahoo.com/quote/{t}/financials", "analysts": f"https://finance.yahoo.com/quote/{t}/analysis"}
        hold.append(h)
    D["holdings"] = hold
    D["cash"] = max(0.0, 1 - sum(h["weight"] for h in hold))
    # watch list: everyone tracked but not held
    held_set = {h["ticker"] for h in hold}
    pend = D.get("pending") or {}
    joining = set(pend.get("targets", {})) - held_set
    leaving = {e["ticker"]: e for e in pend.get("exits", [])}
    for h in hold:
        if h["ticker"] in leaving:
            h["leaving"] = leaving[h["ticker"]]
    watch = [dict(x) for x in (D.get("watch_all") or D.get("bench") or []) if x["ticker"] not in held_set and x["ticker"] not in joining]
    for t in sorted(joining):
        m = pend["meta"][t]
        watch.insert(0, {"ticker": t, "rule": "Joining", "detail": f"Enters at the next trade as {m['tier']}, target {m['target'] * 100:.1f}%."})
    seen = {x["ticker"] for x in watch} | held_set
    for u in _all_universe():
        if u["ticker"] in seen or u.get("status") == "former":
            continue
        if u.get("status") == "foreign":
            watch.append({"ticker": u["ticker"], "rule": "Not US-listed", "detail": u.get("note", "")})
        elif u.get("status", "active") == "active":
            watch.append({"ticker": u["ticker"], "rule": "Pending review", "detail": "Joins the screen at the next weekly check."})
    for x in watch:
        u = names.get(x["ticker"], {})
        x.update({"name": u.get("name", x.get("name", x["ticker"])), "ceo": u.get("ceo", x.get("ceo", "")), "role": u.get("role", x.get("role", ""))})
    D["bench"] = [x for x in watch if names.get(x["ticker"], {}).get("status") != "former"]
    # level and performance
    s = D["series"]
    D["asof"] = s[-1][0]
    D["level"] = s[-1][1]
    D["day_change"] = s[-1][1] / s[-2][1] - 1
    D["stats"] = series.stats(s, px["Close"].get("^IRX"))
    D["trailing"] = series.trailing(s)
    D["years"] = series.years(s)
    D["growth_10k"] = {"prsn": round(10000 * s[-1][1] / s[0][1], 1), "bench": round(10000 * s[-1][2] / s[0][2], 1)}
    D["live"] = {"intraday": False, "time_et": now_et().strftime("%-I:%M %p ET")}
    D["last_rebalance"] = D["rebalances"][-1]["date"] if D["rebalances"] else None
    D["next_rebalance"] = _next_friday(date.fromisoformat(D["asof"])).isoformat()
    D["universe_size"] = len(U)
    D["fundamentals_asof"] = max((c.get("fetched", "") for c in comps.values()), default=D.get("fundamentals_asof"))
    D["chars"] = _chars(hold)
    D["research"] = _research(hold)
    D["generated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    D["sources"] = {"prices": "Yahoo Finance (about 15 min delayed in market hours)", "fundamentals": "Yahoo Finance, from company filings",
                    "filings": "SEC EDGAR", "risk_free": "13-week US T-bill (^IRX)"}
    D["rules"] = {**R, "factor_labels": FACTOR_LABELS}
    D["index"]["rules_version"] = R["version"]
    D["index"]["v2_date"] = R["effective"]
    if "macro" not in D:
        D["macro"] = regime(px)
    # private honorable mentions: growth vs PRSN and the S&P over the same span
    priv = read_json(CONFIG / "private.json", [])
    by_date = {r[0]: r for r in s}
    for p in priv:
        r0 = by_date.get(p["since"]) or s[0]
        p["prsn_mult"], p["bench_mult"] = s[-1][1] / r0[1], s[-1][2] / r0[2]
    D["private"] = priv
    # directory, decisions, live account
    D["directory"] = [{**r, "in_index": r["ticker"] in held_set} for r in read_csv(DATA / "directory" / "leaders.csv")]
    D["decisions"] = list(reversed(read_json(DECISIONS_JSON, [])))[:26]
    acct = read_json(ACCOUNT_JSON)
    D["account"] = acct
    return D


def _auto_thesis(h):
    m, sc = h.get("metrics") or {}, h.get("scores") or {}
    lead = f"{h['ceo']} {'founded' if h['founder'] else 'leads'} {h['name']}"
    bits = []
    if m.get("rev_growth") is not None:
        bits.append(f"revenue {'up' if m['rev_growth'] >= 0 else 'down'} {abs(m['rev_growth']) * 100:.0f}% on the year")
    if m.get("op_margin") is not None:
        bits.append(f"a {m['op_margin'] * 100:.0f}% operating margin")
    if (m.get("fwd_pe") or 0) > 0:
        bits.append(f"{m['fwd_pe']:.0f}× next year's earnings")
    s = lead + (": " + ", ".join(bits) if bits else "") + "."
    if sc.get("quality") is not None and "catalyst" in sc:
        s += f" Scores {sc['quality']:.0f} on quality, {sc['catalyst']:.0f} on catalysts and {sc['rerate']:.0f} on rerating room, out of 100."
    return s


def _wavg(hold, f):
    xs = [(h["weight"], f(h)) for h in hold if f(h) is not None]
    tw = sum(w for w, _ in xs)
    return sum(w * v for w, v in xs) / tw if tw else None


def _chars(hold):
    g = lambda k: (lambda h: (h.get("metrics") or {}).get(k))
    return {"fwd_pe": _wavg(hold, lambda h: g("fwd_pe")(h) if (g("fwd_pe")(h) or 0) > 0 else None),
            "ev_ebitda": _wavg(hold, lambda h: g("ev_ebitda")(h) if (g("ev_ebitda")(h) or 0) > 0 else None),
            "fcf_yield": _wavg(hold, g("fcf_yield")), "op_margin": _wavg(hold, g("op_margin")), "rev_growth": _wavg(hold, g("rev_growth")),
            "roe": _wavg(hold, g("roe")), "net_debt_ebitda": _wavg(hold, g("net_debt_ebitda")), "mcap_b": _wavg(hold, g("mcap_b")),
            "upside": _wavg(hold, g("upside")),
            "pct_above_sma200": sum(h["weight"] for h in hold if (h.get("tech") or {}).get("trend") == "above")}


def _research(hold):
    core = [h for h in hold if not h.get("wildcard")]
    A = lambda h: h.get("analysis") or {}
    sp = sorted(A(h)["spread"] for h in core if A(h).get("spread") is not None)
    eg = sorted(A(h)["eps_growth"] for h in core if A(h).get("eps_growth") is not None)
    q = sum(A(h).get("quarters") or 0 for h in core)
    return {"core": len(core), "clear_hurdle": sum(1 for x in sp if x > 0), "median_spread": sp[len(sp) // 2] if sp else None,
            "wacc": _wavg(core, lambda h: A(h).get("wacc")), "roic": _wavg(core, lambda h: A(h).get("roic")),
            "eps_growth_median": eg[len(eg) // 2] if eg else None, "buyback_yield": _wavg(core, lambda h: A(h).get("buyback_yield")),
            "net_insider_buyers": sum(1 for h in core if (A(h).get("insider_net_pct") or 0) > 0),
            "beat_rate": sum(A(h).get("beats") or 0 for h in core) / q if q else None,
            "filings": sum(1 for h in core if A(h).get("filings"))}


# ---------- intraday: live level from 15-min-delayed prices, without touching the daily record
def intraday():
    t = now_et()
    if t.weekday() >= 5 or not (9 * 60 + 30 <= t.hour * 60 + t.minute <= 16 * 60 + 15):
        log.info("market closed (%s); nothing to do", t.strftime("%a %H:%M ET"))
        return None
    D = read_json(INDEX_JSON)
    w = {h["ticker"]: h["weight"] for h in D["holdings"]}
    last = market.intraday_last(list(w) + [market.BENCH])
    if not last:
        return D
    R_p = sum(w[t] * (last[t] / h["tech"]["ohlc"]["c"] - 1) for h in D["holdings"] for t in [h["ticker"]] if t in last and h.get("tech"))
    D["level"] = round(D["series"][-1][1] * (1 + R_p), 2)
    D["day_change"] = R_p
    for h in D["holdings"]:
        if h["ticker"] in last and h.get("tech"):
            h["day_change"] = last[h["ticker"]] / h["tech"]["ohlc"]["c"] - 1
            h["price"] = last[h["ticker"]]
    D["live"] = {"intraday": True, "time_et": now_et().strftime("%-I:%M %p ET")}
    write_json(INDEX_JSON, D)
    return D
