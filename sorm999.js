const https = require('https');
const vm = require('vm');

const SUPABASE_PACKS_URL = process.env.SUPABASE_PACKS_URL;
const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_KEY       = process.env.SUPABASE_KEY;
const ACCOUNT_ID         = parseInt(process.env.ACCOUNT_ID);

if (!SUPABASE_PACKS_URL) { console.error('Error: SUPABASE_PACKS_URL not configured'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Error: SUPABASE credentials not configured'); process.exit(1); }
if (!ACCOUNT_ID) { console.error('Error: ACCOUNT_ID not configured'); process.exit(1); }

const ACCOUNTS = [
    { supabaseId: 11, label: '11STAR', wishItemId: 9004 },
    { supabaseId: 44, label: '44STAR', wishItemId: 9004 },
    { supabaseId: 45, label: '45STAR', wishItemId: 9004 },
    { supabaseId: 95, label: '95STAR', wishItemId: 9004 },
];

const acc = ACCOUNTS.find(a => a.supabaseId === ACCOUNT_ID);
if (!acc) {
    console.error(`Error: No account found with supabaseId=${ACCOUNT_ID}`);
    process.exit(1);
}

function fetchAccount(supabaseId) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/accs?id=eq.${supabaseId}`);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        };
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const rows = JSON.parse(data);
                    if (rows.length === 0) return reject(new Error(`No account found with id=${supabaseId}`));
                    resolve(rows[0]);
                } catch (e) {
                    reject(new Error(`Parse error for id=${supabaseId}: ${e.message}`));
                }
            });
        }).on('error', reject);
    });
}

// دالة جلب البيانات
function fetchSoilPositions(supabaseId) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/soilPositions?id=eq.${supabaseId}`);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        };
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const rows = JSON.parse(data);
                    resolve(rows[0]?.positions || []);
                } catch(e) { resolve([]); }
            });
        }).on('error', () => resolve([]));
    });
}

function fetchBotCode() {
    return new Promise((resolve, reject) => {
        https.get(SUPABASE_PACKS_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const clean = data.replace(/^\uFEFF/, '').trim();
                if (!clean) return reject(new Error('Bot code is empty'));
                resolve(clean);
            });
        }).on('error', reject);
    });
}

function runBotForAccount(botCode, accountConfigJSON, label) {
    return new Promise((resolve, reject) => {
        console.log(`\n${'='.repeat(52)}`);
        console.log(`  Running: ${label}`);
        console.log(`${'='.repeat(52)}\n`);
        try {
            console.log('Bot code preview:', botCode.substring(0, 300));
            console.log('Bot code length:', botCode.length);
            const script = new vm.Script(botCode);        

            const fakeProcess = {
                ...process,
                env: { ...process.env, CA: accountConfigJSON },
                exit: (code) => {
                    console.log(`\n[${label}] Bot finished with code ${code}`);
                    if (code === 0) resolve();
                    else reject(new Error(`Bot exited with code ${code}`));
                }
            };
            const context = vm.createContext({
                require, process: fakeProcess, console, Buffer,
                setTimeout, setInterval, clearTimeout, clearInterval,
                __dirname, __filename, module, exports
            });
            script.runInContext(context);
        } catch (error) {
            reject(new Error(`VM error for ${label}: ${error.message}`));
        }
    });
}

(async () => {
    try {
        console.log(`Loading bot code... (Account: ${acc.label})`);
        const botCode = await fetchBotCode();
        console.log('✅ Bot code loaded\n');

        console.log(`Fetching config: id=${acc.supabaseId} (${acc.label})...`);
        const row = await fetchAccount(acc.supabaseId);
        console.log('Row keys:', Object.keys(row));
        
        // ---> التعديل هنا: استدعاء الدالة وتخزين النتيجة <---
        console.log(`Fetching soil positions for id=${acc.supabaseId}...`);
        const soilPositions = await fetchSoilPositions(acc.supabaseId);

        const name            = row.name            || acc.label;
        const snsid           = row.snsid           || '';
        const uid_session_key = row.uid_session_key || '';
        const cookies         = row.cookies         || [];

        if (!cookies.length) {
            console.error(`❌ Skipping ${acc.label}: cookies field is empty`);
            process.exit(1);
        }

        const accountConfigJSON = JSON.stringify([{
            id:              acc.label,
            supabaseId:      acc.supabaseId,
            wishItemId:      acc.wishItemId,   
            name,
            snsid,
            uid_session_key,
            cookies,
            soilPositions    // الآن هذا المتغير معرف وتم جلب قيمته
        }]);

        console.log(`✅ Account loaded: ${acc.label} | cookies: ${cookies.length} | wishItemId: ${acc.wishItemId}`);
        await runBotForAccount(botCode, accountConfigJSON, acc.label);

        console.log(`\n🎉 ${acc.label} completed successfully!`);
        process.exit(0);

    } catch (e) {
        console.error('\n❌ Fatal error:', e.message);
        process.exit(1);
    }
})();
