"""Repeatable lead search: every CEO and executive chair in SEC filings, flagged by surname for HUMAN review.

A surname is a lead, never a fact. Many Persian surnames are shared with Arab, Armenian, Azeri, Afghan and South Asian
families; many Iranian-heritage leaders have anglicized or married names. Nobody goes on the public list until a
public source (interview, bio, filing) documents their heritage. Output stays in research/ (gitignored) and is never published.

Sources (free, SEC):
  public:  Forms 3/4/5 insider data sets -> officers and their titles, joined to issuer tickers
  private: Form D data sets -> executive officers of companies raising money, with amounts sold"""
import csv
import io
import os
import re
import zipfile
from datetime import date

import pandas as pd
import requests

from . import market
from .common import RESEARCH, log, read_csv, CONFIG

# Distinctively Iranian surnames (a starting list; add to it as you verify people).
STRONG = set("""
khosrowshahi foroughi goodarzi moghadam mehrabian akradi mahdessian ghaffarian mohajer nejatian salehian kashani ghamsari biglari
talasaz zanganeh azamian sabzevari farokhzad heshmatpour doustdar ghodsi hasani dibachi rofougaran farjadrad larian amiri saghian
lotti nazarian moinian karmely khosravi kiani radfar partovi yazdani nozad mahdara omidyar kordestani kheradpir aalaei heidari nasiri
mashouf najafi tehrani esfahani shirazi tabrizi kermani yazdi rashti hamedani qazvini mashhadi kashi semnani zanjani ardabili
ahmadinejad khamenei pahlavi sadeghi rahimi karimi rezaei hosseini mousavi jafari ghasemi mohammadi akbari ebrahimi bagheri
asadi amini ansari arabi bahrami davoudi esmaeili farahani ghorbani hashemi heidarian jalali kazemi khalili kamali latifi
mahmoudi moradi najafi nouri rahmani rostami sadri salehi shahbazi soltani taheri vahidi yousefi zamani zarei
abbasian alavi asgari azizi bahadori behzadi dehghan dehghani emami farhadi fazeli ghaffari habibi hakimi jahangiri kashef
khatami lajevardi majidi mirzaei moshiri nasseri nikpour pakravan parsa rahbar sabet samii sarraf shafiei shakib sharifi
tavakoli vaziri yaghoubi zandi abtahi afshar afshari ahari alizadeh amirkhani ashrafi azadi bakhtiari behbahani daneshvar
eslami etemadi farzan ghanbari golshani hakim hedayati hekmat javaheri kamrani khorasani mahdavi mazandarani mirza montazeri
nabavi naraghi nikzad parvizi pourmand rafsanjani raissi sadeghian salimi sepehri shams tabatabai tavana yazdanpanah
""".split())
STRONG_SUFFIX = ("zadeh", "zade", "pour", "poor", "nejad", "nezhad", "nia", "far", "bakhsh", "khani", "abadi", "lou", "loo", "shahi", "dokht")
WEAK_SUFFIX = ("ian", "i")   # also Armenian, Arabic, Italian, South Asian: low weight


def score(surname):
    s = re.sub(r"[^a-z]", "", surname.lower())
    if not s:
        return 0, ""
    if s in STRONG:
        return 3, "surname on the list"
    for suf in STRONG_SUFFIX:
        if s.endswith(suf) and len(s) > len(suf) + 2:
            return 2, f"ends in -{suf}"
    for suf in WEAK_SUFFIX:
        if s.endswith(suf) and len(s) > len(suf) + 3:
            return 1, f"ends in -{suf} (weak)"
    return 0, ""


def _zip(url):
    if not market.sec_enabled():
        raise SystemExit("Set SEC_CONTACT (an email for SEC's User-Agent rule) first.")
    r = requests.get(url, headers={"User-Agent": f"PRSN Index research {os.environ['SEC_CONTACT']}"}, timeout=120)
    if r.status_code != 200:
        return None
    return zipfile.ZipFile(io.BytesIO(r.content))


def _quarters(n=2):
    t = pd.Timestamp.today()
    q = (t.month - 1) // 3 + 1
    y = t.year
    out = []
    for _ in range(n + 1):
        q -= 1
        if q == 0:
            q, y = 4, y - 1
        out.append(f"{y}q{q}")
    return out


def _tsv(z, name):
    with z.open(next(n for n in z.namelist() if n.upper().endswith(name.upper()))) as fh:
        return pd.read_csv(fh, sep="\t", dtype=str, on_bad_lines="skip")


def public_leads():
    known = {r["ticker"] for r in read_csv(CONFIG / "universe.csv")}
    listed = (market._sec_get("https://www.sec.gov/files/company_tickers_exchange.json") or {}).get("data", [])
    exch = {str(r[2]).upper(): r[3] for r in listed}   # ticker -> exchange
    rows = []
    for qtr in _quarters():
        z = _zip(f"https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/{qtr}_form345.zip")
        if z is None:
            continue
        sub, own = _tsv(z, "SUBMISSION.tsv"), _tsv(z, "REPORTINGOWNER.tsv")
        df = own.merge(sub[["ACCESSION_NUMBER", "ISSUERNAME", "ISSUERTRADINGSYMBOL"]], on="ACCESSION_NUMBER")
        df = df[df["RPTOWNER_TITLE"].fillna("").str.contains(r"CEO|Chief Executive|Executive Chair|Co-Chief", case=False, regex=True)]
        for _, r in df.drop_duplicates(["RPTOWNERNAME", "ISSUERTRADINGSYMBOL"]).iterrows():
            tk = str(r["ISSUERTRADINGSYMBOL"]).upper()
            if tk in known or exch.get(tk) not in ("NYSE", "Nasdaq", "NYSE American", "NYSE MKT"):
                continue
            sur = str(r["RPTOWNERNAME"]).split()[0] if r["RPTOWNERNAME"] else ""   # SEC lists 'Last First Middle'
            sc, why = score(sur)
            if sc:
                rows.append({"score": sc, "why": why, "ticker": tk, "exchange": exch.get(tk), "company": r["ISSUERNAME"],
                             "person": r["RPTOWNERNAME"], "title": r["RPTOWNER_TITLE"], "quarter": qtr})
        if rows:
            break
    return rows


def private_leads(min_raised=10_000_000):
    rows = []
    for qtr in _quarters():
        z = _zip(f"https://www.sec.gov/files/structureddata/data/form-d-data-sets/{qtr}_d.zip")
        if z is None:
            continue
        iss, rel, off = _tsv(z, "ISSUERS.tsv"), _tsv(z, "RELATEDPERSONS.tsv"), _tsv(z, "OFFERING.tsv")
        off["TOTALAMOUNTSOLD"] = pd.to_numeric(off["TOTALAMOUNTSOLD"], errors="coerce")
        off = off[(off["TOTALAMOUNTSOLD"] >= min_raised) & (off.get("ISPOOLEDFUNDTYPE", "false").astype(str).str.lower() != "true")]
        df = rel.merge(off[["ACCESSION_NUMBER", "TOTALAMOUNTSOLD", "INDUSTRYGROUPTYPE"]], on="ACCESSION_NUMBER")
        df = df.merge(iss[["ACCESSION_NUMBER", "ENTITYNAME", "CITY", "STATEORCOUNTRY"]].drop_duplicates("ACCESSION_NUMBER"), on="ACCESSION_NUMBER")
        df = df[df["RELATIONSHIP_1"].fillna("").str.contains("Executive", case=False)]
        for _, r in df.iterrows():
            sc, why = score(str(r.get("LASTNAME") or ""))
            if sc:
                rows.append({"score": sc, "why": why, "company": r["ENTITYNAME"], "person": f"{r.get('FIRSTNAME', '')} {r.get('LASTNAME', '')}".strip(),
                             "role": r.get("RELATIONSHIPCLARIFICATION") or "Executive officer", "raised_usd": int(r["TOTALAMOUNTSOLD"]),
                             "industry": r.get("INDUSTRYGROUPTYPE"), "location": f"{r.get('CITY', '')}, {r.get('STATEORCOUNTRY', '')}", "quarter": qtr})
        if rows:
            break
    return rows


def run():
    RESEARCH.mkdir(exist_ok=True)
    for name, fn in [("leads_public.csv", public_leads), ("leads_private.csv", private_leads)]:
        rows = sorted(fn(), key=lambda r: -r["score"])
        path = RESEARCH / name
        if rows:
            with open(path, "w", newline="") as fh:
                w = csv.DictWriter(fh, fieldnames=list(rows[0]))
                w.writeheader()
                w.writerows(rows)
        log.info("%d leads -> %s (private; verify each with a public source before adding anyone)", len(rows), path)
    print(f"\nLeads are in {RESEARCH}/ as of {date.today()}. Each needs a public source before it goes in the directory.")
