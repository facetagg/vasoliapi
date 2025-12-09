// mail.helper.js
const nodemailer = require('nodemailer');
const { isEmail } = require('validator');

// --- CONFIGURACIÓN SMTP ---
function readCredential({ b64Key, plainKey }) {
  const b64Env = process.env[b64Key];
  if (b64Env !== undefined) {
    if (String(b64Env).trim()) {
      try { return Buffer.from(b64Env, 'base64').toString('utf8'); } catch (e) { console.warn(`Fallo al decodificar ${b64Key}:`, e && e.message); }
    }
    return undefined;
  }
  const raw = process.env[plainKey];
  if (!raw) return undefined;
  return raw;
}

const MAIL_CREDENTIALS = {
  host: process.env.SMTP_HOST || 'smtp.mailersend.net',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : false,
  auth: {
    user: readCredential({ b64Key: 'SMTP_USER_B64', plainKey: 'SMTP_USER' }),
    pass: readCredential({ b64Key: 'SMTP_PASS_B64', plainKey: 'SMTP_PASS' }),
  },
};

const MAX_RECIPIENTS = 10;

async function sendViaMailerSend({ from, envelopeTo, subject, html, text }) {
  const apiKey = process.env.MAILERSEND_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error('No MailerSend API key');
  const parseNameEmail = (input) => {
    if (!input) return { email: MAIL_CREDENTIALS.auth.user };
    const m = String(input).match(/^(?:\s*(.*?)\s*<)?([^<>\s]+@[^<>\s]+)>?$/);
    if (m) return { name: m[1] || undefined, email: m[2] };
    return { email: String(input) };
  };
  const fromObj = parseNameEmail(from || MAIL_CREDENTIALS.auth.user);
  const toArr = (envelopeTo || []).map(e => ({ email: e }));
  const payload = { from: { email: fromObj.email, name: fromObj.name }, to: toArr, subject };
  if (text) payload.text = text; if (html) payload.html = html;
  let _fetch = global.fetch; if (typeof _fetch !== 'function') { try { _fetch = require('node-fetch'); } catch (e) { throw new Error('No fetch disponible para usar MailerSend API'); } }
  const res = await _fetch('https://api.mailersend.com/v1/email', { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const rawText = await res.text().catch(() => ''); let data = {}; try { data = rawText ? JSON.parse(rawText) : {}; } catch (e) { data = { _raw: rawText }; }
  if (!res.ok) { const err = new Error('MailerSend API error'); err.response = data; err.raw = rawText; err.status = res.status; throw err; }
  return { ok: true, status: res.status, response: data, raw: rawText };
}

function createTransporter(override = {}) {
  const host = override.host || process.env.SMTP_HOST || MAIL_CREDENTIALS.host;
  const port = Number(override.port || process.env.SMTP_PORT || MAIL_CREDENTIALS.port);
  const secure = (override.secure !== undefined) ? override.secure : (port === 465 ? true : (process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : MAIL_CREDENTIALS.secure));
  const requireTLS = (override.requireTLS !== undefined) ? override.requireTLS : (MAIL_CREDENTIALS.secure ? false : (process.env.SMTP_REQUIRE_TLS !== undefined ? process.env.SMTP_REQUIRE_TLS === 'true' : true));
  const authUser = override.user || (MAIL_CREDENTIALS.auth && MAIL_CREDENTIALS.auth.user);
  const authPass = override.pass || (MAIL_CREDENTIALS.auth && MAIL_CREDENTIALS.auth.pass);
  const transporterOpts = { host, port, secure, requireTLS, auth: authUser && authPass ? { user: authUser, pass: authPass } : undefined, authMethod: process.env.SMTP_AUTH_METHOD || 'LOGIN', tls: { rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'true' ? true : false }, logger: false, debug: false };
  return nodemailer.createTransport(transporterOpts);
}

function validarDestinatarios(raw) {
  if (!raw) return { error: "Campo 'to' requerido." };
  let lista = [];
  if (Array.isArray(raw)) { lista = raw.map(item => { if (!item) return ""; if (typeof item === 'string') return item.trim(); if (typeof item === 'object' && item.email) { const email = String(item.email).trim(); if (item.name) return `${String(item.name).trim()} <${email}>`; return email; } return ""; }).filter(Boolean); }
  else if (typeof raw === 'string') { lista = raw.split(/\s*[;,]\s*/).map(s => s.trim()).filter(Boolean); if (lista.length === 0 && raw.trim()) lista = [raw.trim()]; }
  else return { error: "El campo 'to' debe ser string o array." };
  if (lista.length > MAX_RECIPIENTS) return { error: `Máximo ${MAX_RECIPIENTS} destinatarios permitidos.` };
  const parsed = []; const invalid = [];
  for (const entry of lista) { const match = entry.match(/<([^>]+)>/); const email = match ? match[1].trim() : entry.trim(); if (!isEmail(email)) { invalid.push(entry); continue; } parsed.push(entry.trim()); }
  if (parsed.length === 0) return { error: `No hay destinatarios válidos.${invalid.length ? ' Entradas inválidas: ' + invalid.join(', ') : ''}` };
  return { lista: parsed, invalid };
}

const sendEmail = async ({ to, subject, html, text, from }, smtpOverride = {}) => {
  const valid = validarDestinatarios(to); if (valid.error) throw { status: 400, message: valid.error };
  if (!subject) throw { status: 400, message: "Campo 'subject' requerido." };
  if (!html && !text) throw { status: 400, message: "Debe incluir 'html' o 'text'." };
  const toField = valid.lista.join(', ').trim(); if (!toField) throw { status: 400, message: 'No recipients definidos.' };
  const envelopeTo = valid.lista.map(entry => { const match = entry.match(/<([^>]+)>/); return match ? match[1].trim() : entry.trim(); }).filter(Boolean).map(e => e.toLowerCase()).filter(e => isEmail(e));
  if (envelopeTo.length === 0) throw { status: 400, message: 'No hay destinatarios válidos para el envelope.' };
  const mailOptions = { from: from || MAIL_CREDENTIALS.auth.user, to: toField, subject, html, text, envelope: { from: MAIL_CREDENTIALS.auth.user, to: envelopeTo } };
  try {
    if (smtpOverride && Object.keys(smtpOverride).length) { const t = createTransporter(smtpOverride); const info = await t.sendMail(mailOptions); return { ok: true, provider: 'smtp', messageId: info.messageId, response: info.response }; }
    if (process.env.MAILERSEND_API_KEY || process.env.API_KEY) { try { const apiRes = await sendViaMailerSend({ from: mailOptions.from, envelopeTo: mailOptions.envelope.to, subject, html, text }); return { ok: true, provider: 'mailersend', status: apiRes.status, response: apiRes.response }; } catch (apiErr) { console.warn('Envio vía MailerSend API falló, intentando SMTP. Error:', apiErr && (apiErr.message || apiErr.status)); } }
    const defaultTransporter = createTransporter(); const info = await defaultTransporter.sendMail(mailOptions); return { ok: true, provider: 'smtp', messageId: info.messageId, response: info.response };
  } catch (err) {
    console.error('Error interno en Nodemailer:', { message: err && err.message, code: err && err.code, response: err && err.response, responseCode: err && err.responseCode, command: err && err.command, envelope: mailOptions.envelope });
    if (err && err.responseCode === 550 && err.command === 'MAIL FROM') { try { const altTransporter = createTransporter({ port: Number(process.env.FALLBACK_SMTP_PORT || 587), secure: false, requireTLS: true }); const info2 = await altTransporter.sendMail(mailOptions); return { ok: true, messageId: info2.messageId, response: info2.response, fallback: true }; } catch (err2) { console.error('Reintento con STARTTLS falló:', err2 && err2.message); } }
    throw { status: 500, message: 'Fallo interno al enviar correo.' };
  }
};

const verifySMTP = async (override = {}) => { const t = createTransporter(override); return new Promise((resolve, reject) => { t.verify((err, success) => { if (err) return reject(err); resolve(success); }); }); };

const debugManual = async (opts = {}) => {
  const log = []; const host = opts.host || process.env.SMTP_HOST_VASOLI || process.env.SMTP_HOST || 'mail.vasoli.cl';
  const port = Number(opts.port || process.env.SMTP_PORT_VASOLI || process.env.SMTP_PORT || 587);
  const user = opts.user || process.env.SMTP_USER; const pass = opts.pass || process.env.SMTP_PASS;
  if (!user || !pass) return { log: ['Missing SMTP_USER/SMTP_PASS'], success: false };
  const net = require('net'); const tls = require('tls'); let rawSocket; let tlsSocket;
  const cleanup = () => { try { if (tlsSocket && !tlsSocket.destroyed) tlsSocket.end(); } catch (e) {} try { if (rawSocket && !rawSocket.destroyed) rawSocket.end(); } catch (e) {} };
  try {
    try { const ipRes = await fetch('https://api.ipify.org?format=json'); const { ip } = await ipRes.json(); log.push(`Testing from IP: ${ip}`); } catch (e) { log.push('Could not fetch public IP: ' + e.message); }
    log.push(`Connecting to ${host}:${port}...`);
    rawSocket = await new Promise((resolve, reject) => { const s = net.createConnection({ host, port }, () => resolve(s)); s.once('error', reject); s.setTimeout(15000, () => reject(new Error('TCP connect timeout'))); });
    const readResponse = (socket, timeout = 10000) => new Promise((resolve, reject) => { const onData = (data) => { cleanupTimer(); socket.removeListener('data', onData); resolve(data.toString()); }; const onError = (err) => { cleanupTimer(); socket.removeListener('data', onData); reject(err); }; const onTimeout = () => { socket.removeListener('data', onData); reject(new Error('read timeout')); }; const cleanupTimer = () => clearTimeout(timer); socket.once('error', onError); socket.on('data', onData); const timer = setTimeout(onTimeout, timeout); });
    const sendCommand = (socket, command) => new Promise(async (resolve, reject) => { try { log.push(`C: ${command}`); socket.write(command + '\r\n'); const resp = await readResponse(socket); log.push(`S: ${resp.trim()}`); resolve(resp); } catch (err) { reject(err); } });
    const banner = await readResponse(rawSocket); log.push(`S: ${banner.trim()}`);
    await sendCommand(rawSocket, 'EHLO test.local'); const starttlsResp = await sendCommand(rawSocket, 'STARTTLS'); if (!/^220/.test(starttlsResp.trim())) throw new Error('STARTTLS not accepted: ' + starttlsResp.trim());
    tlsSocket = tls.connect({ socket: rawSocket, servername: host, rejectUnauthorized: true }); await new Promise((resolve, reject) => { tlsSocket.once('secureConnect', resolve); tlsSocket.once('error', reject); tlsSocket.setTimeout(15000, () => reject(new Error('TLS connect timeout'))); }); log.push('TLS connection established'); await sendCommand(tlsSocket, 'EHLO test.local');
    const userB64 = Buffer.from(user).toString('base64'); const passB64 = Buffer.from(pass).toString('base64'); await sendCommand(tlsSocket, 'AUTH LOGIN'); await sendCommand(tlsSocket, userB64); await sendCommand(tlsSocket, passB64);
    const mailFromResponse = await sendCommand(tlsSocket, `MAIL FROM:<${user}>`); if (/^250/.test(mailFromResponse.trim())) { cleanup(); return { log, success: true }; }
    try { await sendCommand(tlsSocket, 'QUIT'); } catch (e) {} cleanup(); return { log, success: /^250/.test(mailFromResponse.trim()) };
  } catch (err) { cleanup(); log.push('ERROR: ' + (err && err.message ? err.message : String(err))); return { log, success: false }; }
};

module.exports = { sendEmail, verifySMTP, debugManual };