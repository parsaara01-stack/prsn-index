# PRSN: the Persian-led equity index

**Live:** https://parsaara01-stack.github.io/prsn-index/

A rules-based index of US-listed companies led by a CEO, co-CEO or executive chair of Persian or Iranian heritage, plus a public directory of those leaders, public and private. Heritage decides who can be considered. After that, only the published rules decide what's held and how much. Nobody picks stocks by hand.

Not a fund, and not investment advice. The author holds positions in these companies.

## How it runs

Everything runs on GitHub Actions on a schedule. Nobody has to press anything.

| When (US Eastern) | What happens |
|---|---|
| Every hour, 10am–4pm on weekdays | The live index level updates from 15-minute-delayed prices |
| Every weekday after the close | The index adds the day's close. If a rebalance is pending and its calm day has come, it trades |
| **Friday after the close** | Fundamentals refresh, the **weekly decision** runs, and SEC filings are checked for leadership changes |
| Whenever a nomination gets the `approved` label | The leader is added to the directory, and to the screen if the company is public |

Each run commits its data to `data/` and redeploys the site. The decision log on the site shows every Friday's outcome, including weeks with no trades.

## The rules (v2)

All of them are in one file, [`engine/config/rules.yaml`](engine/config/rules.yaml). Changing a rule means bumping the version and adding a changelog line; the site shows both.

1. **Select.** Every US-listed company (NYSE, Nasdaq, NYSE American) in [`engine/config/universe.csv`](engine/config/universe.csv) must clear every gate:
   - market cap of at least $50M
   - enough trading volume
   - a price of at least $1
   - no event exclusion in [`events.yaml`](engine/config/events.yaml)
   - not trailing the S&P 500 by 20+ points over 3 months (the "cut losers" stop)
2. **Score.** Three 0–100 ranks among the companies that passed:
   - **Quality:** return on capital vs its cost, margins, low debt
   - **Catalyst:** expected earnings growth, earnings beats, insider buying, buybacks, momentum
   - **Rerate:** forward P/E, free-cash-flow yield, analyst upside, P/E relative to growth

   Quality must rank in the top half, and the company must make an operating profit. Conviction = 40% quality + 30% catalyst + 30% rerate.
3. **Size.** Weight goes to the best ideas, by tier:

   | Tier | Who | Weight each |
   |---|---|---|
   | **Core** | Top 4 by conviction, with a catalyst score of 50+ | ~15%, max 20% |
   | **Build** | The next 6 | ~5%, max 8% |
   | **Toehold** | The rest | ~2%, max 3% |

   - **Small caps** (under $500M) are capped at 2% each and 15% in total.
   - **Wildcard:** one fast grower that misses the quality cut gets 3%, picked for its catalysts.
   - Anything left over sits in **T-bills**.
4. **Trade.**
   - The rules are checked every Friday. New names enter only at the monthly reset, on the first Friday of the month.
   - A broken rule, or any weight more than 5 points off target, triggers a trade in any week.
   - Trades wait for the first calm day in the following week: VIX under 30 and no more than 20% above its 5-day average. The index fills at the close *after* that signal, so it never uses hindsight.

v2 has no backtest. Its record starts the day it went live (Oct 9, 2026). The v1 history before that is shown as it was.

## Real money (your account)

The engine decides; you only place the orders. Your trades and dollar amounts stay on your computer in `portfolio/`, which is never committed. Only percentages are published.

```bash
source .venv/bin/activate              # once per terminal
python -m engine orders --value 25000  # exact share orders to match the latest decision
```

1. When the site shows a **trade pending** and its calm-day signal, run `orders`. Place those orders yourself in Robinhood, or hand the list to an agent account that only *you* approve.
2. Log each fill in `portfolio/trades.csv` (`date,action,ticker,quantity,price,amount,note`), plus your deposits.
3. Run `python -m engine account`, then commit and push `data/account.json`. The site then shows your account's return next to PRSN's, in percentages.

## Growing the directory

- **Nominations (public):** the site's "Nominate a leader" button opens [a GitHub form](../../issues/new?template=nominate-leader.yml). Anyone can submit, including the leader themselves. To approve one, check the heritage source, then add the `approved` label. A bot adds the person and closes the issue.
- **Discovery (private):** `python -m engine discover` scans SEC filings for every CEO of a US-listed company, and every executive at a private company that raised $10M+. It flags them by surname into `research/leads_*.csv`. A surname is only a lead: never list anyone until a public source documents their heritage.
- **Corrections and removals:** [a GitHub form](../../issues/new?template=correction.yml). Anyone who asks to be removed is removed.

## Folders

| Path | What |
|---|---|
| `index.html`, `app.js`, `logos/`, `leaders/` | The site (static, no build step) |
| `data/index.json` | Everything the site shows, rebuilt by the engine |
| `data/decisions.json` | Every weekly decision |
| `data/companies.json` | Fundamentals cache, refreshed weekly |
| `data/directory/leaders.csv` | The public directory, each person with a source |
| `engine/` | The Python engine (`python -m engine --help`) |
| `engine/config/` | Rules, universe, event exclusions, editorial bios |
| `portfolio/`, `research/` | Private, gitignored: your trades and orders, research notes and leads |

## Setup on a new computer

```bash
git clone https://github.com/parsaara01-stack/prsn-index.git && cd prsn-index
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m engine daily
python3 -m http.server 8000            # then open http://localhost:8000
```

**SEC features** (filing links, leadership-change alerts, discovery) need a contact email, because SEC requires one on every request. Add it as a repository secret named `SEC_CONTACT`, and `export SEC_CONTACT=you@example.com` locally. Without it, everything else still runs.
