"""PRSN engine.

  python -m engine daily        after the close: extend the index, execute a pending rebalance if its day has come
  python -m engine weekly       Friday after the close: refresh fundamentals, then daily + the weekly decision
  python -m engine intraday     during market hours: live level from delayed prices (doesn't touch the record)
  python -m engine monitor      SEC check: leadership-change filings (8-K Item 5.02) at universe companies
  python -m engine account      local: turn portfolio/trades.csv into data/account.json (percentages only)
  python -m engine orders --value 25000     local: share orders to match the latest targets
  python -m engine discover     local: surname-based leads from SEC insider filings -> research/leads.csv (never published)
"""
import argparse
import sys

from .common import setup_logging


def main():
    ap = argparse.ArgumentParser(prog="python -m engine", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["daily", "weekly", "intraday", "monitor", "account", "orders", "discover", "refresh"])
    ap.add_argument("--value", type=float, help="account value in dollars, for orders")
    a = ap.parse_args()
    setup_logging()
    if a.cmd == "daily":
        from .build import daily
        daily()
    elif a.cmd == "weekly":
        from .build import daily, refresh
        refresh()
        daily(decide_today=True)
    elif a.cmd == "refresh":
        from .build import refresh
        refresh()
    elif a.cmd == "intraday":
        from .build import intraday
        intraday()
    elif a.cmd == "monitor":
        from .monitor import run
        sys.exit(0 if run() is not None else 1)
    elif a.cmd == "account":
        from .portfolio import account
        account()
    elif a.cmd == "orders":
        from .portfolio import orders
        orders(a.value)
    elif a.cmd == "discover":
        from .discover import run
        run()


if __name__ == "__main__":
    main()
