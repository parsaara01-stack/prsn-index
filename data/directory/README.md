# Directory inclusion policy

`leaders.csv` lists CEOs, co-CEOs and executive chairs of Persian or Iranian heritage: born in Iran, or with Iranian family roots, of any ethnicity or faith.

**Who's in scope**
- Public: companies listed on NYSE, Nasdaq or NYSE American and worth $50M or more.
- Private: companies at Series A or later, or with $10M+ raised. Other private businesses of comparable scale (revenue or assets) also count.

**Rules for every entry**
1. **A public source is required.** It must state the person's Iranian birth or family roots, for example an interview, a company bio, a news profile or an honor such as the Ellis Island Medal. Write the person's background in neutral, factual terms.
2. **Never infer heritage from a name.** Surname matches from `python -m engine discover` are private leads in `research/`. They are never published.
3. `confidence` is `confirmed` for an explicit statement and `likely` for indirect evidence, such as schooling in Iran or a self-description on social media. The site marks `likely` entries as "thin source".
4. **Removal on request, no questions asked.** Corrections and removals come in through the GitHub correction form.

**Columns:** `type, name, title, company, ticker, website, sector, hq, background, source, confidence`.

When a public company is added here, add it to `engine/config/universe.csv` too, so it joins the weekly screen. Approved nominations do both automatically.
