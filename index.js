const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const axios = require('axios');

// =============================================
// PUNJAB GRAPHICS - WhatsApp Bot
// =============================================

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://punjabgraphics.kesug.com';
const CHECK_INTERVAL = process.env.CHECK_INTERVAL || '0 9 * * *'; // روزانہ صبح 9 بجے

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

// QR Code دکھائیں
client.on('qr', (qr) => {
    console.log('\n📱 WhatsApp سے connect کرنے کے لیے یہ QR Code scan کریں:\n');
    qrcode.generate(qr, { small: true });
});

// Connected
client.on('ready', () => {
    console.log('✅ WhatsApp Bot کامیابی سے connect ہو گیا!');
    startScheduler();
});

// Disconnected
client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp disconnect ہو گیا:', reason);
    console.log('🔄 دوبارہ connect ہو رہا ہے...');
    client.initialize();
});

// =============================================
// Scheduler — مقررہ وقت پر میسج بھیجیں
// =============================================
function startScheduler() {
    console.log('⏰ Scheduler شروع ہو گیا - ' + CHECK_INTERVAL);

    cron.schedule(CHECK_INTERVAL, async () => {
        console.log('🔍 Pending balances چیک کر رہے ہیں...');
        await sendPendingReminders();
    }, {
        timezone: "Asia/Karachi"
    });
}

// =============================================
// Pending Balance والے clients کو reminder
// =============================================
async function sendPendingReminders() {
    try {
        const response = await axios.get(`${WEBSITE_URL}/api.php?action=getPendingList`, {
            headers: { 'Cookie': 'PHPSESSID=bot_session' }
        });

        const pendingList = response.data;

        if (!Array.isArray(pendingList) || pendingList.length === 0) {
            console.log('✅ کوئی pending balance نہیں');
            return;
        }

        console.log(`📋 ${pendingList.length} clients کو reminder بھیجنا ہے`);

        for (const client_data of pendingList) {
            if (!client_data.phone) continue;

            const phone = formatPhone(client_data.phone);
            if (!phone) continue;

            const message = `السلام علیکم *${client_data.name}* صاحب! 🙏\n\n` +
                `Punjab Graphics کی طرف سے یاد دہانی:\n\n` +
                `📋 Bill No: *${client_data.bill}*\n` +
                `📅 تاریخ: *${client_data.date}*\n` +
                `💰 بقایا رقم: *Rs. ${client_data.balance.toLocaleString()}*\n\n` +
                `براہ کرم جلد ادائیگی فرمائیں۔\n` +
                `شکریہ 🙏`;

            try {
                await client.sendMessage(phone, message);
                console.log(`✅ میسج بھیجا: ${client_data.name} (${phone})`);
                await sleep(3000); // 3 سیکنڈ رکیں
            } catch (err) {
                console.log(`❌ میسج نہیں بھیجا: ${client_data.name} - ${err.message}`);
            }
        }

    } catch (error) {
        console.log('❌ Data لانے میں خرابی:', error.message);
    }
}

// =============================================
// Phone Number Format کریں
// =============================================
function formatPhone(phone) {
    if (!phone) return null;
    let p = phone.toString().replace(/\D/g, '');
    if (p.startsWith('0')) p = '92' + p.slice(1);
    if (p.startsWith('3')) p = '92' + p;
    if (p.length < 11) return null;
    return p + '@c.us';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Bot شروع کریں
client.initialize();

