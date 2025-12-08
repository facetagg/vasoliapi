// mail.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { sendEmail, verifySMTP } = require("../utils/mail.helper");

const router = express.Router();

// --- CONFIGURACIÓN DE ACCESO ---
const ACCESS_KEY = process.env.MAIL_KEY || "Vasoli19";

// --- HELPER: Decodificar variables B64 ---
function decodeEnvB64(keyB64, keyPlain) {
  const b64 = process.env[keyB64];
  if (b64 && b64.length) {
    try {
      return Buffer.from(b64, 'base64').toString('utf8');
    } catch (err) {
      console.warn(`Fallo al decodificar ${keyB64}:`, err && err.message);
      return process.env[keyPlain] || '';
    }
  }
  return process.env[keyPlain] || '';
}

// Configuración de SMTP (prioritario vasoli.cl)
const SMTP_USER = decodeEnvB64('SMTP_USER_B64', 'SMTP_USER');
const SMTP_PASS = decodeEnvB64('SMTP_PASS_B64', 'SMTP_PASS');
const SMTP_HOST = process.env.SMTP_HOST_VASOLI || process.env.SMTP_HOST || 'mail.vasoli.cl';
const SMTP_PORT = Number(process.env.SMTP_PORT_VASOLI || process.env.SMTP_PORT || 587);

// --- MIDDLEWARES DE SEGURIDAD ---
router.use(helmet());
router.use(express.json({ limit: "200kb" }));

// Límite de solicitudes (anti abuso)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 5,
  message: { error: "Demasiadas solicitudes, intenta más tarde." },
});
router.use(limiter);

// --- ENDPOINT: Enviar email ---
router.post("/send", async (req, res) => {
  try {
    const { accessKey, ...emailData } = req.body || {};

    // Validación de seguridad (API Key)
    if (accessKey !== ACCESS_KEY) {
      return res.status(401).json({ error: "Clave de acceso inválida." });
    }

    // Intenta vasoli.cl primero, si falla usa la instancia de API
    let result;
    try {
      result = await sendEmail(emailData, { host: SMTP_HOST, port: SMTP_PORT, user: SMTP_USER, pass: SMTP_PASS });
    } catch (vasoliError) {
      console.warn('Error enviando por vasoli.cl, intentando instancia de API:', vasoliError.message);
      // Fallback a la instancia de API
      result = await sendEmail(emailData);
    }
    
    res.json(result);

  } catch (err) {
    const status = err.status || 500;
    const message = err.message || "Error desconocido del servidor";
    
    if (status === 500) console.error("Error en endpoint /send:", err);
    
    res.status(status).json({ error: message });
  }
});

// --- RUTA: Diagnóstico SMTP ---
router.get("/debug/smtp", async (req, res) => {
  try {
    const accessKey = req.query.accessKey || req.headers["x-access-key"];
    if (accessKey !== ACCESS_KEY) return res.status(401).json({ error: "Clave de acceso inválida." });

    const result = await verifySMTP();
    res.json({ ok: true, verified: result });
  } catch (err) {
    console.error("Error en /debug/smtp:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// --- RUTA: Diagnóstico manual SMTP (STARTTLS) ---
router.get('/debug/manual', async (req, res) => {
  const log = [];
  const accessKey = req.query.accessKey || req.headers['x-access-key'];
  if (accessKey !== ACCESS_KEY) return res.status(401).json({ error: 'Clave de acceso inválida.' });

  // Usar configuración de vasoli.cl por defecto
  const host = SMTP_HOST;
  const port = SMTP_PORT;
  const user = SMTP_USER;
  const pass = SMTP_PASS;

  if (!user || !pass) {
    return res.status(400).json({ error: 'Faltan variables de entorno: SMTP_USER y/o SMTP_PASS' });
  }

  const net = require('net');
  const tls = require('tls');

  let rawSocket;
  let tlsSocket;

  const cleanup = () => {
    try { if (tlsSocket && !tlsSocket.destroyed) tlsSocket.end(); } catch(e){}
    try { if (rawSocket && !rawSocket.destroyed) rawSocket.end(); } catch(e){}
  };

  try {
    // Obtener IP pública
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const { ip } = await ipRes.json();
      log.push(`Testing from IP: ${ip}`);
    } catch (e) {
      log.push('Could not fetch public IP: ' + e.message);
    }

    // Conexión TCP a vasoli.cl
    log.push(`Connecting to ${host}:${port}...`);
    rawSocket = await new Promise((resolve, reject) => {
      const s = net.createConnection({ host, port }, () => resolve(s));
      s.once('error', reject);
      s.setTimeout(15000, () => reject(new Error('TCP connect timeout')));
    });

    const readResponse = (socket, timeout = 10000) => {
      return new Promise((resolve, reject) => {
        const onData = (data) => {
          cleanupTimer();
          socket.removeListener('data', onData);
          resolve(data.toString());
        };
        const onError = (err) => { cleanupTimer(); socket.removeListener('data', onData); reject(err); };
        const onTimeout = () => { socket.removeListener('data', onData); reject(new Error('read timeout')); };

        const cleanupTimer = () => clearTimeout(timer);
        socket.once('error', onError);
        socket.on('data', onData);
        const timer = setTimeout(onTimeout, timeout);
      });
    };

    const sendCommand = (socket, command) => {
      return new Promise(async (resolve, reject) => {
        try {
          log.push(`C: ${command}`);
          socket.write(command + '\r\n');
          const resp = await readResponse(socket);
          log.push(`S: ${resp.trim()}`);
          resolve(resp);
        } catch (err) { reject(err); }
      });
    };

    // Banner
    const banner = await readResponse(rawSocket);
    log.push(`S: ${banner.trim()}`);

    await sendCommand(rawSocket, 'EHLO test.local');

    const starttlsResp = await sendCommand(rawSocket, 'STARTTLS');
    if (!/^220/.test(starttlsResp.trim())) {
      throw new Error('STARTTLS not accepted: ' + starttlsResp.trim());
    }

    // Upgrade a TLS
    tlsSocket = tls.connect({ socket: rawSocket, servername: host, rejectUnauthorized: true });

    await new Promise((resolve, reject) => {
      tlsSocket.once('secureConnect', resolve);
      tlsSocket.once('error', reject);
      tlsSocket.setTimeout(15000, () => reject(new Error('TLS connect timeout')));
    });
    log.push('TLS connection established');

    await sendCommand(tlsSocket, 'EHLO test.local');

    // AUTH LOGIN
    const userB64 = Buffer.from(user).toString('base64');
    const passB64 = Buffer.from(pass).toString('base64');

    await sendCommand(tlsSocket, 'AUTH LOGIN');
    await sendCommand(tlsSocket, userB64);
    await sendCommand(tlsSocket, passB64);

    const mailFromResponse = await sendCommand(tlsSocket, `MAIL FROM:<${user}>`);
    if (/^250/.test(mailFromResponse.trim())) {
      log.push('✅ MAIL FROM accepted!');
    } else {
      log.push('❌ MAIL FROM rejected! Response: ' + mailFromResponse.trim());
    }

    try { await sendCommand(tlsSocket, 'QUIT'); } catch(e){}
    cleanup();

    return res.json({ log, success: /^250/.test(mailFromResponse.trim()) });
  } catch (err) {
    cleanup();
    log.push('ERROR: ' + (err && err.message ? err.message : String(err)));
    return res.status(200).json({ log, success: false });
  }
});

module.exports = router;