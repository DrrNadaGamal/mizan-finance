// Browser and API checks against a running Mizan (local dev server or the live URL).
// Usage: node e2e/e2e.mjs https://your-deploy.vercel.app   (needs Chrome at /usr/bin/google-chrome)
import puppeteer from 'puppeteer-core';
import * as L from '../public/logic.js';
const U = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
const errs = [];
async function newPage(w = 1280, h = 900) {
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function login(p, pin, lang = 'en') {
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear()); await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter'); await p.waitForSelector('.top .nav', { timeout: 15000 }); await sleep(400);
}
const go = async (p, r) => { await p.evaluate((r) => (location.hash = '#/' + r), r); await sleep(450); };
const body = async (p) => { for (let i = 0; i < 4; i++) { try { return await p.evaluate(() => document.body.innerText); } catch { await sleep(600); } } return ''; };
const bare = /undefined|NaN|\[object/;
async function api(token, method, bodyObj, raw) {
  const r = await fetch(U + '/api/data', { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: raw ?? (bodyObj ? JSON.stringify(bodyObj) : undefined) });
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
const tokenFor = async (pin) => (await api(null, 'POST', { op: { type: 'login', pin } })).j.token;
const T = { owner: await tokenFor('1111'), partner: await tokenFor('2222'), advisor: await tokenFor('3333'), teen: await tokenFor('4444') };
const post = (role, op) => api(T[role], 'POST', { op });
const view = async (role) => (await api(T[role], 'GET')).j;
await post('owner', { type: 'reset' });
let n = 0; const key = () => 'e2e-' + Date.now().toString(36) + '-' + ++n;
const today = L.dayKey(Date.now()), m0 = L.monthOf(today);

// ---------- API security ----------
ok((await api(null, 'GET')).status === 401, 'no token: 401');
ok((await api('garbage', 'GET')).status === 401, 'garbage token: 401');
const tv = T.teen.split('.'); const forged = Buffer.from('u-owner.' + (Date.now() + 1e7)).toString('base64url') + '.' + tv[1];
ok((await api(forged, 'GET')).status === 401, 'forged token for another user: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: '0000' } })).status === 401, 'wrong PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: ['1111'] } })).status === 401, 'array PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: 1111 } })).status === 401, 'numeric PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: { $ne: 1 } } })).status === 401, 'object PIN: 401');
ok((await api(T.owner, 'POST', null, '{not json')).status === 400, 'malformed JSON: 400');
ok((await post('owner', { type: 'nope' })).status === 400, 'unknown action: 400');
ok((await post('owner', { type: 'constructor' })).status === 400, 'prototype name as action: 400');
ok((await post('owner', { type: '__proto__' })).status === 400, '__proto__ as action: 400');
ok((await post('owner', { type: 'toString' })).status === 400, 'toString as action: 400');
ok((await api(T.owner, 'POST', { op: { type: 'addTx', pad: 'x'.repeat(70000) } })).status === 413, 'oversized body: 413');
ok((await api(T.owner, 'DELETE')).status === 405, 'DELETE: 405');
ok((await api(T.owner, 'PUT', { op: { type: 'reset' } })).status === 405, 'PUT: 405');
ok((await api(T.owner, 'PATCH', { op: { type: 'reset' } })).status === 405, 'PATCH: 405');
ok((await post('partner', { type: 'reset' })).status === 403, 'partner cannot reset: 403');
ok((await post('advisor', { type: 'reset' })).status === 403, 'advisor cannot reset: 403');
ok((await post('teen', { type: 'reset' })).status === 403, 'teen cannot reset: 403');
ok((await api(null, 'POST', { op: { type: 'reset' } })).status === 401, 'reset without token: 401');
ok((await api(null, 'POST', { op: { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 5 } })).status === 401, 'money action without token: 401');

// ---------- advisor is fully read-only ----------
for (const op of [
  { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 5, date: today, key: key() },
  { type: 'addAccount', name: 'Nope account', kind: 'cash', opening: 1, key: key() },
  { type: 'addCategory', name: 'Nope cat', kind: 'expense', budget: 0, key: key() },
  { type: 'addGoal', name: 'Nope goal', target: 1000, deadline: L.addDays(today, 30), key: key() },
  { type: 'goalMove', goalId: 'g1', accountId: 'a2', dir: 'in', amount: 5, key: key() },
  { type: 'addBill', name: 'Nope bill', amount: 5, categoryId: 'c4', accountId: 'a2', day: 3, key: key() },
  { type: 'payBill', billId: 'b3', key: key() },
  { type: 'addDebt', name: 'Nope debt', lender: 'X', principal: 1000, installment: 100, months: 2, startMonth: m0, categoryId: 'c14', key: key() },
  { type: 'payInstallment', debtId: 'd1', accountId: 'a2', key: key() },
  { type: 'importTransactions', rows: [{ date: today, kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 5, key: key() }] },
  { type: 'setSettings', teenMax: 300, savingsTarget: 20 },
  { type: 'deleteTx', txId: 't1' },
  { type: 'archiveCategory', categoryId: 'c4' },
]) ok((await post('advisor', op)).status === 403, 'advisor blocked from ' + op.type + ': 403');

// ---------- data visibility ----------
const own = await view('owner'), par = await view('partner'), adv = await view('advisor'), tn = await view('teen');
ok(own.accounts.length === 5 && own.audit && own.reports && own.settings, 'owner sees everything including audit');
ok(par.accounts.length === 4 && !par.accounts.some((a) => a.private), 'partner sees no private account');
ok(!JSON.stringify(par.accounts).includes('QNB'), 'private account name never reaches the partner');
ok(par.audit === undefined && adv.audit === undefined, 'audit log is owner-only');
ok(adv.reports && adv.debts.length === 3 && adv.goals.length === 3 && adv.accounts.length === 4, 'advisor reads the full family view');
ok(tn.accounts.length === 1 && tn.accounts[0].holder === 'u-teen', 'teen sees only her wallet');
ok(tn.reports === undefined && tn.goals === undefined && tn.debts === undefined && tn.bills === undefined && tn.audit === undefined, 'teen gets no family data');
ok(tn.categories.every((c) => c.teen && c.kind === 'expense' && !c.archived), 'teen categories are her open expense categories');
ok(tn.txs.every((x) => x.accountId === tn.accounts[0].id), 'teen transactions are her own only');
const tj = JSON.stringify(tn);
ok(!/QNB|CBE current|Car loan|Emergency fund|u-owner/.test(tj), 'teen response carries no family account, debt or goal names');
ok(own.reports.totals.netWorth !== par.reports.totals.netWorth, 'net worth respects the private account');
ok(own.reports.byMonth.length === 12 && own.reports.byCat.length > 5, 'reports carry 12 months and category breakdown');
ok(own.reports.insights.some((i) => i.kind === 'bill_overdue'), 'the overdue electricity bill is flagged');
ok(own.reports.insights.some((i) => i.kind === 'over_budget'), 'the over-budget groceries are flagged');

// ---------- money flows over the API ----------
const bal = async (role, id) => (await view(role)).accounts.find((a) => a.id === id)?.balance;
const cash0 = await bal('owner', 'a1');
ok((await post('owner', { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 321, date: today, note: 'e2e spend', key: key() })).status === 200, 'add expense: 200');
ok((await bal('owner', 'a1')) === cash0 - 321, 'expense lowers the balance');
ok((await post('owner', { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 999999, date: today, key: key() })).status === 400, 'overdraft refused: 400');
ok((await post('owner', { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c1', amount: 5, date: today, key: key() })).status === 400, 'income category for an expense: 400');
ok((await post('owner', { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 5, date: L.addDays(today, 1), key: key() })).status === 400, 'future date: 400');
ok((await post('owner', { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 5.5, date: today, key: key() })).status === 400, 'fractions of a pound: 400');
const wal0 = await bal('owner', 'a3');
ok((await post('owner', { type: 'addTx', kind: 'transfer', accountId: 'a1', toAccountId: 'a3', amount: 100, date: today, key: key() })).status === 200, 'transfer: 200');
ok((await bal('owner', 'a3')) === wal0 + 100 && (await bal('owner', 'a1')) === cash0 - 321 - 100, 'transfer moves the balance both ways');
ok((await post('owner', { type: 'addTx', kind: 'transfer', accountId: 'a1', toAccountId: 'a1', amount: 5, date: today, key: key() })).status === 400, 'transfer to self: 400');
const dup = { type: 'addTx', kind: 'income', accountId: 'a1', categoryId: 'c1', amount: 777, date: today, key: key() };
ok((await post('owner', dup)).status === 200, 'first keyed income: 200');
const dup2 = await post('owner', dup);
ok(dup2.status === 200 && dup2.j.result.duplicate === true, 'same key again: duplicate, no second record');
ok((await bal('owner', 'a1')) === cash0 - 321 - 100 + 777, 'duplicate key did not move money twice');

// teen rules over the API
const jb0 = await bal('teen', 'a5');
ok((await post('teen', { type: 'addTx', kind: 'expense', accountId: 'a5', categoryId: 'c10', amount: 200, date: today, note: 'e2e teen', key: key() })).status === 200, 'teen spends within her limit: 200');
ok((await bal('teen', 'a5')) === jb0 - 200, 'teen balance moved');
ok((await post('teen', { type: 'addTx', kind: 'expense', accountId: 'a5', categoryId: 'c10', amount: 301, date: today, key: key() })).status === 400, 'teen above her cap: 400');
ok((await post('teen', { type: 'addTx', kind: 'expense', accountId: 'a5', categoryId: 'c4', amount: 50, date: today, key: key() })).status === 400, 'teen outside her categories: 400');
ok((await post('teen', { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c10', amount: 50, date: today, key: key() })).status === 403, 'teen on a family account: 403');
ok((await post('teen', { type: 'addTx', kind: 'income', accountId: 'a5', categoryId: 'c1', amount: 50, date: today, key: key() })).status === 403, 'teen income: 403');
ok((await post('teen', { type: 'addTx', kind: 'transfer', accountId: 'a5', toAccountId: 'a1', amount: 50, date: today, key: key() })).status === 403, 'teen transfer: 403');
ok((await post('teen', { type: 'setSettings', teenMax: 9999, savingsTarget: 20 })).status === 403, 'teen settings: 403');

// partner vs private account
ok((await post('partner', { type: 'addTx', kind: 'expense', accountId: 'a4', categoryId: 'c4', amount: 5, date: today, key: key() })).status === 403, 'partner cannot spend from the private account: 403');
ok((await post('partner', { type: 'addTx', kind: 'expense', accountId: 'a2', categoryId: 'c4', amount: 50, date: today, note: 'e2e partner', key: key() })).status === 200, 'partner spends from a family account: 200');
ok((await post('partner', { type: 'deleteTx', txId: 't1' })).status === 403, 'partner cannot delete: 403');

// bills over the API
const elec0 = await bal('owner', 'a3');
const payElec = await post('owner', { type: 'payBill', billId: 'b3', key: key() });
ok(payElec.status === 200 && payElec.j.result.month === m0, 'pay the overdue electricity bill');
ok((await bal('owner', 'a3')) === elec0 - 700, 'bill payment is an expense');
ok((await post('owner', { type: 'payBill', billId: 'b3', key: key() })).status === 400, 'same month twice: 400');
ok((await view('owner')).reports.insights.every((i) => !(i.kind === 'bill_overdue' && i.billId === 'b3')), 'overdue flag clears after paying');
ok((await post('owner', { type: 'setBillActive', billId: 'b4', active: false })).status === 200, 'pause the gym bill');
ok((await post('owner', { type: 'payBill', billId: 'b4', key: key() })).status === 400, 'paused bill cannot be paid: 400');
ok((await post('teen', { type: 'payBill', billId: 'b1', key: key() })).status === 403, 'teen cannot pay bills: 403');

// debts over the API
const car0 = (await view('owner')).debts.find((d) => d.id === 'd1');
const cbe0 = await bal('owner', 'a2');
const payCar = await post('owner', { type: 'payInstallment', debtId: 'd1', accountId: 'a2', key: key() });
ok(payCar.status === 200 && payCar.j.result.month === car0.nextMonth && payCar.j.result.remaining === car0.remaining - Math.min(car0.installment, car0.remaining), 'car installment pays the next month in order');
ok((await bal('owner', 'a2')) === cbe0 - Math.min(car0.installment, car0.remaining), 'installment is an expense');
ok((await post('owner', { type: 'payInstallment', debtId: 'd1', accountId: 'a2', month: L.addMonths(m0, 2), key: key() })).status === 400, 'skipping ahead in the schedule: 400');
ok((await post('owner', { type: 'payInstallment', debtId: 'd3', accountId: 'a2', key: key() })).status === 400, 'a paid-off debt refuses more: 400');
ok((await post('advisor', { type: 'payInstallment', debtId: 'd1', accountId: 'a2', key: key() })).status === 403, 'advisor cannot pay installments: 403');

// goals over the API
const goals0 = (await view('owner')).goals.find((g) => g.id === 'g3');
ok((await post('owner', { type: 'goalMove', goalId: 'g3', accountId: 'a2', dir: 'in', amount: 1000, key: key() })).status === 200, 'add to the laptop goal');
const goals1 = (await view('owner')).goals.find((g) => g.id === 'g3');
ok(goals1.saved === goals0.saved + 1000, 'goal saved amount moved');
ok((await post('owner', { type: 'goalMove', goalId: 'g3', accountId: 'a2', dir: 'out', amount: 999999, key: key() })).status === 400, 'withdraw more than saved: 400');
ok((await post('owner', { type: 'goalMove', goalId: 'g3', accountId: 'a2', dir: 'sideways', amount: 5, key: key() })).status === 400, 'bad direction: 400');

// import over the API
const imp = await post('owner', { type: 'importTransactions', rows: [
  { date: today, kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 42, note: 'csv ok', key: key() },
  { date: today, kind: 'expense', accountId: 'a1', categoryId: 'missing-cat', amount: 42, key: key() },
  { date: L.addDays(today, 1), kind: 'income', accountId: 'a1', categoryId: 'c1', amount: 42, key: key() },
] });
ok(imp.status === 200 && imp.j.result.added === 1 && imp.j.result.errors.length === 2, 'CSV import adds valid rows and reports the bad ones');

// owner deletes a transaction and the bill record reverts
await post('owner', { type: 'setBillActive', billId: 'b4', active: true });
ok((await post('owner', { type: 'deleteTx', txId: payElec.j.result.txId })).status === 200, 'owner deletes the electricity payment');
ok((await view('owner')).bills.find((x) => x.id === 'b3').due?.month === m0, 'the bill is due again after deletion');

// settings over the API
ok((await post('owner', { type: 'setSettings', teenMax: 500, savingsTarget: 30 })).status === 200, 'owner updates settings');
ok((await view('teen')).teenMax === 500, 'the teen limit reaches the teen view');
ok((await post('owner', { type: 'setSettings', teenMax: 500, savingsTarget: 95 })).status === 400, 'settings validated: 400');
ok((await post('owner', { type: 'setSettings', teenMax: 300, savingsTarget: 20 })).status === 200, 'settings restored');

// ---------- browser: owner walkthrough ----------
let p = await newPage();
await login(p, '1111');
let txt = await body(p);
ok(/Net worth/.test(txt) && /Savings rate/.test(txt) && /Insights/.test(txt), 'owner dashboard renders KPIs and insights');
ok(!bare.test(txt), 'dashboard has no undefined/NaN/[object');
for (const r of ['accounts', 'transactions', 'budgets', 'goals', 'bills', 'debts', 'reports', 'settings', 'audit']) {
  await go(p, r); txt = await body(p);
  ok(txt.length > 200 && !bare.test(txt), 'page ' + r + ' renders clean');
}
await go(p, 'accounts');
ok(!(await body(p)).includes('undefined'), 'accounts page clean');
const auditTxt = await (async () => { await go(p, 'audit'); return body(p); })();
ok(/addTx|payBill|Action/.test(await auditTxt), 'audit log lists money actions');

// owner adds an expense through the UI
await go(p, 'transactions');
const before = await body(p);
await p.click('[data-act="newtx"]'); await sleep(300);
await p.type('#tx-amt', '63'); await p.type('#tx-note', 'e2e-ui-spend');
await p.click('[data-act="savetx"]'); await sleep(800);
ok((await body(p)).includes('e2e-ui-spend'), 'UI expense appears in the list');

// XSS stays text
await p.click('[data-act="newtx"]'); await sleep(300);
await p.type('#tx-amt', '64'); await p.type('#tx-note', '<img src=x onerror="window.__xss=1">');
await p.click('[data-act="savetx"]'); await sleep(800);
ok(await p.evaluate(() => window.__xss !== 1 && document.body.innerText.includes('<img src=x')), 'hostile note renders as text, never runs');
ok((await body(p)).includes('e2e-ui-spend'), 'list still fine after the hostile note');

// transfer through the UI
await go(p, 'accounts');
await p.click('[data-act="newtransfer"]'); await sleep(300);
await p.type('#tr-amt', '55'); await p.type('#tr-note', 'e2e-ui-transfer');
await p.click('[data-act="savetransfer"]'); await sleep(800);
await go(p, 'transactions');
ok((await body(p)).includes('e2e-ui-transfer'), 'UI transfer appears in the list');

// teen browser view
let tp = await newPage();
await login(tp, '4444');
txt = await body(tp);
ok(/My wallet|محفظتي/.test(txt) && !/Net worth/.test(txt) && !/Car loan/.test(txt), 'teen dashboard shows only her wallet');
ok(!bare.test(txt), 'teen dashboard clean');
await go(tp, 'transactions');
ok((await body(tp)).length > 100 && !(await body(tp)).includes('Car loan'), 'teen transactions page is hers only');
await tp.evaluate(() => (location.hash = '#/debts')); await sleep(500);
ok(!(await body(tp)).includes('Car loan'), 'teen cannot reach the debts page by URL');

// advisor browser view
let ap = await newPage();
await login(ap, '3333');
txt = await body(ap);
ok(/financial advisor/i.test(txt), 'advisor sees the read-only note');
ok(!(await ap.$('[data-act="newtx"]')), 'advisor gets no add-transaction button');
await go(ap, 'bills');
ok(!(await ap.$('[data-act="paybill"]')), 'advisor gets no pay button');
ok((await body(ap)).includes('Electricity'), 'advisor still reads the bills');

// partner cannot see the private account in the browser
let pp = await newPage();
await login(pp, '2222');
await go(pp, 'accounts');
ok(!(await body(pp)).includes('QNB'), 'partner browser never shows the private account');
ok((await body(pp)).includes('CBE'), 'partner sees the family bank account');

// Arabic RTL
let arp = await newPage();
await login(arp, '1111', 'ar');
ok(await arp.evaluate(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar'), 'Arabic sets rtl and lang');
txt = await body(arp);
ok(/صافي الثروة/.test(txt) && /ملاحظات/.test(txt), 'Arabic dashboard renders Arabic labels');
ok(!bare.test(txt), 'Arabic dashboard clean');
for (const r of ['transactions', 'budgets', 'goals', 'bills', 'debts']) { await go(arp, r); ok(!bare.test(await body(arp)), 'Arabic ' + r + ' clean'); }
await go(arp, 'accounts');
ok(/الحسابات/.test(await body(arp)), 'Arabic accounts page');

// phone layout
let ph = await newPage(390, 844);
await login(ph, '2222');
ok(await ph.evaluate(() => document.documentElement.scrollWidth <= 395), 'owner dashboard fits a 390px phone');
await go(ph, 'transactions');
ok(await ph.evaluate(() => document.documentElement.scrollWidth <= 400), 'transactions table scrolls inside the page, page does not widen');
await go(ph, 'budgets');
ok(await ph.evaluate(() => document.documentElement.scrollWidth <= 400), 'budgets page fits a phone');
let tph = await newPage(390, 844);
await login(tph, '4444');
ok(await tph.evaluate(() => document.documentElement.scrollWidth <= 395), 'teen view fits a phone');

// no page errors anywhere
ok(errs.length === 0, 'no console or page errors (' + errs.slice(0, 3).join(' | ') + ')');

await post('owner', { type: 'reset' });
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
