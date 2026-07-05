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

            // Migration: Helper to add columns dynamically if the database file was already created
            db.run("ALTER TABLE users ADD COLUMN barcode TEXT UNIQUE", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE users ADD COLUMN device_id TEXT", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE users ADD COLUMN parent_phone TEXT", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE alerts ADD COLUMN class_id INTEGER", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE classes ADD COLUMN token_secret TEXT", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE classes ADD COLUMN accuracy REAL", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE attendance ADD COLUMN status TEXT DEFAULT 'present'", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE attendance ADD COLUMN request_lat REAL", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE attendance ADD COLUMN request_lon REAL", (err) => { /* Ignore duplicate column errors */ });
            
            // Retroactively populate student parent phones
            db.run("UPDATE users SET parent_phone = '+91 90123 456' || substr('0' || (id - 21), -2) WHERE role = 'student' AND parent_phone IS NULL");

            // Robust individual seeding (creates HOD or other users if they are missing from the table)
            db.get("SELECT count(*) as count FROM users WHERE role = 'hod'", (err, row) => {
                if (row && row.count === 0) {
                    console.log("Seeding HOD account...");
                    const hodUsername = 'hod1';
                    const hodPassword = 'hod123';
                    const hashedHodPassword = bcrypt.hashSync(hodPassword, 10);
                    db.run('INSERT INTO users (username, password, role, barcode) VALUES (?,?,?,?)', [hodUsername, hashedHodPassword, 'hod', null]);
                }
            });

            db.get("SELECT count(*) as count FROM users WHERE role = 'teacher'", (err, row) => {
                if (row && row.count === 0) {
                    console.log("Seeding 20 teachers...");
                    const insert = db.prepare('INSERT INTO users (username, password, role, barcode) VALUES (?,?,?,?)');
                    for (let i = 1; i <= 20; i++) {
                        const username = `teacher${i}`;
                        const password = `teacher123`;
                        const hashedPassword = bcrypt.hashSync(password, 10);
                        insert.run([username, hashedPassword, 'teacher', null]);
                    }
                    insert.finalize();
                }
            });

            db.get("SELECT count(*) as count FROM users WHERE role = 'student'", (err, row) => {
                if (row && row.count === 0) {
                    console.log("Seeding 67 students...");
                    const insert = db.prepare('INSERT INTO users (username, password, role, barcode, parent_phone) VALUES (?,?,?,?,?)');
                    for (let i = 1; i <= 67; i++) {
                        const username = `student${i}`;
                        const password = `student123`;
                        const barcode = `STU${100 + i}`;
                        const parentPhone = `+91 90123 456${i.toString().padStart(2, '0')}`;
                        const hashedPassword = bcrypt.hashSync(password, 10);
                        insert.run([username, hashedPassword, 'student', barcode, parentPhone]);
                    }
                    insert.finalize();
                }
            });

            // Write static credentials helper file locally
            let credentialsLog = "=========================================\n";
            credentialsLog += "AUTO-GENERATED SECURED LOGIN CREDENTIALS\n";
            credentialsLog += "=========================================\n\n";
            credentialsLog += "HOD ACCOUNT (1 Total)\n";
            credentialsLog += "---------------------\n";
            credentialsLog += `Username: hod1 | Password: hod123\n\n`;
            credentialsLog += "TEACHER ACCOUNTS (20 Total)\n";
            credentialsLog += "---------------------------\n";
            for (let i = 1; i <= 20; i++) {
                credentialsLog += `Username: teacher${i} | Password: teacher123\n`;
            }
            credentialsLog += "\nSTUDENT ACCOUNTS (67 Total)\n";
            credentialsLog += "---------------------------\n";
            for (let i = 1; i <= 67; i++) {
                credentialsLog += `Username: student${i} | Password: student123 | Barcode ID: STU${100 + i}\n`;
            }
            const logPath = path.resolve(__dirname, 'generated_credentials.txt');
            fs.writeFileSync(logPath, credentialsLog, 'utf8');
        });
    }
});

module.exports = db;
