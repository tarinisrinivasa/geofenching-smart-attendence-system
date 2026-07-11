const http = require('http');
const https = require('https');

// Since we are running HTTPS locally, we bypass certificate validation
const agent = new https.Agent({
    rejectUnauthorized: false
});

function post(url, headers, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = https.request(url, {
            method: 'POST',
            agent,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(payload);
        req.end();
    });
}

async function run() {
    console.log('Logging in as HOD...');
    const loginRes = await post('https://localhost:3000/api/login', {}, {
        username: 'hod1',
        password: 'hod123'
    });

    console.log('Login Status:', loginRes.status);
    console.log('Login Body:', loginRes.body);

    if (loginRes.status !== 200 || !loginRes.body.token) {
        console.error('Login failed.');
        return;
    }

    const token = loginRes.body.token;
    const authHeaders = { 'Authorization': `Bearer ${token}` };

    console.log('\nTesting Reversal for Alert 101 (class_id = 1)...');
    const rev101 = await post('https://localhost:3000/api/alerts/101/reverse-attendance', authHeaders, {});
    console.log('Reversal 101 Status:', rev101.status);
    console.log('Reversal 101 Body:', rev101.body);

    console.log('\nTesting Reversal for Alert 102 (class_id = NULL)...');
    const rev102 = await post('https://localhost:3000/api/alerts/102/reverse-attendance', authHeaders, {});
    console.log('Reversal 102 Status:', rev102.status);
    console.log('Reversal 102 Body:', rev102.body);

    console.log('\nTesting Notify Parent for Alert 101...');
    const np101 = await post('https://localhost:3000/api/alerts/101/notify-parent', authHeaders, {});
    console.log('Notify Parent 101 Status:', np101.status);
    console.log('Notify Parent 101 Body:', np101.body);
}

run().catch(console.error);
