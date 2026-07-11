const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
        process.exit(1);
    }
});

db.all(`
    SELECT a.*, u.username, u.parent_phone 
    FROM alerts a 
    LEFT JOIN users u ON a.student_id = u.id
`, [], (err, rows) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log('--- ALL ALERTS IN DATABASE ---');
        console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
});
