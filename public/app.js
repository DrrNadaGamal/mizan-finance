import * as L from './logic.js';
import { T } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('mz.' + k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem('mz.' + k, JSON.stringify(v)), del: (k) => localStorage.removeItem('mz.' + k) };
const rid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
const S = { lang: new URLSearchParams(location.search).get('lang') || LS.get('lang', 'en'), token: LS.get('token', null), me: LS.get('me', null), data: null, busy: false, modal: null, q: '', fkind: '', fcat: '', facc: '', fmonth: '' };
if (!T[S.lang]) S.lang = 'en';
const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
const t = (k) => get(T[S.lang], k) ?? get(T.en, k) ?? k;
const srvErr = (m) => (S.lang === 'ar' && T.ar.srv[m]) || m;
const ar = () => S.lang === 'ar';
const nf = (n, d = 0) => Number(n).toLocaleString(ar() ? 'ar-EG' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const egp = (n) => `${nf(n)} ${t('cur')}`;
const dF = (k) => (k ? new Date(k + 'T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : '');
const mLabel = (m) => new Date(m + '-01T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', month: 'short' });
const nm = (o) => (o ? (ar() && o.nameAr ? o.nameAr : o.name) : '');
const D = () => S.data;
const accOf = (id) => (D()?.accounts || []).find((a) => a.id === id);
const accName = (id) => { const a = accOf(id); return a ? nm(a) : t('privateAccount'); };
const catOf = (id) => (D()?.categories || []).find((c) => c.id === id);
const catName = (id) => { const c = catOf(id); return c ? nm(c) : t('uncategorised'); };
const NAV = {
  owner: ['dashboard', 'accounts', 'transactions', 'budgets', 'goals', 'bills', 'debts', 'reports', 'settings', 'audit'],
  partner: ['dashboard', 'accounts', 'transactions', 'budgets', 'goals', 'bills', 'debts', 'reports'],
  advisor: ['dashboard', 'accounts', 'transactions', 'budgets', 'goals', 'bills', 'debts', 'reports'],
  teen: ['dashboard', 'transactions'],
};
const route = () => {
  const r = (location.hash.replace(/^#\//, '') || '').split('?')[0];
  if (!S.token || !S.me) return 'login';
  const allowed = NAV[S.me.role] || [];
  return allowed.includes(r) ? r : allowed[0];
};
const role = () => S.me?.role;
const canEdit = () => ['owner', 'partner'].includes(role());

// ---------- api ----------
async function api(method, op) {
  let r;
  try { r = await fetch('/api/data', { method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: op ? JSON.stringify({ op }) : undefined }); }
  catch { throw new Error(t('offline')); }
  const j = await r.json().catch(() => null);
  if (r.status === 401 && !(op && op.type === 'login')) { logout(false); throw new Error(t('again')); }
  if (!r.ok) { const e = new Error(srvErr(j?.error) || t('err.server')); e.status = r.status; throw e; }
  return j;
}
async function refresh() { S.data = await api('GET'); }
async function doOp(op, msg) {
  if (S.busy) return null;
  S.busy = true;
  try { const j = await api('POST', op); S.data = j; if (msg) toast(msg); return j.result || {}; }
  catch (e) { toast(e.message, true); return null; } finally { S.busy = false; }
}
function toast(msg, bad) {
  const el = $('#toast'); el.innerHTML = `<div class="${bad ? 'err' : ''}">${esc(msg)}</div>`;
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.innerHTML = ''), 4500);
}
function logout(reload = true) {
  LS.del('token'); LS.del('me'); S.token = null; S.me = null; S.data = null; S.modal = null;
  if (reload) { location.hash = '#/'; render(); }
}

// ---------- small views ----------
const pill = (txt, cls = '') => `<span class="pill ${cls}">${esc(txt)}</span>`;
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
const meter = (a, b, cls = '') => `<div class="meter ${cls}" role="progressbar" aria-valuenow="${pct(a, b)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct(a, b)}%"></i></div>`;
const sel = (id, opts, cur, extra = '') => `<select id="${id}" ${extra}>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const field = (id, label, inner) => `<div class="f"><label for="${id}">${esc(label)}</label>${inner}</div>`;
const inp = (id, label, v = '', attrs = '') => field(id, label, `<input id="${id}" value="${esc(v)}" ${attrs}>`);
const chk = (id, label, on) => `<label class="chk"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${esc(label)}</label>`;
const val = (id) => $(id)?.value?.trim() ?? '';
const checked = (id) => !!$(id)?.checked;
const modalBg = (inner, wide) => `<div class="modal-bg" data-act="bg"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${inner}</div></div>`;
const mhead = (title) => `<div class="bar"><h2>${esc(title)}</h2><span class="sp"></span><button class="btn sm" data-act="close">${esc(t('b.close'))}</button></div>`;
const kpi = (n, l, s = '', cls = '') => `<div class="card kpi ${cls}"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;
const opts = (list, ns) => list.map((x) => [x, t(ns + '.' + x)]);
const tbl = (head, rows, empty) => `<div class="tw"><table><thead><tr>${head.map((h) => `<th${h[1] ? ' class="num"' : ''}>${esc(Array.isArray(h) ? h[0] : h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="empty">${esc(empty || t('none'))}</td></tr>`}</tbody></table></div>`;
const LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#1e5e4e"/><path d="M24 9v30M10 15h28" stroke="#f4b740" stroke-width="3.4" stroke-linecap="round"/><path d="M14 15l-5 9h10zM34 15l-5 9h10z" fill="#f4b740"/><path d="M9 24a5 5 0 0 0 10 0M29 24a5 5 0 0 0 10 0" fill="none" stroke="#f4b740" stroke-width="2.4"/></svg>';
function shell(inner) {
  const nav = NAV[role()].map((r) => `<a href="#/${r}" class="${route() === r ? 'on' : ''}">${esc(t('nav.' + r))}${r === 'bills' && D().reports?.totals.billsDue ? ` <b class="dot">${D().reports.totals.billsDue}</b>` : ''}</a>`).join('');
  return `<div class="top"><a class="brand" href="#/${NAV[role()][0]}">${LOGO}<span>${esc(t('appName'))}<small>${esc(t('appSub'))}</small></span></a>
    <nav class="nav">${nav}</nav><div class="tools"><span class="pill">${esc(t('role.' + role()))} · ${esc(nm(S.me))}</span>
    <button class="btn ghost sm" data-act="lang">${esc(t('other'))}</button><button class="btn ghost sm" data-act="logout">${esc(t('logout'))}</button></div></div><main>${inner}</main>${modalHtml()}`;
}
function loginPage() {
  return `<div class="login"><div class="logo">${LOGO}<div><h1>${esc(t('appName'))}</h1><p class="sub">${esc(t('appSub'))}</p></div></div>
    <div class="card"><p class="muted">${esc(t('demoNote'))}</p>
    <div class="demo-users">${L.DEMO_USERS.map((u) => `<button class="btn" data-act="pin" data-pin="${u.pin}"><span>${esc(ar() ? u.labelAr : u.label)}</span><b>${u.pin}</b></button>`).join('')}</div>
    <div class="f"><label for="pin">${esc(t('pin'))}</label><input id="pin" class="big" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="••••"></div>
    <button class="btn pri big" data-act="login" style="width:100%">${esc(t('signin'))}</button>
    <p class="muted small">${esc(t('limits'))}</p><div class="row" style="margin-top:.4rem"><button class="btn sm" data-act="lang">${esc(t('other'))}</button></div></div></div>`;
}

// ---------- dashboard ----------
function pairChart(rows) {
  const mx = Math.max(1, ...rows.map((r) => Math.max(r.income, r.expense)));
  return `<div class="bars2" role="img" aria-label="${esc(t('incExp'))}">${rows.map((r) => `<div class="col2" title="${esc(mLabel(r.m) + ': ' + egp(r.income) + ' / ' + egp(r.expense))}"><div class="pair"><div class="b" style="height:${Math.round((r.income / mx) * 100)}%"></div><div class="b alt" style="height:${Math.round((r.expense / mx) * 100)}%"></div></div><small>${esc(mLabel(r.m))}</small></div>`).join('')}</div>
  <div class="leg"><span><i></i>${esc(t('tkind.income'))}</span><span><i class="alt"></i>${esc(t('tkind.expense'))}</span></div>`;
}
function insightText(i) {
  const R = D().reports;
  const k = i.kind;
  if (k === 'over_budget') return t('ins.over_budget').replace('{c}', catName(i.catId)).replace('{s}', egp(i.spent)).replace('{b}', egp(i.budget));
  if (k === 'budget_pace') return t('ins.budget_pace').replace('{c}', catName(i.catId)).replace('{s}', egp(i.spent)).replace('{b}', egp(i.budget));
  if (k === 'spike') return t('ins.spike').replace('{c}', catName(i.catId)).replace('{s}', egp(i.spent)).replace('{a}', egp(i.avg3));
  if (k === 'savings_rate') return t('ins.savings_rate').replace('{r}', nf(i.rate)).replace('{t}', nf(i.target));
  if (k === 'bill_overdue' || k === 'bill_due') { const b = (D().bills || []).find((x) => x.id === i.billId); return t('ins.' + k).replace('{b}', nm(b)).replace('{d}', nf(b ? b.day : '')); }
  if (k === 'goal_behind') { const g = (D().goals || []).find((x) => x.id === i.goalId); return t('ins.goal_behind').replace('{g}', nm(g)).replace('{s}', egp(i.saved)).replace('{t}', egp(i.target)); }
  if (k === 'debt_behind') { const d = (D().debts || []).find((x) => x.id === i.debtId); return t('ins.debt_behind').replace('{d}', nm(d)); }
  return k;
}
const insPill = (k) => pill(t('st.' + (k === 'over_budget' || k === 'bill_overdue' || k === 'debt_behind' ? 'overdue' : k === 'spike' || k === 'budget_pace' || k === 'goal_behind' || k === 'savings_rate' ? 'due' : 'active')), k === 'over_budget' || k === 'bill_overdue' || k === 'debt_behind' ? 'bad' : 'off');
function pgDashboard() {
  const d = D();
  if (role() === 'teen') {
    const a = d.accounts[0], bal = a ? a.balance : 0;
    const thisM = d.txs.filter((x) => x.kind === 'expense' && x.date.startsWith(d.today.slice(0, 7))).reduce((x, y) => x + y.amount, 0);
    return `<div class="bar"><h1>${esc(t('teenWallet'))}</h1><span class="sp"></span><button class="btn pri" data-act="newtx">${esc(t('b.spend'))}</button></div>
    <p class="notice">${esc(t('teenNote').replace('{n}', nf(d.teenMax)))}</p>
    <div class="grid kpis">${kpi(egp(bal), t('k.balance'))}${kpi(egp(thisM), t('k.expense'))}${kpi(nf(d.txs.length), t('nav.transactions'))}</div>
    <section class="card" style="margin-top:1rem"><h2>${esc(t('nav.transactions'))}</h2>${txRows(d.txs.slice(0, 12), true)}</section>`;
  }
  const r = d.reports, tt = r.totals;
  return `<div class="bar"><h1>${esc(t('nav.dashboard'))}</h1><span class="sp"></span>${canEdit() ? `<button class="btn pri" data-act="newtx">${esc(t('b.addTx'))}</button>` : ''}</div>
  ${role() === 'advisor' ? `<p class="notice">${esc(t('advisorNote'))}</p>` : ''}
  <div class="grid kpis">${kpi(egp(tt.netWorth), t('k.netWorth'), '', tt.netWorth >= 0 ? 'good' : 'warn')}${kpi(egp(tt.income), t('k.income'))}${kpi(egp(tt.expense), t('k.expense'), egp(tt.budgetTotal) + ' ' + t('k.ofBudget'))}${kpi(tt.savingsRate === null ? '—' : tt.savingsRate + '%', t('k.savingsRate'), t('k.vsTarget').replace('{n}', nf(d.settings.savingsTarget)), tt.savingsRate !== null && tt.savingsRate < d.settings.savingsTarget ? 'warn' : 'good')}${kpi(nf(tt.billsDue), t('k.billsDue'), '', tt.billsDue ? 'warn' : 'good')}${kpi(egp(tt.debtsRemaining), t('k.debtsLeft'))}</div>
  <div class="grid two" style="margin-top:1rem">
  <section class="card"><h2>${esc(t('incExp'))}</h2>${pairChart(r.byMonth)}</section>
  <section class="card"><h2>${esc(t('insights'))}</h2>
  ${r.insights.length ? r.insights.map((i) => `<div class="att-row"><span>${insPill(i.kind)} ${esc(insightText(i))}</span></div>`).join('') : `<p class="empty">${esc(t('none'))}</p>`}</section></div>
  <div class="grid two" style="margin-top:1rem">
  <section class="card"><h2>${esc(t('nav.accounts'))}</h2>${d.accounts.map((a) => `<div class="mrow"><div><b>${esc(nm(a))}</b> <span class="small muted">${esc(t('akind.' + a.kind))}${a.private ? ' · ' + esc(t('f.private')) : ''}</span></div><b class="num">${esc(egp(a.balance))}</b></div>`).join('')}</section>
  <section class="card"><h2>${esc(t('nav.budgets'))}</h2>${r.byCat.filter((c) => c.budget > 0).slice(0, 6).map((c) => `<div class="mrow"><div style="flex:1"><b>${esc(catName(c.id))}</b><div class="small muted">${esc(egp(c.spent))} / ${esc(egp(c.budget))}</div>${meter(c.spent, c.budget, c.spent > c.budget ? 'bad' : '')}</div></div>`).join('') || `<p class="empty">${esc(t('noBudget'))}</p>`}</section></div>`;
}

// ---------- accounts ----------
function pgAccounts() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.accounts'))}</h1><span class="sp"></span>${canEdit() ? `<button class="btn pri" data-act="newacc">${esc(t('b.addAccount'))}</button><button class="btn" data-act="newtransfer">${esc(t('b.transfer'))}</button>` : ''}</div>
  <p class="muted small">${esc(t('accountsNote'))}</p>
  <div class="grid two">${d.accounts.map((a) => `<article class="card"><div class="mc-h"><div><h2>${esc(nm(a))}</h2><div class="muted small">${esc(t('akind.' + a.kind))}${a.private ? ' · ' + esc(t('f.private')) : ''}${a.holder ? ' · ' + esc(t('teenWallet')) : ''}</div></div>${a.active ? pill(t('st.active')) : pill(t('st.archived'), 'gray')}</div>
  <div class="big-n">${esc(egp(a.balance))}</div>
  ${canEdit() && !a.holder ? `<div class="acts1"><button class="btn sm" data-act="editacc" data-id="${a.id}">${esc(t('b.edit'))}</button>${a.active ? `<button class="btn sm" data-act="archacc" data-id="${a.id}">${esc(t('b.archive'))}</button>` : `<button class="btn sm" data-act="unarchacc" data-id="${a.id}">${esc(t('b.unarchive'))}</button>`}</div>` : ''}</article>`).join('')}</div>`;
}
function accForm(a) {
  const e = !!a;
  return modalBg(`${mhead(e ? t('b.edit') : t('b.addAccount'))}
  ${inp('ac-name', t('f.name'), e ? a.name : '', 'maxlength="50"')}${inp('ac-nameAr', t('f.nameAr'), e ? a.nameAr : '', 'maxlength="50" dir="rtl"')}
  ${field('ac-kind', t('f.kind'), sel('ac-kind', opts(L.ACCOUNT_KINDS, 'akind'), e ? a.kind : 'bank'))}
  ${inp('ac-opening', t('f.opening'), e ? a.opening : '0', 'type="number" min="0" inputmode="numeric"')}
  ${role() === 'owner' ? chk('ac-private', t('f.private'), e && a.private) : ''}
  <div class="acts"><button class="btn pri" data-act="saveacc" ${e ? `data-id="${a.id}"` : ''}>${esc(t('b.save'))}</button></div>`);
}
function transferForm() {
  const d = D(), usable = d.accounts.filter((a) => a.active);
  const ao = usable.map((a) => [a.id, nm(a) + ' · ' + egp(a.balance)]);
  return modalBg(`${mhead(t('b.transfer'))}
  ${field('tr-from', t('f.from'), sel('tr-from', ao, usable[0]?.id))}${field('tr-to', t('f.to'), sel('tr-to', ao, usable[1]?.id ?? usable[0]?.id))}
  ${inp('tr-amt', t('f.amount') + ' (' + t('cur') + ')', '', 'type="number" min="1" inputmode="numeric"')}${inp('tr-note', t('f.note'), '', 'maxlength="120"')}
  <div class="acts"><button class="btn pri" data-act="savetransfer">${esc(t('b.transfer'))}</button></div>`);
}

// ---------- transactions ----------
function txLabel(x) {
  if (x.kind === 'transfer') return `${accName(x.accountId)} → ${accName(x.toAccountId)}`;
  return catName(x.categoryId);
}
function txRows(list, teenView) {
  return tbl([[t('f.date')], teenView ? null : [t('f.account')], [t('f.kind')], [t('f.category')], [t('f.note')], [t('f.amount'), 1], canEdit() || role() === 'owner' ? [t('auditAction')] : null].filter(Boolean),
    list.map((x) => `<tr>
      <td>${esc(dF(x.date))}</td>
      ${teenView ? '' : `<td>${esc(accName(x.accountId))}${x.kind === 'transfer' ? ' → ' + esc(accName(x.toAccountId)) : ''}</td>`}
      <td>${pill(t('tkind.' + x.kind), x.kind === 'income' ? '' : x.kind === 'expense' ? 'bad' : 'ice')}</td>
      <td>${esc(x.kind === 'transfer' ? '—' : catName(x.categoryId))}</td>
      <td class="small">${esc(x.note)}${x.billId ? ' · ' + pill(t('nav.bills'), 'ice') : ''}${x.debtId ? ' · ' + pill(t('nav.debts'), 'ice') : ''}</td>
      <td class="num ${x.kind === 'income' ? 'ok-t' : x.kind === 'expense' ? 'neg' : ''}">${x.kind === 'income' ? '+' : x.kind === 'expense' ? '−' : ''}${esc(nf(x.amount))}</td>
      ${role() === 'owner' ? `<td><button class="btn sm danger" data-act="deltx" data-id="${x.id}">${esc(t('b.delete'))}</button></td>` : canEdit() ? '<td></td>' : ''}
    </tr>`), t('noTx'));
}
function pgTransactions() {
  const d = D(), teen = role() === 'teen';
  const months = []; for (let i = 0; i < 12; i++) months.push(L.addMonths(d.today.slice(0, 7), -i));
  let list = d.txs;
  if (!teen) {
    if (S.fkind) list = list.filter((x) => x.kind === S.fkind);
    if (S.fcat) list = list.filter((x) => x.categoryId === S.fcat);
    if (S.facc) list = list.filter((x) => x.accountId === S.facc || x.toAccountId === S.facc);
    if (S.fmonth) list = list.filter((x) => x.date.startsWith(S.fmonth));
  }
  if (S.q) { const q = S.q.toLowerCase(); list = list.filter((x) => (x.note || '').toLowerCase().includes(q) || String(x.amount).includes(q)); }
  const shown = list.slice(0, 300);
  return `<div class="bar"><h1>${esc(t('nav.transactions'))}</h1><span class="sp"></span>
  ${teen ? `<button class="btn pri" data-act="newtx">${esc(t('b.spend'))}</button>` : ''}
  ${canEdit() ? `<button class="btn pri" data-act="newtx">${esc(t('b.addTx'))}</button><button class="btn" data-act="importopen">${esc(t('b.import'))}</button><button class="btn" data-act="csvtx">${esc(t('b.csv'))}</button>` : ''}</div>
  <div class="filters"><input type="search" id="txq" placeholder="${esc(t('searchTx'))}" value="${esc(S.q)}">
  ${teen ? '' : `${sel('f-kind', [['', t('any')], ...opts(['income', 'expense', 'transfer'], 'tkind')], S.fkind, 'data-act-change="fkind"')}
  ${sel('f-cat', [['', t('any')], ...d.categories.map((c) => [c.id, nm(c)])], S.fcat, 'data-act-change="fcat"')}
  ${sel('f-acc', [['', t('any')], ...d.accounts.map((a) => [a.id, nm(a)])], S.facc, 'data-act-change="facc"')}
  ${sel('f-month', [['', t('any')], ...months.map((m) => [m, mLabel(m) + ' ' + m.slice(0, 4)])], S.fmonth, 'data-act-change="fmonth"')}`}</div>
  ${list.length > shown.length ? `<p class="muted small">${esc(t('firstN').replace('{n}', nf(shown.length)))}</p>` : ''}
  ${txRows(shown, teen)}`;
}
function txForm() {
  const d = D(), teen = role() === 'teen';
  const usable = d.accounts.filter((a) => a.active);
  const kinds = teen ? ['expense'] : ['expense', 'income', 'transfer'];
  const cats = (k) => d.categories.filter((c) => !c.archived && c.kind === k && (!teen || c.teen));
  const curKind = S.modal.kind || kinds[0];
  const m = S.modal.preMonth || d.today.slice(0, 7);
  return modalBg(`${mhead(teen ? t('b.spend') : t('b.addTx'))}
  ${field('tx-kind', t('f.kind'), sel('tx-kind', opts(kinds, 'tkind'), curKind, 'data-act-change="txkind"'))}
  ${field('tx-acc', t('f.account'), sel('tx-acc', usable.map((a) => [a.id, nm(a) + ' · ' + egp(a.balance)]), S.modal.accId || usable[0]?.id))}
  ${curKind === 'transfer' ? field('tx-to', t('f.to'), sel('tx-to', usable.map((a) => [a.id, nm(a)]), usable[1]?.id ?? usable[0]?.id)) : field('tx-cat', t('f.category'), sel('tx-cat', cats(curKind).map((c) => [c.id, nm(c)]), S.modal.catId || cats(curKind)[0]?.id))}
  ${inp('tx-amt', t('f.amount') + ' (' + t('cur') + (teen ? ', ≤ ' + nf(d.teenMax) : '') + ')', '', 'type="number" min="1" inputmode="numeric"')}
  ${inp('tx-date', t('f.date'), S.modal.date || d.today, 'type="date" max="' + d.today + '"')}
  ${inp('tx-note', t('f.note'), S.modal.note || '', 'maxlength="120"')}
  <div class="acts"><button class="btn pri" data-act="savetx">${esc(t('b.save'))}</button></div>`);
}
function importModal() {
  const m = S.modal, d = D();
  const usable = d.accounts.filter((a) => a.active && !a.holder);
  let body;
  if (m.result) {
    body = `<div class="notice ${m.result.errors.length ? '' : 'ok'}"><b>${esc(t('msg.imported').replace('{n}', nf(m.result.added)).replace('{m}', nf(m.result.errors.length)))}</b></div>
    ${m.result.errors.length ? `<ul class="rules">${m.result.errors.slice(0, 10).map((e) => `<li>${esc(t('rowErr').replace('{r}', nf(e.row)).replace('{m}', srvErr(e.message)))}</li>`).join('')}</ul>` : ''}
    <div class="acts"><button class="btn pri" data-act="close">${esc(t('b.close'))}</button></div>`;
  } else {
    body = `${field('im-acc', t('toImport'), sel('im-acc', usable.map((a) => [a.id, nm(a)]), usable[0]?.id))}
    <p class="muted small">${esc(t('importNote'))}</p>
    ${field('im-file', 'CSV', `<input id="im-file" type="file" accept=".csv,text/csv">`)}
    <div class="acts"><button class="btn" data-act="imptemplate">${esc(t('b.template'))}</button><button class="btn pri" data-act="doimport">${esc(t('b.import'))}</button></div>`;
  }
  return modalBg(`${mhead(t('importTitle'))}${body}`, true);
}

// ---------- budgets ----------
function pgBudgets() {
  const d = D(), r = d.reports;
  const el = Math.round(L.monthElapsed(d.today.slice(0, 7), d.today) * 100);
  const rows = d.categories.filter((c) => c.kind === 'expense' && !c.archived).map((c) => {
    const bc = r.byCat.find((x) => x.id === c.id) || { spent: 0, avg3: 0 };
    return { c, ...bc };
  });
  return `<div class="bar"><h1>${esc(t('nav.budgets'))}</h1><span class="sp"></span>${canEdit() ? `<button class="btn pri" data-act="newcat">${esc(t('b.save'))} +</button>` : ''}</div>
  <p class="muted small">${esc(t('budgetsNote'))}</p>
  ${tbl([[t('f.category')], [t('spent'), 1], [t('f.budget'), 1], [t('monthlyAvg'), 1], [t('progress')], [t('status')], canEdit() ? [t('auditAction')] : null].filter(Boolean),
    rows.map((x) => `<tr>
      <td><b>${esc(nm(x.c))}</b>${x.c.teen ? ' · ' + pill(t('teenWallet'), 'ice') : ''}</td>
      <td class="num">${esc(nf(x.spent))}</td>
      <td class="num">${x.c.budget ? esc(nf(x.c.budget)) : esc(t('noBudget'))}</td>
      <td class="num">${esc(nf(x.avg3))}</td>
      <td style="min-width:9rem">${x.c.budget ? `<div class="pacemeter">${meter(x.spent, x.c.budget, x.spent > x.c.budget ? 'bad' : '')}<i class="pace" style="inset-inline-start:${el}%"></i></div>` : ''}</td>
      <td>${!x.c.budget ? '' : x.spent > x.c.budget ? pill(t('st.overdue'), 'bad') : x.spent > x.c.budget * (el / 100 + 0.1) ? pill(t('st.due'), 'off') : pill(t('st.on_track'))}</td>
      ${canEdit() ? `<td><button class="btn sm" data-act="editcat" data-id="${x.c.id}">${esc(t('b.edit'))}</button></td>` : ''}
    </tr>`), t('none'))}`;
}
function catForm(c) {
  const e = !!c;
  return modalBg(`${mhead(e ? t('b.edit') + ' · ' + nm(c) : t('f.category'))}
  ${inp('ct-name', t('f.name'), e ? c.name : '', 'maxlength="40"')}${inp('ct-nameAr', t('f.nameAr'), e ? c.nameAr : '', 'maxlength="40" dir="rtl"')}
  ${field('ct-kind', t('f.kind'), sel('ct-kind', opts(['expense', 'income'], 'tkind'), e ? c.kind : 'expense'))}
  ${inp('ct-budget', t('f.budget') + ' (0 = ' + t('noBudget') + ')', e ? c.budget : '0', 'type="number" min="0" inputmode="numeric"')}
  ${chk('ct-teen', t('teenWallet'), e && c.teen)}
  <div class="acts">${e && canEdit() && !c.archived ? `<button class="btn danger" data-act="archcat" data-id="${c.id}">${esc(t('b.archive'))}</button>` : ''}<button class="btn pri" data-act="savecat" ${e ? `data-id="${c.id}"` : ''}>${esc(t('b.save'))}</button></div>`);
}

// ---------- goals ----------
function pgGoals() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.goals'))}</h1><span class="sp"></span>${canEdit() ? `<button class="btn pri" data-act="newgoal">${esc(t('b.addGoal'))}</button>` : ''}</div>
  <p class="muted small">${esc(t('goalsNote'))}</p>
  <div class="grid two">${d.goals.map((g) => {
    const late = !g.done && g.saved < g.expected;
    const days = Math.max(0, Math.round((new Date(g.deadline + 'T00:00:00Z') - new Date(d.today + 'T00:00:00Z')) / 864e5));
    return `<article class="card"><div class="mc-h"><div><h2>${esc(nm(g))}</h2><div class="muted small">${esc(dF(g.deadline))} · ${esc(t('daysLeft').replace('{n}', nf(days)))}</div></div>${g.done ? pill(t('st.done')) : late ? pill(t('st.behind'), 'off') : pill(t('st.on_track'))}</div>
    <div class="big-n">${esc(egp(g.saved))} <span class="small muted">${esc(t('ofTarget'))} ${esc(egp(g.target))}</span></div>${meter(g.saved, g.target, g.done ? '' : late ? 'off' : '')}
    <p class="small muted">${esc(t('expectedByNow'))}: ${esc(egp(g.expected))} (${pct(g.saved, g.target)}%)</p>
    ${canEdit() ? `<div class="acts1"><button class="btn sm" data-act="goalmove" data-id="${g.id}" data-dir="in">${esc(t('b.addMoney'))}</button><button class="btn sm" data-act="goalmove" data-id="${g.id}" data-dir="out">${esc(t('b.withdraw'))}</button></div>` : ''}</article>`;
  }).join('') || `<p class="empty">${esc(t('noGoals'))}</p>`}</div>`;
}
function goalForm() {
  return modalBg(`${mhead(t('b.addGoal'))}
  ${inp('gl-name', t('f.name'), '', 'maxlength="60"')}${inp('gl-nameAr', t('f.nameAr'), '', 'maxlength="60" dir="rtl"')}
  ${inp('gl-target', t('f.target') + ' (' + t('cur') + ')', '', 'type="number" min="500" inputmode="numeric"')}
  ${inp('gl-deadline', t('f.deadline'), '', 'type="date" min="' + D().today + '"')}
  <div class="acts"><button class="btn pri" data-act="savegoal">${esc(t('b.save'))}</button></div>`);
}
function goalMoveForm(g, dir) {
  const usable = D().accounts.filter((a) => a.active && !a.holder);
  return modalBg(`${mhead((dir === 'in' ? t('b.addMoney') : t('b.withdraw')) + ' · ' + nm(g))}
  <p class="muted small">${esc(egp(g.saved))} / ${esc(egp(g.target))}</p>
  ${field('gm-acc', t('f.account'), sel('gm-acc', usable.map((a) => [a.id, nm(a) + ' · ' + egp(a.balance)]), usable[0]?.id))}
  ${inp('gm-amt', t('f.amount') + ' (' + t('cur') + ')', '', 'type="number" min="1" inputmode="numeric"')}
  <div class="acts"><button class="btn pri" data-act="savegoalmove" data-id="${g.id}" data-dir="${dir}">${esc(t('b.save'))}</button></div>`);
}

// ---------- bills ----------
function pgBills() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.bills'))}</h1><span class="sp"></span>${canEdit() ? `<button class="btn pri" data-act="newbill">${esc(t('b.addBill'))}</button>` : ''}</div>
  <p class="muted small">${esc(t('billsNote'))}</p>
  ${tbl([[t('f.name')], [t('f.category')], [t('f.account')], [t('f.day')], [t('f.amount'), 1], [t('status')], canEdit() ? [t('auditAction')] : null].filter(Boolean),
    d.bills.map((b) => `<tr>
      <td><b>${esc(nm(b))}</b></td><td>${esc(catName(b.categoryId))}</td><td>${esc(accName(b.accountId))}</td><td>${nf(b.day)}</td><td class="num">${esc(nf(b.amount))}</td>
      <td>${!b.active ? pill(t('st.paused'), 'gray') : b.due ? (b.due.overdue ? pill(t('st.overdue'), 'bad') : pill(t('st.due'), 'off')) : pill(t('st.paid'))}</td>
      ${canEdit() ? `<td class="acts1">${b.due ? `<button class="btn sm pri" data-act="paybill" data-id="${b.id}">${esc(t('b.payMonth'))}</button>` : ''}<button class="btn sm" data-act="togglebill" data-id="${b.id}" data-on="${b.active ? '0' : '1'}">${esc(b.active ? t('b.pause') : t('b.resume'))}</button></td>` : ''}
    </tr>`), t('none'))}`;
}
function billForm() {
  const d = D();
  const usable = d.accounts.filter((a) => a.active && !a.holder);
  return modalBg(`${mhead(t('b.addBill'))}
  ${inp('bl-name', t('f.name'), '', 'maxlength="60"')}${inp('bl-nameAr', t('f.nameAr'), '', 'maxlength="60" dir="rtl"')}
  ${inp('bl-amt', t('f.amount') + ' (' + t('cur') + ')', '', 'type="number" min="1" inputmode="numeric"')}
  const ecats = d.categories.filter((c) => c.kind === 'expense' && !c.archived);
  ${field('bl-cat', t('f.category'), sel('bl-cat', ecats.map((c) => [c.id, nm(c)]), ecats[0]?.id))}
  ${field('bl-acc', t('f.account'), sel('bl-acc', usable.map((a) => [a.id, nm(a)]), usable[0]?.id))}
  ${inp('bl-day', t('f.day') + ' (1-28)', '1', 'type="number" min="1" max="28" inputmode="numeric"')}
  <div class="acts"><button class="btn pri" data-act="savebill">${esc(t('b.save'))}</button></div>`);
}

// ---------- debts ----------
function pgDebts() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.debts'))}</h1><span class="sp"></span>${canEdit() ? `<button class="btn pri" data-act="newdebt">${esc(t('b.addDebt'))}</button>` : ''}</div>
  <p class="muted small">${esc(t('debtsNote'))}</p>
  <div class="grid two">${d.debts.map((x) => `<article class="card"><div class="mc-h"><div><h2>${esc(nm(x))}</h2><div class="muted small">${esc(x.lender)} · ${esc(t('paidMonths').replace('{n}', nf(x.paidCount)).replace('{m}', nf(x.months)))}</div></div>${pill(t('st.' + x.status), x.status === 'paid_off' ? '' : x.status === 'behind' ? 'bad' : 'ice')}</div>
  <div class="big-n">${esc(egp(x.remaining))} <span class="small muted">${esc(t('remaining'))}</span></div>${meter(x.paidTotal, x.principal)}
  <p class="small muted">${esc(egp(x.installment))} / ${esc(t('f.month'))} · ${x.nextMonth ? esc(t('nextDue') + ': ' + mLabel(x.nextMonth) + ' ' + x.nextMonth.slice(0, 4)) : ''}</p>
  <div class="acts1">${canEdit() && x.remaining > 0 ? `<button class="btn sm pri" data-act="payinst" data-id="${x.id}">${esc(t('b.payMonth'))}</button>` : ''}<button class="btn sm" data-act="sched" data-id="${x.id}">${esc(t('schedule'))}</button></div></article>`).join('') || `<p class="empty">${esc(t('noDebts'))}</p>`}</div>`;
}
function debtForm() {
  const d = D();
  return modalBg(`${mhead(t('b.addDebt'))}
  ${inp('db-name', t('f.name'), '', 'maxlength="60"')}${inp('db-nameAr', t('f.nameAr'), '', 'maxlength="60" dir="rtl"')}
  ${inp('db-lender', t('f.lender'), '', 'maxlength="60"')}
  ${inp('db-principal', t('f.principal') + ' (' + t('cur') + ')', '', 'type="number" min="500" inputmode="numeric"')}
  ${inp('db-inst', t('f.installment') + ' (' + t('cur') + ')', '', 'type="number" min="50" inputmode="numeric"')}
  ${inp('db-months', t('f.months'), '', 'type="number" min="1" max="360" inputmode="numeric"')}
  ${inp('db-start', t('f.startMonth'), d.today.slice(0, 7), 'type="month"')}
  ${field('db-cat', t('f.category'), sel('db-cat', d.categories.filter((c) => c.kind === 'expense' && !c.archived).map((c) => [c.id, nm(c)])))}
  <div class="acts"><button class="btn pri" data-act="savedebt">${esc(t('b.save'))}</button></div>`);
}
function payInstForm(x) {
  const usable = D().accounts.filter((a) => a.active && !a.holder);
  const amt = Math.min(x.installment, x.remaining);
  return modalBg(`${mhead(t('b.payMonth') + ' · ' + nm(x))}
  <p class="muted small">${esc(mLabel(x.nextMonth) + ' ' + x.nextMonth.slice(0, 4))} · ${esc(egp(amt))} · ${esc(t('remaining'))}: ${esc(egp(x.remaining))}</p>
  ${field('pi-acc', t('f.account'), sel('pi-acc', usable.map((a) => [a.id, nm(a) + ' · ' + egp(a.balance)]), usable[0]?.id))}
  <div class="acts"><button class="btn pri" data-act="dopayinst" data-id="${x.id}">${esc(t('b.pay'))} ${esc(nf(amt))}</button></div>`);
}
function schedModal(x) {
  const rows = []; let run = 0;
  for (let i = 0; i < x.months; i++) {
    const m = L.addMonths(x.startMonth, i);
    const p = x.paid.find((pp) => pp.month === m);
    const amt = p ? p.amount : Math.min(x.installment, Math.max(0, x.principal - run));
    run += amt;
    rows.push(`<tr><td>${esc(mLabel(m) + ' ' + m.slice(0, 4))}</td><td class="num">${esc(nf(amt))}</td><td>${p ? pill(t('st.paid')) : m === x.nextMonth ? pill(t('st.due'), 'off') : pill('—', 'gray')}</td></tr>`);
  }
  return modalBg(`${mhead(t('schedule') + ' · ' + nm(x))}${tbl([[t('f.month')], [t('f.amount'), 1], [t('status')]], rows, t('none'))}`, true);
}

// ---------- reports ----------
function pgReports() {
  const d = D(), r = d.reports;
  const maxCat = Math.max(1, ...r.byCat.map((c) => c.spent));
  return `<div class="bar"><h1>${esc(t('nav.reports'))}</h1><span class="sp"></span>${canEdit() ? `<button class="btn" data-act="csvreport">${esc(t('b.csv'))}</button>` : ''}</div>
  <div class="grid two">
  <section class="card"><h2>${esc(t('monthly'))}</h2>
  ${tbl([[t('f.month')], [t('tkind.income'), 1], [t('tkind.expense'), 1], [t('netEach'), 1]], r.byMonth.slice().reverse().map((x) => `<tr><td>${esc(mLabel(x.m) + ' ' + x.m.slice(0, 4))}</td><td class="num ok-t">${esc(nf(x.income))}</td><td class="num neg">${esc(nf(x.expense))}</td><td class="num ${x.net < 0 ? 'neg' : 'ok-t'}">${esc(nf(x.net))}</td></tr>`), t('none'))}</section>
  <section class="card"><h2>${esc(t('incExp'))}</h2>${pairChart(r.byMonth)}</section></div>
  <div class="grid two" style="margin-top:1rem">
  <section class="card"><h2>${esc(t('spendByCat'))}</h2><div class="hbars">${r.byCat.map((c) => `<div class="hb"><span>${esc(catName(c.id))}</span><div class="meter ${c.budget && c.spent > c.budget ? 'bad' : ''}"><i style="width:${pct(c.spent, maxCat)}%"></i></div><b>${esc(nf(c.spent))}</b></div>`).join('') || `<p class="empty">${esc(t('none'))}</p>`}</div></section>
  <section class="card"><h2>${esc(t('incomeByCat'))}</h2><div class="hbars">${r.incCat.map((c) => `<div class="hb"><span>${esc(catName(c.id))}</span><div class="meter"><i style="width:${pct(c.total, Math.max(1, ...r.incCat.map((x) => x.total)))}%"></i></div><b>${esc(nf(c.total))}</b></div>`).join('') || `<p class="empty">${esc(t('none'))}</p>`}</div>
  <h2 style="margin-top:1rem">${esc(t('insights'))}</h2>
  ${r.insights.length ? r.insights.map((i) => `<div class="att-row"><span>${insPill(i.kind)} ${esc(insightText(i))}</span></div>`).join('') : `<p class="empty">${esc(t('none'))}</p>`}</section></div>`;
}

// ---------- settings and audit ----------
function pgSettings() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.settings'))}</h1></div>
  <section class="card" style="max-width:34rem">
  ${inp('st-teen', t('set.teenMax'), d.settings.teenMax, 'type="number" min="50" max="10000" inputmode="numeric"')}
  ${inp('st-save', t('set.savingsTarget'), d.settings.savingsTarget, 'type="number" min="0" max="90" inputmode="numeric"')}
  <div class="acts"><button class="btn pri" data-act="savesettings">${esc(t('b.save'))}</button></div></section>
  <section class="card" style="max-width:34rem;margin-top:1rem"><h2>${esc(t('b.reset'))}</h2><p class="muted small">${esc(t('limits'))}</p><button class="btn danger" data-act="reset">${esc(t('b.reset'))}</button></section>`;
}
function pgAudit() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.audit'))}</h1></div>
  ${tbl([[t('f.when')], [t('by')], [t('auditAction')], [t('f.note')]], d.audit.map((a) => `<tr><td>${esc(new Date(a.ts).toLocaleString(ar() ? 'ar-EG' : 'en-GB', { timeZone: L.TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td><td>${esc(ar() ? (DEMO_NAME_AR[a.userId] || a.name) : a.name)}</td><td>${esc(a.action)}</td><td class="small">${esc(a.detail)}</td></tr>`), t('none'))}`;
}
const DEMO_NAME_AR = { 'u-owner': 'كريم عادل', 'u-partner': 'سلمى هاني', 'u-advisor': 'يوسف نبيل', 'u-teen': 'جنى كريم' };

// ---------- modals, render, events ----------
function modalHtml() {
  const m = S.modal; if (!m) return '';
  if (m.k === 'acc') return accForm(m.id ? accOf(m.id) : null);
  if (m.k === 'transfer') return transferForm();
  if (m.k === 'tx') return txForm();
  if (m.k === 'import') return importModal();
  if (m.k === 'cat') return catForm(m.id ? catOf(m.id) : null);
  if (m.k === 'goal') return goalForm();
  if (m.k === 'gmove') { const g = D().goals.find((x) => x.id === m.id); return g ? goalMoveForm(g, m.dir) : ''; }
  if (m.k === 'bill') return billForm();
  if (m.k === 'debt') return debtForm();
  if (m.k === 'payinst') { const x = D().debts.find((y) => y.id === m.id); return x ? payInstForm(x) : ''; }
  if (m.k === 'sched') { const x = D().debts.find((y) => y.id === m.id); return x ? schedModal(x) : ''; }
  return '';
}
const PAGES = { dashboard: pgDashboard, accounts: pgAccounts, transactions: pgTransactions, budgets: pgBudgets, goals: pgGoals, bills: pgBills, debts: pgDebts, reports: pgReports, settings: pgSettings, audit: pgAudit };
function render() {
  document.documentElement.lang = S.lang; document.documentElement.dir = T[S.lang].dir;
  const app = $('#app'), r = route();
  if (r === 'login') { app.innerHTML = loginPage(); const pin = $('#pin'); if (pin) pin.focus(); return; }
  if (!S.data) { app.innerHTML = shell('<p class="boot">…</p>'); return; }
  app.innerHTML = shell(PAGES[r]());
}
async function signin(pin) {
  try {
    const j = await api('POST', { type: 'login', pin });
    S.token = j.token; S.me = j.me; LS.set('token', j.token); LS.set('me', j.me);
    await refresh(); location.hash = '#/' + NAV[S.me.role][0]; render();
  } catch (e) { toast(e.message, true); render(); }
}
const keep = (id) => { const i = $(id); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
const download = (name, rows) => { const blob = new Blob([L.toCsv(rows)], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); };
const num = (id) => (val(id) === '' ? NaN : Number(val(id)));
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'bg') { if (e.target === el) { S.modal = null; render(); } return; }
  if (act === 'lang') { S.lang = ar() ? 'en' : 'ar'; LS.set('lang', S.lang); render(); return; }
  if (act === 'logout') { logout(); return; }
  if (act === 'pin') { signin(el.dataset.pin); return; }
  if (act === 'login') { signin(val('#pin')); return; }
  if (act === 'close') { S.modal = null; render(); return; }
  if (!S.data) return;
  const ok = async (op, msg, after) => { const r = await doOp(op, msg); if (r) { if (after) after(r); render(); } return r; };
  const shut = () => (S.modal = null);
  const open = (k, extra = {}) => { S.modal = { k, id, ...extra }; render(); };
  if (act === 'newacc') return open('acc');
  if (act === 'editacc') return open('acc');
  if (act === 'saveacc') { const o = { name: val('#ac-name'), nameAr: val('#ac-nameAr'), kind: val('#ac-kind'), opening: num('#ac-opening'), private: checked('#ac-private') }; return ok(id ? { type: 'updateAccount', accountId: id, ...o } : { type: 'addAccount', ...o, key: rid() }, t('msg.saved'), shut); }
  if (act === 'archacc') { if (!confirm(t('confirm.archive'))) return; return ok({ type: 'updateAccount', accountId: id, name: accOf(id).name, nameAr: accOf(id).nameAr, kind: accOf(id).kind, opening: accOf(id).opening, private: accOf(id).private, active: false }, t('msg.saved')); }
  if (act === 'unarchacc') { const a = accOf(id); return ok({ type: 'updateAccount', accountId: id, name: a.name, nameAr: a.nameAr, kind: a.kind, opening: a.opening, private: a.private, active: true }, t('msg.saved')); }
  if (act === 'newtransfer') return open('transfer');
  if (act === 'savetransfer') return ok({ type: 'addTx', kind: 'transfer', accountId: val('#tr-from'), toAccountId: val('#tr-to'), amount: num('#tr-amt'), note: val('#tr-note'), key: rid() }, t('msg.moved'), shut);
  if (act === 'newtx') return open('tx');
  if (act === 'savetx') { const k = val('#tx-kind'); const o = { type: 'addTx', kind: k, accountId: val('#tx-acc'), amount: num('#tx-amt'), date: val('#tx-date'), note: val('#tx-note'), key: rid() }; if (k === 'transfer') o.toAccountId = val('#tx-to'); else o.categoryId = val('#tx-cat'); return ok(o, t('msg.saved'), shut); }
  if (act === 'deltx') { if (!confirm(t('confirm.delete'))) return; return ok({ type: 'deleteTx', txId: id }, t('msg.deleted')); }
  if (act === 'csvtx') { const rows = [[t('f.date'), t('f.kind'), t('f.account'), t('f.category'), t('f.note'), t('f.amount')]]; for (const x of D().txs) rows.push([x.date, t('tkind.' + x.kind), x.kind === 'transfer' ? accName(x.accountId) + ' -> ' + accName(x.toAccountId) : accName(x.accountId), x.kind === 'transfer' ? '' : catName(x.categoryId), x.note, x.amount]); download('mizan-transactions.csv', rows); return; }
  if (act === 'importopen') return open('import');
  if (act === 'imptemplate') { download('mizan-import-template.csv', [L.IMPORT_COLS, [D().today, 'expense', D().categories.find((c) => c.kind === 'expense')?.name || '', 100, 'example']]); return; }
  if (act === 'doimport') {
    const f = $('#im-file').files[0]; if (!f) return;
    const text = await f.text();
    const rows = parseCsv(text.replace(/^﻿/, ''));
    const accId = val('#im-acc');
    const catByName = new Map(D().categories.map((c) => [c.name.toLowerCase(), c.id]));
    const out = [];
    for (const r of rows) {
      if (!r.length || r[0] === 'date') continue;
      const [date, kind, catName2, amount2, note] = r.map((x) => String(x ?? '').trim());
      out.push({ date, kind, accountId: accId, categoryId: catByName.get((catName2 || '').toLowerCase()) || catName2, amount: Number(amount2), note: note || '', key: rid() + '-' + out.length });
    }
    const r = await doOp({ type: 'importTransactions', rows: out });
    if (r) { S.modal = { k: 'import', result: r }; render(); }
    return;
  }
  if (act === 'newcat') return open('cat');
  if (act === 'editcat') return open('cat');
  if (act === 'savecat') { const o = { name: val('#ct-name'), nameAr: val('#ct-nameAr'), kind: val('#ct-kind'), budget: num('#ct-budget'), teen: checked('#ct-teen') }; return ok(id ? { type: 'updateCategory', categoryId: id, ...o } : { type: 'addCategory', ...o, key: rid() }, t('msg.saved'), shut); }
  if (act === 'archcat') { if (!confirm(t('confirm.archiveCat'))) return; return ok({ type: 'archiveCategory', categoryId: id }, t('msg.saved'), shut); }
  if (act === 'newgoal') return open('goal');
  if (act === 'savegoal') return ok({ type: 'addGoal', name: val('#gl-name'), nameAr: val('#gl-nameAr'), target: num('#gl-target'), deadline: val('#gl-deadline'), key: rid() }, t('msg.saved'), shut);
  if (act === 'goalmove') return open('gmove', { dir: el.dataset.dir });
  if (act === 'savegoalmove') return ok({ type: 'goalMove', goalId: id, accountId: val('#gm-acc'), dir: el.dataset.dir, amount: num('#gm-amt'), key: rid() }, t('msg.moved'), shut);
  if (act === 'newbill') return open('bill');
  if (act === 'savebill') return ok({ type: 'addBill', name: val('#bl-name'), nameAr: val('#bl-nameAr'), amount: num('#bl-amt'), categoryId: val('#bl-cat'), accountId: val('#bl-acc'), day: num('#bl-day'), key: rid() }, t('msg.saved'), shut);
  if (act === 'togglebill') return ok({ type: 'setBillActive', billId: id, active: el.dataset.on === '1' }, t('msg.saved'));
  if (act === 'paybill') return ok({ type: 'payBill', billId: id, key: rid() }, t('msg.paid'));
  if (act === 'newdebt') return open('debt');
  if (act === 'savedebt') return ok({ type: 'addDebt', name: val('#db-name'), nameAr: val('#db-nameAr'), lender: val('#db-lender'), principal: num('#db-principal'), installment: num('#db-inst'), months: num('#db-months'), startMonth: val('#db-start'), categoryId: val('#db-cat'), key: rid() }, t('msg.saved'), shut);
  if (act === 'payinst') return open('payinst');
  if (act === 'dopayinst') return ok({ type: 'payInstallment', debtId: id, accountId: val('#pi-acc'), key: rid() }, t('msg.paid'), shut);
  if (act === 'sched') return open('sched');
  if (act === 'csvreport') { const rows = [[t('f.month'), t('tkind.income'), t('tkind.expense'), t('netEach')]]; for (const x of D().reports.byMonth) rows.push([x.m, x.income, x.expense, x.net]); download('mizan-monthly-report.csv', rows); return; }
  if (act === 'savesettings') return ok({ type: 'setSettings', teenMax: num('#st-teen'), savingsTarget: num('#st-save') }, t('msg.saved'));
  if (act === 'reset') { if (confirm(t('confirm.reset'))) await ok({ type: 'reset' }, t('msg.reset')); return; }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act-change]'); if (!el) return;
  const a = el.dataset.actChange;
  if (a === 'fkind') S.fkind = el.value; if (a === 'fcat') S.fcat = el.value; if (a === 'facc') S.facc = el.value; if (a === 'fmonth') S.fmonth = el.value;
  if (a === 'txkind') { S.modal = { k: 'tx', kind: el.value, accId: val('#tx-acc'), date: val('#tx-date'), note: val('#tx-note') }; render(); return; }
  render();
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'txq') { S.q = e.target.value; render(); keep('#txq'); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'pin') signin(e.target.value);
  if (e.key === 'Escape' && S.modal) { S.modal = null; render(); }
});
window.addEventListener('hashchange', () => { S.modal = null; render(); });

(async () => {
  render();
  if (S.token) { try { await refresh(); } catch { /* logout handled in api */ } }
  render();
})();
