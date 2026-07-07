const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

// Auto-detect Render cloud persistent disks to prevent data wipes on server restart
let dbPath = path.resolve(__dirname, 'database.sqlite');
const persistentDirs = ['/var/data', '/data'];
for (const dir of persistentDirs) {
    try {
        if (fs.existsSync(dir)) {
            dbPath = path.resolve(dir, 'database.sqlite');
            console.log(`Persistent disk detected! Storing database at: ${dbPath}`);
            break;
        }
    } catch (e) {
        // Directory not accessible or exists check failed
    }
}
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        db.serialize(() => {
            // Create tables with updated schemas
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                role TEXT,
                barcode TEXT UNIQUE,
                device_id TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                teacher_id INTEGER,
                latitude REAL,
                longitude REAL,
                radius REAL,
                token_secret TEXT,
                accuracy REAL,
                active INTEGER DEFAULT 1
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER,
                student_id INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'present',
                request_lat REAL,
                request_lon REAL,
                UNIQUE(class_id, student_id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER,
                class_id INTEGER,
                message TEXT,
                status INTEGER DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS campus_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS otp_codes (
                student_id INTEGER PRIMARY KEY,
                class_id INTEGER,
                otp_code TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS student_passes (
                student_id INTEGER PRIMARY KEY,
                expiry DATETIME,
                reason TEXT,
                duration_mins INTEGER,
                notified_expired INTEGER DEFAULT 0
            )`);

            // Seed default campus settings if not present
            db.get("SELECT count(*) as count FROM campus_settings", (err, row) => {
                if (row && row.count === 0) {
                    console.log("Seeding default campus geofence settings...");
                    db.run("INSERT INTO campus_settings (key, value) VALUES ('campus_latitude', '17.3850')");
                    db.run("INSERT INTO campus_settings (key, value) VALUES ('campus_longitude', '78.4867')");
                    db.run("INSERT INTO campus_settings (key, value) VALUES ('campus_radius', '500')");
                    db.run("INSERT INTO campus_settings (key, value) VALUES ('college_start_time', '09:00')");
                    db.run("INSERT INTO campus_settings (key, value) VALUES ('college_end_time', '16:00')");
                }
            });

            // Migration: Helper to add columns dynamically if the database file was already created
            db.run("ALTER TABLE users ADD COLUMN barcode TEXT UNIQUE", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE users ADD COLUMN device_id TEXT", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE users ADD COLUMN parent_phone TEXT", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE users ADD COLUMN device_biometric_id TEXT UNIQUE", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE users ADD COLUMN last_seen TEXT", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE users ADD COLUMN is_keypad INTEGER DEFAULT 0", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE users ADD COLUMN coordinator_class_id INTEGER", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE alerts ADD COLUMN class_id INTEGER", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE alerts ADD COLUMN student_reason TEXT", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE alerts ADD COLUMN latitude REAL", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE alerts ADD COLUMN longitude REAL", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE classes ADD COLUMN token_secret TEXT", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE classes ADD COLUMN accuracy REAL", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE attendance ADD COLUMN status TEXT DEFAULT 'present'", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE attendance ADD COLUMN request_lat REAL", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE attendance ADD COLUMN request_lon REAL", (err) => { /* Ignore duplicate column errors */ });
            
            // Clean up and seed exact demo accounts if no coordinators exist (indicates old database version on Render)
            db.get("SELECT count(*) as count FROM users WHERE role = 'coordinator'", (err, row) => {
                if (err || !row || row.count === 0) {
                    console.log("Wiping old database structures on Render to seed fresh coordinator roster...");
                    
                    db.run("DELETE FROM users");
                    db.run("DELETE FROM classes");
                    db.run("DELETE FROM attendance");
                    db.run("DELETE FROM alerts");
                    db.run("DELETE FROM student_passes");
                    db.run("DELETE FROM otp_codes");

                    console.log("Seeding clean demo environment accounts...");

                    // 1. Seed 6 HODs
                    for (let i = 1; i <= 6; i++) {
                        const username = `hod${i}`;
                        const password = `hod123`;
                        const hashedPassword = bcrypt.hashSync(password, 10);
                        db.run('INSERT INTO users (username, password, role) VALUES (?,?,?)', [username, hashedPassword, 'hod']);
                    }

                    // 2. Seed 5 Teachers
                    for (let i = 1; i <= 5; i++) {
                        const username = `teacher${i}`;
                        const password = `teacher123`;
                        const hashedPassword = bcrypt.hashSync(password, 10);
                        db.run('INSERT INTO users (username, password, role) VALUES (?,?,?)', [username, hashedPassword, 'teacher']);
                    }

                    // 3. Seed 3 Coordinators (assigned to class IDs 1, 2, and 3)
                    for (let i = 1; i <= 3; i++) {
                        const username = `coordinator${i}`;
                        const password = `coordinator123`;
                        const hashedPassword = bcrypt.hashSync(password, 10);
                        db.run('INSERT INTO users (username, password, role, coordinator_class_id) VALUES (?,?,?,?)', [username, hashedPassword, 'coordinator', i]);
                    }

                    // 4. Seed 6 Students
                    for (let i = 1; i <= 6; i++) {
                        const username = `student${i}`;
                        const password = `student123`;
                        const barcode = `STU10${i}`;
                        const parentPhone = `+91 90123 4560${i}`;
                        const hashedPassword = bcrypt.hashSync(password, 10);
                        // Make student6 a Keypad Phone User by default for testing/demo override
                        const isKeypad = (i === 6) ? 1 : 0;
                        db.run('INSERT INTO users (username, password, role, barcode, parent_phone, is_keypad) VALUES (?,?,?,?,?,?)', [username, hashedPassword, 'student', barcode, parentPhone, isKeypad]);
                    }

                    // 5. Seed 3 Demo Classes
                    db.run("INSERT INTO classes (id, name, teacher_id, latitude, longitude, radius, token_secret, accuracy) VALUES (1, 'CSE-A (Section Alpha)', 1, 17.3850, 78.4867, 50, 'sec1', 10)");
                    db.run("INSERT INTO classes (id, name, teacher_id, latitude, longitude, radius, token_secret, accuracy) VALUES (2, 'CSE-B (Section Beta)', 1, 17.3850, 78.4867, 50, 'sec2', 10)");
                    db.run("INSERT INTO classes (id, name, teacher_id, latitude, longitude, radius, token_secret, accuracy) VALUES (3, 'ECE-A (Section Gamma)', 2, 17.3850, 78.4867, 50, 'sec3', 10)");

                    console.log("Database seeded successfully!");
                }
            });

            // Write static credentials helper file locally
            let credentialsLog = "=========================================\n";
            credentialsLog += "AUTO-GENERATED SECURED LOGIN CREDENTIALS\n";
            credentialsLog += "=========================================\n\n";
            credentialsLog += "HOD ACCOUNTS (6 Total)\n";
            credentialsLog += "---------------------\n";
            for (let i = 1; i <= 6; i++) {
                credentialsLog += `Username: hod${i} | Password: hod123\n`;
            }
            credentialsLog += "\nTEACHER ACCOUNTS (5 Total)\n";
            credentialsLog += "---------------------------\n";
            for (let i = 1; i <= 5; i++) {
                credentialsLog += `Username: teacher${i} | Password: teacher123\n`;
            }
            credentialsLog += "\nCOORDINATOR ACCOUNTS (3 Total)\n";
            credentialsLog += "-------------------------------\n";
            for (let i = 1; i <= 3; i++) {
                credentialsLog += `Username: coordinator${i} | Password: coordinator123 | Coordinator Class ID: ${i}\n`;
            }
            credentialsLog += "\nSTUDENT ACCOUNTS (6 Total)\n";
            credentialsLog += "---------------------------\n";
            for (let i = 1; i <= 6; i++) {
                credentialsLog += `Username: student${i} | Password: student123 | Barcode ID: STU10${i} | Parent: +91 90123 4560${i}${i === 6 ? ' (Keypad phone exempted)' : ''}\n`;
            }
            const logPath = path.resolve(__dirname, 'generated_credentials.txt');
            fs.writeFileSync(logPath, credentialsLog, 'utf8');
        });
    }
});

module.exports = db;
