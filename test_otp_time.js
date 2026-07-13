const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS test_time (timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("INSERT INTO test_time DEFAULT VALUES");
    db.get("SELECT timestamp FROM test_time ORDER BY rowid DESC LIMIT 1", [], (err, row) => {
        if (row) {
            console.log("Raw SQLite timestamp from database:", JSON.stringify(row.timestamp));
            const formatted = row.timestamp.replace(' ', 'T') + 'Z';
            const parsed1 = new Date(row.timestamp + 'Z');
            const parsed2 = new Date(formatted);
            console.log("Parsed using (row.timestamp + 'Z'):", parsed1.toString(), "getTime:", parsed1.getTime());
            console.log("Parsed using (row.timestamp.replace(' ', 'T') + 'Z'):", parsed2.toString(), "getTime:", parsed2.getTime());
            console.log("Current Date.now():", Date.now());
            console.log("Elapsed using raw + 'Z':", (Date.now() - parsed1.getTime()) / 1000);
            console.log("Elapsed using formatted:", (Date.now() - parsed2.getTime()) / 1000);
        }
        db.run("DROP TABLE test_time");
        db.close();
    });
});
