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

// ── Simple Web Server QR دکھانے کے لیے ──
const server = http.createServer(async (req, res) => {
    if (req.url === '/') {
        if (isConnected) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body style="background:#25D366;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h1 style="color:white;font-size:48px">✅ WhatsApp Connected!</h1></body></html>');
        } else if (currentQR) {
            const qrImage = await QRCode.toDataURL(currentQR);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<html><body style="text-align:center;font-family:Arial;padding:20px">
                <h2>Punjab Graphics WhatsApp Bot</h2>
                <p>اپنے WhatsApp سے یہ QR Code scan کریں</p>
                <img src="${qrImage}" style="width:300px;height:300px">
                <p><small>WhatsApp > Linked Devices > Link a Device</small></p>
                <script>setTimeout(()=>location.reload(),30000)</script>
            </body></html>`);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body style="text-align:center;padding:50px"><h2>⏳ QR Code لوڈ ہو رہا ہے...</h2><script>setTimeout(()=>location.reload(),5000)</script></body></html>');
        }
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`🌐 Web server شروع: port ${PORT}`);
});

console.log('🚀 Punjab Graphics WhatsApp Bot شروع ہو رہا ہے...');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

client.on('qr', (qr) => {
    currentQR = qr;
    isConnected = false;
    console.log('📱 QR Code تیار ہے — ویب پیج کھولیں');
    qrcode.generate(qr, { small: true });
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
    client.initialize();
});

function startScheduler() {
    cron.schedule(CHECK_INTERVAL, async () => {
        console.log('🔍 Pending balances چیک کر رہے ہیں...');
        await sendPendingReminders();
    }, { timezone: "Asia/Karachi" });
}

async function sendPendingReminders() {
    try {
        const response = await axios.get(`${WEBSITE_URL}/api.php?action=getPendingList`);
        const pendingList = response.data;
        if (!Array.isArray(pendingList) || pendingList.length === 0) return;

        for (const c of pendingList) {
            if (!c.phone) continue;
            const phone = formatPhone(c.phone);
            if (!phone) continue;
            const msg = `السلام علیکم *${c.name}* صاحب! 🙏\n\nPunjab Graphics یاد دہانی:\n📋 Bill: *${c.bill}*\n💰 بقایا: *Rs. ${c.balance}*\n\nبراہ کرم جلد ادائیگی فرمائیں۔ شکریہ 🙏`;
            try {
                await client.sendMessage(phone, msg);
                await sleep(3000);
            } catch (e) {
                console.log('میسج error:', e.message);
            }
        }
    } catch (e) {
        console.log('API error:', e.message);
    }
}

function formatPhone(phone) {
    let p = phone.toString().replace(/\D/g, '');
    if (p.startsWith('0')) p = '92' + p.slice(1);
    if (p.startsWith('3')) p = '92' + p;
    if (p.length < 11) return null;
    return p + '@c.us';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

client.initialize();
