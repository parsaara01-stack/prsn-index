"""The index level: chained daily from holdings' total returns, plus every performance statistic the site shows."""
import numpy as np
import pandas as pd

from .common import log


def _vix_calm(vix, t, ex):
    """True when VIX closed under the cap and isn't spiking vs its prior 5-day average."""
    if vix is None or t not in vix.index:
        return True   # no VIX data: don't block the trade
    v = vix.loc[:t].dropna()
    if len(v) < 6:
        return True
    return v.iloc[-1] < ex["vix_max"] and v.iloc[-1] <= (1 + ex["vix_spike"]) * v.iloc[-6:-1].mean()


def chain(D, px, R, bench="SPY"):
    """Extend D['series'] through the latest close. Holdings' weights drift with prices; a pending
    rebalance executes per the VIX rule. Mutates D (series, holdings weights, pending, rebalances).
    Returns the list of executed rebalances."""
    adj = px["Adj Close"]
    b = adj[bench].dropna()
    vix = px["Close"].get("^VIX")
    irx = px["Close"].get("^IRX")
    last = D["series"][-1][0]
    days = [d for d in b.index if d.strftime("%Y-%m-%d") > last]
    if not days:
        return []
    lvl, blv = D["series"][-1][1], D["series"][-1][2]
    peak = max(r[1] for r in D["series"])
    w = {h["ticker"]: h["weight"] for h in D["holdings"]}
    prev = b.index[b.index.get_loc(days[0]) - 1]
    ex = R["rebalance"]["execution"]
    pend = D.get("pending")
    done = []
    for t in days:
        ds = t.strftime("%Y-%m-%d")
        rets = {}
        for k in w:
            s = adj[k] if k in adj else None
            p0 = s.get(prev) if s is not None else None
            p1 = s.get(t) if s is not None else None
            rets[k] = (p1 / p0 - 1) if p0 and p1 and not np.isnan(p0) and not np.isnan(p1) else 0.0
        cash = max(0.0, 1 - sum(w.values()))   # uninvested weight sits in T-bills
        rf_d = float(irx.loc[:t].dropna().iloc[-1]) / 100 / 252 if irx is not None and len(irx.loc[:t].dropna()) else 0.0
        rets["_cash"] = rf_d
        R_p = sum(w[k] * rets[k] for k in w) + cash * rf_d
        lvl *= 1 + R_p
        blv *= b[t] / b[prev]
        tot = sum(w[k] * (1 + rets[k]) for k in w) + cash * (1 + rf_d)
        w = {k: w[k] * (1 + rets[k]) / tot for k in w}
        if pend and ds > pend["decided"]:
            if not pend.get("signal") and (_vix_calm(vix, t, ex) or ds >= pend["window_end"]):
                pend["signal"] = ds
                log.info("rebalance signal on %s (VIX %s)", ds, None if vix is None or t not in vix.index else round(float(vix[t]), 2))
            elif pend.get("signal") and ds > pend["signal"]:   # trade one close after the signal: no hindsight
                new = pend["targets"]
                turnover = sum(abs(new.get(k, 0) - w.get(k, 0)) for k in set(new) | set(w)) / 2
                lvl *= 1 - turnover * R["cost_bps"] / 1e4
                w = dict(new)
                done.append({"date": ds, "type": pend["type"], "turnover": round(turnover, 4), "rules": R["version"], "decided": pend["decided"], "signal": pend["signal"]})
                log.info("rebalance executed %s, turnover %.1f%%", ds, turnover * 100)
                pend = None
        peak = max(peak, lvl)
        D["series"].append([ds, round(lvl, 2), round(blv, 2), round(lvl / peak - 1, 5)])
        prev = t
    D["pending"] = pend
    D["rebalances"].extend(done)
    D["_weights"] = w
    return done


def stats(series, rf_series=None):
    df = pd.DataFrame(series, columns=["d", "p", "b", "dd"]).set_index(pd.to_datetime([r[0] for r in series]))
    r = df[["p", "b"]].pct_change().dropna()
    n_years = (df.index[-1] - df.index[0]).days / 365.25
    ann = (df["p"].iloc[-1] / df["p"].iloc[0]) ** (1 / n_years) - 1
    ann_b = (df["b"].iloc[-1] / df["b"].iloc[0]) ** (1 / n_years) - 1
    rf = float(rf_series.reindex(df.index).ffill().mean() / 100) if rf_series is not None and len(rf_series) else 0.04
    vol, vol_b = r["p"].std() * np.sqrt(252), r["b"].std() * np.sqrt(252)
    down = r["p"][r["p"] < 0].std() * np.sqrt(252)
    beta = r.cov().loc["p", "b"] / r["b"].var()
    te = (r["p"] - r["b"]).std() * np.sqrt(252)
    m = df[["p", "b"]].resample("ME").last()
    m = pd.concat([df[["p", "b"]].iloc[:1], m]).pct_change().dropna()
    months = [[i.strftime("%Y-%m"), round(float(a), 5), round(float(c), 5)] for i, (a, c) in m.iterrows()]
    up, dn = m[m["b"] > 0], m[m["b"] < 0]

    def dd(col):
        s = df[col]
        run = s.cummax()
        d = s / run - 1
        trough = d.idxmin()
        peak = s.loc[:trough].idxmax()
        rec = s.loc[trough:][s.loc[trough:] >= s.loc[peak]]
        return {"depth": float(d.min()), "peak": peak.strftime("%Y-%m-%d"), "trough": trough.strftime("%Y-%m-%d"),
                "recovered": None if rec.empty else rec.index[0].strftime("%Y-%m-%d")}

    best = max(months, key=lambda x: x[1])
    worst = min(months, key=lambda x: x[1])
    return {
        "ann_return": ann, "ann_return_bench": ann_b, "vol": vol, "vol_bench": vol_b,
        # Sharpe and Sortino on the arithmetic mean of daily excess returns, the standard definition (and v1's)
        "sharpe": (r["p"].mean() * 252 - rf) / vol, "sharpe_bench": (r["b"].mean() * 252 - rf) / vol_b, "sortino": (r["p"].mean() * 252 - rf) / down,
        "max_dd": dd("p"), "max_dd_bench": dd("b"), "beta": beta, "alpha": ann - (rf + beta * (ann_b - rf)),
        "correlation": r.corr().loc["p", "b"], "tracking_error": te, "info_ratio": (ann - ann_b) / te,
        "up_capture": up["p"].mean() / up["b"].mean() if len(up) else None,
        "down_capture": dn["p"].mean() / dn["b"].mean() if len(dn) else None,
        "best_month": [best[0], best[1]], "worst_month": [worst[0], worst[1]],
        "pct_up_months": sum(1 for x in months if x[1] > 0) / len(months), "months": months,
        "expected_capm": rf + beta * (ann_b - rf), "rf": rf,
    }


def trailing(series):
    df = pd.DataFrame(series, columns=["d", "p", "b", "dd"])
    df.index = pd.to_datetime(df["d"])
    end = df.index[-1]

    def back(days=None, since=None, ann=False):
        s = df[df.index >= since] if since is not None else df.iloc[-days - 1:]
        if len(s) < 2:
            return None
        y = (s.index[-1] - s.index[0]).days / 365.25
        f = (lambda x: x ** (1 / y) - 1) if ann else (lambda x: x - 1)
        return {"prsn": f(s["p"].iloc[-1] / s["p"].iloc[0]), "bench": f(s["b"].iloc[-1] / s["b"].iloc[0]), "annualized": ann}

    prev_ye = df[df.index.year < end.year].index
    return {"1M": back(21), "3M": back(63), "6M": back(126), "YTD": back(since=prev_ye[-1] if len(prev_ye) else df.index[0]),
            "1Y": back(252), "3Y": back(756, ann=True), "Since base": back(since=df.index[0], ann=True)}


def years(series):
    df = pd.DataFrame(series, columns=["d", "p", "b", "dd"])
    df.index = pd.to_datetime(df["d"])
    out, prev = {}, df.iloc[0]
    for y, g in df.groupby(df.index.year):
        last = g.iloc[-1]
        if len(g) == 1 and g.index[0] == df.index[0]:   # the base date alone isn't a year
            continue
        out[str(y)] = {"prsn": last["p"] / prev["p"] - 1, "bench": last["b"] / prev["b"] - 1}
        prev = last
    out[str(df.index[-1].year)]["partial"] = True
    return out
