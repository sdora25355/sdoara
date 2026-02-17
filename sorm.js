const https = require('https');
const vm = require('vm');

const SUPABASE_CODE_URL2 = process.env.SUPABASE_CODE_URL2;
const SUPABASE_URL = process.env.SUPABASE_URL; 
const SUPABASE_KEY = process.env.SUPABASE_KEY; 

if (!SUPABASE_CODE_URL2) {
    console.error('Error: SUPABASE_CODE_URL2 not configured');
    process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: SUPABASE credentials not configured');
    process.exit(1);
}

console.log('Fetching account configuration from Supabase...');

// جلب حساب واحد بالـ id المحدد
function fetchAccountById(id) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/accounts?id=eq.${id}`);

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

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const accounts = JSON.parse(data);

                    if (accounts.length === 0) {
                        return reject(new Error(`No account found with id=${id}`));
                    }

                    const sr = accounts[0].sr;
                    const name = accounts[0].name || `Account_${id}`;

                    if (!sr) {
                        return reject(new Error(`SR field is empty for id=${id}`));
                    }

                    resolve({ id, name, sr });

                } catch (error) {
                    reject(new Error(`Error parsing data for id=${id}: ${error.message}`));
                }
            });

        }).on('error', (error) => {
            reject(new Error(`Error fetching id=${id}: ${error.message}`));
        });
    });
}

// جلب الحسابات 2 ثم 3 ثم 4 بالترتيب
async function fetchAllAccounts() {
    const targetIds = [2, 3, 4];
    const results = [];

    for (const id of targetIds) {
        try {
            console.log(`   Fetching account id=${id}...`);
            const account = await fetchAccountById(id);
            results.push(account);
            console.log(`   ✅ Account id=${id} (${account.name}) loaded`);
        } catch (err) {
            console.error(`   ⚠️ Skipping id=${id}: ${err.message}`);
        }
    }

    if (results.length === 0) {
        console.error('Error: No accounts loaded (ids 2, 3, 4)');
        process.exit(1);
    }

    return results;
}

fetchAllAccounts().then((accounts) => {
    const accountConfigJSON = JSON.stringify(accounts);

    console.log(`✅ Loaded ${accounts.length} account(s): ids [${accounts.map(a => a.id).join(', ')}]`);
    console.log('Loading bot code from secure storage...');

    https.get(SUPABASE_CODE_URL2, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const cleanCode = data.replace(/^\uFEFF/, '').trim();

                console.log('Code loaded successfully. Validating and starting bot...');

                const script = new vm.Script(cleanCode);

                const context = vm.createContext({
                    require: require,
                    process: {
                        ...process,
                        env: {
                            ...process.env,
                            CA: accountConfigJSON
                        }
                    },
                    console: console,
                    Buffer: Buffer,
                    setTimeout: setTimeout,
                    setInterval: setInterval,
                    clearTimeout: clearTimeout,
                    clearInterval: clearInterval,
                    __dirname: __dirname,
                    __filename: __filename,
                    module: module,
                    exports: exports
                });

                script.runInContext(context);

            } catch (error) {
                console.error('Error executing bot code:');
                console.error(error.stack || error.message);
                process.exit(1);
            }
        });

    }).on('error', (error) => {
        console.error('Error loading bot code from Supabase:', error.message);
        process.exit(1);
    });
});
