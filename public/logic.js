// Mizan business rules. Pure functions shared by the browser, the API and the tests.
// Money is whole EGP. Cairo calendar days are 'YYYY-MM-DD'. Times are epoch ms.
export const TZ = 'Africa/Cairo';
export const ROLES = { owner: 'owner', partner: 'partner', advisor: 'advisor', teen: 'teen' };
export const DEMO_USERS = [
  { pin: '1111', label: 'Owner (Karim)', labelAr: 'رب الأسرة (كريم)' },
  { pin: '2222', label: 'Partner (Salma)', labelAr: 'الشريكة (سلمى)' },
  { pin: '3333', label: 'Financial advisor (Youssef)', labelAr: 'المستشار المالي (يوسف)' },
  { pin: '4444', label: 'Teen (Jana)', labelAr: 'الابنة (جنى)' },
];
export const ACCOUNT_KINDS = ['cash', 'bank', 'wallet', 'savings'];
export const DEFAULTS = { teenMax: 300, savingsTarget: 20, importMax: 200 };
export const MAX_AMOUNT = 2000000;
export const BACKDATE_DAYS = 365;

export class UserError extends Error {}
export class PermError extends Error {}

// ---------- dates ----------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayKey = (ts) => fmt.format(ts);
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (k, n) => toKey(parse(k) + n * 864e5);
export const monthOf = (k) => k.slice(0, 7);
export const isKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && toKey(parse(k)) === k;
export const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
export const monthDiff = (a, b) => { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by - ay) * 12 + bm - am; };
const pad = (n, w) => String(n).padStart(w, '0');
const daysInMonth = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
// How far through the current month we are, as a fraction (1 for past months).
export const monthElapsed = (m, today) => {
  if (m < monthOf(today)) return 1;
  if (m > monthOf(today)) return 0;
  return Number(today.slice(8, 10)) / daysInMonth(m);
};

// ---------- validation ----------
const str = (v, min, max, label) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw new UserError(`${label} must be ${min === max ? min : `${min} to ${max}`} characters`);
  return s;
};
const optStr = (v, max, label) => (v === undefined || v === null || v === '' ? '' : str(v, 0, max, label));
const intIn = (v, min, max, label) => { if (!Number.isInteger(v) || v < min || v > max) throw new UserError(`${label} must be a whole number from ${min} to ${max}`); return v; };
const oneOf = (v, list, msg) => { if (typeof v !== 'string' || !list.includes(v)) throw new UserError(msg); return v; };
const dateIn = (v, label = 'Date') => { if (!isKey(v)) throw new UserError(`${label} must be a valid date`); return v; };
const bool = (v) => v === true;
const need = (user, roles) => { if (!roles.includes(user.role)) throw new PermError('You do not have permission to do this'); };
const EDIT = ['owner', 'partner']; // roles that may change family money
const settings = (s) => ({ ...DEFAULTS, ...(s.settings || {}) });
const nextId = (s, p) => `${p}${++s.counters[p]}`;
const audit = (s, user, now, action, detail) => { s.audit.unshift({ ts: now, userId: user.id, name: user.name, action, detail: String(detail).slice(0, 200) }); if (s.audit.length > 300) s.audit.length = 300; };
const once = (s, op, fn) => {
  if (op.key !== undefined && (typeof op.key !== 'string' || op.key.length < 4 || op.key.length > 64)) throw new UserError('Bad request');
  if (op.key && s.keys.includes(op.key)) return { duplicate: true };
  const r = fn(); if (op.key) { s.keys.push(op.key); if (s.keys.length > 600) s.keys.shift(); } return r;
};
const find = (arr, id, what) => { const x = typeof id === 'string' ? arr.find((y) => y.id === id) : null; if (!x) throw new UserError(`${what} not found`); return x; };
const getAccount = (s, id) => find(s.accounts, id, 'Account');
const getCategory = (s, id) => find(s.categories, id, 'Category');
const getTx = (s, id) => find(s.txs, id, 'Transaction');
const getGoal = (s, id) => find(s.goals, id, 'Goal');
const getBill = (s, id) => find(s.bills, id, 'Bill');
const getDebt = (s, id) => find(s.debts, id, 'Debt');

// ---------- visibility ----------
// An account is family-visible unless it is private to the owner. The teen sees only her own wallet.
export const canSeeAccount = (user, a) => {
  if (user.role === 'owner') return true;
  if (user.role === 'teen') return a.holder === user.id;
  return !a.private;
};
export const visibleAccounts = (s, user) => s.accounts.filter((a) => canSeeAccount(user, a));
// May this user move money in or out of this account?
const canUseAccount = (user, a) => {
  if (user.role === 'teen') return a.holder === user.id;
  return EDIT.includes(user.role) && (user.role === 'owner' || !a.private);
};

// ---------- money rules ----------
export const goalSaved = (g) => g.moves.reduce((x, m) => x + (m.dir === 'in' ? m.amount : -m.amount), 0);
export const balanceOf = (s, id) => {
  const a = getAccount(s, id);
  let bal = a.opening;
  for (const t of s.txs) {
    if (t.kind === 'income' && t.accountId === id) bal += t.amount;
    if (t.kind === 'expense' && t.accountId === id) bal -= t.amount;
    if (t.kind === 'transfer' && t.accountId === id) bal -= t.amount;
    if (t.kind === 'transfer' && t.toAccountId === id) bal += t.amount;
  }
  for (const g of s.goals) for (const m of g.moves) if (m.accountId === id) bal += m.dir === 'in' ? -m.amount : m.amount;
  return bal;
};
export const spentOf = (s, catId, month) => s.txs.filter((t) => t.kind === 'expense' && t.categoryId === catId && monthOf(t.date) === month).reduce((x, t) => x + t.amount, 0);
export const incomeOf = (s, month) => s.txs.filter((t) => t.kind === 'income' && monthOf(t.date) === month).reduce((x, t) => x + t.amount, 0);
export const expenseOf = (s, month) => s.txs.filter((t) => t.kind === 'expense' && monthOf(t.date) === month).reduce((x, t) => x + t.amount, 0);
export const debtPaid = (d) => d.paid.reduce((x, p) => x + p.amount, 0);
export const debtRemaining = (d) => d.principal - debtPaid(d);
export const debtNextMonth = (d) => {
  for (let i = 0; i < d.months; i++) { const m = addMonths(d.startMonth, i); if (!d.paid.some((p) => p.month === m)) return m; }
  return null;
};
export const debtStatus = (d, today) => {
  if (debtRemaining(d) <= 0) return 'paid_off';
  const next = debtNextMonth(d);
  return next < monthOf(today) ? 'behind' : 'on_track';
};
export const netWorth = (s, user) => {
  const acc = visibleAccounts(s, user).reduce((x, a) => x + balanceOf(s, a.id), 0);
  const goals = user.role === 'teen' ? 0 : s.goals.reduce((x, g) => x + goalSaved(g), 0);
  const debts = user.role === 'teen' ? 0 : s.debts.reduce((x, d) => x + debtRemaining(d), 0);
  return acc + goals - debts;
};
export const billDue = (b, today) => {
  if (!b.active) return null;
  const m = monthOf(today);
  if (b.paid.includes(m)) return null;
  const dueDay = `${m}-${pad(b.day, 2)}`;
  if (dueDay <= today) return { month: m, overdue: Number(today.slice(8, 10)) > b.day + 7 };
  return null;
};

const txDate = (op, now) => {
  const today = dayKey(now);
  const date = op.date === undefined ? today : dateIn(op.date);
  if (date > today) throw new UserError('A transaction cannot be dated in the future');
  if (date < addDays(today, -BACKDATE_DAYS)) throw new UserError('Transactions can be back-dated by at most one year');
  return date;
};
const amount = (op) => intIn(op.amount, 1, MAX_AMOUNT, 'Amount');
function checkAccountUse(user, a) {
  if (!a.active) throw new UserError('This account is archived');
  if (!canUseAccount(user, a)) throw new PermError('You do not have permission to do this');
}
function checkFunds(s, accountId, amt) {
  if (balanceOf(s, accountId) < amt) throw new UserError('This account does not hold enough for that');
}
function checkCategory(s, id, kind) {
  const c = getCategory(s, id);
  if (c.archived) throw new UserError('This category is archived');
  if (c.kind !== kind) throw new UserError(kind === 'expense' ? 'Pick an expense category' : 'Pick an income category');
  return c;
}
function makeTx(s, o, now) {
  const t = { id: nextId(s, 't'), kind: o.kind, accountId: o.accountId, toAccountId: o.toAccountId || null, categoryId: o.categoryId || null, amount: o.amount, date: o.date, note: o.note || '', by: o.by, ts: now, billId: o.billId || null, billMonth: o.billMonth || null, debtId: o.debtId || null, debtMonth: o.debtMonth || null };
  s.txs.push(t);
  return t;
}

// ---------- operations ----------
const accountFields = (op) => ({ name: str(op.name, 2, 50, 'Name'), nameAr: optStr(op.nameAr, 50, 'Arabic name'), kind: oneOf(op.kind, ACCOUNT_KINDS, 'Pick an account type'), private: bool(op.private) });
const categoryFields = (op) => ({ name: str(op.name, 2, 40, 'Name'), nameAr: optStr(op.nameAr, 40, 'Arabic name'), kind: oneOf(op.kind, ['income', 'expense'], 'Pick income or expense'), budget: intIn(op.budget === undefined ? 0 : op.budget, 0, 1000000, 'Monthly budget'), teen: bool(op.teen) });

const OPS = {
  // ----- accounts -----
  addAccount(s, op, { user, now }) {
    need(user, EDIT);
    return once(s, op, () => {
      const f = accountFields(op);
      if (f.private && user.role !== 'owner') throw new PermError('Only the owner can add a private account');
      const a = { id: nextId(s, 'a'), ...f, opening: intIn(op.opening, 0, 100000000, 'Opening balance'), holder: null, active: true, createdAt: now };
      s.accounts.push(a); audit(s, user, now, 'addAccount', `${a.id} ${a.name}`); return { accountId: a.id };
    });
  },
  updateAccount(s, op, { user, now }) {
    need(user, EDIT); const a = getAccount(s, op.accountId);
    if (a.holder) throw new UserError('The teen wallet cannot be edited here');
    if (!canUseAccount(user, a)) throw new PermError('You do not have permission to do this');
    const f = accountFields(op);
    if (f.private && user.role !== 'owner') throw new PermError('Only the owner can make an account private');
    const opening = intIn(op.opening, 0, 100000000, 'Opening balance');
    const was = { private: a.private, opening: a.opening };
    Object.assign(a, f, { opening });
    const bal = balanceOf(s, a.id);
    if (bal < 0) { Object.assign(a, was); throw new UserError('This opening balance would put the account below zero'); }
    if (op.active !== undefined) a.active = bool(op.active);
    audit(s, user, now, 'updateAccount', a.id); return {};
  },
  // ----- categories -----
  addCategory(s, op, { user, now }) {
    need(user, EDIT);
    return once(s, op, () => {
      const f = categoryFields(op);
      if (f.budget > 0 && f.kind !== 'expense') throw new UserError('Only expense categories can have a budget');
      const c = { id: nextId(s, 'c'), ...f, archived: false };
      s.categories.push(c); audit(s, user, now, 'addCategory', `${c.id} ${c.name}`); return { categoryId: c.id };
    });
  },
  updateCategory(s, op, { user, now }) {
    need(user, EDIT); const c = getCategory(s, op.categoryId);
    const f = categoryFields(op);
    if (f.budget > 0 && f.kind !== 'expense') throw new UserError('Only expense categories can have a budget');
    if (f.kind !== c.kind && s.txs.some((t) => t.categoryId === c.id)) throw new UserError('The kind cannot change once the category has transactions');
    Object.assign(c, f); audit(s, user, now, 'updateCategory', c.id); return {};
  },
  archiveCategory(s, op, { user, now }) {
    need(user, EDIT); const c = getCategory(s, op.categoryId);
    if (s.bills.some((b) => b.active && b.categoryId === c.id)) throw new UserError('An active bill uses this category');
    c.archived = true; audit(s, user, now, 'archiveCategory', c.id); return {};
  },
  // ----- transactions -----
  addTx(s, op, { user, now }) {
    return once(s, op, () => addTxInner(s, op, user, now, false));
  },
  deleteTx(s, op, { user, now }) {
    need(user, ['owner']); const t = getTx(s, op.txId);
    if (t.billId) { const b = getBill(s, t.billId); b.paid = b.paid.filter((m) => m !== t.billMonth); }
    if (t.debtId) { const d = getDebt(s, t.debtId); d.paid = d.paid.filter((p) => p.month !== t.debtMonth); }
    s.txs.splice(s.txs.indexOf(t), 1);
    audit(s, user, now, 'deleteTx', `${t.id} ${t.kind} ${t.amount}`); return {};
  },
  // ----- savings goals -----
  addGoal(s, op, { user, now }) {
    need(user, EDIT);
    return once(s, op, () => {
      const g = { id: nextId(s, 'g'), name: str(op.name, 2, 60, 'Name'), nameAr: optStr(op.nameAr, 60, 'Arabic name'), target: intIn(op.target, 500, 100000000, 'Target'), deadline: dateIn(op.deadline, 'Deadline'), moves: [], createdAt: now };
      if (g.deadline < dayKey(now)) throw new UserError('The deadline is in the past');
      s.goals.push(g); audit(s, user, now, 'addGoal', `${g.id} ${g.name}`); return { goalId: g.id };
    });
  },
  goalMove(s, op, { user, now }) {
    need(user, EDIT);
    return once(s, op, () => {
      const g = getGoal(s, op.goalId), a = getAccount(s, op.accountId), dir = oneOf(op.dir, ['in', 'out'], 'Pick add or withdraw');
      const amt = amount(op), date = txDate(op, now);
      checkAccountUse(user, a);
      if (dir === 'in') { if (goalSaved(g) >= g.target) throw new UserError('This goal is already fully funded'); checkFunds(s, a.id, amt); }
      else if (goalSaved(g) < amt) throw new UserError('The goal does not hold that much');
      g.moves.push({ id: nextId(s, 'm'), accountId: a.id, amount: amt, dir, date, ts: now, by: user.id });
      audit(s, user, now, 'goalMove', `${g.id} ${dir} ${amt}`);
      return { saved: goalSaved(g) };
    });
  },
  // ----- recurring bills -----
  addBill(s, op, { user, now }) {
    need(user, EDIT);
    return once(s, op, () => {
      const a = getAccount(s, op.accountId); checkAccountUse(user, a);
      const b = { id: nextId(s, 'b'), name: str(op.name, 2, 60, 'Name'), nameAr: optStr(op.nameAr, 60, 'Arabic name'), amount: amount(op), categoryId: checkCategory(s, op.categoryId, 'expense').id, accountId: a.id, day: intIn(op.day, 1, 28, 'Day of month'), active: true, paid: [], createdAt: now };
      s.bills.push(b); audit(s, user, now, 'addBill', `${b.id} ${b.name}`); return { billId: b.id };
    });
  },
  setBillActive(s, op, { user, now }) {
    need(user, EDIT); const b = getBill(s, op.billId);
    b.active = bool(op.active); audit(s, user, now, 'setBillActive', `${b.id} ${b.active}`); return {};
  },
  payBill(s, op, { user, now }) {
    need(user, EDIT);
    return once(s, op, () => {
      const b = getBill(s, op.billId), a = getAccount(s, b.accountId);
      if (!b.active) throw new UserError('This bill is paused');
      checkAccountUse(user, a);
      const m = op.month === undefined ? monthOf(dayKey(now)) : op.month;
      if (!/^\d{4}-\d{2}$/.test(m) || m > monthOf(dayKey(now)) || m < addMonths(monthOf(dayKey(now)), -12)) throw new UserError('Pick a month within the last year');
      if (b.paid.includes(m)) throw new UserError('This month is already paid');
      checkFunds(s, a.id, b.amount);
      const t = makeTx(s, { kind: 'expense', accountId: a.id, categoryId: b.categoryId, amount: b.amount, date: dayKey(now), note: b.name, by: user.id, billId: b.id, billMonth: m }, now);
      b.paid.push(m); audit(s, user, now, 'payBill', `${b.id} ${m}`);
      return { txId: t.id, month: m };
    });
  },
  // ----- debts and installments -----
  addDebt(s, op, { user, now }) {
    need(user, EDIT);
    return once(s, op, () => {
      const d = { id: nextId(s, 'd'), name: str(op.name, 2, 60, 'Name'), nameAr: optStr(op.nameAr, 60, 'Arabic name'), lender: str(op.lender, 2, 60, 'Lender'), principal: intIn(op.principal, 500, 100000000, 'Principal'), installment: intIn(op.installment, 50, 10000000, 'Installment'), months: intIn(op.months, 1, 360, 'Number of months'), startMonth: op.startMonth, paid: [], createdAt: now };
      if (!/^\d{4}-\d{2}$/.test(String(d.startMonth)) || addMonths(d.startMonth, 0) !== d.startMonth) throw new UserError('Start month must look like 2026-01');
      if (monthDiff(d.startMonth, monthOf(dayKey(now))) > 1) throw new UserError('The start month is too far in the future');
      if (d.installment * (d.months - 1) >= d.principal) throw new UserError('The installments already cover the debt; lower the count or the amount');
      d.categoryId = checkCategory(s, op.categoryId, 'expense').id;
      s.debts.push(d); audit(s, user, now, 'addDebt', `${d.id} ${d.name}`); return { debtId: d.id };
    });
  },
  payInstallment(s, op, { user, now }) {
    need(user, EDIT);
    return once(s, op, () => {
      const d = getDebt(s, op.debtId), a = getAccount(s, op.accountId);
      checkAccountUse(user, a);
      if (debtRemaining(d) <= 0) throw new UserError('This debt is fully paid');
      const m = op.month === undefined ? debtNextMonth(d) : op.month;
      if (m !== debtNextMonth(d)) throw new UserError('Installments are paid in order, one month at a time');
      if (d.paid.some((p) => p.month === m)) throw new UserError('This month is already paid');
      const amt = Math.min(d.installment, debtRemaining(d));
      checkFunds(s, a.id, amt);
      const t = makeTx(s, { kind: 'expense', accountId: a.id, categoryId: d.categoryId, amount: amt, date: dayKey(now), note: d.name, by: user.id, debtId: d.id, debtMonth: m }, now);
      d.paid.push({ month: m, amount: amt, txId: t.id });
      audit(s, user, now, 'payInstallment', `${d.id} ${m} ${amt}`);
      return { txId: t.id, month: m, remaining: debtRemaining(d) };
    });
  },
  // ----- CSV import -----
  importTransactions(s, op, { user, now }) {
    need(user, EDIT);
    const rows = op.rows;
    if (!Array.isArray(rows) || !rows.length) throw new UserError('Nothing to import');
    if (rows.length > settings(s).importMax) throw new UserError('At most ' + settings(s).importMax + ' rows per import');
    const out = { added: 0, errors: [] };
    rows.forEach((r, i) => {
      try {
        const key = 'imp-' + str(r && r.key, 4, 60, 'Row key');
        if (s.keys.includes(key)) { out.errors.push({ row: i + 1, message: 'Duplicate row' }); return; }
        addTxInner(s, { ...r, key }, user, now, true);
        s.keys.push(key); if (s.keys.length > 600) s.keys.shift();
        out.added++;
      } catch (e) { out.errors.push({ row: i + 1, message: e instanceof UserError || e instanceof PermError ? e.message : 'Bad row' }); }
    });
    if (out.added) audit(s, user, now, 'importTransactions', `${out.added} rows`);
    return out;
  },
  // ----- settings -----
  setSettings(s, op, { user, now }) {
    need(user, ['owner']); const cur = settings(s);
    s.settings = { ...cur, teenMax: intIn(op.teenMax, 50, 10000, 'Teen limit'), savingsTarget: intIn(op.savingsTarget, 0, 90, 'Savings target') };
    audit(s, user, now, 'setSettings', 'updated'); return {};
  },
};

// Shared by addTx and importTransactions. isImport relaxes the per-op key handling only.
function addTxInner(s, op, user, now, isImport) {
  if (!EDIT.includes(user.role) && user.role !== 'teen') throw new PermError('You do not have permission to do this');
  const kind = oneOf(op.kind, ['income', 'expense', 'transfer'], 'Pick income, expense or transfer');
  if (user.role === 'teen' && kind !== 'expense') throw new PermError('You do not have permission to do this');
  const a = getAccount(s, op.accountId);
  checkAccountUse(user, a);
  const amt = amount(op), date = txDate(op, now);
  const note = optStr(op.note, 120, 'Note');
  if (kind === 'transfer') {
    const to = getAccount(s, op.toAccountId);
    if (to.id === a.id) throw new UserError('Pick a different account to transfer to');
    checkAccountUse(user, to);
    checkFunds(s, a.id, amt);
    const t = makeTx(s, { kind, accountId: a.id, toAccountId: to.id, amount: amt, date, note, by: user.id }, now);
    audit(s, user, now, 'addTx', `${t.id} transfer ${amt}`);
    return { txId: t.id };
  }
  const c = checkCategory(s, op.categoryId, kind);
  if (user.role === 'teen') {
    if (amt > settings(s).teenMax) throw new UserError('The teen limit is ' + settings(s).teenMax + ' EGP per expense');
    if (!c.teen) throw new UserError('This category is not open to the teen wallet');
  }
  if (kind === 'expense') checkFunds(s, a.id, amt);
  const t = makeTx(s, { kind, accountId: a.id, categoryId: c.id, amount: amt, date, note, by: user.id }, now);
  if (!isImport) audit(s, user, now, 'addTx', `${t.id} ${kind} ${amt}`);
  return { txId: t.id };
}
export function applyOp(s, op, ctx) {
  if (!op || typeof op.type !== 'string' || !Object.hasOwn(OPS, op.type)) throw new UserError('Unknown action');
  return OPS[op.type](s, op, ctx);
}
export const OP_NAMES = Object.keys(OPS);

// ---------- reports and insights ----------
export function reports(s, user, now) {
  const today = dayKey(now), m0 = monthOf(today);
  const vis = new Set(visibleAccounts(s, user).map((a) => a.id));
  const txs = s.txs.filter((t) => vis.has(t.accountId) || (t.kind === 'transfer' && vis.has(t.toAccountId)));
  const months = []; for (let i = 11; i >= 0; i--) months.push(addMonths(m0, -i));
  const byMonth = months.map((m) => ({
    m,
    income: txs.filter((t) => t.kind === 'income' && monthOf(t.date) === m).reduce((x, t) => x + t.amount, 0),
    expense: txs.filter((t) => t.kind === 'expense' && monthOf(t.date) === m).reduce((x, t) => x + t.amount, 0),
  }));
  for (const r of byMonth) r.net = r.income - r.expense;
  const inc = incomeOf({ txs }, m0), exp = expenseOf({ txs }, m0);
  const byCat = s.categories.filter((c) => c.kind === 'expense').map((c) => ({
    id: c.id, spent: spentOf({ txs }, c.id, m0), budget: c.budget,
    avg3: Math.round(months.slice(-4, -1).reduce((x, m) => x + spentOf({ txs }, c.id, m), 0) / 3),
  })).filter((c) => c.spent || c.budget || c.avg3).sort((a, b) => b.spent - a.spent);
  const incCat = s.categories.filter((c) => c.kind === 'income').map((c) => ({ id: c.id, total: txs.filter((t) => t.kind === 'income' && t.categoryId === c.id && monthOf(t.date) === m0).reduce((x, t) => x + t.amount, 0) })).filter((c) => c.total);
  const el = monthElapsed(m0, today);
  const insights = [];
  for (const c of byCat) {
    if (c.budget > 0 && c.spent > c.budget) insights.push({ kind: 'over_budget', catId: c.id, spent: c.spent, budget: c.budget });
    else if (c.budget > 0 && c.spent > c.budget * (el + 0.1) && el < 0.9) insights.push({ kind: 'budget_pace', catId: c.id, spent: c.spent, budget: c.budget });
    if (c.avg3 >= 500 && c.spent > c.avg3 * 1.5) insights.push({ kind: 'spike', catId: c.id, spent: c.spent, avg3: c.avg3 });
  }
  if (inc > 0) {
    const rate = Math.round(((inc - exp) / inc) * 100);
    if (rate < settings(s).savingsTarget) insights.push({ kind: 'savings_rate', rate, target: settings(s).savingsTarget });
  }
  const dueBills = user.role === 'teen' ? [] : s.bills.map((b) => ({ id: b.id, due: billDue(b, today) })).filter((b) => b.due);
  for (const b of dueBills) insights.push({ kind: b.due.overdue ? 'bill_overdue' : 'bill_due', billId: b.id, month: b.due.month });
  if (user.role !== 'teen') {
    for (const g of s.goals) {
      const saved = goalSaved(g);
      if (saved >= g.target) continue;
      const total = Math.max(1, monthDiff(monthOf(dayKey(g.createdAt)), monthOf(g.deadline + '-01')));
      const gone = Math.max(0, monthDiff(monthOf(dayKey(g.createdAt)), m0));
      if (gone / total > 0.25 && saved < g.target * (gone / total) * 0.6) insights.push({ kind: 'goal_behind', goalId: g.id, saved, target: g.target });
    }
    for (const d of s.debts) if (debtStatus(d, today) === 'behind') insights.push({ kind: 'debt_behind', debtId: d.id, remaining: debtRemaining(d) });
  }
  return {
    today, byMonth, byCat, incCat,
    totals: {
      income: inc, expense: exp, net: inc - exp,
      savingsRate: inc > 0 ? Math.round(((inc - exp) / inc) * 100) : null,
      netWorth: netWorth(s, user),
      budgetTotal: byCat.reduce((x, c) => x + c.budget, 0),
      spentVsBudget: byCat.reduce((x, c) => x + Math.min(c.spent, c.budget || Infinity), 0),
      goalsSaved: user.role === 'teen' ? 0 : s.goals.reduce((x, g) => x + goalSaved(g), 0),
      debtsRemaining: user.role === 'teen' ? 0 : s.debts.reduce((x, d) => x + debtRemaining(d), 0),
      billsDue: dueBills.length,
    },
    insights,
  };
}
export function csvCell(v) {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
export const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
// Expected columns of the import template, in order. Header row in the client's language.
export const IMPORT_COLS = ['date', 'kind', 'category', 'amount', 'note'];

// ---------- views (what each role may see) ----------
const accountOut = (s, a) => ({ id: a.id, name: a.name, nameAr: a.nameAr, kind: a.kind, private: !!a.private, holder: a.holder || null, active: a.active !== false, opening: a.opening, balance: balanceOf(s, a.id) });
const goalOut = (g, today) => {
  const saved = goalSaved(g);
  const total = Math.max(1, monthDiff(monthOf(dayKey(g.createdAt)), monthOf(g.deadline + '-01')));
  const gone = Math.max(0, monthDiff(monthOf(dayKey(g.createdAt)), monthOf(today)));
  return { id: g.id, name: g.name, nameAr: g.nameAr, target: g.target, deadline: g.deadline, saved, moves: g.moves.slice(-60).reverse(), done: saved >= g.target, expected: Math.min(g.target, Math.round(g.target * (gone / total))) };
};
const billOut = (b, today) => ({ id: b.id, name: b.name, nameAr: b.nameAr, amount: b.amount, categoryId: b.categoryId, accountId: b.accountId, day: b.day, active: b.active, paid: b.paid, due: billDue(b, today) });
const debtOut = (d, today) => ({ id: d.id, name: d.name, nameAr: d.nameAr, lender: d.lender, principal: d.principal, installment: d.installment, months: d.months, startMonth: d.startMonth, categoryId: d.categoryId, paidCount: d.paid.length, paidTotal: debtPaid(d), remaining: debtRemaining(d), nextMonth: debtNextMonth(d), status: debtStatus(d, today), paid: d.paid.slice(-40) });
const txOut = (t) => ({ ...t });
export function view(s, user, now) {
  const today = dayKey(now), st = settings(s);
  const base = { me: { id: user.id, name: user.name, nameAr: user.nameAr, role: user.role }, today, now };
  if (user.role === 'teen') {
    const mine = s.accounts.filter((a) => a.holder === user.id);
    const ids = new Set(mine.map((a) => a.id));
    return {
      ...base, teenMax: st.teenMax,
      accounts: mine.map((a) => accountOut(s, a)),
      categories: s.categories.filter((c) => c.kind === 'expense' && c.teen && !c.archived),
      txs: s.txs.filter((t) => ids.has(t.accountId)).slice(-300).reverse(),
    };
  }
  const vis = new Set(visibleAccounts(s, user).map((a) => a.id));
  const common = {
    ...base,
    accounts: visibleAccounts(s, user).map((a) => accountOut(s, a)),
    categories: s.categories,
    txs: s.txs.filter((t) => vis.has(t.accountId) || (t.kind === 'transfer' && vis.has(t.toAccountId))).slice(-2500).reverse(),
    goals: s.goals.map((g) => goalOut(g, today)),
    bills: s.bills.map((b) => billOut(b, today)),
    debts: s.debts.map((d) => debtOut(d, today)),
    reports: reports(s, user, now),
    settings: { teenMax: st.teenMax, savingsTarget: st.savingsTarget, importMax: st.importMax },
  };
  if (user.role === 'owner') return { ...common, audit: s.audit };
  return common; // partner and advisor read the same family view; the advisor cannot change anything
}
export const OP_ROLES = { addAccount: EDIT, updateAccount: EDIT, addCategory: EDIT, updateCategory: EDIT, archiveCategory: EDIT, addTx: ['owner', 'partner', 'teen'], deleteTx: ['owner'], addGoal: EDIT, goalMove: EDIT, addBill: EDIT, setBillActive: EDIT, payBill: EDIT, addDebt: EDIT, payInstallment: EDIT, importTransactions: EDIT, setSettings: ['owner'] };

// ---------- seed ----------
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function seed(now = Date.now()) {
  const rnd = mulberry32(20261125), pick = (a) => a[Math.floor(rnd() * a.length)], today = dayKey(now), m0 = monthOf(today), tDay = Number(today.slice(8, 10));
  const s = {
    resetAt: now, counters: { a: 0, c: 0, t: 0, g: 0, b: 0, d: 0, m: 0 }, keys: [], settings: { ...DEFAULTS }, audit: [],
    users: [
      { id: 'u-owner', pin: '1111', name: 'Karim Adel', nameAr: 'كريم عادل', role: 'owner' },
      { id: 'u-partner', pin: '2222', name: 'Salma Hany', nameAr: 'سلمى هاني', role: 'partner' },
      { id: 'u-advisor', pin: '3333', name: 'Youssef Nabil', nameAr: 'يوسف نبيل', role: 'advisor' },
      { id: 'u-teen', pin: '4444', name: 'Jana Karim', nameAr: 'جنى كريم', role: 'teen' },
    ],
    accounts: [], categories: [], txs: [], goals: [], bills: [], debts: [],
  };
  const mkAcc = (name, nameAr, kind, opening, priv, holder) => { const a = { id: nextId(s, 'a'), name, nameAr, kind, opening, private: !!priv, holder: holder || null, active: true, createdAt: now - 500 * 864e5 }; s.accounts.push(a); return a; };
  const cash = mkAcc('Cash in hand', 'الكاش في اليد', 'cash', 8000);
  const cbe = mkAcc('CBE current account', 'الحساب الجاري - البنك الأهلي', 'bank', 42000);
  const wal = mkAcc('Vodafone Cash wallet', 'محفظة فودافون كاش', 'wallet', 6000);
  const qnb = mkAcc('QNB savings account', 'حساب التوفير QNB', 'savings', 85000, true);
  const jana = mkAcc("Jana's allowance wallet", 'محفظة مصروف جنى', 'wallet', 500, false, 'u-teen');
  const cat = (name, nameAr, kind, budget, teen) => { const c = { id: nextId(s, 'c'), name, nameAr, kind, budget: budget || 0, teen: !!teen, archived: false }; s.categories.push(c); return c; };
  const cSal = cat('Salary', 'مرتب', 'income');
  const cFree = cat('Freelance work', 'عمل حر', 'income');
  const cOinc = cat('Other income', 'دخل آخر', 'income');
  const cGroc = cat('Groceries', 'مشتريات البيت', 'expense', 9000);
  const cRent = cat('Rent', 'الإيجار', 'expense', 8500);
  const cUtil = cat('Utilities', 'المرافق والفواتير', 'expense', 1500);
  const cTrans = cat('Transport', 'المواصلات', 'expense', 2500);
  const cHealth = cat('Health', 'الصحة', 'expense', 2000);
  const cEdu = cat('Education', 'التعليم', 'expense', 3000);
  const cEat = cat('Eating out', 'الأكل بره', 'expense', 1800, true);
  const cFun = cat('Entertainment', 'الترفيه', 'expense', 1200, true);
  const cCloth = cat('Clothing', 'الملابس', 'expense', 1500, true);
  const cGive = cat('Giving', 'الصدقة والعطاء', 'expense', 1000);
  const cInst = cat('Installments', 'الأقساط', 'expense', 5700);
  const cOther = cat('Other', 'أخرى', 'expense', 800, true);
  const mkBill = (name, nameAr, amount, c, a, day) => { const b = { id: nextId(s, 'b'), name, nameAr, amount, categoryId: c.id, accountId: a.id, day, active: true, paid: [], createdAt: now - 300 * 864e5 }; s.bills.push(b); return b; };
  const bRent = mkBill('Apartment rent', 'إيجار الشقة', 8500, cRent, cbe, 1);
  const bNet = mkBill('Home internet', 'نت المنزل', 450, cUtil, cbe, 8);
  const bElec = mkBill('Electricity', 'الكهرباء', 700, cUtil, wal, 12);
  const bGym = mkBill('Gym membership', 'اشتراك الجيم', 600, cHealth, wal, 15);
  const mkDebt = (name, nameAr, lender, principal, installment, months, startMonth) => { const d = { id: nextId(s, 'd'), name, nameAr, lender, principal, installment, months, startMonth, categoryId: cInst.id, paid: [], createdAt: now - 400 * 864e5 }; s.debts.push(d); return d; };
  const dCar = mkDebt('Car loan', 'قرض السيارة', 'CBE auto loans', 216000, 4500, 48, addMonths(m0, -22));
  const dFurn = mkDebt('Furniture installments', 'أقساط الأثاث', 'B-Tech', 14400, 1200, 12, addMonths(m0, -10));
  const dPhone = mkDebt('Phone installment', 'قسط الموبايل', 'Orange shop', 3600, 600, 6, addMonths(m0, -6));
  const mkGoal = (name, nameAr, target, deadline) => { const g = { id: nextId(s, 'g'), name, nameAr, target, deadline, moves: [], createdAt: now - 180 * 864e5 }; s.goals.push(g); return g; };
  const gEmerg = mkGoal('Emergency fund', 'صندوق الطوارئ', 60000, addDays(today, 300));
  const gUmrah = mkGoal('Umrah trip', 'رحلة العمرة', 30000, addDays(today, 120));
  const gLap = mkGoal('New laptop', 'لابتوب جديد', 45000, addDays(today, 420));
  const OWN = { id: 'u-owner' }, PAR = { id: 'u-partner' }, TEEN = { id: 'u-teen' };
  const tx = (kind, a, to, c, amount, date, note, by, extra) => { const t = { id: nextId(s, 't'), kind, accountId: a.id, toAccountId: to ? to.id : null, categoryId: c ? c.id : null, amount, date, note: note || '', by: by.id, ts: parse(date) + 10 * 3600000, billId: null, billMonth: null, debtId: null, debtMonth: null, ...(extra || {}) }; s.txs.push(t); return t; };
  const gmove = (g, a, amount, dir, date) => g.moves.push({ id: nextId(s, 'm'), accountId: a.id, amount, dir, date, ts: parse(date) + 11 * 3600000, by: OWN.id });
  // Six months of household activity, ending today. Day-capped inside the current month.
  const md = (m, d) => `${m}-${pad(Math.min(d, m === m0 ? tDay : 28), 2)}`;
  // Installments older than the activity window are recorded as paid without individual transactions.
  for (const d of s.debts) {
    for (let m = d.startMonth; m < addMonths(m0, -5); m = addMonths(m, 1)) {
      const amt = Math.min(d.installment, d.principal - d.paid.reduce((x, p) => x + p.amount, 0));
      if (amt <= 0) break;
      d.paid.push({ month: m, amount: amt, txId: null });
    }
  }
  for (let back = 5; back >= 0; back--) {
    const m = addMonths(m0, -back), cur = back === 0;
    // income
    tx('income', cbe, null, cSal, 28000, md(m, 25), 'Monthly salary - Karim', OWN);
    if (!cur || tDay >= 1) tx('income', cbe, null, cSal, 22000, md(m, 1), 'Monthly salary - Salma', PAR);
    if (rnd() < 0.75) tx('income', wal, null, cFree, pick([4000, 4500, 6000, 7500, 9000]), md(m, 5 + Math.floor(rnd() * 14)), 'Freelance project payment', OWN);
    if (rnd() < 0.25) tx('income', cash, null, cOinc, pick([500, 1000, 1500]), md(m, 18), 'Sold old items', PAR);
    // transfers that keep each account funded
    tx('transfer', cbe, qnb, null, 8000, md(m, 2), 'Monthly saving transfer', OWN);
    tx('transfer', cbe, cash, null, 5000, md(m, 2), 'Cash top-up', OWN);
    tx('transfer', cbe, wal, null, 3000, md(m, 2), 'Wallet top-up', OWN);
    tx('transfer', cbe, jana, null, 500, md(m, 3), "Jana's monthly allowance", OWN);
    // recurring bills
    for (const b of s.bills) {
      if (cur && (b.day + 2 > tDay)) continue; // not due yet this month
      if (cur && b.id === bElec.id) continue; // left unpaid on purpose: shows the overdue warning
      const t = tx('expense', s.accounts.find((a) => a.id === b.accountId), null, s.categories.find((c) => c.id === b.categoryId), b.amount, md(m, b.day + 1), b.name, OWN, { billId: b.id, billMonth: m });
      b.paid.push(m); t.billId = b.id; t.billMonth = m;
    }
    // debt installments (every past month; this month is left for the demo to pay)
    for (const d of s.debts) {
      const due = monthDiff(d.startMonth, m);
      if (due < 0 || due >= d.months) continue;
      if (cur) continue;
      const amt = Math.min(d.installment, d.principal - d.paid.reduce((x, p) => x + p.amount, 0));
      if (amt <= 0) continue;
      const t = tx('expense', cbe, null, cInst, amt, md(m, 5), d.name, OWN, { debtId: d.id, debtMonth: m });
      t.debtId = d.id; t.debtMonth = m; d.paid.push({ month: m, amount: amt, txId: t.id });
    }
    // everyday spending
    const gN = cur ? 5 : 5, gAmt = cur ? 1900 : 1700;
    for (let i = 0; i < gN; i++) tx('expense', pick([cbe, cbe, cash]), null, cGroc, gAmt - 400 + Math.floor(rnd() * 700), md(m, 1 + i * 5), pick(['Hyper One weekly shop', 'Local market', 'Bakery and dairy', 'Vegetables and fruit', 'Butcher']), pick([OWN, PAR]));
    for (let i = 0; i < 14; i++) tx('expense', pick([cash, wal]), null, cTrans, 40 + Math.floor(rnd() * 140), md(m, 1 + Math.floor(rnd() * 26)), pick(['Uber ride', 'Metro tickets', 'Microbus', 'Fuel', 'Parking']), pick([OWN, PAR]));
    const eatN = cur ? 5 : 3, eatAmt = cur ? 300 : 150;
    for (let i = 0; i < eatN; i++) tx('expense', pick([cbe, wal]), null, cEat, eatAmt + Math.floor(rnd() * 200), md(m, 2 + i * 4), pick(['Family dinner', 'Foul and falafel', 'Pizza night', 'Coffee with friends', 'Koshary']), pick([OWN, PAR]));
    for (let i = 0; i < 2; i++) tx('expense', pick([cash, wal]), null, cFun, 150 + Math.floor(rnd() * 250), md(m, 6 + i * 9), pick(['Cinema tickets', 'PlayStation credits', 'Book fair', 'Bowling']), PAR);
    if (rnd() < 0.8) tx('expense', cbe, null, cHealth, 250 + Math.floor(rnd() * 450), md(m, 9), pick(['Pharmacy', 'Lab tests', 'Dentist visit']), OWN);
    tx('expense', cbe, null, cEdu, 2500, md(m, 4), 'School installment', OWN);
    if (rnd() < 0.6) tx('expense', cbe, null, cCloth, 400 + Math.floor(rnd() * 700), md(m, 14), pick(['Winter jacket', 'School uniform', 'Shoes']), PAR);
    tx('expense', cash, null, cGive, 300 + Math.floor(rnd() * 400), md(m, 15), 'Monthly giving', OWN);
    tx('expense', wal, null, cUtil, 200 + Math.floor(rnd() * 200), md(m, 17), pick(['Water bill', 'Gas cylinder']), OWN);
    if (rnd() < 0.5) tx('expense', cash, null, cOther, 100 + Math.floor(rnd() * 200), md(m, 20), 'Household bits', PAR);
    // teen spending from her own wallet
    for (let i = 0; i < 5; i++) tx('expense', jana, null, pick([cEat, cFun, cCloth, cOther]), 20 + Math.floor(rnd() * 120), md(m, 2 + i * 4), pick(['Snacks with friends', 'Mobile game credit', 'Hair accessories', 'School supplies', 'Ice cream']), TEEN);
    // savings goals
    if (back <= 5) gmove(gEmerg, qnb, back === 5 ? 8000 : 5000, 'in', md(m, 6));
    if (back <= 3) gmove(gUmrah, cbe, back === 0 ? 2000 : 2500, 'in', md(m, 7));
    if (back === 2) gmove(gLap, qnb, 3000, 'in', md(m, 8));
  }
  s.txs.sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1));
  s.audit = [];
  return s;
}
