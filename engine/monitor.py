"""Weekly SEC check: leadership changes (8-K Item 5.02) at every tracked company.

A 5.02 filing means a CEO, chair or director arrived or left. Each new one becomes a GitHub issue so a human
re-checks that the company still qualifies. Nothing is changed automatically."""
import os
from datetime import date, timedelta

from . import market
from .common import ALERTS_JSON, log, read_json, universe, write_json


def run(days=10):
    if not market.sec_enabled():
        log.warning("SEC_CONTACT is not set; skipping the SEC check (SEC requires a contact email)")
        return []
    seen = read_json(ALERTS_JSON, [])
    known = {a["accession"] for a in seen}
    since = (date.today() - timedelta(days=days)).isoformat()
    new = []
    for u in universe():
        s = market.submissions(u["ticker"])
        if s is None:
            new.append({"accession": f"missing-{u['ticker']}-{date.today().isoformat()}", "ticker": u["ticker"], "date": date.today().isoformat(),
                        "kind": "not found", "detail": "Ticker not found in SEC's company list. Delisted, renamed or merged?", "url": ""})
            continue
        for f in s["filings"]:
            if f["filingDate"] < since:
                break
            if f["form"] in ("8-K", "8-K/A") and "5.02" in (f.get("items") or "") and f["accessionNumber"] not in known:
                new.append({"accession": f["accessionNumber"], "ticker": u["ticker"], "date": f["filingDate"], "kind": "8-K 5.02",
                            "detail": f"Leadership change filed by {s['name']}. Check that {u['ceo']} is still {u['role']}.", "url": f["url"]})
    new = [a for a in new if a["accession"] not in known]
    write_json(ALERTS_JSON, (seen + new)[-300:], indent=1)
    out = os.environ.get("ALERTS_OUT")
    if out:   # one markdown block per alert, for the workflow to open issues with
        with open(out, "w") as fh:
            for a in new:
                fh.write(f"{a['ticker']}|{a['kind']}: {a['ticker']} ({a['date']})|{a['detail']}\n\n{a['url']}\n\nIf the leader changed, update engine/config/universe.csv (status: former) and data/directory/leaders.csv.\n<<<END>>>\n")
    log.info("%d new SEC alerts", len(new))
    return new
