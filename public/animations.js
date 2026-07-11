/**
 * animations.js — Smart Attendance System
 * ═══════════════════════════════════════════════════════════════════
 * Premium animation layer powered by Motion.dev (window.Motion)
 * All DOM work deferred to DOMContentLoaded/load to be safe.
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // Expose AG namespace immediately so portals can reference it before init
    window.AG = window.AG || {};

    // ── Colour palette for particles ───────────────────────────────────────
    const COLORS = ['#6c63ff','#a78bfa','#10b981','#f59e0b','#3b82f6','#ec4899','#ffffff'];

    // ── Shared particle canvas ─────────────────────────────────────────────
    let _canvas = null;
    function getCanvas() {
        if (_canvas) return _canvas;
        _canvas = document.createElement('canvas');
        _canvas.id = 'ag-particle-canvas';
        _canvas.style.cssText = 'position:fixed;inset:0;z-index:9990;pointer-events:none;';
        _canvas.width = window.innerWidth;
        _canvas.height = window.innerHeight;
        document.body.appendChild(_canvas);
        window.addEventListener('resize', () => {
            _canvas.width = window.innerWidth;
            _canvas.height = window.innerHeight;
        });
        return _canvas;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CSS — injected once DOM is ready
    // ═══════════════════════════════════════════════════════════════════════
    const CSS_TEXT = `
        /* ── Success overlay ── */
        #ag-success-overlay {
            position:fixed;inset:0;z-index:9995;
            display:flex;align-items:center;justify-content:center;
            background:rgba(0,0,0,0.7);backdrop-filter:blur(14px);
            opacity:0;pointer-events:none;
            transition:opacity 0.3s ease;
        }
        #ag-success-overlay.ag-active { opacity:1;pointer-events:all; }
        .ag-success-card {
            background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05));
            border:1px solid rgba(16,185,129,0.4);
            border-radius:24px;padding:36px 32px;
            text-align:center;max-width:320px;width:90%;
            transform:scale(0.82) translateY(28px);
            transition:transform 0.45s cubic-bezier(0.34,1.56,0.64,1);
        }
        #ag-success-overlay.ag-active .ag-success-card {
            transform:scale(1) translateY(0);
        }
        .ag-success-icon {
            font-size:64px;margin-bottom:14px;display:block;
            animation:ag-bounce-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes ag-bounce-in {
            from{transform:scale(0);opacity:0}
            to{transform:scale(1);opacity:1}
        }
        .ag-success-title {
            font-size:20px;font-weight:800;color:#10b981;margin-bottom:8px;
            font-family:'Inter',sans-serif;
        }
        .ag-success-msg {
            font-size:13px;color:rgba(255,255,255,0.65);line-height:1.5;
            font-family:'Inter',sans-serif;
        }
        .ag-success-btn {
            margin-top:22px;padding:11px 32px;border-radius:10px;
            background:linear-gradient(135deg,#10b981,#059669);
            color:white;font-size:14px;font-weight:700;
            border:none;cursor:pointer;font-family:'Inter',sans-serif;
            transition:transform 0.15s,box-shadow 0.15s;
        }
        .ag-success-btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(16,185,129,0.4);}

        /* ── Ripple on click ── */
        .ag-ripple {
            position:absolute;border-radius:50%;
            background:rgba(255,255,255,0.22);
            transform:scale(0);pointer-events:none;
            animation:ag-ripple-out 0.55s ease forwards;
        }
        @keyframes ag-ripple-out{to{transform:scale(4.5);opacity:0}}

        /* ── GPS pulse rings ── */
        .ag-gps-ring {
            position:absolute;border-radius:50%;
            border:2px solid rgba(16,185,129,0.55);
            animation:ag-gps-expand 2s ease-out infinite;
            pointer-events:none;
        }
        @keyframes ag-gps-expand{
            from{transform:scale(0.4);opacity:0.9}
            to{transform:scale(3.8);opacity:0}
        }

        /* ── Number pop ── */
        @keyframes ag-num-pop{
            0%{transform:scale(1)}
            45%{transform:scale(1.4)}
            100%{transform:scale(1)}
        }
        .ag-num-pop{animation:ag-num-pop 0.4s cubic-bezier(0.34,1.56,0.64,1)}

        /* ── QR flip ── */
        .ag-qr-flip{animation:ag-flip 0.42s ease both}
        @keyframes ag-flip{
            0%{transform:perspective(400px) rotateY(0deg);opacity:1}
            50%{transform:perspective(400px) rotateY(90deg);opacity:0.3}
            100%{transform:perspective(400px) rotateY(0deg);opacity:1}
        }

        /* ── Tab page entrance ── */
        .ag-page-enter{animation:ag-page-in 0.33s cubic-bezier(0.16,1,0.3,1) both}
        @keyframes ag-page-in{
            from{opacity:0;transform:translateY(16px)}
            to{opacity:1;transform:translateY(0)}
        }

        /* ── Card reveal ── */
        .ag-card-reveal{animation:ag-card-in 0.4s cubic-bezier(0.16,1,0.3,1) both}
        @keyframes ag-card-in{
            from{opacity:0;transform:translateY(18px) scale(0.97)}
            to{opacity:1;transform:translateY(0) scale(1)}
        }

        /* ── Request card slide ── */
        .ag-req-in{animation:ag-req-slide 0.35s cubic-bezier(0.16,1,0.3,1) both}
        @keyframes ag-req-slide{
            from{opacity:0;transform:translateX(-18px)}
            to{opacity:1;transform:translateX(0)}
        }

        /* ── Session start pop ── */
        .ag-session-pop{animation:ag-ses-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) both}
        @keyframes ag-ses-pop{
            from{transform:scale(0.88) translateY(10px);opacity:0}
            to{transform:scale(1) translateY(0);opacity:1}
        }

        /* ── Magnetic button base ── */
        .ag-mag{transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.2s ease}

        /* ── Toast slide ── */
        @keyframes ag-toast-in{
            from{transform:translateX(110px);opacity:0}
            to{transform:translateX(0);opacity:1}
        }
        .ag-toast-animate{animation:ag-toast-in 0.35s cubic-bezier(0.16,1,0.3,1)}

        /* ── Floating dot ── */
        .ag-float-dot{
            position:fixed;width:8px;height:8px;border-radius:50%;
            pointer-events:none;z-index:9999;
            animation:ag-float-up 1s ease forwards;
        }
        @keyframes ag-float-up{
            0%{transform:translateY(0) scale(1);opacity:1}
            100%{transform:translateY(-110px) scale(0);opacity:0}
        }
    `;

    // ═══════════════════════════════════════════════════════════════════════
    // CONFETTI ENGINE
    // ═══════════════════════════════════════════════════════════════════════
    function burst(x, y, count) {
        count = count || 32;
        const canvas = getCanvas();
        const ctx = canvas.getContext('2d');
        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + Math.random() * 0.4;
            const speed = 4 + Math.random() * 7;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 5,
                gravity: 0.28,
                alpha: 1,
                size: 4 + Math.random() * 5,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.18
            });
        }
        let raf;
        (function draw() {
            let alive = false;
            particles.forEach(p => {
                if (p.alpha <= 0) return;
                alive = true;
                p.x += p.vx; p.y += p.vy;
                p.vy += p.gravity;
                p.alpha -= 0.02;
                p.rot += p.rotSpeed;
                ctx.save();
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
                ctx.restore();
            });
            if (alive) raf = requestAnimationFrame(draw);
        })();
        setTimeout(() => cancelAnimationFrame(raf), 2500);
    }

    function centerBurst(n) { burst(window.innerWidth / 2, window.innerHeight * 0.4, n || 42); }

    // ═══════════════════════════════════════════════════════════════════════
    // SUCCESS OVERLAY
    // ═══════════════════════════════════════════════════════════════════════
    function showSuccess(title, msg, onClose) {
        let overlay = document.getElementById('ag-success-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ag-success-overlay';
            overlay.innerHTML = `
                <div class="ag-success-card">
                    <span class="ag-success-icon">✅</span>
                    <div class="ag-success-title" id="ag-suc-title"></div>
                    <div class="ag-success-msg"   id="ag-suc-msg"></div>
                    <button class="ag-success-btn" id="ag-suc-ok">Got it 👍</button>
                </div>`;
            document.body.appendChild(overlay);
            overlay.querySelector('#ag-suc-ok').addEventListener('click', () => _closeSuccess(onClose));
            overlay.addEventListener('click', e => { if (e.target === overlay) _closeSuccess(onClose); });
        }
        overlay.querySelector('#ag-suc-title').textContent = title;
        overlay.querySelector('#ag-suc-msg').textContent   = msg;
        overlay.classList.add('ag-active');
        // Burst after a tiny delay so the card is visible
        setTimeout(() => { centerBurst(48); }, 120);
        setTimeout(() => { centerBurst(28); }, 450);
        if (overlay._t) clearTimeout(overlay._t);
        overlay._t = setTimeout(() => _closeSuccess(onClose), 6000);
    }

    function _closeSuccess(cb) {
        const overlay = document.getElementById('ag-success-overlay');
        if (!overlay) return;
        overlay.classList.remove('ag-active');
        setTimeout(() => { if (cb) cb(); }, 320);
    }
    function hideSuccess(cb) { _closeSuccess(cb); }

    // ═══════════════════════════════════════════════════════════════════════
    // MAGNETIC BUTTONS — spring hover + ripple
    // ═══════════════════════════════════════════════════════════════════════
    function wireMagnetic(root) {
        const sel = '.btn,.btn-login,.btn-logout,.btn-sm,.method-btn,.nav-tab';
        (root || document).querySelectorAll(sel).forEach(el => {
            if (el._agMag) return;
            el._agMag = true;
            el.classList.add('ag-mag');
            el.style.position = el.style.position || 'relative';
            el.style.overflow = 'hidden';

            el.addEventListener('mouseenter', () => { el.style.transform = 'translateY(-2px) scale(1.03)'; });
            el.addEventListener('mouseleave', () => { el.style.transform = ''; });
            el.addEventListener('mousedown',  () => { el.style.transform = 'translateY(1px) scale(0.97)'; });
            el.addEventListener('mouseup',    () => {
                el.style.transform = 'translateY(-1px) scale(1.01)';
                setTimeout(() => { el.style.transform = ''; }, 160);
            });
            el.addEventListener('click', e => {
                const rect = el.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height) * 1.5;
                const r = document.createElement('span');
                r.className = 'ag-ripple';
                r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size/2}px;top:${e.clientY - rect.top - size/2}px;`;
                el.appendChild(r);
                setTimeout(() => r.remove(), 600);
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ANIMATED COUNTER
    // ═══════════════════════════════════════════════════════════════════════
    function animateNumber(el, from, to, dur) {
        if (!el) return;
        dur = dur || 600;
        const start = performance.now();
        (function tick(now) {
            const p = Math.min((now - start) / dur, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(from + (to - from) * eased);
            if (p < 1) requestAnimationFrame(tick);
            else {
                el.textContent = to;
                el.classList.add('ag-num-pop');
                setTimeout(() => el.classList.remove('ag-num-pop'), 450);
            }
        })(start);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CARD STAGGER REVEAL
    // ═══════════════════════════════════════════════════════════════════════
    function revealCards(container, startDelay) {
        startDelay = startDelay || 0;
        (container || document).querySelectorAll('.card').forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px) scale(0.97)';
            setTimeout(() => {
                card.style.transition = 'opacity 0.42s cubic-bezier(0.16,1,0.3,1), transform 0.42s cubic-bezier(0.16,1,0.3,1)';
                card.style.opacity = '1';
                card.style.transform = '';
            }, startDelay + i * 70);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TAB ANIMATION
    // ═══════════════════════════════════════════════════════════════════════
    function animateTab(pageEl) {
        if (!pageEl) return;
        pageEl.classList.remove('ag-page-enter');
        void pageEl.offsetWidth; // reflow
        pageEl.classList.add('ag-page-enter');
        revealCards(pageEl, 60);
        wireMagnetic(pageEl);
    }

    // Patch switchTab if it exists now or later
    function patchSwitchTab() {
        if (!window.switchTab || window.switchTab._agPatched) return;
        const orig = window.switchTab;
        window.switchTab = function(tab) {
            orig(tab);
            requestAnimationFrame(() => animateTab(document.getElementById('page-' + tab)));
        };
        window.switchTab._agPatched = true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // QR CODE FLIP
    // ═══════════════════════════════════════════════════════════════════════
    function flipQR() {
        const c = document.getElementById('qrCanvas');
        if (!c) return;
        c.classList.remove('ag-qr-flip');
        void c.offsetWidth;
        c.classList.add('ag-qr-flip');
        setTimeout(() => c.classList.remove('ag-qr-flip'), 500);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GPS PULSE RINGS
    // ═══════════════════════════════════════════════════════════════════════
    function showGpsPulse(el) {
        if (!el) return;
        el.style.position = 'relative';
        el.querySelectorAll('.ag-gps-ring').forEach(r => r.remove());
        for (let i = 0; i < 3; i++) {
            const ring = document.createElement('div');
            ring.className = 'ag-gps-ring';
            const sz = 56;
            ring.style.cssText = `width:${sz}px;height:${sz}px;top:50%;left:50%;margin:-${sz/2}px 0 0 -${sz/2}px;animation-delay:${i*0.6}s;`;
            el.appendChild(ring);
        }
        setTimeout(() => el.querySelectorAll('.ag-gps-ring').forEach(r => r.remove()), 5500);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HEADER DROP-IN
    // ═══════════════════════════════════════════════════════════════════════
    function animateHeader() {
        const h = document.querySelector('.header');
        if (!h) return;
        h.style.cssText += ';transform:translateY(-100%);opacity:0;transition:transform 0.5s cubic-bezier(0.16,1,0.3,1),opacity 0.4s ease;';
        setTimeout(() => { h.style.transform = ''; h.style.opacity = '1'; }, 50);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SESSION START CELEBRATION
    // ═══════════════════════════════════════════════════════════════════════
    function onSessionStarted() {
        const banner = document.querySelector('.session-banner');
        if (banner) {
            banner.classList.remove('ag-session-pop');
            void banner.offsetWidth;
            banner.classList.add('ag-session-pop');
        }
        const nav = document.getElementById('mainNav');
        if (nav) {
            nav.style.opacity = '0';
            nav.style.transform = 'translateY(-12px)';
            nav.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            setTimeout(() => { nav.style.opacity = '1'; nav.style.transform = ''; }, 80);
        }
        burst(window.innerWidth / 2, 90, 40);
        setTimeout(() => centerBurst(30), 280);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REQUEST CARDS STAGGER
    // ═══════════════════════════════════════════════════════════════════════
    function animateRequestCards() {
        document.querySelectorAll('.request-card').forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateX(-16px)';
            setTimeout(() => {
                card.style.transition = 'opacity 0.32s ease, transform 0.32s ease';
                card.style.opacity = '1';
                card.style.transform = '';
            }, i * 80);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FLOATING DOTS (attendance button)
    // ═══════════════════════════════════════════════════════════════════════
    function floatDots(btn) {
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        for (let i = 0; i < 9; i++) {
            const d = document.createElement('div');
            d.className = 'ag-float-dot';
            d.style.cssText = `left:${cx + (Math.random()-0.5)*70}px;top:${cy}px;background:${COLORS[i % COLORS.length]};animation-delay:${i*0.06}s;`;
            document.body.appendChild(d);
            setTimeout(() => d.remove(), 1300);
        }
    }

    function onAttendanceMarked(btn) {
        floatDots(btn);
        setTimeout(() => centerBurst(50), 180);
        setTimeout(() => centerBurst(30), 420);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TOAST SLIDE ANIMATION
    // ═══════════════════════════════════════════════════════════════════════
    function patchToast() {
        if (!window.showToast || window.showToast._agPatched) return;
        const orig = window.showToast;
        window.showToast = function(msg, type, dur) {
            orig(msg, type, dur);
            requestAnimationFrame(() => {
                const c = document.getElementById('toastContainer');
                const last = c && c.lastElementChild;
                if (!last) return;
                last.classList.add('ag-toast-animate');
            });
        };
        window.showToast._agPatched = true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LOGIN PAGE STEP ANIMATION
    // ═══════════════════════════════════════════════════════════════════════
    function animateLoginStep(direction) {
        const active = document.querySelector('.step.active');
        if (!active) return;
        const kf = direction === 'backward'
            ? [{opacity:0, transform:'translateY(-12px)'},{opacity:1, transform:'translateY(0)'}]
            : [{opacity:0, transform:'translateY(14px)'},{opacity:1, transform:'translateY(0)'}];
        active.style.animation = 'none';
        void active.offsetWidth;
        active.style.animation = '';
        // Use Web Animations API directly — always available
        active.animate(kf, { duration: 380, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'both' });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MUTATION OBSERVER — wire new dynamic elements
    // ═══════════════════════════════════════════════════════════════════════
    const obs = new MutationObserver(muts => {
        muts.forEach(m => m.addedNodes.forEach(n => {
            if (n.nodeType !== 1) return;
            wireMagnetic(n);
            if (n.classList.contains('request-card')) {
                n.style.opacity = '0'; n.style.transform = 'translateX(-14px)';
                setTimeout(() => { n.style.transition = 'opacity 0.3s ease,transform 0.3s ease'; n.style.opacity = '1'; n.style.transform = ''; }, 40);
            }
            if (n.classList.contains('student-row')) {
                n.style.opacity = '0'; n.style.transform = 'translateX(10px)';
                setTimeout(() => { n.style.transition = 'opacity 0.28s ease,transform 0.28s ease'; n.style.opacity = '1'; n.style.transform = ''; }, 30);
            }
        }));
    });

    // ═══════════════════════════════════════════════════════════════════════
    // INIT — deferred to DOM ready
    // ═══════════════════════════════════════════════════════════════════════
    function init() {
        // Inject CSS
        const style = document.createElement('style');
        style.id = 'ag-styles';
        style.textContent = CSS_TEXT;
        document.head.appendChild(style);

        // Wire existing buttons
        wireMagnetic(document);

        // Header drop-in
        animateHeader();

        // Reveal cards after portal JS has had time to render
        setTimeout(() => revealCards(document, 0), 450);

        // Start DOM watcher
        obs.observe(document.body, { childList: true, subtree: true });

        // Patch switchTab & showToast (they may not be defined yet — retry)
        patchSwitchTab();
        patchToast();
        setTimeout(() => { patchSwitchTab(); patchToast(); }, 500);
        setTimeout(() => { patchSwitchTab(); patchToast(); }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM already ready (e.g. script deferred or placed before </body>)
        init();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════
    Object.assign(window.AG, {
        showSuccess,
        hideSuccess,
        burst,
        centerBurst,
        animateTab,
        revealCards,
        wireMagnetic,
        flipQR,
        showGpsPulse,
        animateNumber,
        animateRequestCards,
        floatDots,
        onAttendanceMarked,
        onSessionStarted,
        onQRRefresh: flipQR,
        onRequestsLoaded: animateRequestCards,
        animateLoginStep,
    });

    console.log('[AG Animations] ✅ Initialized successfully');
})();
