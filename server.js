const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const selfsigned = require('selfsigned');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { getDistance } = require('./utils/geofence');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_for_attendance_system';

const isRender = process.env.RENDER === 'true';

let httpsOptions = null;
if (!isRender) {
    // Generate self-signed certificates on startup for secure local device testing (only needed for local network phone access)
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048 });
    httpsOptions = {
        key: pems.private,
        cert: pems.cert
    };
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// JWT authentication verification middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <token>"

    if (!token) {
        return res.status(401).json({ success: false, message: "Access denied. Login required." });
    }

    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) {
            return res.status(403).json({ success: false, message: "Session expired or invalid. Please login again." });
        }
        req.user = payload; // contains user id, username, role
        next();
    });
}

// Secure Login Endpoint (using Bcrypt, JWT, and Device Lock)
app.post('/api/login', (req, res) => {
    const { username, password, device_id } = req.body;
    
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) {
            return res.status(401).json({ success: false, message: "Invalid username or password" });
        }
        
        // Verify hashed password
        const passwordMatch = bcrypt.compareSync(password, row.password);
        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: "Invalid username or password" });
        }

        // Helper to sign JWT and return response
        const completeLogin = () => {
            const token = jwt.sign(
                { id: row.id, username: row.username, role: row.role }, 
                JWT_SECRET, 
                { expiresIn: '12h' }
            );
            res.json({ 
                success: true, 
                token, 
                user: { id: row.id, username: row.username, role: row.role, barcode: row.barcode } 
            });
        };

        // Enforce hardware lock for students
        if (row.role === 'student') {
            if (!row.device_id) {
                // First login: Verify that this phone isn't already registered to another student
                db.get("SELECT username FROM users WHERE device_id = ? AND id != ?", [device_id, row.id], (err, boundUser) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (boundUser) {
                        return res.status(400).json({ success: false, message: `This device is already registered to student: ${boundUser.username}` });
                    }
                    
                    // Bind this device ID
                    db.run("UPDATE users SET device_id = ? WHERE id = ?", [device_id, row.id], (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        completeLogin();
                    });
                });
            } else if (row.device_id !== device_id) {
                // Lockout: Prevent login from other devices
                return res.status(400).json({ success: false, message: "This account is registered on another device." });
            } else {
                completeLogin();
            }
        } else {
            completeLogin();
        }
    });
});

// Teacher API: Create a new class session
app.post('/api/classes', authenticateToken, (req, res) => {
    // Only teachers are allowed to create sessions
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }

    const { name, latitude, longitude, radius, accuracy } = req.body;
    const teacher_id = req.user.id; // Extract teacher ID securely from verified token
    const token_secret = crypto.randomBytes(16).toString('hex');
    
    db.run(
        "INSERT INTO classes (teacher_id, name, latitude, longitude, radius, token_secret, accuracy) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [teacher_id, name, latitude, longitude, radius, token_secret, accuracy],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, class_id: this.lastID });
        }
    );
});

// Teacher API: Get classes for teacher
app.get('/api/classes/:teacher_id', authenticateToken, (req, res) => {
    db.all("SELECT * FROM classes WHERE teacher_id = ? ORDER BY id DESC", [req.params.teacher_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ classes: rows });
    });
});

// Teacher API: End a class session & Run AI Bunking Analysis
app.post('/api/classes/:class_id/end', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const classId = parseInt(req.params.class_id);
    db.run("UPDATE classes SET active = 0 WHERE id = ?", [classId], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        // Run AI Bunking Analysis asynchronously in the background
        db.get("SELECT name FROM classes WHERE id = ?", [classId], (err, currentClass) => {
            if (err || !currentClass) return;

            // Find the most recent ended class session (if any)
            db.get("SELECT id, name FROM classes WHERE id < ? ORDER BY id DESC LIMIT 1", [classId], (err, prevClass) => {
                if (err || !prevClass) return;

                // Query students present in the previous session
                db.all("SELECT student_id FROM attendance WHERE class_id = ? AND status = 'present'", [prevClass.id], (err, prevPresent) => {
                    if (err || !prevPresent || prevPresent.length === 0) return;

                    // Query students present in the current ended session
                    db.all("SELECT student_id FROM attendance WHERE class_id = ? AND status = 'present'", [classId], (err, currentPresent) => {
                        if (err || !currentPresent) return;

                        const currentPresentIds = new Set(currentPresent.map(p => p.student_id));
                        const missingStudents = prevPresent.filter(p => !currentPresentIds.has(p.student_id));

                        if (missingStudents.length > 0) {
                            const placeholders = missingStudents.map(() => '?').join(',');
                            const studentIds = missingStudents.map(m => m.student_id);

                            // Get usernames of flagged students to write readable warnings
                            db.all(`SELECT id, username FROM users WHERE id IN (${placeholders})`, studentIds, (err, users) => {
                                if (err || !users) return;

                                const insertAlert = db.prepare("INSERT INTO alerts (student_id, message) VALUES (?, ?)");
                                users.forEach(u => {
                                    const alertMsg = `⚠️ Anomaly: Student "${u.username}" was Present in "${prevClass.name}" but Absent in consecutive class "${currentClass.name}". Potential class skipping detected.`;
                                    insertAlert.run([u.id, alertMsg]);
                                });
                                insertAlert.finalize();
                            });
                        }
                    });
                });
            });
        });

        res.json({ success: true, message: "Class session ended successfully!" });
    });
});

// HOD API: Get all AI alerts (sorted by unread first)
app.get('/api/alerts', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }

    db.all("SELECT * FROM alerts ORDER BY status ASC, id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ alerts: rows });
    });
});

// HOD API: Mark alert as read
app.post('/api/alerts/:alert_id/read', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }

    const alertId = req.params.alert_id;
    db.run("UPDATE alerts SET status = 1 WHERE id = ?", [alertId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Alert marked as read." });
    });
});

// Teacher API: Get attendance for a specific class (only present students)
app.get('/api/attendance/:class_id', authenticateToken, (req, res) => {
    const query = `
        SELECT u.username, a.timestamp 
        FROM attendance a
        JOIN users u ON a.student_id = u.id
        WHERE a.class_id = ? AND a.status = 'present'
        ORDER BY a.timestamp DESC
    `;
    db.all(query, [req.params.class_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ attendance: rows });
    });
});

// Teacher API: Get current Dynamic QR Code token
app.get('/api/classes/:class_id/token', authenticateToken, (req, res) => {
    const classId = req.params.class_id;
    db.get("SELECT token_secret FROM classes WHERE id = ?", [classId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Class not found" });
        
        const timeIndex = Math.floor(Date.now() / 15000); // 15-second intervals
        const token = crypto.createHmac('sha256', row.token_secret || 'fallback_secret')
                            .update(`${classId}-${timeIndex}`)
                            .digest('hex')
                            .substring(0, 16);
        res.json({ token, expires_in: 15 - (Math.floor(Date.now() % 15000) / 1000) });
    });
});

// Teacher API: Mark student present by Barcode scan
app.post('/api/mark-barcode', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { class_id, barcode } = req.body;
    db.get("SELECT id, username FROM users WHERE barcode = ?", [barcode], (err, student) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!student) return res.status(404).json({ success: false, message: "Barcode not registered to any student." });

        db.run("INSERT INTO attendance (class_id, student_id, status) VALUES (?, ?, 'present')", [class_id, student.id], function(err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    db.run("UPDATE attendance SET status = 'present' WHERE class_id = ? AND student_id = ?", [class_id, student.id], function(updateErr) {
                        if (updateErr) return res.status(500).json({ error: updateErr.message });
                        return res.json({ success: true, message: `Attendance updated to Present for ${student.username}.` });
                    });
                    return;
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: `Attendance marked for ${student.username}.` });
        });
    });
});

// Student API: Get active classes
app.get('/api/active-classes', authenticateToken, (req, res) => {
    db.all("SELECT id, name FROM classes WHERE active = 1 ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ classes: rows });
    });
});

// Student API: Update registered barcode ID
app.post('/api/update-barcode', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { barcode } = req.body;
    const student_id = req.user.id;

    if (!barcode || barcode.trim() === "") {
        return res.status(400).json({ success: false, message: "Barcode ID cannot be empty." });
    }

    const cleanBarcode = barcode.trim();
    // Validate barcode uniqueness to prevent duplicate profiles
    db.get("SELECT username FROM users WHERE barcode = ? AND id != ?", [cleanBarcode, student_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            return res.status(400).json({ success: false, message: "This barcode is already registered by another student." });
        }

        db.run("UPDATE users SET barcode = ? WHERE id = ?", [cleanBarcode, student_id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            // Return updated barcode so student profile refreshes correctly
            res.json({ success: true, message: "Barcode ID updated successfully!", barcode: cleanBarcode });
        });
    });
});

// Student API: Request Manual Attendance Approval (GPS verified)
app.post('/api/request-approval', authenticateToken, (req, res) => {
    const { class_id, latitude, longitude } = req.body;
    const student_id = req.user.id; // Securely retrieve student ID from verified token
    
    db.run(
        "INSERT INTO attendance (class_id, student_id, status, request_lat, request_lon) VALUES (?, ?, 'pending', ?, ?)",
        [class_id, student_id, latitude, longitude],
        function(err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ success: false, message: "Request already sent or student already present." });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: "Approval request submitted successfully!" });
        }
    );
});

// Teacher API: Get pending approval requests
app.get('/api/pending-requests/:class_id', authenticateToken, (req, res) => {
    const classId = req.params.class_id;
    db.get("SELECT latitude, longitude, radius FROM classes WHERE id = ?", [classId], (err, cls) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!cls) return res.status(404).json({ error: "Class not found" });

        const query = `
            SELECT a.id as attendance_id, u.username, u.id as student_id, a.request_lat, a.request_lon, a.timestamp 
            FROM attendance a
            JOIN users u ON a.student_id = u.id
            WHERE a.class_id = ? AND a.status = 'pending'
        `;
        db.all(query, [classId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const requests = rows.map(r => {
                const dist = cls.radius <= 0 ? 0 : getDistance(cls.latitude, cls.longitude, r.request_lat, r.request_lon);
                return {
                    attendance_id: r.attendance_id,
                    student_id: r.student_id,
                    username: r.username,
                    distance: Math.round(dist),
                    timestamp: r.timestamp
                };
            });
            res.json({ requests });
        });
    });
});

// Teacher API: Approve a student request
app.post('/api/approve-request', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { class_id, student_id } = req.body;
    db.run(
        "UPDATE attendance SET status = 'present' WHERE class_id = ? AND student_id = ? AND status = 'pending'",
        [class_id, student_id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: "Student approved successfully!" });
        }
    );
});

// Student API: Mark Attendance (Standard GPS + dynamic QR if qr_token provided)
app.post('/api/mark-attendance', authenticateToken, (req, res) => {
    const { class_id, latitude, longitude, qr_token, accuracy } = req.body;
    const student_id = req.user.id; // Securely retrieve student ID from verified token

    db.get("SELECT latitude, longitude, radius, token_secret, accuracy FROM classes WHERE id = ?", [class_id], (err, cls) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!cls) return res.status(404).json({ error: "Class not found" });

        // Verify Dynamic QR Code if provided
        if (qr_token) {
            const timeIndex = Math.floor(Date.now() / 15000);
            const expectedToken1 = crypto.createHmac('sha256', cls.token_secret || 'fallback_secret')
                                        .update(`${class_id}-${timeIndex}`)
                                        .digest('hex')
                                        .substring(0, 16);
            const expectedToken2 = crypto.createHmac('sha256', cls.token_secret || 'fallback_secret')
                                        .update(`${class_id}-${timeIndex - 1}`) // allow 15 seconds grace period
                                        .digest('hex')
                                        .substring(0, 16);
            if (qr_token !== expectedToken1 && qr_token !== expectedToken2) {
                return res.status(400).json({ success: false, message: "QR Code expired or invalid. Please scan again." });
            }
        }

        const distance = cls.radius <= 0 ? 0 : getDistance(cls.latitude, cls.longitude, latitude, longitude);
        const allowedDistance = cls.radius <= 0 ? 0 : (cls.radius + (cls.accuracy || 0) + (accuracy || 0));
        
        // Skip distance validation check if radius is 0 or less (Geofence disabled) or if distance falls within accuracy tolerance
        if (cls.radius <= 0 || distance <= allowedDistance) {
            db.run("INSERT INTO attendance (class_id, student_id, status) VALUES (?, ?, 'present')", [class_id, student_id], function(err) {
                if (err) {
                    if (err.message.includes("UNIQUE")) {
                        // If it was pending, promote it to present
                        db.run("UPDATE attendance SET status = 'present' WHERE class_id = ? AND student_id = ? AND status = 'pending'", [class_id, student_id], function(updateErr) {
                            if (updateErr) return res.status(500).json({ error: updateErr.message });
                            if (this.changes > 0) {
                                return res.json({ success: true, message: "Attendance verified and marked present!", distance: Math.round(distance) });
                            }
                            return res.status(400).json({ success: false, message: "Attendance already marked present." });
                        });
                        return;
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true, message: cls.radius <= 0 ? "Attendance marked successfully! (Geofence Disabled)" : "Attendance marked successfully!", distance: Math.round(distance) });
            });
        } else {
            res.status(400).json({ 
                success: false, 
                message: `You are outside the geofence. Distance: ${Math.round(distance)}m, Limit: ${Math.round(allowedDistance)}m (Radius: ${cls.radius}m + Teacher GPS error: ±${Math.round(cls.accuracy || 0)}m + Student GPS error: ±${Math.round(accuracy || 0)}m)`
            });
        }
    });
});

if (isRender) {
    // Render handles SSL certificates automatically at the proxy level. Start a standard HTTP server.
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`HTTP Server running on port ${PORT}`);
    });
} else {
    // Local environment: Start HTTPS server for secure mobile phone connections over local WiFi
    https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
        console.log(`Secure HTTPS Server running on https://localhost:${PORT}`);
        console.log(`To access from other devices on WiFi, open: https://<your_laptop_ip>:${PORT}`);
    });
}
