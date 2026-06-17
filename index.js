const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const axios = require('axios');
const http = require('http');
const QRCode = require('qrcode');

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://punjabgraphics.kesug.com';
const CHECK_INTERVAL = process.env.CHECK_INTERVAL || '0 9 * * *';
const PORT = process.env.PORT || 3000;

let currentQR = null;
let isConnected = false;

// ── Web Server ──
const server = http.createServer(async (req, res) => {
    if (req.url === '/') {
        if (isConnected) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <html>
                <head><meta charset="utf-8"><title>Punjab Graphics Bot</title></head>
                <body style="background:#25D366;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column">
                    <h1 style="color:white;font-size:48px">✅ WhatsApp Connected!</h1>
                    <p style="color:white;font-size:20px">Bot چل رہا ہے</p>
                </body>
                </html>
            `);
        } else if (currentQR) {
            try {
                const qrImage = await QRCode.toDataURL(currentQR);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <title>Punjab Graphics Bot - QR Scan</title>
                        <meta http-equiv="refresh" content="30">
                    </head>
                    <body style="text-align:center;font-family:Arial;padding:20px;background:#f0f0f0">
                        <h2 style="color:#25D366">Punjab Graphics WhatsApp Bot</h2>
                        <p style="font-size:18px">اپنے WhatsApp سے یہ QR Code scan کریں</p>
                        <div style="background:white;display:inline-block;padding:20px;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,0.2)">
                            <img src="${qrImage}" style="width:300px;height:300px;display:block">
                        </div>
                        <p style="color:#666;margin-top:20px">
                            WhatsApp کھولیں ➜ تین نقطے ➜ Linked Devices ➜ Link a Device
                        </p>
                        <p style="color:#999;font-size:14px">یہ صفحہ 30 سیکنڈ میں خود refresh ہوگا</p>
                    </body>
                    </html>
                `);
            } catch (err) {
                res.writeHead(500);
                res.end('QR Code بنانے میں مسئلہ: ' + err.message);
            }
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Punjab Graphics Bot</title>
                    <meta http-equiv="refresh" content="5">
                </head>
                <body style="text-align:center;padding:50px;font-family:Arial">
                    <h2>⏳ QR Code لوڈ ہو رہا ہے...</h2>
                    <p>چند سیکنڈ انتظار کریں، صفحہ خود refresh ہوگا</p>
                    <div style="width:50px;height:50px;border:5px solid #25D366;border-top:5px solid transparent;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto"></div>
                    <style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
                </body>
                </html>
            `);
        }
    } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', connected: isConnected }));
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`🌐 Web server شروع: port ${PORT}`);
});

console.log('🚀 Punjab Graphics WhatsApp Bot شروع ہو رہا ہے...');

// ── WhatsApp Client ──
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '/tmp/.wwebjs_auth'
    }),
    puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/run/current-system/sw/bin/chromium',
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--safebrowsing-disable-auto-update',
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            '--ignore-certificate-errors-spki-list'
        ],
    }
});

// ── Events ──
client.on('qr', (qr) => {
    currentQR = qr;
    isConnected = false;
    console.log('📱 QR Code تیار ہے — ویب پیج کھولیں اور scan کریں');
    qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent, message) => {
    console.log(`⏳ لوڈنگ: ${percent}% - ${message}`);
});

client.on('authenticated', () => {
    console.log('🔐 WhatsApp authenticated ہو گیا!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication fail:', msg);
    isConnected = false;
});

client.on('ready', () => {
    isConnected = true;
    currentQR = null;
    console.log('✅ WhatsApp Bot کامیابی سے connect ہو گیا!');
    startScheduler();
});

client.on('disconnected', (reason) => {
    isConnected = false;
    console.log('❌ WhatsApp disconnect:', reason);
    setTimeout(() => {
        console.log('🔄 دوبارہ connect کرنے کی کوشش...');
        client.initialize();
    }, 5000);
});

// ── Scheduler ──
function startScheduler() {
    cron.schedule(CHECK_INTERVAL, async () => {
        console.log('🔍 Pending balances چیک کر رہے ہیں...');
        await sendPendingReminders();
    }, { timezone: "Asia/Karachi" });

    console.log(`⏰ Scheduler چل رہا ہے: ${CHECK_INTERVAL}`);
}

// ── Pending Reminders ──
async function sendPendingReminders() {
    try {
        const response = await axios.get(`${WEBSITE_URL}/api.php?action=getPendingList`, {
            timeout: 10000
        });
        const pendingList = response.data;

        if (!Array.isArray(pendingList) || pendingList.length === 0) {
            console.log('✅ کوئی pending balance نہیں ہے');
            return;
        }

        console.log(`📋 ${pendingList.length} pending accounts ملے`);

        for (const c of pendingList) {
            if (!c.phone) continue;
            const phone = formatPhone(c.phone);
            if (!phone) {
                console.log(`⚠️ غلط نمبر: ${c.phone}`);
                continue;
            }

            const msg = `السلام علیکم *${c.name}* صاحب! 🙏\n\nPunjab Graphics یاد دہانی:\n📋 Bill: *${c.bill}*\n💰 بقایا: *Rs. ${c.balance}*\n\nبراہ کرم جلد ادائیگی فرمائیں۔\nشکریہ 🙏`;

            try {
                await client.sendMessage(phone, msg);
                console.log(`✅ میسج بھیجا: ${c.name} (${c.phone})`);
                await sleep(3000);
            } catch (e) {
                console.log(`❌ میسج error (${c.name}):`, e.message);
            }
        }

        console.log('✅ تمام reminders بھیج دیے گئے');
    } catch (e) {
        console.log('❌ API error:', e.message);
    }
}

// ── Helpers ──
function formatPhone(phone) {
    let p = phone.toString().replace(/\D/g, '');
    if (p.startsWith('0')) p = '92' + p.slice(1);
    if (p.startsWith('3')) p = '92' + p;
    if (p.length < 11) return null;
    return p + '@c.us';
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ── Start ──
client.initialize();
