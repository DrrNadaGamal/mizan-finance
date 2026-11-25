# Mizan (ميزان)

A bilingual (Arabic RTL / English) household finance manager for one family: cash, bank and wallet accounts, transactions and transfers, categories with monthly budgets, savings goals, recurring bills, debts with installment schedules, net worth, monthly reports, CSV import and export, and plain-language insights that flag what needs attention.

Product direction, scope and delivery: Nada Gamal

This is a portfolio demo. Everything runs on an invented family in Cairo (all names and accounts are made up).

## Try it

Live demo: https://mizan-home.vercel.app — sign in with a PIN (the PINs are public on purpose, this is a demo):

| PIN | Role | What it can do |
| --- | --- | --- |
| 1111 | Owner (Karim) | Everything: all accounts including the private one, deleting transactions, settings, the audit log, reset |
| 2222 | Partner (Salma) | Add and edit on the family accounts. Cannot see the private account, cannot delete, no settings, no audit log |
| 3333 | Advisor (Youssef) | Read-only view of the whole family picture, for a financial advisor following along |
| 4444 | Teen (Jana) | Her own allowance wallet only: log spends up to a limit per spend, in her own categories. Sees nothing else |

## Rules the system enforces

- Money moves in whole Egyptian pounds. No fractions, no negatives, no zero.
- An expense can only use an expense category, an income an income category. A transfer moves money between two different accounts and is never categorized.
- Dates cannot be in the future. Nothing can be back-dated more than a year.
- No account can go below zero: an expense, transfer, bill payment or installment that would overdraw is refused.
- The private account is visible to the owner only. It appears in no one else's balances, net worth or reports.
- The teen role can only spend from her own wallet, up to a per-spend limit the owner sets, in categories marked for her. The limit reaches her screen the moment it changes.
- A recurring bill is paid month by month. The same month is never paid twice. Pausing a bill stops payments until it is resumed. Deleting a payment transaction makes the bill due again.
- A debt has a principal, a fixed installment and a start month. Installments are paid strictly in order, the next unpaid month first. A paid-off debt refuses more payments.
- A savings goal collects money moved in from an account and can give it back. You cannot withdraw more than the goal holds, and a fully funded goal refuses more.
- Budgets are monthly per category. Insights flag an over-budget category, one running ahead of pace, an unusual spend against the 3-month average, a low savings rate, an overdue or upcoming bill, a goal behind schedule and a debt that fell behind.
- CSV import validates every row and reports the bad ones with line numbers; valid rows still import. CSV export escapes cells that start with `=`, `+`, `-` or `@`.
- Repeating a create request with the same `key` does not create a second record or move money twice.
- Every money action lands in an audit log with who did it and when (owner only).

## Architecture

- `public/logic.js`: all rules, the seed data, reports and per-role views. Used by the server, the front end and the tests.
- `api/data.js`: one serverless endpoint. Sign in, run an operation, read the view for your role.
- `api/_auth.js`: signed tokens (set `MIZAN_SECRET` in production).
- `public/app.js`, `i18n.js`, `style.css`: plain JavaScript front end, no framework, no build step.
- `dev-server.mjs`: local server with the same API.

State lives in the memory of the running server and is rebuilt from the seed about every 6 hours and on every restart.

## Run and test

```
npm ci
PORT=3100 node dev-server.mjs         # http://localhost:3100
npm test                              # unit tests (node:test)
./run-local.sh node e2e/e2e.mjs http://localhost:3100   # browser and API checks, needs Chrome
node e2e/e2e.mjs https://your-deploy.vercel.app          # same checks against a deployment
node e2e/shots.mjs http://localhost:3100                 # screenshots into docs/
```

The e2e run resets the demo data at the start and at the end.

Verified: 24 unit tests and the full e2e suite (135 browser and API checks) run to completion green against the live deployment.

## Honest limits

- The PINs are public and there is no real authentication, password reset or account creation.
- No bank connection and no real money movement. Balances come from what is typed in, not from any bank, wallet or card.
- No email, SMS or push reminders for bills or budgets; insights appear inside the app only.
- Data is in memory and resets about every 6 hours. Do not enter real personal data.
- Multi-currency is not supported: everything is EGP. Dates follow Africa/Cairo.
- CSV import is one fixed template (the one the export produces); bank statement formats are not parsed.
- Some server error messages (for example field validation) appear in English even when the screen is in Arabic. The common ones are translated.
- The e2e suite drives the shared demo, so run it only on a demo deployment.
