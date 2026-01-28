const https = require('https');
const vm = require('vm');
const SUPABASE_URL = process.env.SUPABASE_CODE_URL;
if (!SUPABASE_URL) {
    console.error('Error: SUPABASE_CODE_URL not configured');
    process.exit(1);
}
console.log('Loading bot code from secure storage...');
https.get(SUPABASE_URL, (res) => {
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
                process: process,
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
