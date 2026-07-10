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
            // Verify write permission to prevent SQLITE_CANTOPEN errors on read-only environments
            fs.accessSync(dir, fs.constants.W_OK);
            dbPath = path.resolve(dir, 'database.sqlite');
            console.log(`Writable persistent disk detected! Storing database at: ${dbPath}`);
            break;
        }
    } catch (e) {
        // Directory not accessible or not writable
    }
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        return;
    }

    console.log('Connected to the SQLite database.');

    db.serialize(() => {
        // ── Schema Creation ─────────────────────────────────────────
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            barcode TEXT UNIQUE,
            device_id TEXT,
            parent_phone TEXT,
            device_biometric_id TEXT,
            last_seen TEXT,
            is_keypad INTEGER DEFAULT 0,
            coordinator_class_id INTEGER,
            attendance_locked INTEGER DEFAULT 0,
            student_phone TEXT
        )`, (err) => { if (err) console.error('[DB] Error creating users table:', err.message); });

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
        )`, (err) => { if (err) console.error('[DB] Error creating classes table:', err.message); });

        db.run(`CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER,
            student_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'present',
            request_lat REAL,
            request_lon REAL,
            UNIQUE(class_id, student_id)
        )`, (err) => { if (err) console.error('[DB] Error creating attendance table:', err.message); });

        db.run(`CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            class_id INTEGER,
            message TEXT,
            student_reason TEXT,
            latitude REAL,
            longitude REAL,
            status INTEGER DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => { if (err) console.error('[DB] Error creating alerts table:', err.message); });

        db.run(`CREATE TABLE IF NOT EXISTS campus_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`, (err) => { if (err) console.error('[DB] Error creating campus_settings table:', err.message); });

        db.run(`CREATE TABLE IF NOT EXISTS otp_codes (
            student_id INTEGER PRIMARY KEY,
            class_id INTEGER,
            otp_code TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => { if (err) console.error('[DB] Error creating otp_codes table:', err.message); });

        db.run(`CREATE TABLE IF NOT EXISTS student_passes (
            student_id INTEGER PRIMARY KEY,
            expiry DATETIME,
            reason TEXT,
            duration_mins INTEGER,
            notified_expired INTEGER DEFAULT 0
        )`, (err) => { if (err) console.error('[DB] Error creating student_passes table:', err.message); });

        // ── Safe Migrations (for older databases already deployed) ──
        // These will silently fail if column already exists — that's intentional
        const safeAlter = (sql) => db.run(sql, () => {}); // ignore duplicate-column errors
        safeAlter("ALTER TABLE users ADD COLUMN parent_phone TEXT");
        safeAlter("ALTER TABLE users ADD COLUMN device_biometric_id TEXT");
        safeAlter("ALTER TABLE users ADD COLUMN last_seen TEXT");
        safeAlter("ALTER TABLE users ADD COLUMN is_keypad INTEGER DEFAULT 0");
        safeAlter("ALTER TABLE users ADD COLUMN coordinator_class_id INTEGER");
        safeAlter("ALTER TABLE users ADD COLUMN attendance_locked INTEGER DEFAULT 0");
        safeAlter("ALTER TABLE users ADD COLUMN student_phone TEXT");
        safeAlter("ALTER TABLE alerts ADD COLUMN class_id INTEGER");
        safeAlter("ALTER TABLE alerts ADD COLUMN student_reason TEXT");
        safeAlter("ALTER TABLE alerts ADD COLUMN latitude REAL");
        safeAlter("ALTER TABLE alerts ADD COLUMN longitude REAL");
        safeAlter("ALTER TABLE classes ADD COLUMN token_secret TEXT");
        safeAlter("ALTER TABLE classes ADD COLUMN accuracy REAL");
        safeAlter("ALTER TABLE attendance ADD COLUMN status TEXT DEFAULT 'present'");
        safeAlter("ALTER TABLE attendance ADD COLUMN request_lat REAL");
        safeAlter("ALTER TABLE attendance ADD COLUMN request_lon REAL");

        // Ensure barcode index exists
        db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_barcode ON users (barcode)", () => {});

        // ── Seed Default Campus Settings ────────────────────────────
        db.get("SELECT count(*) as count FROM campus_settings", (err, row) => {
            if (!err && row && row.count === 0) {
                console.log("[DB] Seeding default campus geofence settings...");
                db.serialize(() => {
                    db.run("INSERT INTO campus_settings (key, value) VALUES ('campus_latitude', '17.3850')");
                    db.run("INSERT INTO campus_settings (key, value) VALUES ('campus_longitude', '78.4867')");
                    db.run("INSERT INTO campus_settings (key, value) VALUES ('campus_radius', '500')");
                    db.run("INSERT INTO campus_settings (key, value) VALUES ('college_start_time', '09:00')");
                    db.run("INSERT INTO campus_settings (key, value) VALUES ('college_end_time', '16:00')");
                });
            }
        });

        // ── Seed Demo Accounts (only if no coordinators found) ──────
        db.get("SELECT count(*) as count FROM users WHERE role = 'coordinator'", (err, row) => {
            if (err || !row || row.count === 0) {
                console.log("[DB] No coordinator accounts found. Seeding fresh demo accounts...");

                // Wipe existing data first (old/partial seed)
                db.serialize(() => {
                    db.run("DELETE FROM users");
                    db.run("DELETE FROM classes");
                    db.run("DELETE FROM attendance");
                    db.run("DELETE FROM alerts");
                    db.run("DELETE FROM student_passes");
                    db.run("DELETE FROM otp_codes");

                    // 1. Seed HODs (6)
                    for (let i = 1; i <= 6; i++) {
                        const hash = bcrypt.hashSync('hod123', 10);
                        db.run(
                            'INSERT INTO users (username, password, role) VALUES (?,?,?)',
                            [`hod${i}`, hash, 'hod'],
                            (e) => { if (e) console.error(`[DB] Failed to seed hod${i}:`, e.message); }
                        );
                    }

                    // 2. Seed Teachers (5)
                    for (let i = 1; i <= 5; i++) {
                        const hash = bcrypt.hashSync('teacher123', 10);
                        db.run(
                            'INSERT INTO users (username, password, role) VALUES (?,?,?)',
                            [`teacher${i}`, hash, 'teacher'],
                            (e) => { if (e) console.error(`[DB] Failed to seed teacher${i}:`, e.message); }
                        );
                    }

                    // 3. Seed Coordinators (3) — assigned to class IDs 1, 2, 3
                    for (let i = 1; i <= 3; i++) {
                        const hash = bcrypt.hashSync('coordinator123', 10);
                        db.run(
                            'INSERT INTO users (username, password, role, coordinator_class_id) VALUES (?,?,?,?)',
                            [`coordinator${i}`, hash, 'coordinator', i],
                            (e) => { if (e) console.error(`[DB] Failed to seed coordinator${i}:`, e.message); }
                        );
                    }

                    // 4. Seed Students (6)
                    for (let i = 1; i <= 6; i++) {
                        const hash = bcrypt.hashSync('student123', 10);
                        const isKeypad = (i === 6) ? 1 : 0;
                        db.run(
                            'INSERT INTO users (username, password, role, barcode, parent_phone, student_phone, is_keypad) VALUES (?,?,?,?,?,?,?)',
                            [
                                `student${i}`, hash, 'student',
                                `STU10${i}`,
                                `+91 90123 4560${i}`,
                                `+91 99887 7665${i}`,
                                isKeypad
                            ],
                            (e) => { if (e) console.error(`[DB] Failed to seed student${i}:`, e.message); }
                        );
                    }

                    // 5. Seed 3 Demo Classes
                    db.run("INSERT INTO classes (id, name, teacher_id, latitude, longitude, radius, token_secret, accuracy) VALUES (1, 'CSE-A (Section Alpha)', 1, 17.3850, 78.4867, 50, 'sec1', 10)",
                        (e) => { if (e) console.error('[DB] Failed to seed class 1:', e.message); });
                    db.run("INSERT INTO classes (id, name, teacher_id, latitude, longitude, radius, token_secret, accuracy) VALUES (2, 'CSE-B (Section Beta)', 1, 17.3850, 78.4867, 50, 'sec2', 10)",
                        (e) => { if (e) console.error('[DB] Failed to seed class 2:', e.message); });
                    db.run("INSERT INTO classes (id, name, teacher_id, latitude, longitude, radius, token_secret, accuracy) VALUES (3, 'ECE-A (Section Gamma)', 2, 17.3850, 78.4867, 50, 'sec3', 10)",
                        (e) => { if (e) console.error('[DB] Failed to seed class 3:', e.message); });

                    console.log("[DB] Demo accounts and classes seeded successfully!");
                });
            } else {
                console.log(`[DB] Found ${row ? row.count : 0} coordinator(s). Skipping seed.`);
            }
        });

        // ── Write Generated Credentials Log ─────────────────────────
        let credentialsLog = "=========================================\n";
        credentialsLog += "AUTO-GENERATED SECURED LOGIN CREDENTIALS\n";
        credentialsLog += "=========================================\n\n";
        credentialsLog += "HOD ACCOUNTS (6 Total)\n";
        credentialsLog += "---------------------\n";
        for (let i = 1; i <= 6; i++) credentialsLog += `Username: hod${i} | Password: hod123\n`;
        credentialsLog += "\nTEACHER ACCOUNTS (5 Total)\n";
        credentialsLog += "---------------------------\n";
        for (let i = 1; i <= 5; i++) credentialsLog += `Username: teacher${i} | Password: teacher123\n`;
        credentialsLog += "\nCOORDINATOR ACCOUNTS (3 Total)\n";
        credentialsLog += "-------------------------------\n";
        for (let i = 1; i <= 3; i++) credentialsLog += `Username: coordinator${i} | Password: coordinator123 | Coordinator Class ID: ${i}\n`;
        credentialsLog += "\nSTUDENT ACCOUNTS (6 Total)\n";
        credentialsLog += "---------------------------\n";
        for (let i = 1; i <= 6; i++) {
            credentialsLog += `Username: student${i} | Password: student123 | Barcode: STU10${i}${i === 6 ? ' (Keypad/No-Phone Exempted)' : ''}\n`;
        }

        const logPath = path.resolve(__dirname, 'generated_credentials.txt');
        fs.writeFileSync(logPath, credentialsLog, 'utf8');
    });
});

module.exports = db;
