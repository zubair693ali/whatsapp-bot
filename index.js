const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const axios = require('axios');
const http = require('http');
const QRCode = require('qrcode');

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://punjabgraphics.alwaysdata.net';
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
                const qrImage = await QRCode.toDataURL(currentQR, {
                    errorCorrectionLevel: 'H',
                    type: 'image/png',
                    quality: 0.95,
                    margin: 1,
                    width: 300
                });
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <title>Punjab Graphics Bot - QR Scan</title>
                        <meta http-equiv="refresh" content="120">
                    </head>
                    <body style="text-align:center;font-family:Arial;padding:40px;background:#f0f0f0;margin:0">
                        <h1 style="color:#25D366;margin-bottom:10px">Punjab Graphics WhatsApp Bot</h1>
                        <p style="font-size:20px;color:#333;margin:10px 0 30px 0">اپنے WhatsApp سے یہ QR Code scan کریں</p>
                        
                        <div style="background:white;display:inline-block;padding:30px;border-radius:15px;box-shadow:0 8px 25px rgba(0,0,0,0.15)">
                            <img src="${qrImage}" style="width:400px;height:400px;display:block;image-rendering:pixelated">
                        </div>
                        
                        <div style="margin-top:30px;background:white;padding:20px;border-radius:10px;max-width:500px;margin-left:auto;margin-right:auto">
                            <p style="color:#333;margin:10px 0;font-size:16px"><strong>اسطریقے سے کریں:</strong></p>
                            <p style="color:#666;margin:10px 0">1️⃣ اپنے WhatsApp کھولیں</p>
                            <p style="color:#666;margin:10px 0">2️⃣ تین نقطے (⋯) پر کلک کریں</p>
                            <p style="color:#666;margin:10px 0">3️⃣ "Linked Devices" منتخب کریں</p>
                            <p style="color:#666;margin:10px 0">4️⃣ "Link a Device" پر کلک کریں</p>
                            <p style="color:#666;margin:10px 0">5️⃣ یہ QR Code scan کریں</p>
                        </div>
                        
                        <p style="color:#999;font-size:13px;margin-top:30px">⏱️ اگر scan نہیں ہو رہا تو 2 منٹ میں نیا QR آئے گا</p>
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
    } else if (req.url === '/send-now') {
        if (!isConnected) {
            res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <html>
                <head><meta charset="utf-8"><title>Error</title></head>
                <body style="text-align:center;padding:50px;font-family:Arial">
                    <h2 style="color:red">❌ WhatsApp Connected نہیں ہے</h2>
                    <p>براہ کرم پہلے QR code scan کریں</p>
                    <a href="/">← واپس جائیں</a>
                </body>
                </html>
            `);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <html>
                <head><meta charset="utf-8"><title>Messages بھیج رہے ہیں</title></head>
                <body style="text-align:center;padding:50px;font-family:Arial;background:#e8f5e9">
                    <h2 style="color:green">✅ Messages بھیجنا شروع</h2>
                    <p>تمام pending customers کو messages بھیجے جا رہے ہیں...</p>
                    <p style="color:#666;font-size:14px">Logs میں progress دیکھیں</p>
                    <a href="/">← واپس جائیں</a>
                </body>
                </html>
            `);
            
            // Background میں messages بھیجیں
            sendPendingReminders().catch(err => {
                console.log('❌ sendPendingReminders error:', err);
            });
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

// ── Chromium Path خود تلاش کرے ──
function getChromiumPath() {
    const paths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/nix/var/nix/profiles/default/bin/chromium',
        '/run/current-system/sw/bin/chromium'
    ];

    const fs = require('fs');
    for (const p of paths) {
        if (p && fs.existsSync(p)) {
            console.log(`✅ Chromium ملا: ${p}`);
            return p;
        }
    }

    // اگر کوئی نہ ملے تو puppeteer کا اپنا
    try {
        const puppeteer = require('puppeteer');
        const path = puppeteer.executablePath();
        console.log(`✅ Puppeteer chromium: ${path}`);
        return path;
    } catch (e) {
        console.log('⚠️ Puppeteer path نہیں ملا');
        return null;
    }
}

// ── WhatsApp Client ──
const chromiumPath = getChromiumPath();

const clientOptions = {
    authStrategy: new LocalAuth({
        dataPath: process.env.WWEBJS_AUTH_PATH || '/tmp/.wwebjs_auth',
        clientId: 'punjab-graphics-bot'
    }),
    puppeteer: {
        headless: true,
        timeout: 60000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
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
            '--disable-blink-features=AutomationControlled'
        ],
    }
};

if (chromiumPath) {
    clientOptions.puppeteer.executablePath = chromiumPath;
}

const client = new Client(clientOptions);

// ── Auto-restart on Puppeteer/Chrome crash ──
// جب بھی WhatsApp Web کا context crash ہو (یہی وہ error تھا)،
// process پوری طرح ری اسٹارٹ کر دیں تاکہ Chrome صاف حالت میں دوبارہ شروع ہو۔
process.on('unhandledRejection', (reason) => {
    console.log('⚠️ Unhandled rejection پکڑا گیا:', reason && reason.message ? reason.message : reason);
    if (reason && reason.message && reason.message.includes('Execution context was destroyed')) {
        console.log('🔄 Chrome context crash ہوا — process ری اسٹارٹ ہو رہا ہے...');
        process.exit(1); // Railway اسے خود دوبارہ شروع کر دے گا
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
    currentQR = null;
    
    // سلوبھی صفائی
    console.log('🔄 5 سیکنڈ میں دوبارہ کوشش کریں گے...');
    setTimeout(() => {
        if (!isConnected) {
            console.log('🔄 Browser session reset کر رہے ہیں...');
            client.destroy().catch(err => console.log('Destroy error:', err));
            setTimeout(() => {
                client.initialize();
            }, 2000);
        }
    }, 5000);
});

client.on('ready', async () => {
    isConnected = true;
    currentQR = null;
    console.log('✅ WhatsApp Bot کامیابی سے connect ہو گیا!');
    // پہلی بار فوری میسج بھیجیں
    console.log('📨 پہلی بار تمام pending کو فوری میسج بھیج رہے ہیں...');
    await sendPendingReminders();
    // پھر روزانہ scheduler شروع کریں
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
        console.log(`🔗 API سے رابطہ: ${WEBSITE_URL}/api.php?action=getPendingList`);
        
        const response = await axios.get(`${WEBSITE_URL}/api.php?action=getPendingList&key=punjabgraphics2026`, {
        });
        
        console.log('📥 API Response:', JSON.stringify(response.data).substring(0, 100));
        
        const pendingList = response.data;

        if (!Array.isArray(pendingList)) {
            console.log('⚠️ Response array نہیں ہے:', typeof pendingList);
            return;
        }

        if (pendingList.length === 0) {
            console.log('✅ کوئی pending balance نہیں ہے');
            return;
        }

        console.log(`\n📋 ${pendingList.length} pending accounts ملے\n`);

        let sent = 0;
        let failed = 0;

        for (const c of pendingList) {
            console.log(`\n👤 Processing: ${c.name} - Phone: ${c.phone}`);
            
            if (!c.phone) {
                console.log(`⚠️ Phone نمبر missing ہے`);
                failed++;
                continue;
            }

            const phone = formatPhone(c.phone);
            console.log(`📞 Formatted phone: ${phone}`);
            
            if (!phone) {
                console.log(`⚠️ غلط phone format: ${c.phone}`);
                failed++;
                continue;
            }

            const msg = `السلام علیکم *${c.name}* صاحب! 🙏\n\nPunjab Graphics یاد دہانی:\n📋 Bill: *${c.bill}*\n💰 بقایا: *Rs. ${c.balance}*\n\nبراہ کرم جلد ادائیگی فرمائیں۔\nشکریہ 🙏`;

            try {
                console.log(`📤 Message بھیج رہے ہیں...`);
                await client.sendMessage(phone, msg);
                console.log(`✅ ✅ میسج بھیجا: ${c.name} (${c.phone})`);
                sent++;
                await sleep(3000);
            } catch (e) {
                console.log(`❌ ❌ میسج fail (${c.name}): ${e.message}`);
                failed++;
            }
        }

        console.log(`\n📊 خلاصہ: ✅ ${sent} کامیاب | ❌ ${failed} ناکام`);
        console.log('✅ تمام reminders کی کوشش مکمل ہوئی');
    } catch (e) {
        console.log('❌ API error:', e.message);
        console.log('Stack:', e.stack);
    }
}

// ── Helpers ──
function formatPhone(phone) {
    if (!phone) return null;
    
    let p = phone.toString().trim().replace(/\D/g, '');
    console.log(`   [Format Step 1] Original: ${phone} → Digits only: ${p}`);
    
    // اگر 0 سے شروع ہو تو 92 سے replace کریں
    if (p.startsWith('0')) {
        p = '92' + p.slice(1);
        console.log(`   [Format Step 2] 0 سے شروع تھا → ${p}`);
    }
    // اگر 3 سے شروع ہو تو 92 شامل کریں (Pakistan code)
    else if (p.startsWith('3')) {
        p = '92' + p;
        console.log(`   [Format Step 2] 3 سے شروع تھا → ${p}`);
    }
    // اگر 92 سے شروع ہو تو ویسے ہی رہے
    else if (p.startsWith('92')) {
        console.log(`   [Format Step 2] پہلے سے 92 موجود ہے`);
    }
    
    // Final validation
    if (p.length < 12 || !p.startsWith('92')) {
        console.log(`   [Format ERROR] Invalid length (${p.length}) یا شروع 92 سے نہیں`);
        return null;
    }
    
    const whatsappId = p + '@c.us';
    console.log(`   [Format FINAL] WhatsApp ID: ${whatsappId}`);
    return whatsappId;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ── Start ──
client.initialize();
