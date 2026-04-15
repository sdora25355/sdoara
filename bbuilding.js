const https    = require('https');
const vm       = require('vm');
const puppeteer = require('puppeteer');
const axios    = require('axios');

const SUPABASE_CODE_URL = process.env.SUPABASE_CODE_URL;
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_KEY;

// قاعدة بيانات الروابط (مختلفة عن قاعدة الكوكيز)
const V_URL  = process.env.V_URL;
const V_KEY  = process.env.V_KEY;

const TG_TOKEN   = process.env.TA;
const TG_CHAT_ID = process.env.CB;
const GAME_URL   = process.env.SA;

if (!SUPABASE_CODE_URL) { console.error('Error: SUPABASE_CODE_URL not configured'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Error: SUPABASE credentials not configured'); process.exit(1); }

// ─────────────────────────────────────────────────────────────────
// إرسال رسالة تلغرام
// ─────────────────────────────────────────────────────────────────
async function sendTelegram(msg) {
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: msg,
            parse_mode: 'HTML'
        });
    } catch (e) {
        console.error('[TG] Error:', e.message);
    }
}

// ─────────────────────────────────────────────────────────────────
// اختبار الوصول لـ vkff من داخل صفحة اللعبة
// ─────────────────────────────────────────────────────────────────
const LINK_TYPES = [
    { id: 4,  label: "قسائم صفراء 🟡",    filter: "g_type=eq.white_voucher"  },
    { id: 5,  label: "قسائم أرجوانية 🟣", filter: "g_type=eq.purple_voucher" },
    { id: 6,  label: "قسائم خضراء 🟢",    filter: "g_type=eq.green_voucher"  },
    { id: 15, label: "حزمة المبتدئين 📦", filter: "g_id=like.*240894*"        },
    { id: 16, label: "حزمة رائعة ⭐",      filter: "g_id=like.*240895*"        },
];

async function testVkffInGame(account) {
    if (!V_URL || !V_KEY) {
        console.log('[VKFF] V_URL or V_KEY not set — skipping test');
        await sendTelegram('⚠️ <b>اختبار VKFF</b>\nلم يتم تعيين V_URL أو V_KEY في Secrets');
        return;
    }

    console.log('\n[VKFF] ── بدء اختبار الوصول لقاعدة بيانات الروابط ──');
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        // ضبط الكوكيز
        const cookies = account.cookies.map(c => ({
            name: c.name, value: c.value,
            domain: '.centurygames.com', path: '/'
        }));
        await page.setCookie(...cookies);

        console.log('[VKFF] تحميل صفحة اللعبة...');
        await page.goto(GAME_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // انتظار تحميل اللعبة
        await page.waitForFunction(() => window.GF?.loginModel?.AppData, { timeout: 120000 });
        console.log('[VKFF] ✅ اللعبة محملة — جاري جلب العدادات...');

        // جلب العدادات من داخل الصفحة
        const counts = await page.evaluate(async (V_URL, V_KEY, LINK_TYPES) => {
            const results = {};
            for (const t of LINK_TYPES) {
                try {
                    const res = await fetch(
                        `${V_URL}/rest/v1/vkff?${t.filter}&run_time=lte.10&select=g_id`,
                        {
                            headers: {
                                'apikey':        V_KEY,
                                'Authorization': `Bearer ${V_KEY}`,
                                'Content-Type':  'application/json'
                            }
                        }
                    );
                    const data = await res.json();
                    results[t.id] = Array.isArray(data) ? data.length : `خطأ: ${JSON.stringify(data)}`;
                } catch (e) {
                    results[t.id] = `استثناء: ${e.message}`;
                }
            }
            return results;
        }, V_URL, V_KEY, LINK_TYPES);

        console.log('[VKFF] النتائج:', counts);

        // بناء رسالة التلغرام
        const lines = LINK_TYPES.map(t => `${t.label}: <b>${counts[t.id]}</b>`).join('\n');
        const hasData = LINK_TYPES.some(t => typeof counts[t.id] === 'number' && counts[t.id] > 0);

        await sendTelegram(
            `${hasData ? '✅' : '⚠️'} <b>اختبار الوصول لـ VKFF</b>\n` +
            `الحساب: ${account.name}\n\n` +
            `${lines}\n\n` +
            `${hasData
                ? '🟢 تم الوصول لقاعدة البيانات بنجاح!'
                : '🔴 الاتصال يعمل لكن لا توجد روابط حالياً (0)'
            }`
        );

    } catch (e) {
        console.error('[VKFF] خطأ:', e.message);
        await sendTelegram(`❌ <b>فشل اختبار VKFF</b>\nالخطأ: ${e.message}`);
    } finally {
        if (browser) await browser.close().catch(() => {});
        console.log('[VKFF] ── انتهى الاختبار ──\n');
    }
}

// ─────────────────────────────────────────────────────────────────
// جلب إعدادات الحساب من Supabase
// ─────────────────────────────────────────────────────────────────
function fetchAccountConfig(callback) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/accs?id=eq.45`);

    const options = {
        hostname: url.hostname,
        path:     url.pathname + url.search,
        method:   'GET',
        headers: {
            'apikey':        SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type':  'application/json'
        }
    };

    https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const accounts = JSON.parse(data);
                if (accounts.length === 0) {
                    console.error('Error: No account found with id=6 in accs table');
                    process.exit(1);
                }
                const row             = accounts[0];
                const name            = row.name            || 'Account';
                const snsid           = row.snsid           || '';
                const uid_session_key = row.uid_session_key || '';
                const cookies         = row.cookies         || [];

                if (!cookies.length) {
                    console.error('Error: cookies field is empty for id=6');
                    process.exit(1);
                }

                const accountConfigJSON = JSON.stringify([{
                    id: '5STAR', name, snsid, uid_session_key, cookies
                }]);

                console.log(`✅ Account loaded: 5STAR | cookies: ${cookies.length}`);
                callback(accountConfigJSON, { name, cookies });

            } catch (error) {
                console.error('Error parsing account data:', error.message);
                process.exit(1);
            }
        });
    }).on('error', error => {
        console.error('Error fetching account config from Supabase:', error.message);
        process.exit(1);
    });
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────
console.log('Fetching account configuration from Supabase (accs table)...');

fetchAccountConfig(async (accountConfigJSON, account) => {

    // ── اختبار VKFF قبل تشغيل الكود الرئيسي ──
    await testVkffInGame(account);

    // ── تشغيل الكود الرئيسي ──
    console.log('Loading bot code from secure storage...');

    https.get(SUPABASE_CODE_URL, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const cleanCode = data.replace(/^\uFEFF/, '').trim();
                console.log('Code loaded successfully. Validating and starting bot...');

                const script  = new vm.Script(cleanCode);
                const context = vm.createContext({
                    require,
                    process: {
                        ...process,
                        env: { ...process.env, CA: accountConfigJSON }
                    },
                    console, Buffer,
                    setTimeout, setInterval, clearTimeout, clearInterval,
                    __dirname, __filename, module, exports
                });

                script.runInContext(context);

            } catch (error) {
                console.error('Error executing bot code:');
                console.error(error.stack || error.message);
                process.exit(1);
            }
        });
    }).on('error', error => {
        console.error('Error loading bot code from Supabase:', error.message);
        process.exit(1);
    });
});
