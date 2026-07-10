/**
 * animations.js — Smart Attendance System
 * ═══════════════════════════════════════════════════════════════════
 * Premium animation layer powered by Motion.dev
 * Covers: page load, tab transitions, button springs, number counters,
 * particle bursts, success celebrations, GPS pulses, QR flip, toasts,
 * card reveals, attendance marks, and magnetic hover effects.
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ── Motion.dev detection ─────────────────────────────────────────────────
    const M = typeof motion !== 'undefined' ? motion : null;
    const animate = M ? M.animate : null;
    const stagger = M ? M.stagger : (d => (i) => i * d);

    // ── CSS Injection ────────────────────────────────────────────────────────
    const css = document.createElement('style');
    css.textContent = `
        /* ── Particle canvas ── */
        #ag-particle-canvas {
            position: fixed; inset: 0; z-index: 9990;
            pointer-events: none; opacity: 1;
        }

        /* ── Page-load shimmer overlay ── */
        #ag-intro-overlay {
            position: fixed; inset: 0; z-index: 9998;
            background: #07080f;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 20px;
            transition: opacity 0.5s ease;
        }
        #ag-intro-overlay.hidden { opacity: 0; pointer-events: none; }
        .ag-intro-logo {
            width: 80px; height: 80px; border-radius: 22px;
            background: linear-gradient(135deg, #6c63ff, #a78bfa);
            display: flex; align-items: center; justify-content: center;
            font-size: 38px;
            box-shadow: 0 0 60px rgba(108,99,255,0.6);
            animation: ag-intro-pulse 1.2s ease-in-out infinite;
        }
        @keyframes ag-intro-pulse {
            0%,100% { transform: scale(1); box-shadow: 0 0 40px rgba(108,99,255,0.5); }
            50%       { transform: scale(1.07); box-shadow: 0 0 80px rgba(108,99,255,0.8); }
        }
        .ag-intro-bar-wrap {
            width: 160px; height: 3px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden;
        }
        .ag-intro-bar {
            height: 100%; width: 0%; background: linear-gradient(90deg, #6c63ff, #a78bfa);
            border-radius: 99px; animation: ag-bar-fill 1.4s cubic-bezier(0.4,0,0.2,1) forwards;
        }
        @keyframes ag-bar-fill { to { width: 100%; } }
        .ag-intro-label { font-size: 12px; color: rgba(255,255,255,0.35); font-family: 'Inter', sans-serif; letter-spacing: 1px; }

        /* ── Success burst overlay ── */
        #ag-success-overlay {
            position: fixed; inset: 0; z-index: 9995;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.65); backdrop-filter: blur(12px);
            opacity: 0; pointer-events: none;
            transition: opacity 0.3s ease;
        }
        #ag-success-overlay.active { opacity: 1; pointer-events: all; }
        .ag-success-card {
            background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.05));
            border: 1px solid rgba(16,185,129,0.35);
            border-radius: 24px; padding: 36px 32px;
            text-align: center; max-width: 320px; width: 90%;
            transform: scale(0.8) translateY(30px);
            transition: transform 0.45s cubic-bezier(0.34,1.56,0.64,1);
        }
        #ag-success-overlay.active .ag-success-card {
            transform: scale(1) translateY(0);
        }
        .ag-success-icon {
            font-size: 64px; margin-bottom: 16px;
            animation: ag-bounce-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes ag-bounce-in {
            from { transform: scale(0); opacity: 0; }
            to   { transform: scale(1); opacity: 1; }
        }
        .ag-success-title { font-size: 20px; font-weight: 800; color: #10b981; margin-bottom: 8px; font-family: 'Inter', sans-serif; }
        .ag-success-msg   { font-size: 13px; color: rgba(255,255,255,0.65); line-height: 1.5; font-family: 'Inter', sans-serif; }
        .ag-success-btn   {
            margin-top: 24px; padding: 12px 32px; border-radius: 10px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white; font-size: 14px; font-weight: 700;
            border: none; cursor: pointer; font-family: 'Inter', sans-serif;
            transition: transform 0.15s, box-shadow 0.15s;
        }
        .ag-success-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(16,185,129,0.4); }

        /* ── Ripple on tap ── */
        .ag-ripple {
            position: absolute; border-radius: 50%;
            background: rgba(255,255,255,0.25);
            transform: scale(0); pointer-events: none;
            animation: ag-ripple-out 0.55s ease forwards;
        }
        @keyframes ag-ripple-out { to { transform: scale(4); opacity: 0; } }

        /* ── GPS pulse rings ── */
        .ag-gps-ring {
            position: absolute; border-radius: 50%;
            border: 2px solid rgba(16,185,129,0.6);
            animation: ag-gps-expand 1.8s ease-out infinite;
            pointer-events: none;
        }
        @keyframes ag-gps-expand {
            from { transform: scale(0.4); opacity: 0.8; }
            to   { transform: scale(3.5); opacity: 0; }
        }

        /* ── Number counter animation ── */
        @keyframes ag-num-pop {
            0%   { transform: scale(1); }
            40%  { transform: scale(1.35); }
            100% { transform: scale(1); }
        }
        .ag-num-pop { animation: ag-num-pop 0.4s cubic-bezier(0.34,1.56,0.64,1); }

        /* ── Magnetic button glow ── */
        .ag-magnetic { transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease; }
        .ag-magnetic:hover { box-shadow: 0 8px 28px rgba(108,99,255,0.35); }

        /* ── Tab slide ── */
        .ag-tab-enter {
            animation: ag-tab-slide 0.32s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes ag-tab-slide {
            from { opacity: 0; transform: translateY(18px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Card reveal stagger ── */
        .ag-card-reveal {
            animation: ag-card-in 0.4s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes ag-card-in {
            from { opacity: 0; transform: translateY(20px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* ── Request card enter ── */
        .ag-request-in {
            animation: ag-request-slide 0.35s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes ag-request-slide {
            from { opacity: 0; transform: translateX(-20px); }
            to   { opacity: 1; transform: translateX(0); }
        }

        /* ── QR refresh flip ── */
        .ag-qr-flip {
            animation: ag-flip-refresh 0.4s ease both;
        }
        @keyframes ag-flip-refresh {
            0%   { transform: perspective(400px) rotateY(0deg);    opacity: 1; }
            50%  { transform: perspective(400px) rotateY(90deg);   opacity: 0.3; }
            100% { transform: perspective(400px) rotateY(0deg);    opacity: 1; }
        }

        /* ── Shimmer skeleton ── */
        .ag-shimmer {
            background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%);
            background-size: 200% 100%;
            animation: ag-shimmer-move 1.6s infinite;
            border-radius: 8px;
        }
        @keyframes ag-shimmer-move { to { background-position: -200% 0; } }

        /* ── Floating particle dot (attendance mark) ── */
        .ag-float-dot {
            position: fixed; width: 8px; height: 8px; border-radius: 50%;
            pointer-events: none; z-index: 9999;
            animation: ag-float-up 1s ease forwards;
        }
        @keyframes ag-float-up {
            0%   { transform: translateY(0) scale(1); opacity: 1; }
            100% { transform: translateY(-120px) scale(0); opacity: 0; }
        }

        /* ── Session start blast ── */
        .ag-session-started {
            animation: ag-session-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes ag-session-pop {
            from { transform: scale(0.88) translateY(10px); opacity: 0; }
            to   { transform: scale(1) translateY(0);       opacity: 1; }
        }
    `;
    document.head.appendChild(css);

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 1 — INTRO / PAGE LOAD ANIMATION
    // ═══════════════════════════════════════════════════════════════════════════
    let introOverlay = null;

    function createIntroOverlay() {
        // Don't show intro on the login page (index.html has its own loader)
        if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') return;

        introOverlay = document.createElement('div');
        introOverlay.id = 'ag-intro-overlay';
        introOverlay.innerHTML = `
            <div class="ag-intro-logo">🎓</div>
            <div class="ag-intro-bar-wrap"><div class="ag-intro-bar"></div></div>
            <div class="ag-intro-label">SMART ATTENDANCE</div>
        `;
        document.body.appendChild(introOverlay);
    }
    createIntroOverlay();

    // Called when the app finishes loading (from DOMContentLoaded hook)
    window.AG = window.AG || {};
    window.AG.hideIntro = function () {
        if (!introOverlay) return;
        introOverlay.classList.add('hidden');
        setTimeout(() => introOverlay && introOverlay.remove(), 600);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — CARD STAGGER REVEAL
    // ═══════════════════════════════════════════════════════════════════════════
    function revealCards(container, delay = 0) {
        const cards = (container || document).querySelectorAll('.card');
        cards.forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(22px) scale(0.97)';
            setTimeout(() => {
                card.style.transition = 'opacity 0.42s cubic-bezier(0.16,1,0.3,1), transform 0.42s cubic-bezier(0.16,1,0.3,1)';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0) scale(1)';
            }, delay + i * 65);
        });
    }
    window.AG.revealCards = revealCards;

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — TAB SWITCH ANIMATION
    // ═══════════════════════════════════════════════════════════════════════════
    window.AG.animateTabChange = function (pageEl) {
        if (!pageEl) return;
        pageEl.classList.remove('ag-tab-enter');
        void pageEl.offsetWidth; // force reflow
        pageEl.classList.add('ag-tab-enter');
        revealCards(pageEl, 60);
    };

    // Patch switchTab globally if it exists
    const _patchSwitchTab = () => {
        if (typeof window.switchTab !== 'function') return;
        const original = window.switchTab;
        window.switchTab = function (tab) {
            original(tab);
            requestAnimationFrame(() => {
                const pageEl = document.getElementById(`page-${tab}`);
                window.AG.animateTabChange(pageEl);
            });
        };
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 4 — MAGNETIC BUTTON SPRINGS
    // ═══════════════════════════════════════════════════════════════════════════
    function wireMagnetic(root) {
        const targets = (root || document).querySelectorAll('.btn, .btn-login, .btn-logout, .nav-tab, .method-btn');
        targets.forEach(el => {
            if (el._agMag) return;
            el._agMag = true;
            el.classList.add('ag-magnetic');

            el.addEventListener('mouseenter', () => {
                el.style.transform = 'translateY(-2px) scale(1.03)';
            });
            el.addEventListener('mouseleave', () => {
                el.style.transform = 'translateY(0) scale(1)';
            });
            el.addEventListener('mousedown', () => {
                el.style.transform = 'translateY(1px) scale(0.97)';
            });
            el.addEventListener('mouseup', () => {
                el.style.transform = 'translateY(-1px) scale(1.01)';
                setTimeout(() => { el.style.transform = 'translateY(0) scale(1)'; }, 150);
            });

            // Touch ripple
            el.style.position = el.style.position || 'relative';
            el.style.overflow = 'hidden';
            el.addEventListener('click', function (e) {
                const rect = el.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height) * 1.4;
                const r = document.createElement('span');
                r.className = 'ag-ripple';
                r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size/2}px;top:${e.clientY - rect.top - size/2}px;`;
                el.appendChild(r);
                setTimeout(() => r.remove(), 600);
            });
        });
    }
    window.AG.wireMagnetic = wireMagnetic;

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 5 — ANIMATED NUMBER COUNTER
    // ═══════════════════════════════════════════════════════════════════════════
    function animateNumber(el, from, to, duration = 600) {
        if (!el) return;
        const start = performance.now();
        const diff = to - from;
        function frame(now) {
            const elapsed = Math.min(now - start, duration);
            const progress = elapsed / duration;
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(from + diff * eased);
            if (elapsed < duration) requestAnimationFrame(frame);
            else {
                el.textContent = to;
                el.classList.add('ag-num-pop');
                setTimeout(() => el.classList.remove('ag-num-pop'), 400);
            }
        }
        requestAnimationFrame(frame);
    }
    window.AG.animateNumber = animateNumber;

    // Patch attendance count elements after DOM loads
    function watchCounters() {
        const ids = ['countPresent', 'countPending', 'countTotal'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el || el._agCounted) return;
            el._agCounted = true;
            const prev = parseInt(el.textContent) || 0;
            const observer = new MutationObserver(() => {
                const next = parseInt(el.textContent) || 0;
                if (next !== prev) {
                    animateNumber(el, prev, next);
                }
            });
            observer.observe(el, { childList: true, characterData: true, subtree: true });
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 6 — CONFETTI / PARTICLE BURST (Attendance Marked)
    // ═══════════════════════════════════════════════════════════════════════════
    const COLORS = ['#6c63ff','#a78bfa','#10b981','#f59e0b','#3b82f6','#ec4899','#fff'];

    function spawnConfetti(x, y, count = 28) {
        const canvas = getOrCreateCanvas();
        const ctx = canvas.getContext('2d');
        const particles = [];

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + Math.random() * 0.3;
            const speed = 4 + Math.random() * 6;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 4,
                gravity: 0.3,
                alpha: 1,
                size: 4 + Math.random() * 5,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.2
            });
        }

        let frame;
        function draw() {
            particles.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                p.vy += p.gravity;
                p.alpha -= 0.022;
                p.rotation += p.rotSpeed;
                if (p.alpha <= 0) return;
                ctx.save();
                ctx.globalAlpha = p.alpha;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
                ctx.restore();
            });
            if (particles.some(p => p.alpha > 0)) frame = requestAnimationFrame(draw);
        }
        frame = requestAnimationFrame(draw);
        // Clear this burst's contribution after 2s
        setTimeout(() => { cancelAnimationFrame(frame); }, 2200);
    }

    function getOrCreateCanvas() {
        let c = document.getElementById('ag-particle-canvas');
        if (!c) {
            c = document.createElement('canvas');
            c.id = 'ag-particle-canvas';
            c.width = window.innerWidth;
            c.height = window.innerHeight;
            document.body.appendChild(c);
            window.addEventListener('resize', () => { c.width = window.innerWidth; c.height = window.innerHeight; });
        }
        return c;
    }

    window.AG.burst = function (x, y, count) { spawnConfetti(x, y, count); };

    // Center-screen burst shortcut
    window.AG.centerBurst = function (count = 40) {
        spawnConfetti(window.innerWidth / 2, window.innerHeight * 0.45, count);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 7 — SUCCESS OVERLAY (Attendance Marked)
    // ═══════════════════════════════════════════════════════════════════════════
    window.AG.showSuccess = function (title, message, onClose) {
        let overlay = document.getElementById('ag-success-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ag-success-overlay';
            overlay.innerHTML = `
                <div class="ag-success-card">
                    <div class="ag-success-icon">✅</div>
                    <div class="ag-success-title" id="ag-success-title"></div>
                    <div class="ag-success-msg" id="ag-success-msg"></div>
                    <button class="ag-success-btn" id="ag-success-ok">Got it</button>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.querySelector('#ag-success-ok').addEventListener('click', () => window.AG.hideSuccess(onClose));
            overlay.addEventListener('click', e => { if (e.target === overlay) window.AG.hideSuccess(onClose); });
        }
        overlay.querySelector('#ag-success-title').textContent = title;
        overlay.querySelector('#ag-success-msg').textContent = message;
        overlay.querySelector('.ag-success-icon').textContent = '✅';
        overlay.classList.add('active');
        // Confetti!
        setTimeout(() => window.AG.centerBurst(50), 100);
        setTimeout(() => window.AG.centerBurst(30), 400);
        // Auto-close after 5s
        if (overlay._closeTimer) clearTimeout(overlay._closeTimer);
        overlay._closeTimer = setTimeout(() => window.AG.hideSuccess(onClose), 5000);
    };

    window.AG.hideSuccess = function (cb) {
        const overlay = document.getElementById('ag-success-overlay');
        if (!overlay) return;
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.classList.remove('active');
            overlay.style.opacity = '';
            if (cb) cb();
        }, 300);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 8 — GPS PULSE RING ANIMATION
    // ═══════════════════════════════════════════════════════════════════════════
    window.AG.showGpsPulse = function (containerEl) {
        if (!containerEl) return;
        containerEl.style.position = 'relative';
        // Remove old rings
        containerEl.querySelectorAll('.ag-gps-ring').forEach(r => r.remove());
        for (let i = 0; i < 3; i++) {
            const ring = document.createElement('div');
            ring.className = 'ag-gps-ring';
            const size = 60;
            ring.style.cssText = `
                width:${size}px; height:${size}px;
                top:50%; left:50%;
                margin-top:-${size/2}px; margin-left:-${size/2}px;
                animation-delay:${i * 0.6}s;
            `;
            containerEl.appendChild(ring);
        }
        // Remove after 5 seconds
        setTimeout(() => containerEl.querySelectorAll('.ag-gps-ring').forEach(r => r.remove()), 5000);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 9 — QR CODE REFRESH FLIP
    // ═══════════════════════════════════════════════════════════════════════════
    window.AG.flipQR = function () {
        const canvas = document.getElementById('qrCanvas');
        if (!canvas) return;
        canvas.classList.remove('ag-qr-flip');
        void canvas.offsetWidth;
        canvas.classList.add('ag-qr-flip');
        setTimeout(() => canvas.classList.remove('ag-qr-flip'), 450);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 10 — REQUEST CARD STAGGER
    // ═══════════════════════════════════════════════════════════════════════════
    window.AG.animateRequestCards = function () {
        const cards = document.querySelectorAll('.request-card');
        cards.forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateX(-18px)';
            setTimeout(() => {
                card.style.transition = 'opacity 0.35s cubic-bezier(0.16,1,0.3,1), transform 0.35s cubic-bezier(0.16,1,0.3,1)';
                card.style.opacity = '1';
                card.style.transform = 'translateX(0)';
            }, i * 80);
        });
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 11 — SESSION BANNER POP
    // ═══════════════════════════════════════════════════════════════════════════
    window.AG.animateSessionStart = function () {
        const banner = document.querySelector('.session-banner');
        const nav = document.getElementById('mainNav');
        if (banner) {
            banner.classList.remove('ag-session-started');
            void banner.offsetWidth;
            banner.classList.add('ag-session-started');
        }
        if (nav) {
            nav.style.opacity = '0';
            nav.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                nav.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                nav.style.opacity = '1';
                nav.style.transform = 'translateY(0)';
            }, 100);
        }
        // Burst from top
        spawnConfetti(window.innerWidth / 2, 100, 35);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 12 — FLOATING DOTS (when marking attendance)
    // ═══════════════════════════════════════════════════════════════════════════
    window.AG.floatDots = function (targetEl) {
        if (!targetEl) return;
        const rect = targetEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        for (let i = 0; i < 8; i++) {
            const dot = document.createElement('div');
            dot.className = 'ag-float-dot';
            dot.style.cssText = `
                left:${cx + (Math.random()-0.5)*60}px;
                top:${cy}px;
                background:${COLORS[Math.floor(Math.random()*COLORS.length)]};
                animation-delay:${i * 0.07}s;
            `;
            document.body.appendChild(dot);
            setTimeout(() => dot.remove(), 1200 + i * 70);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 13 — TOAST ENHANCEMENT (slide + fade)
    // ═══════════════════════════════════════════════════════════════════════════
    // Patch the showToast function globally if it exists
    const _patchToast = () => {
        if (typeof window.showToast !== 'function') return;
        const origToast = window.showToast;
        window.showToast = function (msg, type, dur) {
            origToast(msg, type, dur);
            // Animate the last toast
            requestAnimationFrame(() => {
                const container = document.getElementById('toastContainer');
                if (!container) return;
                const last = container.lastElementChild;
                if (!last) return;
                last.style.transform = 'translateX(120px)';
                last.style.opacity = '0';
                last.style.transition = 'transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.35s ease';
                requestAnimationFrame(() => {
                    last.style.transform = 'translateX(0)';
                    last.style.opacity = '1';
                });
            });
        };
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 14 — HEADER ENTRANCE (on load)
    // ═══════════════════════════════════════════════════════════════════════════
    function animateHeader() {
        const header = document.querySelector('.header');
        if (!header) return;
        header.style.transform = 'translateY(-100%)';
        header.style.opacity = '0';
        header.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease';
        setTimeout(() => {
            header.style.transform = 'translateY(0)';
            header.style.opacity = '1';
        }, 200);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 15 — OBSERVER: Watch for dynamic content
    // ═══════════════════════════════════════════════════════════════════════════
    const domObserver = new MutationObserver(mutations => {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;

                // Animate newly added request cards
                if (node.classList && node.classList.contains('request-card')) {
                    node.style.opacity = '0';
                    node.style.transform = 'translateX(-18px)';
                    setTimeout(() => {
                        node.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        node.style.opacity = '1';
                        node.style.transform = 'translateX(0)';
                    }, 50);
                }

                // Animate newly added student-row items
                if (node.classList && node.classList.contains('student-row')) {
                    node.style.opacity = '0';
                    node.style.transform = 'translateX(12px)';
                    setTimeout(() => {
                        node.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        node.style.opacity = '1';
                        node.style.transform = 'translateX(0)';
                    }, 30);
                }

                // Wire magnetic to new buttons
                wireMagnetic(node);

                // Reveal cards inside newly inserted containers
                if (node.querySelectorAll) {
                    const innerCards = node.querySelectorAll('.card');
                    if (innerCards.length > 0) revealCards(node, 50);
                }
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 16 — INIT (DOMContentLoaded)
    // ═══════════════════════════════════════════════════════════════════════════
    function init() {
        // Wire all existing buttons
        wireMagnetic(document);

        // Animate header
        animateHeader();

        // Reveal cards after short delay (allow portal JS to render first)
        setTimeout(() => revealCards(document, 0), 400);

        // Watch DOM for dynamic content
        if (document.body) {
            domObserver.observe(document.body, { childList: true, subtree: true });
        }

        // Start counter watchers
        watchCounters();

        // Patch switchTab & showToast (they may not exist yet — retry)
        _patchSwitchTab();
        _patchToast();
        setTimeout(() => { _patchSwitchTab(); _patchToast(); }, 800);

        // Hide intro overlay
        setTimeout(() => window.AG.hideIntro(), 1400);

        console.log('[AG Animations] ✅ Motion system initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 17 — LOGIN PAGE ANIMATIONS (index.html)
    // ═══════════════════════════════════════════════════════════════════════════
    window.AG.animateLoginStep = function (direction = 'forward') {
        const activeStep = document.querySelector('.step.active');
        if (!activeStep) return;
        activeStep.style.animation = 'none';
        void activeStep.offsetWidth;
        activeStep.style.animation = direction === 'forward'
            ? 'fadeSlide 0.4s cubic-bezier(0.16,1,0.3,1)'
            : 'fadeSlideBack 0.35s ease';
    };

    // Inject fadeSlideBack keyframe for login page
    const loginCss = document.createElement('style');
    loginCss.textContent = `
        @keyframes fadeSlideBack {
            from { opacity: 0; transform: translateY(-14px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Login card shimmer border glow ── */
        .card {
            position: relative;
        }
        @keyframes ag-border-glow {
            0%,100% { box-shadow: 0 24px 64px rgba(0,0,0,0.4), 0 0 0 1px rgba(108,99,255,0.1); }
            50%      { box-shadow: 0 24px 64px rgba(0,0,0,0.4), 0 0 20px rgba(108,99,255,0.25); }
        }
    `;
    document.head.appendChild(loginCss);

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 18 — GLOBAL API for portals to call
    // ═══════════════════════════════════════════════════════════════════════════
    // Expose a simple hook portals can call:
    // AG.onAttendanceMarked(buttonEl)  — floats dots + center burst
    window.AG.onAttendanceMarked = function (btn) {
        window.AG.floatDots(btn);
        setTimeout(() => window.AG.centerBurst(45), 200);
    };

    // AG.onSessionStarted()
    window.AG.onSessionStarted = function () {
        window.AG.animateSessionStart();
    };

    // AG.onQRRefresh()
    window.AG.onQRRefresh = function () {
        window.AG.flipQR();
    };

    // AG.onRequestsLoaded()
    window.AG.onRequestsLoaded = function () {
        window.AG.animateRequestCards();
    };

}());
