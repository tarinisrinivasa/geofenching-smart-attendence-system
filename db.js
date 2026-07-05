const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
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
                barcode TEXT UNIQUE
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

            // Migration: Helper to add columns dynamically if the database file was already created
            db.run("ALTER TABLE users ADD COLUMN barcode TEXT UNIQUE", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE classes ADD COLUMN token_secret TEXT", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE classes ADD COLUMN accuracy REAL", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE attendance ADD COLUMN status TEXT DEFAULT 'present'", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE attendance ADD COLUMN request_lat REAL", (err) => { /* Ignore duplicate column errors */ });
            db.run("ALTER TABLE attendance ADD COLUMN request_lon REAL", (err) => { /* Ignore duplicate column errors */ });

            // Seed initial data
            db.get("SELECT count(*) as count FROM users", async (err, row) => {
                if (row && row.count === 0) {
                    console.log("Seeding database with 20 teachers and 67 students...");
                    
                    let credentialsLog = "=========================================\n";
                    credentialsLog += "AUTO-GENERATED SECURED LOGIN CREDENTIALS\n";
                    credentialsLog += "=========================================\n\n";
                    
                    credentialsLog += "TEACHER ACCOUNTS (20 Total)\n";
                    credentialsLog += "---------------------------\n";
                    
                    const insert = db.prepare('INSERT INTO users (username, password, role, barcode) VALUES (?,?,?,?)');
                    
                    // Seed 20 Teachers
                    for (let i = 1; i <= 20; i++) {
                        const username = `teacher${i}`;
                        const password = `teacher123`;
                        const hashedPassword = bcrypt.hashSync(password, 10);
                        insert.run([username, hashedPassword, 'teacher', null]);
                        credentialsLog += `Username: ${username} | Password: ${password}\n`;
                    }
                    
                    credentialsLog += "\nSTUDENT ACCOUNTS (67 Total)\n";
                    credentialsLog += "---------------------------\n";
                    
                    // Seed 67 Students
                    for (let i = 1; i <= 67; i++) {
                        const username = `student${i}`;
                        const password = `student123`;
                        const barcode = `STU${100 + i}`;
                        const hashedPassword = bcrypt.hashSync(password, 10);
                        insert.run([username, hashedPassword, 'student', barcode]);
                        credentialsLog += `Username: ${username} | Password: ${password} | Barcode ID: ${barcode}\n`;
                    }
                    
                    insert.finalize();
                    
                    // Write to local text file for easy reference
                    const logPath = path.resolve(__dirname, 'generated_credentials.txt');
                    fs.writeFileSync(logPath, credentialsLog, 'utf8');
                    console.log(`Secured credentials successfully saved to: ${logPath}`);
                }
            });
        });
    }
});

module.exports = db;
