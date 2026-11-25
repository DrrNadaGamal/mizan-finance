// Screenshots into docs/. Usage: node e2e/shots.mjs http://localhost:3100
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const U = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
fs.mkdirSync('docs', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
async function page(w = 1280, h = 900) { const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 }); return p; }
async function login(p, pin, lang = 'en') {
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter');
  await p.waitForSelector('.top .nav', { timeout: 8000 }); await sleep(700);
}
const go = async (p, r) => { await p.evaluate((x) => (location.hash = '#/' + x), r); await sleep(700); };
const shot = async (p, name) => { await p.screenshot({ path: 'docs/' + name + '.png' }); console.log('shot', name); };
async function api(token, op) { const r = await fetch(U + '/api/data', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ op }) }); return r.json(); }
const token = (await (await fetch(U + '/api/data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: { type: 'login', pin: '1111' } }) })).json()).token;
await api(token, { type: 'reset' });
let p = await page(); await p.goto(U, { waitUntil: 'networkidle0' }); await sleep(400); await shot(p, '01-login');
await login(p, '1111'); await shot(p, '02-dashboard');
await go(p, 'accounts'); await shot(p, '03-accounts');
await go(p, 'transactions'); await shot(p, '04-transactions');
await p.click('[data-act="newtx"]'); await sleep(500); await shot(p, '05-add-transaction'); await p.keyboard.press('Escape'); await sleep(300);
await go(p, 'budgets'); await shot(p, '06-budgets');
await go(p, 'goals'); await shot(p, '07-goals');
await go(p, 'bills'); await shot(p, '08-bills');
await go(p, 'debts'); await shot(p, '09-debts');
await go(p, 'reports'); await sleep(600); await shot(p, '10-reports');
await go(p, 'settings'); await shot(p, '11-settings');
await go(p, 'audit'); await shot(p, '12-audit');
let par = await page(); await login(par, '2222'); await shot(par, '13-partner-dashboard');
let adv = await page(); await login(adv, '3333'); await shot(adv, '14-advisor-dashboard');
await go(adv, 'reports'); await sleep(500); await shot(adv, '15-advisor-reports');
let teen = await page(); await login(teen, '4444'); await shot(teen, '16-teen-wallet');
let a = await page(); await login(a, '1111', 'ar'); await shot(a, '17-arabic-dashboard');
await go(a, 'transactions'); await shot(a, '18-arabic-transactions');
await go(a, 'budgets'); await shot(a, '19-arabic-budgets');
let ph = await page(390, 844); await login(ph, '2222'); await shot(ph, '20-phone-dashboard');
await go(ph, 'transactions'); await shot(ph, '21-phone-transactions');
let tph = await page(390, 844); await login(tph, '4444'); await shot(tph, '22-phone-teen');
let aph = await page(390, 844); await login(aph, '1111', 'ar'); await shot(aph, '23-phone-arabic');
await api(token, { type: 'reset' });
await b.close(); console.log('done');
