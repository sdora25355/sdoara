const https = require('https');
const vm    = require('vm');

const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_KEY       = process.env.SUPABASE_KEY;
const SUPABASE_PACKS_URL = process.env.SUPABASE_PACKS_URL; // رابط الكود من Supabase Storage

const ACCOUNT_IDS = [11, 44, 45];

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ SUPABASE_URL و SUPABASE_KEY مطلوبان');
    process.exit(1);
}
if (!SUPABASE_PACKS_URL) {
    console.error('❌ SUPABASE_PACKS_URL مطلوب');
    process.exit(1);
}

// ─── جلب حساب واحد من Supabase ──────────────────────────────
function fetchAccount(id) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/accs?id=eq.${id}`);
        const opts = {
            hostname: url.hostname,
            path:     url.pathname + url.search,
            method:   'GET',
            headers: {
                'apikey':        SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type':  'application/json'
            }
        };
        https.get(opts, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try {
                    const rows = JSON.parse(raw);
                    if (!rows.length) return reject(new Error(`لا يوجد حساب id=${id}`));
                    resolve(rows[0]);
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

// ─── جلب جميع الحسابات ──────────────────────────────────────
async function fetchAllAccounts() {
    const accounts = [];
    for (const id of ACCOUNT_IDS) {
        console.log(`🔍 جلب الحساب id=${id}...`);
        const acc = await fetchAccount(id);
        console.log(`✅ جُلب: ${acc.name} (id=${id}) | كوكيز: ${Array.isArray(acc.cookies) ? acc.cookies.length : '?'}`);
        accounts.push({
            id:              id,
            name:            acc.name            || `Account_${id}`,
            snsid:           acc.snsid           || '',
            uid_session_key: acc.uid_session_key || '',
            cookies:         acc.cookies         || []
        });
    }
    return accounts;
}

// ─── جلب الكود من Supabase Storage وتشغيله ──────────────────
function fetchAndRunCode(accountsJson) {
    console.log('\n📥 جلب كود فتح الحزم من Supabase Storage...');

    https.get(SUPABASE_PACKS_URL, res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
            try {
                const cleanCode = raw.replace(/^\uFEFF/, '').trim();
                console.log('✅ الكود جُلب بنجاح. بدء التشغيل...\n');

                const script  = new vm.Script(cleanCode);
                const context = vm.createContext({
                    require,
                    process: {
                        ...process,
                        env: {
                            ...process.env,
                            PACKS_ACCOUNTS: accountsJson,  // تمرير الحسابات للكود
                            SA: process.env.SA             // رابط اللعبة
                        }
                    },
                    console,
                    Buffer,
                    setTimeout,
                    setInterval,
                    clearTimeout,
                    clearInterval,
                    __dirname,
                    __filename,
                    module,
                    exports
                });

                script.runInContext(context);

            } catch (e) {
                console.error('❌ خطأ في تشغيل الكود:', e.stack || e.message);
                process.exit(1);
            }
        });
    }).on('error', e => {
        console.error('❌ فشل جلب الكود من Supabase:', e.message);
        process.exit(1);
    });
}

// ─── Main ────────────────────────────────────────────────────
(async () => {
    try {
        console.log('🚀 Open Packs Building - بدء التشغيل');
        console.log(`📋 الحسابات: ${ACCOUNT_IDS.join(', ')}\n`);

        const accounts    = await fetchAllAccounts();
        const accountsJson = JSON.stringify(accounts);

        fetchAndRunCode(accountsJson);

    } catch (e) {
        console.error('❌ خطأ:', e.message);
        process.exit(1);
    }
})();
