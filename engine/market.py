"""Everything that talks to the outside world: Yahoo Finance (via yfinance) and SEC EDGAR."""
import os
import tempfile
import time

import pandas as pd
import requests
import yfinance as yf

from .common import log

yf.set_tz_cache_location(os.path.join(tempfile.gettempdir(), "prsn-yf-cache"))   # private cache avoids sqlite lock errors

BENCH = "SPY"          # S&P 500 with dividends reinvested (adjusted close)
MACRO = ["^VIX", "^IRX", "^TNX", "DX-Y.NYB", "^GSPC"]


def _retry(fn, tries=3, wait=2.0, what=""):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:  # yfinance raises many types; retry them all
            if i == tries - 1:
                log.warning("giving up on %s: %s", what, e)
                return None
            time.sleep(wait * (i + 1))


def daily(tickers, start="2020-06-01"):
    """Daily OHLCV, both raw and dividend-adjusted closes. Returns dict of DataFrames keyed by field."""
    tickers = sorted(set(tickers))
    frames = {}
    for t in tickers:   # one at a time: slower, but a bad ticker can't sink the batch
        df = _retry(lambda: yf.download(t, start=start, auto_adjust=False, progress=False, threads=False, multi_level_index=False), what=f"prices {t}")
        if df is None or df.empty:
            log.warning("no prices for %s", t)
            continue
        frames[t] = df
    out = {}
    for field in ["Open", "High", "Low", "Close", "Adj Close", "Volume"]:
        out[field] = pd.DataFrame({t: f[field] for t, f in frames.items() if field in f}).sort_index()
    return out


def hourly(ticker):
    df = _retry(lambda: yf.download(ticker, period="60d", interval="1h", auto_adjust=False, progress=False, threads=False, multi_level_index=False), what=f"hourly {ticker}")
    return None if df is None or df.empty else df


def intraday_last(tickers):
    """Latest 1-minute-ish prices during the session (15-min delayed), for the live level."""
    out = {}
    for t in sorted(set(tickers)):
        df = _retry(lambda: yf.download(t, period="1d", interval="5m", auto_adjust=False, progress=False, threads=False, multi_level_index=False), what=f"intraday {t}")
        if df is not None and not df.empty:
            out[t] = float(df["Close"].dropna().iloc[-1])
    return out


def fundamentals(ticker):
    """Raw fundamentals for one company. Every piece is optional; missing pieces come back as None."""
    tk = yf.Ticker(ticker)
    f = {"info": _retry(lambda: tk.info, what=f"info {ticker}") or {}}
    for name, attr in [("income", "income_stmt"), ("balance", "balance_sheet"), ("cashflow", "cashflow"),
                       ("q_income", "quarterly_income_stmt"), ("earnings", "earnings_history"),
                       ("insider", "insider_purchases")]:
        f[name] = _retry(lambda a=attr: getattr(tk, a), what=f"{attr} {ticker}")
    return f


# ---------- SEC EDGAR. SEC requires a contact email in the User-Agent; set SEC_CONTACT (e.g. a repo secret).
_SEC_UA = None


def sec_enabled():
    return bool(os.environ.get("SEC_CONTACT"))


def _sec_get(url):
    global _SEC_UA
    if not sec_enabled():
        return None
    _SEC_UA = _SEC_UA or f"PRSN Index research {os.environ['SEC_CONTACT']}"
    time.sleep(0.15)   # SEC asks for at most 10 requests a second
    r = _retry(lambda: requests.get(url, headers={"User-Agent": _SEC_UA, "Accept-Encoding": "gzip, deflate"}, timeout=30), what=url)
    if r is None or r.status_code != 200:
        log.warning("SEC %s -> %s", url, None if r is None else r.status_code)
        return None
    return r.json()


_CIKS = None


def cik(ticker):
    global _CIKS
    if _CIKS is None:
        j = _sec_get("https://www.sec.gov/files/company_tickers.json") or {}
        _CIKS = {v["ticker"].upper(): int(v["cik_str"]) for v in j.values()}
    return _CIKS.get(ticker.upper().replace(".", "-"))


def submissions(ticker):
    c = cik(ticker)
    if not c:
        return None
    j = _sec_get(f"https://data.sec.gov/submissions/CIK{c:010d}.json")
    if not j:
        return None
    rec = j.get("filings", {}).get("recent", {})
    keys = ["accessionNumber", "filingDate", "form", "primaryDocument", "items"]
    rows = [dict(zip(keys, vals)) for vals in zip(*[rec.get(k, []) for k in keys])]
    for r in rows:
        r["url"] = f"https://www.sec.gov/Archives/edgar/data/{c}/{r['accessionNumber'].replace('-', '')}/{r['primaryDocument']}"
    return {"cik": c, "name": j.get("name"), "filings": rows}


def latest_filings(ticker):
    """Most recent annual, quarterly and proxy filing, in the shape the site expects."""
    s = submissions(ticker)
    if not s:
        return None
    want = {"annual": ("10-K", "20-F", "40-F"), "quarterly": ("10-Q", "6-K"), "proxy": ("DEF 14A",)}
    out = {}
    for k, forms in want.items():
        for r in s["filings"]:   # newest first
            if r["form"] in forms:
                out[k] = {"form": r["form"], "date": r["filingDate"], "url": r["url"]}
                break
    return out
