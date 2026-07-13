const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });

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

function get(url, headers) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: 'GET',
            agent,
            headers
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
        req.end();
    });
}

const db = new sqlite3.Database(path.resolve(__dirname, 'database.sqlite'));

async function testQR() {
    console.log('--- TESTING QR TOKEN API ---');

    // 1. Get teacher token
    const loginRes = await post('https://localhost:3000/api/login', {}, { username: 'teacher1', password: 'teacher123' });
    const teacherToken = loginRes.body.token;
    const headers = { 'Authorization': `Bearer ${teacherToken}` };

    // 2. Query classes for this teacher
    const classesRes = await get(`https://localhost:3000/api/classes/${loginRes.body.user.id}?with_counts=true`, headers);
    console.log('Classes for teacher:', classesRes.body);

    const active = (classesRes.body.classes || []).find(c => c.active === 1);
    if (!active) {
        console.log('No active class found in DB. Creating one...');
        // Let's activate one or create one
        await new Promise((res) => db.run("UPDATE classes SET active = 1 WHERE id = 1", [], res));
    }

    // Query active class token
    const tokenRes = await get('https://localhost:3000/api/classes/1/token', headers);
    console.log('QR Token Endpoint Response:', tokenRes.body);

    console.log('--- TEST COMPLETED ---');
}

testQR().catch(console.error).finally(() => db.close());
