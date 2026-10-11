"""Paths, file I/O and small helpers shared by every engine step."""
import csv
import json
import logging
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "engine" / "config"
DATA = ROOT / "data"
INDEX_JSON = DATA / "index.json"
COMPANIES_JSON = DATA / "companies.json"      # fundamentals cache, refreshed weekly
DECISIONS_JSON = DATA / "decisions.json"      # every weekly run, public log
ALERTS_JSON = DATA / "alerts.json"            # SEC filings that need a human look
ACCOUNT_JSON = DATA / "account.json"          # live account, percentages only
PORTFOLIO = ROOT / "portfolio"                # private (gitignored): trades, orders
RESEARCH = ROOT / "research"                  # private (gitignored): leads, notes
ET = ZoneInfo("America/New_York")

log = logging.getLogger("prsn")


def setup_logging():
    logging.basicConfig(level=os.environ.get("PRSN_LOG", "INFO"), format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")


def now_et():
    return datetime.now(timezone.utc).astimezone(ET)


def read_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def clean(x):
    """Make a value JSON-safe: NaN/inf become null, numpy scalars become Python numbers."""
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    if hasattr(x, "item") and not isinstance(x, (str, bytes)):
        try:
            x = x.item()
        except (ValueError, AttributeError):
            pass
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    return x


def write_json(path, obj, indent=None):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w") as f:
        json.dump(clean(obj), f, indent=indent, separators=None if indent else (",", ":"), ensure_ascii=False)
    tmp.replace(path)


def read_yaml(path):
    with open(path) as f:
        return yaml.safe_load(f)


def read_csv(path):
    if not Path(path).exists():
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def rules():
    return read_yaml(CONFIG / "rules.yaml")


def universe():
    """Every public company in scope: heritage verified with a public source (see data/directory/README.md)."""
    rows = read_csv(CONFIG / "universe.csv")
    return [r for r in rows if r.get("status", "active") == "active"]


def fnum(x):
    """float or None, tolerant of blanks and bad values."""
    try:
        v = float(x)
        return None if math.isnan(v) or math.isinf(v) else v
    except (TypeError, ValueError):
        return None
