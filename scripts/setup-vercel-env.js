const https = require('https');
require('dotenv').config();

function vercelRequest(path, method = 'GET', body = null, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, 'https://api.vercel.com');
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch(e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function syncVercelEnv(customConfig = {}) {
    const token = customConfig.token || process.env.VERCEL_TOKEN;
    const projectName = customConfig.projectName || 'maple-roan';

    if (!token) {
        console.error('❌ Error: Vercel Token is required.');
        console.log('You can generate a personal access token at: https://vercel.com/account/tokens');
        process.exit(1);
    }

    console.log(`🍁 Connecting to Vercel project: ${projectName}...`);

    // 1. Verify Project
    const projectRes = await vercelRequest(`/v9/projects/${projectName}`, 'GET', null, token);
    if (projectRes.status !== 200) {
        console.error(`❌ Could not find Vercel project "${projectName}".`, projectRes.data);
        process.exit(1);
    }
    console.log(`✅ Found Vercel Project: ${projectRes.data.name} (ID: ${projectRes.data.id})`);

    // 2. Fetch existing env vars
    const envListRes = await vercelRequest(`/v9/projects/${projectName}/env`, 'GET', null, token);
    const existingEnvs = (envListRes.data && envListRes.data.envs) || [];
    const existingMap = {};
    existingEnvs.forEach(e => { existingMap[e.key] = e.id; });

    // 3. Variables to sync
    const envsToSync = [
        {
            key: 'MONGO_URI',
            value: customConfig.mongoUri || process.env.MONGO_URI,
            target: ['production', 'preview', 'development']
        },
        {
            key: 'JWT_SECRET',
            value: customConfig.jwtSecret || process.env.JWT_SECRET || 'maple_bms_production_secret_jwt_2026',
            target: ['production', 'preview', 'development']
        },
        {
            key: 'RAZORPAY_KEY_ID',
            value: customConfig.razorpayKeyId || process.env.RAZORPAY_KEY_ID || 'rzp_test_T7SOBhHsCvrWoC',
            target: ['production', 'preview', 'development']
        },
        {
            key: 'RAZORPAY_KEY_SECRET',
            value: customConfig.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET,
            target: ['production', 'preview', 'development']
        },
        {
            key: 'NEXT_PUBLIC_RAZORPAY_KEY_ID',
            value: customConfig.razorpayKeyId || process.env.RAZORPAY_KEY_ID || 'rzp_test_T7SOBhHsCvrWoC',
            target: ['production', 'preview', 'development']
        }
    ];

    console.log('\n--- Syncing Environment Variables to Vercel ---');
    for (const item of envsToSync) {
        if (!item.value || item.value.includes('****')) {
            console.warn(`⚠️  Skipping ${item.key}: Value is missing or masked.`);
            continue;
        }

        if (existingMap[item.key]) {
            // Update existing
            const updateRes = await vercelRequest(
                `/v9/projects/${projectName}/env/${existingMap[item.key]}`,
                'PATCH',
                { value: item.value, target: item.target },
                token
            );
            if (updateRes.status === 200) {
                console.log(`✅ Updated ${item.key} in ${item.target.join(', ')}`);
            } else {
                console.error(`❌ Failed to update ${item.key}:`, updateRes.data);
            }
        } else {
            // Create new
            const createRes = await vercelRequest(
                `/v10/projects/${projectName}/env`,
                'POST',
                { key: item.key, value: item.value, type: 'encrypted', target: item.target },
                token
            );
            if (createRes.status === 200 || createRes.status === 201) {
                console.log(`✅ Created ${item.key} in ${item.target.join(', ')}`);
            } else {
                console.error(`❌ Failed to create ${item.key}:`, createRes.data);
            }
        }
    }

    console.log('\n🎉 All environment variables synchronized successfully to Vercel!');
}

module.exports = { syncVercelEnv };

if (require.main === module) {
    syncVercelEnv().catch(err => {
        console.error('Sync failed:', err);
        process.exit(1);
    });
}

