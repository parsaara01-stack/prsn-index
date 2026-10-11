"""The real-money side, run on your own computer. Trades and dollar amounts stay in portfolio/ (gitignored);
only percentages are published.

portfolio/trades.csv columns: date,action,ticker,quantity,price,amount,note
  action = deposit | withdraw | buy | sell | dividend | fee
  deposit/withdraw/dividend/fee use `amount`; buy/sell use `quantity` and `price` (and `amount` for any commission)."""
import csv
import math
from datetime import date

import pandas as pd

from . import market
from .common import ACCOUNT_JSON, INDEX_JSON, PORTFOLIO, fnum, log, read_csv, read_json, write_json

TRADES = PORTFOLIO / "trades.csv"
HEADER = ["date", "action", "ticker", "quantity", "price", "amount", "note"]


def _trades():
    if not TRADES.exists():
        PORTFOLIO.mkdir(exist_ok=True)
        with open(TRADES, "w", newline="") as f:
            csv.writer(f).writerow(HEADER)
        log.info("created %s; log your deposits and fills there", TRADES)
    return sorted(read_csv(TRADES), key=lambda r: r["date"])


def _book(rows, upto=None):
    """Cash and share counts after every trade up to a date."""
    cash, pos, flow = 0.0, {}, 0.0
    for r in rows:
        if upto and r["date"] > upto:
            break
        a, amt = r["action"].lower(), fnum(r.get("amount")) or 0.0
        q, p = fnum(r.get("quantity")) or 0.0, fnum(r.get("price")) or 0.0
        if a == "deposit":
            cash += amt
            flow += amt
        elif a == "withdraw":
            cash -= amt
            flow -= amt
        elif a == "buy":
            cash -= q * p + amt
            pos[r["ticker"]] = pos.get(r["ticker"], 0) + q
        elif a == "sell":
            cash += q * p - amt
            pos[r["ticker"]] = pos.get(r["ticker"], 0) - q
        elif a == "dividend":
            cash += amt
        elif a == "fee":
            cash -= amt
    return cash, {k: v for k, v in pos.items() if abs(v) > 1e-9}, flow


def account():
    rows = _trades()
    if not rows:
        log.info("no trades yet")
        return None
    D = read_json(INDEX_JSON)
    tickers = sorted({r["ticker"] for r in rows if r.get("ticker")})
    start = rows[0]["date"]
    px = market.daily(tickers + [market.BENCH], start=start)["Close"]
    days = [d.strftime("%Y-%m-%d") for d in px.index if d.strftime("%Y-%m-%d") >= start]
    prsn = {r[0]: r[1] for r in D["series"]}
    out, acct, prev_v, prev_flow = [], 100.0, None, 0.0
    p0 = None
    for d in days:
        cash, pos, flow = _book(rows, d)
        v = cash + sum(q * float(px[t].loc[:d].dropna().iloc[-1]) for t, q in pos.items() if t in px)
        if prev_v:   # time-weighted: strip out deposits and withdrawals
            acct *= (v - (flow - prev_flow)) / prev_v
        prev_v, prev_flow = v, flow
        if d in prsn:
            p0 = p0 or prsn[d]
            out.append([d, round(acct, 3), round(prsn[d] / p0 * 100, 3)])
    cash, pos, _ = _book(rows)
    last = {t: float(px[t].dropna().iloc[-1]) for t in pos if t in px}
    total = cash + sum(q * last.get(t, 0) for t, q in pos.items())
    res = {"since": out[0][0] if out else start, "updated": date.today().isoformat(), "series": out,
           "positions": sorted([{"ticker": t, "weight": q * last.get(t, 0) / total} for t, q in pos.items()], key=lambda x: -x["weight"]),
           "cash_weight": cash / total if total else 1.0}
    write_json(ACCOUNT_JSON, res, indent=1)
    log.info("account: %+.2f%% vs PRSN %+.2f%% since %s (written to %s; dollar amounts not published)",
             out[-1][1] - 100 if out else 0, out[-1][2] - 100 if out else 0, res["since"], ACCOUNT_JSON.name)
    return res


def orders(value=None):
    """Orders that move your account to the latest published targets. You review and place them yourself."""
    D = read_json(INDEX_JSON)
    P = D.get("pending")
    targets = P["targets"] if P else {h["ticker"]: h["target"] for h in D["holdings"]}
    rows = _trades()
    cash, pos, _ = _book(rows)
    tickers = sorted(set(targets) | set(pos))
    px = market.daily(tickers, start=(pd.Timestamp.today() - pd.Timedelta(days=40)).strftime("%Y-%m-%d"))
    last = {t: float(px["Close"][t].dropna().iloc[-1]) for t in tickers if t in px["Close"]}
    adv = {t: float((px["Close"][t] * px["Volume"][t]).tail(20).mean()) for t in tickers if t in px["Close"]}
    held = cash + sum(q * last.get(t, 0) for t, q in pos.items())
    value = value or held
    if not value:
        raise SystemExit("No account value: pass --value 25000, or log a deposit in portfolio/trades.csv")
    lines = []
    for t in tickers:
        if t not in last:
            log.warning("no price for %s; skipped", t)
            continue
        want = value * targets.get(t, 0) / last[t]
        delta = want - pos.get(t, 0)
        dollars = delta * last[t]
        if abs(dollars) < max(5, value * 0.002):   # skip dust
            continue
        flag = "  ⚠ over 5% of daily volume, split it up" if abs(dollars) > 0.05 * adv.get(t, math.inf) else ""
        lines.append([t, "BUY" if delta > 0 else "SELL", round(abs(delta), 4), round(last[t], 2), round(abs(dollars), 2), flag])
    lines.sort(key=lambda x: (x[1] != "SELL", -x[4]))   # sells first, to free cash
    stamp = (P or {}).get("decided") or D["asof"]
    path = PORTFOLIO / f"orders-{stamp}.csv"
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "side", "shares", "last_price", "approx_dollars", "note"])
        w.writerows(lines)
    print(f"\nOrders to match the {'pending' if P else 'current'} PRSN targets for a ${value:,.0f} account (prices as of the last close):\n")
    for t, side, q, p, d, flag in lines:
        print(f"  {side:4} {q:>10.4f} {t:6} ~${d:>10,.2f}  @ ${p:,.2f}{flag}")
    if P:
        print(f"\nDecision of {P['decided']}: place these on the calm-day signal (shown on the site), by {P['window_end']}.")
    print(f"\nSaved to {path}. Use limit orders near the last price for small caps. Log each fill in {TRADES}.\n")
    return lines
