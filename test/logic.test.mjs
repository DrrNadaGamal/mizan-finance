import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.js';

const NOW = Date.parse('2026-11-25T12:00:00+02:00');
const fresh = () => L.seed(NOW);
const U = {
  owner: { id: 'u-owner', name: 'Karim Adel', role: 'owner' },
  partner: { id: 'u-partner', name: 'Salma Hany', role: 'partner' },
  advisor: { id: 'u-advisor', name: 'Youssef Nabil', role: 'advisor' },
  teen: { id: 'u-teen', name: 'Jana Karim', role: 'teen' },
};
const today = L.dayKey(NOW), m0 = L.monthOf(today);
const run = (s, user, op) => L.applyOp(s, op, { user, now: NOW });
const throws = (s, user, op, re) => assert.throws(() => run(s, user, op), typeof re === 'function' ? re : re ? { message: re } : Error);

test('seed: every account balance is non-negative and transactions are dated in order', () => {
  const s = fresh();
  for (const a of s.accounts) assert.ok(L.balanceOf(s, a.id) >= 0, a.name);
  for (let i = 1; i < s.txs.length; i++) assert.ok(s.txs[i].date >= s.txs[i - 1].date);
  assert.ok(s.txs.length > 250);
});

test('seed: goals, debts and bills are internally consistent', () => {
  const s = fresh();
  assert.deepEqual(s.goals.map(L.goalSaved), [33000, 9500, 3000]);
  assert.deepEqual(s.debts.map(L.debtRemaining), [117000, 2400, 0]);
  assert.equal(L.debtStatus(s.debts[0], today), 'on_track');
  assert.equal(L.debtStatus(s.debts[2], today), 'paid_off');
  assert.ok(L.billDue(s.bills[2], today)?.overdue, 'electricity is overdue this month');
  assert.equal(L.billDue(s.bills[0], today), null, 'rent is paid this month');
});

test('expense reduces the balance and refuses to overdraw', () => {
  const s = fresh();
  const bal = L.balanceOf(s, 'a1');
  run(s, U.owner, { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 500, date: today });
  assert.equal(L.balanceOf(s, 'a1'), bal - 500);
  throws(s, U.owner, { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: bal }, /does not hold enough/);
});

test('transfer moves money between accounts and validates both sides', () => {
  const s = fresh();
  const b1 = L.balanceOf(s, 'a1'), b2 = L.balanceOf(s, 'a2');
  run(s, U.owner, { type: 'addTx', kind: 'transfer', accountId: 'a1', toAccountId: 'a2', amount: 1000, date: today });
  assert.equal(L.balanceOf(s, 'a1'), b1 - 1000);
  assert.equal(L.balanceOf(s, 'a2'), b2 + 1000);
  throws(s, U.owner, { type: 'addTx', kind: 'transfer', accountId: 'a1', toAccountId: 'a1', amount: 5, date: today }, /different account/);
  throws(s, U.owner, { type: 'addTx', kind: 'transfer', accountId: 'a1', toAccountId: 'a2', amount: 50000, date: today }, /does not hold enough/);
});

test('dates: no future transactions, back-dating capped at one year', () => {
  const s = fresh();
  throws(s, U.owner, { type: 'addTx', kind: 'income', accountId: 'a1', categoryId: 'c1', amount: 5, date: L.addDays(today, 1) }, /future/);
  throws(s, U.owner, { type: 'addTx', kind: 'income', accountId: 'a1', categoryId: 'c1', amount: 5, date: L.addDays(today, -366) }, /one year/);
  run(s, U.owner, { type: 'addTx', kind: 'income', accountId: 'a1', categoryId: 'c1', amount: 5, date: L.addDays(today, -365) });
});

test('teen: limited to her wallet, her categories and the per-spend cap', () => {
  const s = fresh();
  const bal = L.balanceOf(s, 'a5');
  run(s, U.teen, { type: 'addTx', kind: 'expense', accountId: 'a5', categoryId: 'c10', amount: 250, date: today, note: 'cinema' });
  assert.equal(L.balanceOf(s, 'a5'), bal - 250);
  throws(s, U.teen, { type: 'addTx', kind: 'expense', accountId: 'a5', categoryId: 'c10', amount: 301, date: today }, /teen limit/);
  throws(s, U.teen, { type: 'addTx', kind: 'expense', accountId: 'a5', categoryId: 'c4', amount: 50, date: today }, /not open to the teen/);
  throws(s, U.teen, { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c10', amount: 50, date: today }, L.PermError);
  throws(s, U.teen, { type: 'addTx', kind: 'income', accountId: 'a5', categoryId: 'c1', amount: 50, date: today }, L.PermError);
  throws(s, U.teen, { type: 'addTx', kind: 'transfer', accountId: 'a5', toAccountId: 'a1', amount: 50, date: today }, L.PermError);
  throws(s, U.teen, { type: 'setSettings', teenMax: 500, savingsTarget: 20 }, L.PermError);
});

test('advisor cannot change anything at all', () => {
  const s = fresh();
  for (const type of L.OP_NAMES) throws(s, U.advisor, { type }, L.PermError);
});

test('partner edits but cannot touch settings, private accounts or delete', () => {
  const s = fresh();
  run(s, U.partner, { type: 'addTx', kind: 'expense', accountId: 'a2', categoryId: 'c4', amount: 100, date: today });
  throws(s, U.partner, { type: 'setSettings', teenMax: 500, savingsTarget: 20 }, L.PermError);
  throws(s, U.partner, { type: 'addAccount', name: 'Secret stash', kind: 'cash', opening: 100, private: true }, L.PermError);
  throws(s, U.partner, { type: 'addTx', kind: 'expense', accountId: 'a4', categoryId: 'c4', amount: 100, date: today }, L.PermError);
  throws(s, U.partner, { type: 'deleteTx', txId: s.txs[0].id }, L.PermError);
  const v = L.view(s, U.partner, NOW);
  assert.ok(!v.accounts.some((a) => a.id === 'a4'), 'private account hidden from the partner');
  assert.equal(v.audit, undefined);
});

test('idempotency: the same key never creates two records', () => {
  const s = fresh();
  const bal = L.balanceOf(s, 'a1');
  const op = { type: 'addTx', kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 70, date: today, key: 'dup-key-1' };
  run(s, U.owner, op);
  const r = run(s, U.owner, op);
  assert.equal(r.duplicate, true);
  assert.equal(L.balanceOf(s, 'a1'), bal - 70);
});

test('budgets: spent per category and the over-budget insight', () => {
  const s = fresh();
  const spent = L.spentOf(s, 'c4', m0);
  assert.ok(spent > 9000, 'seeded groceries exceed the 9000 budget this month');
  const r = L.reports(s, U.owner, NOW);
  assert.ok(r.insights.some((i) => i.kind === 'over_budget' && i.catId === 'c4'));
  assert.ok(r.insights.some((i) => i.kind === 'bill_overdue'));
  run(s, U.owner, { type: 'setSettings', teenMax: 300, savingsTarget: 90 });
  const r2 = L.reports(s, U.owner, NOW);
  assert.ok(r2.insights.some((i) => i.kind === 'savings_rate' && i.target === 90));
});

test('goals: contributions move money, withdrawals are capped, over-funding refused', () => {
  const s = fresh();
  const g = s.goals[2], bal = L.balanceOf(s, 'a2');
  run(s, U.owner, { type: 'goalMove', goalId: g.id, accountId: 'a2', dir: 'in', amount: 1000 });
  assert.equal(L.goalSaved(g), 4000);
  assert.equal(L.balanceOf(s, 'a2'), bal - 1000);
  throws(s, U.owner, { type: 'goalMove', goalId: g.id, accountId: 'a2', dir: 'out', amount: 99999 }, /does not hold that much/);
  run(s, U.owner, { type: 'goalMove', goalId: g.id, accountId: 'a2', dir: 'out', amount: 500 });
  assert.equal(L.balanceOf(s, 'a2'), bal - 500);
  run(s, U.owner, { type: 'goalMove', goalId: g.id, accountId: 'a2', dir: 'in', amount: 41500 });
  assert.equal(L.goalSaved(g), g.target);
  throws(s, U.owner, { type: 'goalMove', goalId: g.id, accountId: 'a2', dir: 'in', amount: 1 }, /already fully funded/);
});

test('bills: paying records the month once and creates the expense', () => {
  const s = fresh();
  const b = s.bills[2], bal = L.balanceOf(s, b.accountId);
  const r = run(s, U.owner, { type: 'payBill', billId: b.id });
  assert.equal(r.month, m0);
  assert.ok(b.paid.includes(m0));
  assert.equal(L.balanceOf(s, b.accountId), bal - b.amount);
  const t = s.txs.find((x) => x.id === r.txId);
  assert.equal(t.billId, b.id); assert.equal(t.billMonth, m0); assert.equal(t.categoryId, b.categoryId);
  throws(s, U.owner, { type: 'payBill', billId: b.id }, /already paid/);
  assert.equal(L.billDue(b, today), null);
  run(s, U.owner, { type: 'setBillActive', billId: b.id, active: false });
  throws(s, U.owner, { type: 'payBill', billId: b.id, month: addMonthsSafe(m0, -1) }, /paused/);
});
function addMonthsSafe(m, n) { return L.addMonths(m, n); }

test('debts: installments are paid in order and the last one can be smaller', () => {
  const s = fresh();
  const d = s.debts[1]; // 14400, 1200/month, 10 paid, 2400 left
  assert.equal(L.debtNextMonth(d), m0);
  const bal = L.balanceOf(s, 'a2');
  const r = run(s, U.owner, { type: 'payInstallment', debtId: d.id, accountId: 'a2' });
  assert.equal(r.month, m0); assert.equal(r.remaining, 1200);
  assert.equal(L.balanceOf(s, 'a2'), bal - 1200);
  throws(s, U.owner, { type: 'payInstallment', debtId: d.id, accountId: 'a2', month: L.addMonths(m0, 2) }, /in order/);
  const r2 = run(s, U.owner, { type: 'payInstallment', debtId: d.id, accountId: 'a2' });
  assert.equal(r2.remaining, 0);
  assert.equal(L.debtStatus(d, L.dayKey(NOW)), 'paid_off');
  throws(s, U.owner, { type: 'payInstallment', debtId: d.id, accountId: 'a2' }, /fully paid/);
});

test('debt validation: installments must not cover the principal early', () => {
  const s = fresh();
  throws(s, U.owner, { type: 'addDebt', name: 'Bad loan', lender: 'X bank', principal: 10000, installment: 2000, months: 6, startMonth: m0, categoryId: 'c14' }, /already cover/);
  const r = run(s, U.owner, { type: 'addDebt', name: 'Fine loan', nameAr: '', lender: 'X bank', principal: 10000, installment: 1500, months: 7, startMonth: m0, categoryId: 'c14' });
  assert.ok(r.debtId);
});

test('deleteTx reverts bill and installment records', () => {
  const s = fresh();
  const b = s.bills[2];
  const r = run(s, U.owner, { type: 'payBill', billId: b.id });
  run(s, U.owner, { type: 'deleteTx', txId: r.txId });
  assert.ok(!b.paid.includes(m0));
  assert.ok(L.billDue(b, today));
  const d = s.debts[1];
  const r2 = run(s, U.owner, { type: 'payInstallment', debtId: d.id, accountId: 'a2' });
  const rem = L.debtRemaining(d);
  run(s, U.owner, { type: 'deleteTx', txId: r2.txId });
  assert.equal(L.debtRemaining(d), rem + 1200);
  assert.equal(L.debtNextMonth(d), m0);
});

test('import: valid rows land, bad rows are reported with their line, duplicates rejected', () => {
  const s = fresh();
  const rows = [
    { date: today, kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 100, note: 'ok', key: 'imp-a' },
    { date: today, kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 100, note: 'dup', key: 'imp-a' },
    { date: L.addDays(today, 1), kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: 100, key: 'imp-b' },
    { date: today, kind: 'expense', accountId: 'a1', categoryId: 'nope', amount: 100, key: 'imp-c' },
    { date: today, kind: 'expense', accountId: 'a1', categoryId: 'c4', amount: -5, key: 'imp-d' },
    { date: today, kind: 'income', accountId: 'a1', categoryId: 'c1', amount: 200, key: 'imp-e' },
  ];
  const r = run(s, U.owner, { type: 'importTransactions', rows });
  assert.equal(r.added, 2);
  assert.equal(r.errors.length, 4);
  assert.deepEqual(r.errors.map((e) => e.row), [2, 3, 4, 5]);
  throws(s, U.owner, { type: 'importTransactions', rows: Array.from({ length: 201 }, (_, i) => ({ key: 'k' + i })) }, /At most 200/);
});

test('csv cells escape spreadsheet formulas and quotes', () => {
  assert.equal(L.csvCell('=1+1'), "'=1+1");
  assert.equal(L.csvCell('+SUM(A1)'), "'+SUM(A1)");
  assert.equal(L.csvCell('-5'), "'-5");
  assert.equal(L.csvCell('@x'), "'@x");
  assert.equal(L.csvCell('a,"b"'), '"a,""b"""');
  assert.equal(L.csvCell(1200), '1200');
  assert.ok(L.toCsv([['a'], ['b']]).includes('\r\n'));
});

test('views: each role sees only what it should', () => {
  const s = fresh();
  const teen = L.view(s, U.teen, NOW);
  assert.equal(teen.accounts.length, 1);
  assert.equal(teen.accounts[0].id, 'a5');
  assert.ok(teen.categories.every((c) => c.teen && c.kind === 'expense'));
  assert.equal(teen.goals, undefined); assert.equal(teen.debts, undefined); assert.equal(teen.reports, undefined);
  assert.ok(teen.txs.every((x) => x.accountId === 'a5'));
  const adv = L.view(s, U.advisor, NOW);
  assert.ok(adv.reports && adv.debts && adv.goals && adv.accounts.length === 4, 'advisor reads the family view');
  assert.equal(adv.audit, undefined);
  const own = L.view(s, U.owner, NOW);
  assert.ok(Array.isArray(own.audit));
  assert.equal(own.accounts.length, 5);
  assert.ok(L.netWorth(s, U.owner) !== L.netWorth(s, U.partner), 'private account changes the net worth by role');
  assert.ok(!adv.txs.some((x) => x.accountId === 'a4' || x.toAccountId === 'a4') || adv.txs.some((x) => x.kind === 'transfer'), 'transfers to private accounts leak at most an id');
});

test('accounts: archive refuses new transactions, opening cannot force a negative balance', () => {
  const s = fresh();
  run(s, U.owner, { type: 'updateAccount', accountId: 'a3', name: 'Vodafone Cash wallet', kind: 'wallet', opening: 6000, active: false });
  throws(s, U.owner, { type: 'addTx', kind: 'expense', accountId: 'a3', categoryId: 'c4', amount: 10, date: today }, /archived/);
  const before = s.accounts.find((a) => a.id === 'a3').opening;
  run(s, U.owner, { type: 'updateAccount', accountId: 'a3', name: 'Vodafone Cash wallet', kind: 'wallet', opening: 6000, active: true });
  const bal3 = L.balanceOf(s, 'a3');
  run(s, U.owner, { type: 'addTx', kind: 'expense', accountId: 'a3', categoryId: 'c4', amount: bal3 - 100, date: today });
  throws(s, U.owner, { type: 'updateAccount', accountId: 'a3', name: 'Vodafone Cash wallet', kind: 'wallet', opening: 0, active: true }, /below zero/);
  assert.equal(s.accounts.find((a) => a.id === 'a3').opening, before, 'failed edit is reverted');
});

test('categories: budget rules and kind lock once used', () => {
  const s = fresh();
  throws(s, U.owner, { type: 'addCategory', name: 'Weird', kind: 'income', budget: 100 }, /expense categories/);
  throws(s, U.owner, { type: 'updateCategory', categoryId: 'c4', name: 'Groceries', kind: 'income', budget: 0 }, /kind cannot change/);
  const r = run(s, U.owner, { type: 'updateCategory', categoryId: 'c4', name: 'Groceries', kind: 'expense', budget: 10000 });
  assert.deepEqual(r, {});
  const b = s.bills[0];
  throws(s, U.owner, { type: 'archiveCategory', categoryId: b.categoryId }, /active bill/);
});

test('unknown and prototype-polluting actions are refused', () => {
  const s = fresh();
  throws(s, U.owner, { type: 'nope' }, /Unknown action/);
  throws(s, U.owner, { type: 'constructor' }, /Unknown action/);
  throws(s, U.owner, { type: '__proto__' }, /Unknown action/);
  throws(s, U.owner, { type: 'toString' }, /Unknown action/);
  assert.deepEqual(Object.keys(L.OP_ROLES).sort(), L.OP_NAMES.filter((n) => n !== 'login').sort(), 'OP_ROLES documents every op');
});

test('date helpers', () => {
  assert.equal(L.addMonths('2026-11', -22), '2025-01');
  assert.equal(L.addMonths('2026-01', 1), '2026-02');
  assert.equal(L.monthDiff('2025-01', '2026-11'), 22);
  assert.equal(L.monthElapsed('2026-10', '2026-11-25'), 1);
  assert.equal(L.monthElapsed('2026-12', '2026-11-25'), 0);
  assert.ok(L.monthElapsed('2026-11', '2026-11-25') > 0.8);
});
