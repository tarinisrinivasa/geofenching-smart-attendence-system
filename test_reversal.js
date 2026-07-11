const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database.');
});

db.serialize(() => {
    // 1. Create a dummy class if it doesn't exist
    db.run("INSERT OR IGNORE INTO classes (id, name, teacher_id, latitude, longitude, radius, active) VALUES (1, 'Test Class', 1, 17.385, 78.486, 50, 1)");

    // 2. Create a dummy student if it doesn't exist
    db.run("INSERT OR IGNORE INTO users (id, username, password, role, parent_phone, is_keypad) VALUES (99, 'teststudent', 'hash', 'student', '+91 99999 88888', 0)");

    // 3. Insert a dummy geofence breach alert (class_id = 1)
    db.run("INSERT INTO alerts (id, student_id, class_id, message, status) VALUES (101, 99, 1, '🚨 Geofence Breach Test message', 0)", function(err) {
        if (err) console.error('Error inserting alert 101:', err.message);
        else console.log('Inserted alert 101 with class_id = 1');
    });

    // 4. Insert a dummy biometric breach alert (class_id = NULL)
    db.run("INSERT INTO alerts (id, student_id, class_id, message, status) VALUES (102, 99, NULL, '🚨 Biometric Breach Test message', 0)", function(err) {
        if (err) console.error('Error inserting alert 102:', err.message);
        else console.log('Inserted alert 102 with class_id = NULL');
    });

    // 5. Test Query alerts
    db.all("SELECT * FROM alerts WHERE id IN (101, 102)", [], (err, rows) => {
        if (err) {
            console.error('Error querying alerts:', err.message);
        } else {
            console.log('Current alerts in DB:', rows);
        }
        db.close();
    });
});
