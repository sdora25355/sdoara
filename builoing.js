const https = require('https');
const vm = require('vm');

const SUPABASE_CODE_URL = process.env.SUPABASE_CODE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL; 
const SUPABASE_KEY = process.env.SUPABASE_KEY; 

if (!SUPABASE_CODE_URL) {
    console.error('Error: SUPABASE_CODE_URL not configured');
    process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: SUPABASE credentials not configured');
    process.exit(1);
}

console.log('Fetching account configuration from Supabase...');

function fetchAccountConfig(callback) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/accounts?id=eq.1`);
    
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
                    console.error('Error: No account found with id=1');
                    process.exit(1);
                }

                const sr = accounts[0].sr;
                const name = accounts[0].name || 'Account';
                
                if (!sr) {
                    console.error('Error: SR field is empty for id=1');
                    process.exit(1);
                }


                const accountConfigJSON = JSON.stringify([{
                    name: name,
                    sr: sr
                }]);

                console.log('✅ Account configuration loaded from Supabase');
                callback(accountConfigJSON);

            } catch (error) {
                console.error('Error parsing account data:', error.message);
                process.exit(1);
            }
        });

    }).on('error', (error) => {
        console.error('Error fetching account config from Supabase:', error.message);
        process.exit(1);
    });
}

fetchAccountConfig((accountConfig) => {
    console.log('Loading bot code from secure storage...');

    https.get(SUPABASE_CODE_URL, (res) => {
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
                            CA: accountConfig // الآن accountConfig هو JSON صالح
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
