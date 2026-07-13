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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_for_attendance_system';

// Only treat as Render/cloud when explicitly signalled — avoids false-positive on Windows where PORT may already be set in env
const isRender = process.env.RENDER === 'true' || process.env.RENDER_EXTERNAL_URL !== undefined;

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
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Configure High-Level WAF (Web Application Firewall) Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://bwipjs-api.metafloor.com", "https://*.onrender.com"],
            // Include localhost wildcard so local dev fetch() calls are not blocked by CSP
            connectSrc: ["'self'", "http://localhost:*", "https://localhost:*", "https://*.onrender.com", "wss://*.onrender.com"],
            mediaSrc: ["'self'", "data:"]
        }
    }
}));

// DDoS & Brute Force Rate Limiter (General Limit: 500 requests per 15 minutes per IP)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: {
        success: false,
        message: "❌ Too many requests from this IP. Please try again after 15 minutes."
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(generalLimiter);

// Stricter Rate Limiter for Authentication & Verification Endpoints (15 requests per 15 minutes per IP)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: {
        success: false,
        message: "❌ Stricter Rate Limit: Too many authentication/verification attempts from this IP. Please try again after 15 minutes."
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/login', authLimiter);
app.use('/api/verify-password', authLimiter);
app.use('/api/coordinator/verify-keypad-otp', authLimiter);

// Custom Request Sanitizer (SQL Injection Guard)
function securityFirewall(req, res, next) {
    // Block SQL injection patterns only — XSS is not relevant for JSON API payloads
    // (XSS protection is handled by Content-Security-Policy headers from helmet)
    const sqlInjectionPattern = /('\s+OR\s+'|"\s+OR\s+"|OR\s+1\s*=\s*1|OR\s+TRUE|;\s*DROP\s+TABLE|--\s*$)/i;

    const checkValue = (val) => {
        if (typeof val === 'string') {
            if (sqlInjectionPattern.test(val)) {
                console.warn(`[WAF FIREWALL ALERT] Blocked potential SQL Injection payload: "${val}"`);
                return false;
            }
        } else if (typeof val === 'object' && val !== null) {
            for (const key in val) {
                if (val.hasOwnProperty(key)) {
                    if (!checkValue(val[key])) return false;
                }
            }
        }
        return true;
    };

    if (!checkValue(req.body) || !checkValue(req.query) || !checkValue(req.params)) {
        return res.status(403).json({ 
            success: false, 
            message: "❌ Web Application Firewall (WAF) Violation: Potential SQL Injection pattern detected in your request payload. This action has been logged." 
        });
    }
    next();
}

app.use(cors());
app.use(express.json());

// Force browsers/CDNs to always re-fetch HTML files (prevents stale cached JS)
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: function(res, filePath) {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

app.post('/api/log-error', (req, res) => {
    const { url, message, stack } = req.body;
    console.error(`[CLIENT EXCEPTION] URL: ${url}\nMsg: ${message}\nStack: ${stack}\n`);
    db.run("INSERT INTO client_errors (url, message, stack) VALUES (?, ?, ?)", [url, message, stack], (err) => {
        if (err) console.error('[DB] Failed to insert client error:', err.message);
        res.json({ success: true });
    });
});

app.get('/api/debug/errors', (req, res) => {
    db.all("SELECT * FROM client_errors ORDER BY id DESC LIMIT 50", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, errors: rows });
    });
});

app.get('/api/debug/requests', (req, res) => {
    db.all("SELECT * FROM request_logs ORDER BY id DESC LIMIT 100", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, requests: rows });
    });
});

// Request logging middleware
app.use('/api', (req, res, next) => {
    let username = 'Guest';
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            username = `${payload.username} (${payload.role})`;
        } catch(e) {}
    }
    res.on('finish', () => {
        // Skip logging debug requests themselves to avoid logs bloat
        if (req.path.startsWith('/debug/')) return;
        db.run("INSERT INTO request_logs (method, path, user_info, status_code) VALUES (?, ?, ?, ?)", 
            [req.method, req.baseUrl + req.path, username, res.statusCode], (err) => {
                if (err) console.error('[DB] Request log fail:', err.message);
            }
        );
    });
    next();
});

app.use(securityFirewall);

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
        // For students: also return biometric registration status so the login page
        // can enforce the 2-step biometric verification flow BEFORE granting portal access.
        const completeLogin = () => {
            const token = jwt.sign(
                { id: row.id, username: row.username, role: row.role, coordinator_class_id: row.coordinator_class_id },
                JWT_SECRET,
                { expiresIn: '12h' }
            );
            const baseUser = { id: row.id, username: row.username, role: row.role, barcode: row.barcode, coordinator_class_id: row.coordinator_class_id };

            if (row.role === 'student') {
                // Fetch biometric status for the 2-step login flow
                db.get("SELECT device_biometric_id FROM users WHERE id = ?", [row.id], (bioErr, bioRow) => {
                    const hasBiometric = !!(bioRow && bioRow.device_biometric_id);
                    res.json({
                        success: true,
                        token,
                        user: baseUser,
                        has_biometric: hasBiometric,
                        // Only expose credential ID when biometric is registered so frontend can call WebAuthn
                        biometric_credential_id: hasBiometric ? bioRow.device_biometric_id : null
                    });
                });
            } else {
                res.json({ success: true, token, user: baseUser });
            }
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

// HOD & Coordinator & Teacher API: Get list of classrooms
app.get('/api/classrooms', authenticateToken, (req, res) => {
    db.all("SELECT * FROM classrooms ORDER BY name ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, classrooms: rows });
    });
});

// HOD & Coordinator API: Create/Update classroom
app.post('/api/classrooms', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod' && req.user.role !== 'coordinator') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }
    const { name, latitude, longitude, radius, accuracy } = req.body;
    if (!name || latitude === undefined || longitude === undefined || radius === undefined || accuracy === undefined) {
        return res.status(400).json({ success: false, message: "Missing required classroom details." });
    }

    const trimmedName = name.trim();
    // Try to update existing classroom first (preserves the ID, avoiding broken references)
    db.run(
        "UPDATE classrooms SET latitude = ?, longitude = ?, radius = ?, accuracy = ? WHERE name = ?",
        [parseFloat(latitude), parseFloat(longitude), parseFloat(radius), parseFloat(accuracy), trimmedName],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes > 0) {
                // Found and updated existing classroom
                db.get("SELECT id FROM classrooms WHERE name = ?", [trimmedName], (err, row) => {
                    res.json({ success: true, message: "Classroom coordinates updated successfully!", classroom_id: row ? row.id : null });
                });
            } else {
                // No existing classroom, insert new one
                db.run(
                    "INSERT INTO classrooms (name, latitude, longitude, radius, accuracy) VALUES (?, ?, ?, ?, ?)",
                    [trimmedName, parseFloat(latitude), parseFloat(longitude), parseFloat(radius), parseFloat(accuracy)],
                    function(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ success: true, message: "Classroom configured successfully!", classroom_id: this.lastID });
                    }
                );
            }
        }
    );
});

// HOD & Coordinator API: Delete classroom
app.delete('/api/classrooms/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod' && req.user.role !== 'coordinator') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }

    db.run("DELETE FROM classrooms WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Classroom removed successfully." });
    });
});

// Teacher API: Create a new class session
app.post('/api/classes', authenticateToken, (req, res) => {
    // Only teachers are allowed to create sessions
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }

    const { name, classroom_id } = req.body;
    const teacher_id = req.user.id; // Extract teacher ID securely from verified token
    const token_secret = crypto.randomBytes(16).toString('hex');
    
    if (!name || !classroom_id) {
        return res.status(400).json({ success: false, message: "Class name and classroom location are required." });
    }

    db.get("SELECT latitude, longitude, radius, accuracy FROM classrooms WHERE id = ?", [classroom_id], (err, room) => {
        if (err || !room) {
            return res.status(404).json({ success: false, message: "Selected classroom location not found." });
        }

        db.run(
            "INSERT INTO classes (teacher_id, name, latitude, longitude, radius, token_secret, accuracy) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [teacher_id, name, room.latitude, room.longitude, room.radius, token_secret, room.accuracy],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, class_id: this.lastID });
            }
        );
    });
});

// Teacher API: Get classes for teacher (with optional attendance counts)
app.get('/api/classes/:teacher_id', authenticateToken, (req, res) => {
    const withCounts = req.query.with_counts === 'true';
    if (withCounts) {
        const query = `
            SELECT c.*, 
                   COALESCE((SELECT COUNT(*) FROM attendance a WHERE a.class_id = c.id AND a.status = 'present'), 0) as present_count
            FROM classes c
            WHERE c.teacher_id = ?
            ORDER BY c.id DESC
        `;
        db.all(query, [req.params.teacher_id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ classes: rows });
        });
    } else {
        db.all("SELECT * FROM classes WHERE teacher_id = ? ORDER BY id DESC", [req.params.teacher_id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ classes: rows });
        });
    }
});


// Teacher API: End a class session & Run AI Bunking Analysis
app.post('/api/classes/:class_id/end', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const classId = parseInt(req.params.class_id);
    db.run("UPDATE classes SET active = 0 WHERE id = ?", [classId], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        // Run AI Analysis and Unverified Absence Alerts asynchronously
        db.get("SELECT name FROM classes WHERE id = ?", [classId], (err, currentClass) => {
            if (err || !currentClass) return;

            // 1. Unverified Absence Analysis (Alert coordinator and mark student as absent)
            db.all("SELECT id, username FROM users WHERE role = 'student'", [], (err, allStudents) => {
                if (err || !allStudents) return;

                db.all("SELECT student_id FROM attendance WHERE class_id = ? AND status = 'present'", [classId], (err, presentStudents) => {
                    if (err || !presentStudents) return;

                    const presentIds = new Set(presentStudents.map(p => p.student_id));
                    const unmarkedStudents = allStudents.filter(s => !presentIds.has(s.id));

                    if (unmarkedStudents.length > 0) {
                        const insertUnmarkedAlert = db.prepare("INSERT INTO alerts (student_id, class_id, message) VALUES (?, ?, ?)");
                        const insertAbsentAttendance = db.prepare("INSERT OR REPLACE INTO attendance (class_id, student_id, status) VALUES (?, ?, 'absent')");
                        
                        unmarkedStudents.forEach(u => {
                            const alertMsg = `⚠️ Unverified Absence: Student "${u.username}" did not mark attendance for class session "${currentClass.name}".`;
                            insertUnmarkedAlert.run([u.id, classId, alertMsg]);
                            insertAbsentAttendance.run([classId, u.id]);
                        });
                        
                        insertUnmarkedAlert.finalize();
                        insertAbsentAttendance.finalize();
                    }
                });
            });

            // 2. AI Bunking Analysis (Flag consecutive class skipping anomalies)
            db.get("SELECT id, name FROM classes WHERE id < ? ORDER BY id DESC LIMIT 1", [classId], (err, prevClass) => {
                if (err || !prevClass) return;

                db.all("SELECT student_id FROM attendance WHERE class_id = ? AND status = 'present'", [prevClass.id], (err, prevPresent) => {
                    if (err || !prevPresent || prevPresent.length === 0) return;

                    db.all("SELECT student_id FROM attendance WHERE class_id = ? AND status = 'present'", [classId], (err, currentPresent) => {
                        if (err || !currentPresent) return;

                        const currentPresentIds = new Set(currentPresent.map(p => p.student_id));
                        const missingStudents = prevPresent.filter(p => !currentPresentIds.has(p.student_id));

                        if (missingStudents.length > 0) {
                            const placeholders = missingStudents.map(() => '?').join(',');
                            const studentIds = missingStudents.map(m => m.student_id);

                            db.all(`SELECT id, username FROM users WHERE id IN (${placeholders})`, studentIds, (err, users) => {
                                if (err || !users) return;

                                const insertAlert = db.prepare("INSERT INTO alerts (student_id, class_id, message) VALUES (?, ?, ?)");
                                users.forEach(u => {
                                    const alertMsg = `⚠️ Anomaly: Student "${u.username}" was Present in "${prevClass.name}" but Absent in consecutive class "${currentClass.name}". Potential class skipping detected.`;
                                    insertAlert.run([u.id, classId, alertMsg]);
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

// HOD & Coordinator API: Get all AI alerts (sorted by unread first, joined with user details and parent phone)
app.get('/api/alerts', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod' && req.user.role !== 'coordinator') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }

    const query = `
        SELECT 
            a.id, 
            a.student_id, 
            a.class_id, 
            a.message, 
            a.student_reason,
            a.status, 
            a.timestamp, 
            a.latitude,
            a.longitude,
            u.username as student_name, 
            u.parent_phone 
        FROM alerts a
        LEFT JOIN users u ON a.student_id = u.id
        ORDER BY a.status ASC, a.id DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, alerts: rows });
    });
});

// HOD & Coordinator API: Notify parent (Indian digits standard layout, manual action confirmation)
app.post('/api/alerts/:alert_id/notify-parent', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod' && req.user.role !== 'coordinator') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }

    const alertId = parseInt(req.params.alert_id);
    const query = `
        SELECT a.id, a.message, u.username, u.parent_phone
        FROM alerts a
        JOIN users u ON a.student_id = u.id
        WHERE a.id = ?
    `;
    db.get(query, [alertId], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ success: false, message: "Alert not found." });
        }

        if (!row.parent_phone) {
            return res.status(400).json({ success: false, message: "No registered parent phone number found for this student." });
        }

        const messageText = `Alert from HOD/Coordinator: Your child ${row.username} was Present in the first session but Absent in the second session. Please contact your child or the college to clarify.`;
        
        console.log(`[PARENT ALERT SMS] Destination: ${row.parent_phone} | Content: "${messageText}"`);

        // Mark alert notification as sent by updating status (let's say we set status to 1 as marked/notified)
        db.run("UPDATE alerts SET status = 1 WHERE id = ?", [alertId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ 
                success: true, 
                message: `SMS notification logged & sent to ${row.parent_phone}!`,
                parent_phone: row.parent_phone,
                sms_body: messageText
            });
        });
    });
});

// HOD & Coordinator API: Reverse attendance status from Absent to Present
app.post('/api/alerts/:alert_id/reverse-attendance', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod' && req.user.role !== 'coordinator') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }

    const alertId = parseInt(req.params.alert_id);
    console.log(`[REVERSE ATTENDANCE REQUEST] Alert ID: ${alertId}`);

    db.get("SELECT student_id, class_id FROM alerts WHERE id = ?", [alertId], (err, alertRecord) => {
        if (err) {
            console.error(`[REVERSE ATTENDANCE ERROR] Failed to query alert ${alertId}:`, err);
            return res.status(500).json({ error: err.message });
        }
        if (!alertRecord) {
            console.log(`[REVERSE ATTENDANCE FAIL] Alert ${alertId} not found in database.`);
            return res.status(404).json({ success: false, message: "Alert not found." });
        }

        let { student_id, class_id } = alertRecord;
        console.log(`[REVERSE ATTENDANCE INFO] Alert details: student_id = ${student_id}, class_id = ${class_id}`);

        const proceedWithClassId = (resolvedClassId) => {
            // Verify class session exists in classes table
            db.get("SELECT name FROM classes WHERE id = ?", [resolvedClassId], (err, cls) => {
                if (err) {
                    console.error(`[REVERSE ATTENDANCE ERROR] Class verification query failed:`, err);
                    return res.status(500).json({ error: err.message });
                }

                const performInsert = (finalClassId) => {
                    // Insert or replace present attendance status for that student and class
                    const insertAttendance = `
                        INSERT OR REPLACE INTO attendance (class_id, student_id, status, timestamp) 
                        VALUES (?, ?, 'present', datetime('now', 'localtime'))
                    `;
                    db.run(insertAttendance, [finalClassId, student_id], function(err) {
                        if (err) {
                            console.error(`[REVERSE ATTENDANCE ERROR] Failed to update attendance:`, err);
                            return res.status(500).json({ error: err.message });
                        }

                        // Mark the alert as resolved (status = 2)
                        db.run("UPDATE alerts SET status = 2 WHERE id = ?", [alertId], function(err) {
                            if (err) {
                                console.error(`[REVERSE ATTENDANCE ERROR] Failed to update alert status to 2:`, err);
                                return res.status(500).json({ error: err.message });
                            }
                            console.log(`[REVERSE ATTENDANCE SUCCESS] Successfully marked student ${student_id} present in class ${finalClassId}`);
                            res.json({ success: true, message: "Attendance successfully reversed from Absent to Present!" });
                        });
                    });
                };

                if (!cls) {
                    console.log(`[REVERSE ATTENDANCE WARN] Referenced class ID ${resolvedClassId} does not exist. Finding active class...`);
                    db.get("SELECT id FROM classes WHERE active = 1 ORDER BY id DESC LIMIT 1", [], (err, activeClass) => {
                        if (err || !activeClass) {
                            console.log(`[REVERSE ATTENDANCE INFO] No active class found, proceeding with original resolvedClassId.`);
                            performInsert(resolvedClassId);
                        } else {
                            console.log(`[REVERSE ATTENDANCE INFO] Fallback to active class ID ${activeClass.id}.`);
                            performInsert(activeClass.id);
                        }
                    });
                } else {
                    performInsert(resolvedClassId);
                }
            });
        };

        if (!class_id) {
            // Fallback: resolve active class session to link to this alert
            db.get("SELECT id FROM classes WHERE active = 1 ORDER BY id DESC LIMIT 1", [], (err, activeClass) => {
                if (err) {
                    console.error(`[REVERSE ATTENDANCE ERROR] Failed to query active class session:`, err);
                    return res.status(500).json({ error: err.message });
                }
                if (!activeClass) {
                    console.log(`[REVERSE ATTENDANCE FAIL] No active class session running for biometric breach reversal.`);
                    return res.status(400).json({ success: false, message: "No active class session running. Please start a class first to override attendance." });
                }
                proceedWithClassId(activeClass.id);
            });
        } else {
            proceedWithClassId(class_id);
        }
    });
});

// HOD & Coordinator API: Dismiss / Mark alert as read
// BUG FIX: was previously hod-only; coordinators also view alerts and must be able to dismiss them
app.post('/api/alerts/:alert_id/read', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod' && req.user.role !== 'coordinator') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }

    const alertId = parseInt(req.params.alert_id, 10);
    if (isNaN(alertId)) {
        return res.status(400).json({ success: false, message: "Invalid alert ID." });
    }
    db.run("UPDATE alerts SET status = 2 WHERE id = ?", [alertId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) {
            return res.status(404).json({ success: false, message: "Alert not found." });
        }
        res.json({ success: true, message: "Alert dismissed successfully." });
    });
});

// HOD & Coordinator API: Dismiss ALL pending alerts
app.post('/api/alerts/dismiss-all', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod' && req.user.role !== 'coordinator') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }

    db.run("UPDATE alerts SET status = 2 WHERE status < 2", [], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: `Successfully dismissed all alerts.` });
    });
});

// Teacher API: Get attendance for a specific class (only present students)
app.get('/api/attendance/:class_id', authenticateToken, (req, res) => {
    const query = `
        SELECT u.id as student_id, u.username, a.timestamp, a.request_lat, a.request_lon 
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

// Student API: Get active classes (includes check-in status for this specific student!)
app.get('/api/active-classes', authenticateToken, (req, res) => {
    const studentId = req.user.id;
    const query = `
        SELECT c.id, c.name, c.latitude, c.longitude, c.radius,
               (SELECT status FROM attendance WHERE class_id = c.id AND student_id = ?) as attendance_status
        FROM classes c
        WHERE c.active = 1
        ORDER BY c.id DESC
    `;
    db.all(query, [studentId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ classes: rows });
    });
});

// Student API: Report Geofence Boundary Breach (Student walked out of class)
app.post('/api/alerts/geofence-breach', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { class_id, latitude, longitude, distance } = req.body;
    const student_id = req.user.id;
    const student_name = req.user.username;

    // Fetch class details to construct the alert message
    db.get("SELECT name, radius FROM classes WHERE id = ?", [class_id], (err, currentClass) => {
        if (err || !currentClass) return res.status(404).json({ success: false, message: "Class not found." });

        const message = `🚨 Geofence Breach: Student "${student_name}" walked outside the classroom geofence bounds of "${currentClass.name}" (Current distance: ${distance}m, Limit: ${currentClass.radius}m).`;
        
        // Log this breach alert for the HOD
        db.run("INSERT INTO alerts (student_id, class_id, message) VALUES (?, ?, ?)", [student_id, class_id, message], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, alert_id: this.lastID, message: "Geofence boundary breach logged for HOD review." });
        });
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

// Student API: Verify password fallback for older/incompatible devices
app.post('/api/verify-password', authenticateToken, (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ success: false, message: "Password is required." });
    }

    db.get("SELECT password FROM users WHERE id = ?", [req.user.id], (err, row) => {
        if (err || !row) return res.status(404).json({ success: false, message: "User not found." });

        const match = bcrypt.compareSync(password, row.password);
        if (match) {
            res.json({ success: true, message: "Identity verified successfully!" });
        } else {
            res.json({ success: false, message: "Incorrect login password." });
        }
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
                    timestamp: r.timestamp,
                    latitude: r.request_lat,
                    longitude: r.request_lon
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
            if (this.changes === 0) {
                return res.status(404).json({ success: false, message: "No pending request found for this student." });
            }
            res.json({ success: true, message: "Student approved successfully!" });
        }
    );
});

// Teacher API: Decline a student request (deletes the pending record)
app.post('/api/decline-request', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { class_id, student_id } = req.body;
    db.run(
        "DELETE FROM attendance WHERE class_id = ? AND student_id = ? AND status = 'pending'",
        [class_id, student_id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: "Request declined successfully." });
        }
    );
});



// Student API: Mark Attendance (Standard GPS + dynamic QR if qr_token provided + Teacher OTP if otp_code provided)
app.post('/api/mark-attendance', authenticateToken, (req, res) => {
    const { class_id, latitude, longitude, qr_token, accuracy, otp_code } = req.body;
    const student_id = req.user.id; // Securely retrieve student ID from verified token

    // Check if attendance privileges are locked due to geofence breach
    db.get("SELECT attendance_locked FROM users WHERE id = ?", [student_id], (err, u) => {
        if (err) return res.status(500).json({ error: err.message });
        if (u && u.attendance_locked === 1) {
            return res.status(403).json({ success: false, attendance_locked: true, message: "❌ Attendance Privileges Locked: Your account has been suspended due to an unauthorized campus geofence breach. Please visit your HOD or Class Coordinator to unlock your account." });
        }

    // Validate Teacher OTP first if provided (bypasses geofence check since teacher is present in person)
    if (otp_code) {
        db.get("SELECT otp_code, timestamp FROM otp_codes WHERE student_id = ? AND class_id = ?", [student_id, class_id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(400).json({ success: false, message: "No active OTP generated by the teacher." });

            const elapsedSeconds = (Date.now() - new Date(row.timestamp + 'Z').getTime()) / 1000;
            if (elapsedSeconds > 600) {
                db.run("DELETE FROM otp_codes WHERE student_id = ?", [student_id]);
                return res.status(400).json({ success: false, message: "OTP has expired. Request a new one from the teacher." });
            }

            if (row.otp_code !== otp_code.trim()) {
                return res.status(400).json({ success: false, message: "Incorrect OTP code. Verify and try again." });
            }

            // OTP verified! Consume it
            db.run("DELETE FROM otp_codes WHERE student_id = ?", [student_id]);

            db.run("INSERT INTO attendance (class_id, student_id, status) VALUES (?, ?, 'present')", [class_id, student_id], function(err) {
                if (err) {
                    if (err.message.includes("UNIQUE")) {
                        db.run("UPDATE attendance SET status = 'present' WHERE class_id = ? AND student_id = ? AND status = 'pending'", [class_id, student_id], function(updateErr) {
                            if (updateErr) return res.status(500).json({ error: updateErr.message });
                            return res.json({ success: true, message: "Attendance verified and marked present!" });
                        });
                        return;
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true, message: "Attendance marked successfully via Teacher OTP!" });
            });
        });
        return;
    }

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
            db.run("INSERT INTO attendance (class_id, student_id, status, request_lat, request_lon) VALUES (?, ?, 'present', ?, ?)", [class_id, student_id, latitude, longitude], function(err) {
                if (err) {
                    if (err.message.includes("UNIQUE")) {
                        // If it was pending, promote it to present
                        db.run("UPDATE attendance SET status = 'present', request_lat = ?, request_lon = ? WHERE class_id = ? AND student_id = ? AND status = 'pending'", [latitude, longitude, class_id, student_id], function(updateErr) {
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
});

// HOD & Student API: Get Campus Geofence Settings
app.get('/api/campus-settings', authenticateToken, (req, res) => {
    db.all("SELECT key, value FROM campus_settings", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settings = {};
        rows.forEach(r => {
            if (r.key === 'college_start_time' || r.key === 'college_end_time') {
                settings[r.key] = r.value;
            } else {
                settings[r.key] = parseFloat(r.value);
            }
        });

        if (req.user.role === 'student') {
            // Check if the student has marked attendance today in local time
            db.get(
                "SELECT COUNT(*) as count FROM attendance WHERE student_id = ? AND date(timestamp, 'localtime') = date('now', 'localtime')",
                [req.user.id],
                (err, row) => {
                    if (err) return res.status(500).json({ error: err.message });
                    settings.is_tracking_active = row.count > 0;
                    res.json({ success: true, settings });
                }
            );
        } else {
            res.json({ success: true, settings });
        }
    });
});

// HOD API: Update Campus Geofence Settings
app.post('/api/campus-settings', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized access." });
    }

    const { campus_latitude, campus_longitude, campus_radius, college_start_time, college_end_time, stop_tracking_on_exit, exact_live_tracking, track_after_hours } = req.body;
    
    if (campus_latitude === undefined || campus_longitude === undefined || campus_radius === undefined || college_start_time === undefined || college_end_time === undefined) {
        return res.status(400).json({ success: false, message: "Missing required bounds or college hours values." });
    }

    db.serialize(() => {
        db.run("INSERT OR REPLACE INTO campus_settings (key, value) VALUES ('campus_latitude', ?)", [campus_latitude.toString()]);
        db.run("INSERT OR REPLACE INTO campus_settings (key, value) VALUES ('campus_longitude', ?)", [campus_longitude.toString()]);
        db.run("INSERT OR REPLACE INTO campus_settings (key, value) VALUES ('campus_radius', ?)", [campus_radius.toString()]);
        db.run("INSERT OR REPLACE INTO campus_settings (key, value) VALUES ('college_start_time', ?)", [college_start_time]);
        db.run("INSERT OR REPLACE INTO campus_settings (key, value) VALUES ('college_end_time', ?)", [college_end_time]);
        
        // Save the new configurations
        db.run("INSERT OR REPLACE INTO campus_settings (key, value) VALUES ('stop_tracking_on_exit', ?)", [stop_tracking_on_exit !== undefined ? stop_tracking_on_exit.toString() : '0']);
        db.run("INSERT OR REPLACE INTO campus_settings (key, value) VALUES ('exact_live_tracking', ?)", [exact_live_tracking !== undefined ? exact_live_tracking.toString() : '1']);
        db.run("INSERT OR REPLACE INTO campus_settings (key, value) VALUES ('track_after_hours', ?)", [track_after_hours !== undefined ? track_after_hours.toString() : '0'], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: "Campus geofence and tracking configurations updated successfully!" });
        });
    });
});

// Student API: Report Campus Geofence Boundary Breach (Max 3 logs per day to prevent spam after HOD dismissal)
app.post('/api/alerts/campus-breach', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { latitude, longitude, distance } = req.body;
    const student_id = req.user.id;
    const student_name = req.user.username;

    // Check if the student is marked as keypad/no-phone user (exempt from geofence)
    db.get("SELECT is_keypad FROM users WHERE id = ?", [student_id], (err, u) => {
        if (err) return res.status(500).json({ error: err.message });
        if (u && u.is_keypad === 1) {
            return res.json({ success: false, ignored_keypad: true, message: "Exempted due to keypad/no-phone status." });
        }

        // Check if the student has an active out-pass
        db.get("SELECT expiry, reason, duration_mins FROM student_passes WHERE student_id = ?", [student_id], (err, pass) => {
            if (err) return res.status(500).json({ error: err.message });

            if (pass) {
                const expiryTime = new Date(pass.expiry + 'Z').getTime();
                if (Date.now() < expiryTime) {
                    // Active pass exists, ignore any breach warning reporting
                    return res.json({ success: false, ignored_due_to_pass: true, message: "Campus exit is authorized via HOD out-pass." });
                }
            }

            const isExpiredPass = pass && (Date.now() >= new Date(pass.expiry + 'Z').getTime());

            // Check count of campus breach alerts for this student today
            const countQuery = `
                SELECT COUNT(*) as count 
                FROM alerts 
                WHERE student_id = ? 
                  AND (message LIKE '%Campus Geofence Breach%' OR message LIKE '%Out-Pass Expired%')
                  AND date(timestamp) = date('now')
            `;
            db.get(countQuery, [student_id], (err, countRow) => {
                if (err) return res.status(500).json({ error: err.message });
                
                if (countRow && countRow.count >= 4) {
                    return res.json({ success: false, limit_reached: true, message: "Breach alert limit (4) reached for today." });
                }

                db.get("SELECT value FROM campus_settings WHERE key = 'campus_radius'", (err, row) => {
                    if (err || !row) return res.status(500).json({ error: "Campus settings not loaded." });
                    const campusRadius = row.value;

                    let message = `🚨 Campus Geofence Breach: Student "${student_name}" walked outside the HOD campus bounds (Current distance: ${distance}m, Limit: ${campusRadius}m).`;
                    if (isExpiredPass) {
                        message = `🚨 Out-Pass Expired: Student "${student_name}" did not return to campus within the permitted ${pass.duration_mins} minutes for "${pass.reason}" (Current distance: ${distance}m, Limit: ${campusRadius}m).`;
                    }
                    
                    // Resolve currently active class session to link to this alert
                    db.get("SELECT id FROM classes WHERE active = 1 ORDER BY id DESC LIMIT 1", [], (err, activeClass) => {
                        const classIdToInsert = activeClass ? activeClass.id : null;
                        
                        db.run(
                            "INSERT INTO alerts (student_id, class_id, message, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
                            [student_id, classIdToInsert, message, latitude, longitude],
                            function(err) {
                                if (err) return res.status(500).json({ error: err.message });
                                
                                const alertId = this.lastID;
                                db.run("UPDATE users SET attendance_locked = 1 WHERE id = ?", [student_id], (lockErr) => {
                                    if (lockErr) console.error("Failed to lock attendance for student", student_id, lockErr);
                                    res.json({ success: true, message: isExpiredPass ? "Expired pass breach logged." : "Breach logged.", alert_id: alertId });
                                });
                            }
                        );
                    });
                });
            });
        });
    });
});

// Student API: Submit Explanation Reason for Breach Alert
app.post('/api/alerts/submit-reason', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { alert_id, reason } = req.body;

    if (!alert_id || !reason || reason.trim() === "") {
        return res.status(400).json({ success: false, message: "Valid alert ID and explanation statement are required." });
    }

    db.run("UPDATE alerts SET student_reason = ? WHERE id = ? AND student_id = ?", [reason.trim(), alert_id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Reason statement logged successfully for HOD review." });
    });
});

// Teacher API: Get list of all students (so they can select one to generate OTP)
app.get('/api/students', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher' && req.user.role !== 'hod' && req.user.role !== 'coordinator') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    db.all("SELECT id, username, is_keypad, student_phone FROM users WHERE role = 'student' ORDER BY username ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, students: rows });
    });
});

// Teacher API: Generate dynamic OTP passcode for a student
app.post('/api/teacher/generate-otp', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { class_id, student_id } = req.body;
    if (!class_id || !student_id) {
        return res.status(400).json({ success: false, message: "Missing class_id or student_id." });
    }

    // Generate a random 4-digit code (padded with zeros)
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    db.run(
        "INSERT OR REPLACE INTO otp_codes (student_id, class_id, otp_code, timestamp) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        [student_id, class_id, otp],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, otp, expires_in: 60 });
        }
    );
});

// Deterministic Time-based OTP (TOTP) verification helper for student-generated codes
// Derives code from studentId + current 20-second time window to avoid database overhead
function verifyStudentLocalOTP(studentId, submittedOtp) {
    const timeIndex = Math.floor(Date.now() / 20000); // 20-second windows
    
    // Check current window and previous window (20s grace period for latency)
    for (let i = 0; i <= 1; i++) {
        const idx = timeIndex - i;
        const raw = (parseInt(studentId, 10) * 7919) + (idx * 104729);
        const expected = (Math.abs(raw) % 9000 + 1000).toString();
        if (expected === submittedOtp.trim()) {
            return true;
        }
    }
    return false;
}

// Teacher API: Verify student-generated rotating OTP
app.post('/api/teacher/verify-student-otp', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { student_id, otp_code, class_id } = req.body;
    if (!student_id || !otp_code || !class_id) {
        return res.status(400).json({ success: false, message: "Missing student_id, otp_code, or class_id." });
    }

    if (!verifyStudentLocalOTP(student_id, otp_code)) {
        return res.status(400).json({ success: false, message: "Incorrect or expired student OTP. Ask student for a fresh code." });
    }

    // OTP verified! Mark student present
    db.run(
        "INSERT OR REPLACE INTO attendance (class_id, student_id, status) VALUES (?, ?, 'present')",
        [class_id, student_id],
        function(err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    db.run("UPDATE attendance SET status = 'present' WHERE class_id = ? AND student_id = ? AND status = 'pending'", [class_id, student_id], function(updateErr) {
                        if (updateErr) return res.status(500).json({ error: updateErr.message });
                        return res.json({ success: true, message: "OTP verified! Student marked present." });
                    });
                    return;
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: "Student OTP verified! Attendance marked successfully." });
        }
    );
});

// Student API: Heartbeat telemetry, campus geofence validation, and dynamic location tracking
app.post('/api/student/heartbeat', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const student_id = req.user.id;
    const { latitude, longitude } = req.body;

    // 1. Fetch campus settings
    db.all("SELECT key, value FROM campus_settings", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const settings = {
            campus_latitude: 17.3850,
            campus_longitude: 78.4867,
            campus_radius: 500,
            college_start_time: '09:00',
            college_end_time: '16:00',
            stop_tracking_on_exit: 0,
            exact_live_tracking: 1,
            track_after_hours: 0
        };

        rows.forEach(r => {
            if (r.key === 'college_start_time' || r.key === 'college_end_time') {
                settings[r.key] = r.value;
            } else {
                settings[r.key] = parseFloat(r.value);
            }
        });

        // 2. Check if current local time is within college hours
        const nowLocal = new Date();
        const hours = nowLocal.getHours();
        const minutes = nowLocal.getMinutes();
        const currentMin = hours * 60 + minutes;

        const [startH, startM] = settings.college_start_time.split(':').map(Number);
        const [endH, endM] = settings.college_end_time.split(':').map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;

        const isCollegeHours = currentMin >= startMin && currentMin <= endMin;

        // 3. Calculate distance and campus residency status
        let inside_campus = true;
        let distance = 0;
        if (latitude !== undefined && longitude !== undefined) {
            distance = getDistance(settings.campus_latitude, settings.campus_longitude, latitude, longitude);
            inside_campus = distance <= settings.campus_radius;
        }

        // 4. Resolve active out-pass
        db.get("SELECT expiry, reason FROM student_passes WHERE student_id = ?", [student_id], (err, pass) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const has_pass = pass && Date.now() < new Date(pass.expiry + 'Z').getTime();
            let track_active = true;

            // 5. Enforce Geofencing rules and alerts during college hours
            if (isCollegeHours) {
                if (!inside_campus && !has_pass && latitude !== undefined && longitude !== undefined) {
                    // Check alert count today to avoid alert spamming
                    const alertCountQuery = `
                        SELECT COUNT(*) as count FROM alerts 
                        WHERE student_id = ? 
                          AND message LIKE '%Campus Geofence Breach%' 
                          AND date(timestamp) = date('now')
                    `;
                    db.get(alertCountQuery, [student_id], (err, countRow) => {
                        const alertCount = countRow ? countRow.count : 0;
                        
                        if (alertCount < 4) {
                            const alertMsg = `🚨 Campus Geofence Breach: Student "${req.user.username}" walked outside campus boundary during college hours. (Distance: ${Math.round(distance)}m, Limit: ${settings.campus_radius}m).`;
                            db.run("INSERT INTO alerts (student_id, message, latitude, longitude) VALUES (?, ?, ?, ?)", [student_id, alertMsg, latitude, longitude]);
                            db.run("UPDATE users SET attendance_locked = 1 WHERE id = ?", [student_id]);
                        }
                    });

                    // Stop tracking on exit option
                    if (settings.stop_tracking_on_exit === 1) {
                        track_active = false;
                    }
                }
            } else {
                // Outside operating hours
                if (settings.track_after_hours === 0) {
                    track_active = false;
                }
            }

            // 6. Update student telemetry/status in database
            const updateSql = (track_active && latitude !== undefined && longitude !== undefined)
                ? "UPDATE users SET last_seen = datetime('now', 'localtime'), last_lat = ?, last_lon = ? WHERE id = ?"
                : "UPDATE users SET last_seen = datetime('now', 'localtime') WHERE id = ?";
            const updateParams = (track_active && latitude !== undefined && longitude !== undefined)
                ? [latitude, longitude, student_id]
                : [student_id];

            db.run(updateSql, updateParams, function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({
                    success: true,
                    track_active: track_active,
                    enable_high_accuracy: settings.exact_live_tracking === 1,
                    interval_ms: settings.exact_live_tracking === 1 ? 10000 : 25000,
                    message: "Telemetry processed successfully."
                });
            });
        });
    });
});

// Student API: Check if they have an active out-pass
app.get('/api/student/active-pass', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const student_id = req.user.id;
    db.get(
        "SELECT expiry, reason, duration_mins FROM student_passes WHERE student_id = ?",
        [student_id],
        (err, pass) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!pass) return res.json({ success: true, has_pass: false });

            const expiryTime = new Date(pass.expiry + 'Z').getTime();
            const now = Date.now();
            const has_pass = now < expiryTime;

            res.json({
                success: true,
                has_pass,
                expiry: pass.expiry,
                reason: pass.reason,
                duration_mins: pass.duration_mins,
                time_left_secs: Math.max(0, Math.floor((expiryTime - now) / 1000))
            });
        }
    );
});

// HOD API: Grant Out-pass to a student
app.post('/api/hod/grant-pass', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { student_id, reason, duration_mins } = req.body;
    if (!student_id || !reason || !duration_mins) {
        return res.status(400).json({ success: false, message: "Missing student_id, reason, or duration." });
    }

    // Expiry = current time + duration in minutes
    // To store in UTC consistently for SQLite:
    const expiryDate = new Date(Date.now() + parseInt(duration_mins) * 60000);
    const expiryStr = expiryDate.toISOString().replace('T', ' ').substring(0, 19);

    db.run(
        "INSERT OR REPLACE INTO student_passes (student_id, expiry, reason, duration_mins, notified_expired) VALUES (?, ?, ?, ?, 0)",
        [student_id, expiryStr, reason, duration_mins],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: "Out-pass granted successfully!" });
        }
    );
});

// HOD API: Get all active / recently expired student out-passes
app.get('/api/hod/active-passes', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    db.all(
        `SELECT p.student_id, p.expiry, p.reason, p.duration_mins, u.username 
         FROM student_passes p 
         JOIN users u ON p.student_id = u.id 
         ORDER BY p.expiry DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const now = Date.now();
            const passes = rows.map(r => {
                const expiryTime = new Date(r.expiry + 'Z').getTime();
                const is_active = now < expiryTime;
                return {
                    student_id: r.student_id,
                    username: r.username,
                    reason: r.reason,
                    duration_mins: r.duration_mins,
                    expiry: r.expiry,
                    is_active,
                    time_left_secs: Math.max(0, Math.floor((expiryTime - now) / 1000))
                };
            });
            res.json({ success: true, passes });
        }
    );
});

// HOD API: Revoke / Cancel out-pass
app.post('/api/hod/cancel-pass', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { student_id } = req.body;
    db.run("DELETE FROM student_passes WHERE student_id = ?", [student_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Out-pass revoked successfully!" });
    });
});

// Student API: Fetch student's registered biometric device credential ID
app.get('/api/biometrics/device-id', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }
    
    db.get("SELECT device_biometric_id FROM users WHERE id = ?", [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, device_biometric_id: row ? row.device_biometric_id : null });
    });
});

// Student API: Register and Cryptographically Bind device biometrics to this student account
app.post('/api/biometrics/register', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { credential_id } = req.body;
    if (!credential_id) {
        return res.status(400).json({ success: false, message: "Missing credential_id." });
    }

    // Check if this student already has a registered biometric credential (prevent overwrite/re-registration)
    db.get("SELECT device_biometric_id, username FROM users WHERE id = ?", [req.user.id], (err, userRow) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (userRow && userRow.device_biometric_id) {
            // Biometric already bound! Log bypass attempt alert to HOD/Coordinator
            const alertMsg = `⚠️ Security Bypass Warning: Student "${userRow.username}" attempted to register a new biometric fingerprint/face on an already bound device. (Action Blocked)`;
            db.run("INSERT INTO alerts (student_id, message) VALUES (?, ?)", [req.user.id, alertMsg], (alertErr) => {
                if (alertErr) console.error("Failed to insert security alert:", alertErr.message);
            });
            return res.status(400).json({ 
                success: false, 
                message: "❌ Security Block: A fingerprint is already bound to this account. To register a different device/fingerprint, please contact your HOD or Coordinator to reset your biometrics." 
            });
        }

        // 1. Check if another student has already registered THIS credential ID (meaning they are using the same phone!)
        db.get("SELECT username FROM users WHERE device_biometric_id = ? AND id != ?", [credential_id, req.user.id], (err, other) => {
            if (err) return res.status(500).json({ error: err.message });
            if (other) {
                return res.status(400).json({ success: false, message: `This device is already registered and bound to another student account (${other.username}). Sharing phones is not allowed.` });
            }

            // 2. Register the credential ID for this student
            db.run("UPDATE users SET device_biometric_id = ? WHERE id = ?", [credential_id, req.user.id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: "Biometrics successfully registered and bound to this device!" });
            });
        });
    });
});

// Student API: Verify biometric check-in signature matches registered device
app.post('/api/biometrics/verify', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { credential_id } = req.body;
    if (!credential_id) {
        return res.status(400).json({ success: false, message: "Missing credential_id." });
    }

    db.get("SELECT device_biometric_id, attendance_locked FROM users WHERE id = ?", [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ success: false, message: "User not found." });

        if (row.attendance_locked === 1) {
            return res.status(403).json({ success: false, attendance_locked: true, message: "❌ Attendance Privileges Locked: Your account has been suspended due to an unauthorized campus geofence breach. Please visit your HOD or Class Coordinator to unlock your account." });
        }

        if (!row.device_biometric_id) {
            return res.status(400).json({ success: false, message: "No biometrics registered for this account." });
        }

        if (row.device_biometric_id !== credential_id) {
            return res.status(400).json({ success: false, message: "Biometric signature does not match this registered device." });
        }

        res.json({ success: true, message: "Identity verified successfully!" });
    });
});

// (Duplicate heartbeat handler removed, using the upgraded dynamic geofencing telemetry heartbeat handler registered above)

// Student API: Full attendance history across ALL sessions (active + ended)
app.get('/api/student/history', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const student_id = req.user.id;

    const query = `
        SELECT 
            c.id as class_id,
            c.name as class_name,
            c.active,
            a.status as attendance_status,
            a.timestamp as marked_at
        FROM classes c
        LEFT JOIN attendance a 
            ON a.class_id = c.id AND a.student_id = ?
        ORDER BY c.id DESC
        LIMIT 100
    `;

    db.all(query, [student_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const endedSessions = rows.filter(r => r.active === 0);
        const presentInEnded = endedSessions.filter(r => r.attendance_status === 'present').length;

        res.json({
            success: true,
            history: rows,
            stats: {
                total_sessions: rows.length,
                ended_sessions: endedSessions.length,
                present_count: presentInEnded,
                percentage: endedSessions.length > 0 ? Math.round((presentInEnded / endedSessions.length) * 100) : 0
            }
        });
    });
});

// HOD API: Fetch all students' real-time geofence tracking statuses

app.get('/api/hod/students-tracking', authenticateToken, (req, res) => {
    if (req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const query = `
        SELECT u.id, u.username, u.last_seen, u.attendance_locked, u.last_lat, u.last_lon, a.status as attendance_status,
               (SELECT message FROM alerts WHERE student_id = u.id ORDER BY id DESC LIMIT 1) as last_alert
        FROM users u
        LEFT JOIN attendance a ON a.student_id = u.id AND date(a.timestamp, 'localtime') = date('now', 'localtime')
        WHERE u.role = 'student'
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const now = Date.now();
        const students = rows.map(r => {
            let status = 'Not Checked In';
            let tracking_alert = null;
            
            if (r.attendance_status === 'present') {
                if (!r.last_seen) {
                    status = 'Offline / Suspended Tracking';
                } else {
                    const elapsedSecs = (now - new Date(r.last_seen).getTime()) / 1000;
                    if (elapsedSecs > 180) { // 3 minutes threshold
                        status = 'Offline / Suspended Tracking';
                    } else {
                        // Check if they had a recent breach
                        if (r.last_alert && r.last_alert.includes("Campus Geofence Breach")) {
                            status = 'Geofence Breach';
                            tracking_alert = r.last_alert;
                        } else {
                            status = 'Active & Guarded';
                        }
                    }
                }
            }
            
            return {
                id: r.id,
                username: r.username,
                last_seen: r.last_seen,
                status,
                tracking_alert,
                attendance_locked: r.attendance_locked,
                last_lat: r.last_lat,
                last_lon: r.last_lon
            };
        });
        
        res.json({ success: true, students });
    });
});

// Coordinator API: Toggle Keypad Phone User exemption
app.post('/api/coordinator/toggle-keypad', authenticateToken, (req, res) => {
    if (req.user.role !== 'coordinator' && req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }
    const { student_id, is_keypad } = req.body;
    db.run("UPDATE users SET is_keypad = ? WHERE id = ? AND role = 'student'", [is_keypad ? 1 : 0, student_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Student keypad exemption status updated!" });
    });
});

// Coordinator API: Fetch Coordinator's Class Roster & Telemetry
app.get('/api/coordinator/roster', authenticateToken, (req, res) => {
    if (req.user.role !== 'coordinator' && req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const query = `
        SELECT u.id, u.username, u.barcode, u.is_keypad, u.last_seen, u.attendance_locked, u.student_phone, u.last_lat, u.last_lon, a.status as attendance_status,
               (SELECT message FROM alerts WHERE student_id = u.id ORDER BY id DESC LIMIT 1) as last_alert
        FROM users u
        LEFT JOIN attendance a ON a.student_id = u.id AND date(a.timestamp, 'localtime') = date('now', 'localtime')
        WHERE u.role = 'student'
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const now = Date.now();
        const roster = rows.map(r => {
            let status = 'Not Checked In';
            let tracking_alert = null;
            
            if (r.is_keypad === 1) {
                status = r.attendance_status === 'present' ? '🟢 Checked In (Manual Override)' : 'Not Checked In';
            } else if (r.attendance_status === 'present') {
                if (!r.last_seen) {
                    status = 'Offline / Suspended Tracking';
                } else {
                    const elapsedSecs = (now - new Date(r.last_seen).getTime()) / 1000;
                    if (elapsedSecs > 180) {
                        status = 'Offline / Suspended Tracking';
                    } else {
                        if (r.last_alert && r.last_alert.includes("Campus Geofence Breach")) {
                            status = 'Geofence Breach';
                            tracking_alert = r.last_alert;
                        } else {
                            status = 'Active & Guarded';
                        }
                    }
                }
            }
            return {
                id: r.id,
                username: r.username,
                barcode: r.barcode,
                is_keypad: r.is_keypad,
                status,
                tracking_alert,
                attendance_locked: r.attendance_locked,
                student_phone: r.student_phone,
                last_lat: r.last_lat,
                last_lon: r.last_lon
            };
        });
        res.json({ success: true, roster });
    });
});

// Coordinator API: Fetch Class Alerts
app.get('/api/coordinator/class-feed', authenticateToken, (req, res) => {
    if (req.user.role !== 'coordinator' && req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }
    const query = `
        SELECT a.id, a.student_id, a.message, a.student_reason, a.status, a.timestamp, a.latitude, a.longitude,
               u.username as student_name, u.parent_phone
        FROM alerts a
        JOIN users u ON a.student_id = u.id
        ORDER BY a.status ASC, a.id DESC LIMIT 30
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, alerts: rows });
    });
});

// Coordinator API: Manual check-in override for keypad / broken phone students
app.post('/api/coordinator/manual-checkin', authenticateToken, (req, res) => {
    if (req.user.role !== 'coordinator' && req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }
    const { student_id, class_id } = req.body;
    if (!student_id || !class_id) {
        return res.status(400).json({ success: false, message: "Missing student_id or class_id." });
    }

    const query = `INSERT OR REPLACE INTO attendance (class_id, student_id, status) VALUES (?, ?, 'present')`;
    db.run(query, [class_id, student_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Attendance verified and marked manually!" });
    });
});

// Coordinator & HOD API: Unlock student attendance locks
app.post('/api/coordinator/unlock-student', authenticateToken, (req, res) => {
    if (req.user.role !== 'coordinator' && req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }
    const { student_id } = req.body;
    if (!student_id) {
        return res.status(400).json({ success: false, message: "Missing student_id." });
    }

    console.log(`[UNLOCK REQUEST] User: ${req.user.username} (Role: ${req.user.role}) | Target Student ID: ${student_id}`);

    db.run("UPDATE users SET attendance_locked = 0 WHERE id = ?", [student_id], function(err) {
        if (err) {
            console.error(`[UNLOCK ERROR] Failed to update DB for student ${student_id}:`, err);
            return res.status(500).json({ error: err.message });
        }
        console.log(`[UNLOCK SUCCESS] Student ${student_id} check-in privileges unlocked successfully.`);
        res.json({ success: true, message: "Student check-in privileges unlocked successfully!" });
    });
});

// Coordinator & Teacher API: Send SMS OTP for keypad users
app.post('/api/coordinator/send-keypad-otp', authenticateToken, (req, res) => {
    if (req.user.role !== 'coordinator' && req.user.role !== 'hod' && req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }
    const { student_id } = req.body;
    let { class_id } = req.body;
    if (!student_id) {
        return res.status(400).json({ success: false, message: "Missing student_id." });
    }

    db.get("SELECT id FROM classes WHERE active = 1 ORDER BY id DESC LIMIT 1", [], (err, activeClass) => {
        if (activeClass) {
            class_id = activeClass.id;
        }
        if (!class_id) {
            return res.status(400).json({ success: false, message: "No active class session running." });
        }

        db.get("SELECT username, student_phone, is_keypad FROM users WHERE id = ?", [student_id], (err, student) => {
            if (err || !student) return res.status(404).json({ success: false, message: "Student not found." });
            if (student.is_keypad !== 1) {
                return res.status(400).json({ success: false, message: "This student is not registered as a keypad phone user." });
            }

            const otp = Math.floor(1000 + Math.random() * 9000).toString();

            db.run(
                "INSERT OR REPLACE INTO otp_codes (student_id, class_id, otp_code, timestamp) VALUES (?, ?, ?, datetime('now', 'localtime'))",
                [student_id, class_id, otp],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    // Simulate SMS Transmission
                    console.log(`\n==================================================================`);
                    console.log(`[SMS GATEWAY] Transmitting OTP: ${otp} to Keypad Student "${student.username}" (Phone: ${student.student_phone || 'N/A'})`);
                    console.log(`==================================================================\n`);

                    res.json({ success: true, message: `OTP code sent via SMS successfully to ${student.username}!`, otp });
                }
            );
        });
    });
});

// Coordinator & Teacher API: Verify SMS OTP for keypad users
app.post('/api/coordinator/verify-keypad-otp', authenticateToken, (req, res) => {
    if (req.user.role !== 'coordinator' && req.user.role !== 'hod' && req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }
    const { student_id, otp_code } = req.body;
    let { class_id } = req.body;
    if (!student_id || !otp_code) {
        return res.status(400).json({ success: false, message: "Missing student_id or otp_code." });
    }

    db.get("SELECT id FROM classes WHERE active = 1 ORDER BY id DESC LIMIT 1", [], (err, activeClass) => {
        if (activeClass) {
            class_id = activeClass.id;
        }
        if (!class_id) {
            return res.status(400).json({ success: false, message: "No active class session running." });
        }

        db.get("SELECT otp_code, timestamp FROM otp_codes WHERE student_id = ? AND class_id = ?", [student_id, class_id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(400).json({ success: false, message: "No active OTP generated for this student." });

            if (row.otp_code !== otp_code.trim()) {
                return res.status(400).json({ success: false, message: "Incorrect OTP. Please check and try again." });
            }

            // OTP matches! Mark student present
            db.serialize(() => {
                db.run("DELETE FROM otp_codes WHERE student_id = ?", [student_id]);
                db.run(
                    "INSERT OR REPLACE INTO attendance (class_id, student_id, status) VALUES (?, ?, 'present')",
                    [class_id, student_id],
                    function(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ success: true, message: "OTP verified! Student marked present successfully." });
                    }
                );
            });
        });
    });
});

// Coordinator API: Update a student's phone number
app.post('/api/coordinator/update-student-phone', authenticateToken, (req, res) => {
    if (req.user.role !== 'coordinator' && req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }
    const { student_id, student_phone } = req.body;
    if (!student_id || student_phone === undefined) {
        return res.status(400).json({ success: false, message: "Missing student_id or student_phone." });
    }

    db.run("UPDATE users SET student_phone = ? WHERE id = ? AND role = 'student'", [student_phone.trim(), student_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Student phone number updated successfully!" });
    });
});

// Coordinator & HOD API: Reset student device hardware & biometric locks
app.post('/api/coordinator/reset-device', authenticateToken, (req, res) => {
    if (req.user.role !== 'coordinator' && req.user.role !== 'hod') {
        return res.status(403).json({ success: false, message: "Unauthorized." });
    }
    const { student_id } = req.body;
    if (!student_id) {
        return res.status(400).json({ success: false, message: "Missing student_id." });
    }

    db.run("UPDATE users SET device_id = NULL, device_biometric_id = NULL WHERE id = ? AND role = 'student'", [student_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Student device hardware and biometric fingerprint lock reset successfully!" });
    });
});

const useHttps = process.env.USE_HTTPS === 'true';

// ─── Logout Endpoint ─────────────────────────────────────────────────────────
app.post('/api/logout', authenticateToken, (req, res) => {
    console.log(`[LOGOUT] User "${req.user.username}" (role: ${req.user.role}) logged out at ${new Date().toISOString()}`);
    res.json({ success: true, message: 'Logged out successfully.' });
});
app.get('/api/logout', (req, res) => {
    res.json({ success: true, message: 'Logged out.' });
});

// ─── Biometric Breach Alert (NO AUTH REQUIRED — called BEFORE login completes) ─
// Triggered by the login page when a student's biometric credential_id returned
// by WebAuthn does NOT match the one stored in the database. This means someone
// attempted to log in to this account using a DIFFERENT fingerprint or face —
// possible shared-device fraud, spoofing attempt, or stolen credentials.
// Rate-limited by the general limiter (500 req / 15 min per IP).
app.post('/api/alerts/biometric-breach', (req, res) => {
    const { username, device_info } = req.body;
    if (!username || typeof username !== 'string') {
        return res.status(400).json({ success: false, message: 'Username required.' });
    }

    // Look up the student so we can link the alert to their ID
    db.get("SELECT id, username FROM users WHERE username = ? AND role = 'student'", [username.trim()], (err, student) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

        const deviceHint = device_info ? ` (Device info: ${device_info})` : '';
        const alertMessage = `🚨 BIOMETRIC SECURITY BREACH: Student "${student.username}" attempted login using an UNRECOGNISED fingerprint or face ID. ` +
            `The biometric credential did not match the registered device binding. ` +
            `This may indicate account sharing, device swapping, or a spoofing attempt.${deviceHint} ` +
            `Action Required: Verify with student and reset device binding if necessary.`;

        db.run(
            "INSERT INTO alerts (student_id, message, status) VALUES (?, ?, 0)",
            [student.id, alertMessage],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                console.warn(`[BIOMETRIC BREACH] Alert #${this.lastID} raised for student "${student.username}"`);
                res.json({ success: true, alert_id: this.lastID, message: 'Breach alert sent to HOD.' });
            }
        );
    });
});
// ─────────────────────────────────────────────────────────────────────────────

if (isRender || !useHttps) {
    // Start standard HTTP server (default for local development and cloud hosting)
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`HTTP Server running on http://localhost:${PORT}`);
        console.log(`Portals: http://localhost:${PORT}/hod.html | /teacher.html | /coordinator.html | /student.html`);
    });
} else {
    // Start secure HTTPS server for local network phone access (run with USE_HTTPS=true node server.js)
    https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
        console.log(`Secure HTTPS Server running on https://localhost:${PORT}`);
        console.log(`To access from other devices on WiFi, open: https://<your_laptop_ip>:${PORT}`);
    });
}

// Clean database shutdown on process exit signals
const cleanup = () => {
    db.close((err) => {
        if (err) {
            console.error("Error closing SQLite database during cleanup:", err.message);
        } else {
            console.log("SQLite database connection closed cleanly.");
        }
        process.exit(0);
    });
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
