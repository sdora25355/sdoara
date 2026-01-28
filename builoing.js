const https = require('https');
const vm = require('vm');

// جلب الرابط من متغيرات البيئة
const SUPABASE_URL = process.env.SUPABASE_CODE_URL;

if (!SUPABASE_URL) {
    console.error('Error: SUPABASE_CODE_URL not configured');
    process.exit(1);
}

console.log('Loading bot code from secure storage...');

https.get(SUPABASE_URL, (res) => {
    let data = '';

    // تجميع البيانات المستلمة
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            // 1. تنظيف الكود من أي رموز مخفية (BOM) أو مسافات زائدة ناتجة عن التحميل
            const cleanCode = data.replace(/^\uFEFF/, '').trim();

            console.log('Code loaded successfully. Validating and starting bot...');

            // 2. إنشاء الـ Script (تم التأكد من عدم تكرار التعريف هنا)
            const script = new vm.Script(cleanCode);

            // 3. إعداد البيئة الافتراضية لتشغيل الكود
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

            // 4. تنفيذ الكود داخل السياق المحمي
            script.runInContext(context);

        } catch (error) {
            // إظهار تفاصيل الخطأ بدقة في حال وجود مشكلة في كود البوت المرفوع
            console.error('Error executing bot code:');
            console.error(error.stack || error.message);
            process.exit(1);
        }
    });

}).on('error', (error) => {
    console.error('Error loading bot code from Supabase:', error.message);
    process.exit(1);
});
