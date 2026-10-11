"""Per-company numbers. Fundamentals refresh weekly (slow, many calls); price-based numbers refresh every run."""
import math

import numpy as np
import pandas as pd

from .common import fnum


def _row(df, names, col=0):
    if df is None or getattr(df, "empty", True):
        return None
    for n in names:
        if n in df.index:
            try:
                return fnum(df.loc[n].iloc[col])
            except (IndexError, KeyError):
                return None
    return None


def _div(a, b):
    return None if a is None or b in (None, 0) else a / b


def _clip(x, lo, hi):
    return None if x is None else max(lo, min(hi, x))


# ---------- weekly: fundamentals -> metrics + analysis
def fundamental_block(f, rf, erp, beta=None, prev=None):
    prev = prev or {}
    i = f.get("info") or {}
    inc, bal, cf = f.get("income"), f.get("balance"), f.get("cashflow")
    price = fnum(i.get("currentPrice") or i.get("regularMarketPrice"))
    mcap = fnum(i.get("marketCap"))
    debt = fnum(i.get("totalDebt")) or _row(bal, ["Total Debt"]) or 0.0
    cash = fnum(i.get("totalCash")) or _row(bal, ["Cash Cash Equivalents And Short Term Investments", "Cash And Cash Equivalents"]) or 0.0
    ev = fnum(i.get("enterpriseValue"))
    ebitda = fnum(i.get("ebitda")) or _row(inc, ["EBITDA", "Normalized EBITDA"])
    revenue = fnum(i.get("totalRevenue")) or _row(inc, ["Total Revenue"])
    fcf = _row(cf, ["Free Cash Flow"]) or fnum(i.get("freeCashflow"))
    tgt = fnum(i.get("targetMeanPrice"))
    m = {
        "mcap_b": _div(mcap, 1e9), "ev_b": _div(ev, 1e9), "net_debt_b": (debt - cash) / 1e9, "revenue_b": _div(revenue, 1e9),
        "fwd_pe": fnum(i.get("forwardPE")), "ttm_pe": fnum(i.get("trailingPE")), "ev_ebitda": fnum(i.get("enterpriseToEbitda")),
        "fcf_yield": _div(fcf, mcap), "fcf_margin": _div(fcf, revenue),
        "gross_margin": fnum(i.get("grossMargins")), "op_margin": fnum(i.get("operatingMargins")), "net_margin": fnum(i.get("profitMargins")),
        "rev_growth": fnum(i.get("revenueGrowth")), "roe": fnum(i.get("returnOnEquity")),
        "net_debt_ebitda": _div(debt - cash, ebitda) if ebitda and ebitda > 0 else None,
        "insider": fnum(i.get("heldPercentInsiders")), "dividend_yield": fnum(i.get("trailingAnnualDividendYield")) or 0.0,
        "target_mean": tgt, "target_high": fnum(i.get("targetHighPrice")), "target_low": fnum(i.get("targetLowPrice")),
        "analysts": int(i.get("numberOfAnalystOpinions") or 0), "rating": (i.get("recommendationKey") or "none").replace("none", "") or None,
        "upside": _div(tgt, price) - 1 if tgt and price else None, "price": price,
        "fwd_eps": fnum(i.get("forwardEps")), "ttm_eps": fnum(i.get("trailingEps")),
        "shares": fnum(i.get("sharesOutstanding")), "mcap_price": price,   # to roll market cap forward with the price between refreshes
        "website": i.get("website"), "long_name": i.get("longName") or i.get("shortName"),
    }
    # Cost of capital vs return on capital
    pretax, tax = _row(inc, ["Pretax Income"]), _row(inc, ["Tax Provision"])
    t = _clip(_div(tax, pretax), 0.0, 0.35) if pretax and pretax > 0 else 0.21
    t = 0.21 if t is None else t
    b = _clip(beta if beta is not None else fnum(i.get("beta")), 0.4, 2.5) or 1.0
    ke = rf + b * erp
    interest = abs(_row(inc, ["Interest Expense", "Interest Expense Non Operating"]) or 0.0)
    kd = _clip(_div(interest, debt), 0.02, 0.15) if debt else None
    kd = kd if kd is not None else rf + 0.02
    dw = _div(debt, debt + mcap) if mcap else 0.0
    wacc = (1 - dw) * ke + dw * kd * (1 - t)
    ebit = _row(inc, ["EBIT", "Operating Income"])
    equity = _row(bal, ["Stockholders Equity", "Common Stock Equity"])
    ic = (debt + (equity or 0) - cash) if equity is not None else None
    roic = _div(ebit * (1 - t), ic) if ebit is not None and ic and ic > 0 else None
    sh0, sh1 = _row(bal, ["Ordinary Shares Number", "Share Issued"], 0), _row(bal, ["Ordinary Shares Number", "Share Issued"], 1)
    buyback = _row(cf, ["Repurchase Of Capital Stock", "Common Stock Payments"])
    a = {
        "beta_5y": b, "cost_equity": ke, "cost_debt_after_tax": kd * (1 - t), "tax_rate": t, "debt_weight": dw, "wacc": wacc,
        "roic": roic, "spread": None if roic is None else roic - wacc,
        "eps": m["ttm_eps"], "eps_growth": fnum(i.get("earningsGrowth")), "rev_growth": m["rev_growth"],
        "fwd_eps_growth": _div(m["fwd_eps"], m["ttm_eps"]) - 1 if m["fwd_eps"] and m["ttm_eps"] and m["ttm_eps"] > 0 else None,
        "share_change": _div(sh0, sh1) - 1 if sh0 and sh1 else None,
        "buyback_yield": _div(-buyback, mcap) if buyback and buyback < 0 and mcap else 0.0,
        "fiscal_year": str(inc.columns[0])[:10] if inc is not None and not inc.empty else prev.get("fiscal_year"),
    }
    ins = f.get("insider")
    if ins is not None and not getattr(ins, "empty", True):
        lab = ins.iloc[:, 0].astype(str)
        get = lambda s, c: fnum(ins.loc[lab == s, c].iloc[0]) if (lab == s).any() else None
        a["insider_net_pct"] = get("% Net Shares Purchased (Sold)", "Shares")
        a["insider_buys"] = int(get("Purchases", "Trans") or 0)
        a["insider_sells"] = int(get("Sales", "Trans") or 0)
    eh = f.get("earnings")
    if eh is not None and not getattr(eh, "empty", True) and "epsActual" in eh:
        eh = eh.dropna(subset=["epsActual", "epsEstimate"]).tail(4)
        a["beats"] = int((eh["epsActual"] > eh["epsEstimate"]).sum())
        a["quarters"] = int(len(eh))
        a["avg_surprise"] = fnum(eh["surprisePercent"].mean()) if "surprisePercent" in eh else None
    for k in ["insider_net_pct", "insider_buys", "insider_sells", "beats", "quarters", "avg_surprise", "filings"]:
        a.setdefault(k, (prev.get("analysis") or {}).get(k))
    return m, a


# ---------- every run: prices -> tech, returns, risk
def price_block(px, t, bench="SPY", rf=0.04, erp=0.05):
    c, adj = px["Close"].get(t), px["Adj Close"].get(t)
    if c is None or c.dropna().empty:
        return None
    c, adj = c.dropna(), adj.dropna()
    o, h, l, v = (px[k][t].reindex(c.index) for k in ["Open", "High", "Low", "Volume"])
    s50, s200 = c.rolling(50).mean(), c.rolling(200).mean()
    last = c.index[-1]
    golden = bool(s50.iloc[-1] > s200.iloc[-1]) if not math.isnan(s200.iloc[-1]) else None
    cross = (s50 > s200).astype(int).diff().fillna(0)
    lc = cross[cross != 0]
    tail = c.index[-260:]
    candles = [[d.strftime("%Y-%m-%d"), *(round(float(x), 2) for x in (o[d], h[d], l[d], c[d])),
                None if math.isnan(s200[d]) else round(float(s200[d]), 2), None if math.isnan(s50[d]) else round(float(s50[d]), 2)] for d in tail]
    yr = adj[adj.index >= last - pd.Timedelta(days=365)]
    ytd = adj[adj.index.year == last.year]
    prev_year_close = adj[adj.index.year < last.year]
    ret_ytd = adj.iloc[-1] / (prev_year_close.iloc[-1] if len(prev_year_close) else ytd.iloc[0]) - 1
    b = px["Adj Close"][bench].dropna()
    r63 = adj.iloc[-1] / adj.iloc[-64] - 1 if len(adj) > 64 else None
    b63 = b.iloc[-1] / b.iloc[-64] - 1 if len(b) > 64 else None
    dollar = (c * v).tail(20).mean()
    out = {
        "price": float(c.iloc[-1]), "prev_close": float(c.iloc[-2]) if len(c) > 1 else None,
        "day_change": float(adj.iloc[-1] / adj.iloc[-2] - 1) if len(adj) > 1 else 0.0,
        "ret_ytd": float(ret_ytd), "ret_1y": float(yr.iloc[-1] / yr.iloc[0] - 1) if len(yr) > 200 else None,
        "momentum_12_1": float(adj.iloc[-22] / adj.iloc[-253] - 1) if len(adj) > 253 else None,
        "rel_3m": (1 + r63) / (1 + b63) - 1 if r63 is not None and b63 is not None else None,
        "adv_musd": float(dollar / 1e6) if not math.isnan(dollar) else None,
        "asof": last.strftime("%Y-%m-%d"),
        "tech": {
            "sma50": float(s50.iloc[-1]), "sma200": None if math.isnan(s200.iloc[-1]) else float(s200.iloc[-1]),
            "vs_sma200": None if math.isnan(s200.iloc[-1]) else float(c.iloc[-1] / s200.iloc[-1] - 1),
            "sma200_slope_1m": float(s200.iloc[-1] / s200.iloc[-22] - 1) if len(s200.dropna()) > 22 else None,
            "trend": None if math.isnan(s200.iloc[-1]) else ("above" if c.iloc[-1] > s200.iloc[-1] else "below"),
            "golden": golden, "last_cross": None if lc.empty else ("golden" if lc.iloc[-1] > 0 else "death"),
            "last_cross_date": None if lc.empty else lc.index[-1].strftime("%Y-%m-%d"),
            "hi52": float(h[h.index >= last - pd.Timedelta(days=365)].max()), "lo52": float(l[l.index >= last - pd.Timedelta(days=365)].min()),
            "ohlc": {"d": last.strftime("%Y-%m-%d"), "o": float(o.iloc[-1]), "h": float(h.iloc[-1]), "l": float(l.iloc[-1]), "c": float(c.iloc[-1])},
            "prev_close": float(c.iloc[-2]) if len(c) > 1 else None,
            "candles_1d": candles,
        },
        "capm": capm(adj, b, rf, erp),
    }
    out["tech"]["off_high"] = out["price"] / out["tech"]["hi52"] - 1 if out["tech"]["hi52"] else None
    return out


def capm(adj, b, rf, erp, years=3):
    """Monthly regression on the S&P 500 over up to 3 years."""
    df = pd.concat([adj, b], axis=1, keys=["s", "b"]).dropna()
    df = df[df.index >= df.index[-1] - pd.Timedelta(days=365 * years + 5)]
    m = df.resample("ME").last().pct_change().dropna()
    if len(m) < 12:
        return None
    x, y = m["b"].values - rf / 12, m["s"].values - rf / 12
    beta = float(np.cov(x, y, ddof=1)[0, 1] / np.var(x, ddof=1))
    alpha = float((y.mean() - beta * x.mean()) * 12)
    r = np.corrcoef(x, y)[0, 1]
    yrs = len(m) / 12
    return {"beta": beta, "expected": rf + beta * erp, "realized": float((df["s"].iloc[-1] / df["s"].iloc[0]) ** (1 / yrs) - 1),
            "alpha": alpha, "r2": float(r * r), "years": int(round(yrs))}


def candles_4h(hourly_df):
    """Two bars per US session (9:30-13:30 and 13:30-16:00 ET), last 120."""
    if hourly_df is None or hourly_df.empty:
        return []
    df = hourly_df.copy()
    idx = df.index.tz_convert("America/New_York") if df.index.tz is not None else df.index.tz_localize("UTC").tz_convert("America/New_York")
    df.index = idx
    df = df[(df.index.hour * 60 + df.index.minute >= 570) & (df.index.hour < 16)]
    half = np.where(df.index.hour * 60 + df.index.minute < 810, "09:30", "13:30")
    key = df.index.strftime("%Y-%m-%d") + " " + half
    g = df.groupby(key, sort=True)
    bars = pd.DataFrame({"o": g["Open"].first(), "h": g["High"].max(), "l": g["Low"].min(), "c": g["Close"].last()}).dropna()
    return [[k, *(round(float(x), 2) for x in r)] for k, r in bars.tail(120).iterrows()]


def signals(rec):
    """Plain up/down reads for the detail card; not used in weights."""
    tech, m = rec.get("tech") or {}, rec.get("metrics") or {}
    s = {
        "momentum": 0 if rec.get("momentum_12_1") is None else (1 if rec["momentum_12_1"] > 0.10 else -1 if rec["momentum_12_1"] < -0.10 else 0),
        "trend": 0 if tech.get("trend") is None else (1 if tech["trend"] == "above" else -1),
        "value": 0 if m.get("upside") is None else (1 if m["upside"] > 0.20 else -1 if m["upside"] < 0 else 0),
        "analysts": {"strong_buy": 1, "buy": 1, "sell": -1, "strong_sell": -1}.get(m.get("rating"), 0),
    }
    tot = sum(s.values())
    return s, ("Positive" if tot >= 2 else "Negative" if tot <= -2 else "Neutral")
