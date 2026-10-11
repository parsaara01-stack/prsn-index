"""Turn an approved nomination (a GitHub issue form) into directory and universe rows.

Runs in the 'nomination approved' workflow when the maintainer adds the `approved` label: the label is the human check."""
import csv
import json
import os
import re
import sys

from .common import CONFIG, DATA, read_csv

FIELDS = {"Name": "name", "Title": "title", "Company": "company", "Public or private": "type", "Ticker": "ticker", "Exchange": "exchange",
          "Website": "website", "Sector": "sector", "Headquarters": "hq", "Heritage source": "source", "Background": "background",
          "Founder": "founder", "Leader since": "since"}


def parse(body):
    """Issue forms render as '### Label' followed by the answer."""
    out = {}
    for label, answer in re.findall(r"^### (.+?)\s*\n+(.*?)(?=\n### |\Z)", body, flags=re.S | re.M):
        key = FIELDS.get(label.strip())
        if key:
            v = answer.strip()
            out[key] = "" if v in ("_No response_", "None") else v
    return out


def apply(body):
    f = parse(body)
    need = ["name", "title", "company", "type", "source", "background"]
    missing = [k for k in need if not f.get(k)]
    if missing:
        raise SystemExit(f"Missing fields: {', '.join(missing)}")
    if not re.match(r"https?://", f["source"]):
        raise SystemExit("The heritage source must be a link.")
    typ = "public" if f["type"].lower().startswith("public") else "private"
    tk = (f.get("ticker") or "").upper().strip()
    if typ == "public" and not tk:
        raise SystemExit("Public companies need a ticker.")
    d_path = DATA / "directory" / "leaders.csv"
    rows = read_csv(d_path)
    if any(r["name"].lower() == f["name"].lower() and r["company"].lower() == f["company"].lower() for r in rows):
        raise SystemExit("Already in the directory.")
    with open(d_path, "a", newline="") as fh:
        csv.writer(fh).writerow([typ, f["name"], f["title"], f["company"], tk, f.get("website", ""), f.get("sector", ""), f.get("hq", ""),
                                 f["background"].replace("\n", " ")[:400], f["source"], "confirmed"])
    if typ == "public":
        u_path = CONFIG / "universe.csv"
        if not any(r["ticker"] == tk for r in read_csv(u_path)):
            role = "Co-CEO" if "co-ceo" in f["title"].lower() else "Executive Chairman" if "executive chair" in f["title"].lower() else "CEO"
            with open(u_path, "a", newline="") as fh:
                csv.writer(fh).writerow([tk, f["company"], f["name"], role, str("yes" in (f.get("founder") or "").lower()).lower(),
                                         re.sub(r"\D", "", f.get("since", ""))[:4], f.get("sector", ""), "false", f.get("exchange") or "Nasdaq",
                                         f["source"], "confirmed", "active", "Added by nomination"])
    return {"type": typ, "name": f["name"], "company": f["company"], "ticker": tk}


if __name__ == "__main__":
    print(json.dumps(apply(os.environ.get("ISSUE_BODY") or sys.stdin.read())))
