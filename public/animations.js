/**
 * animations.js — Smart Geofence Attendance System
 * ═══════════════════════════════════════════════════════════════════
 * Ultra-Premium Animation Engine v4.0 — Motion One + GSAP + Three.js
 *
 *  Layer 1 — Three.js WebGL   : Nebula star field + floating orbs
 *  Layer 2 — GSAP 3           : Entrances, magnetic hover, elastic spring
 *  Layer 3 — Motion One (web) : Micro-interactions, stagger, spring physics
 *  Layer 4 — Vanilla JS       : Ripple, cursor glow, counter-up, tab morphing
 *
 * Public API (window.AG):
 *   AG.showSuccess(title, msg, icon)
 *   AG.hideSuccess()
 *   AG.shake(el)
 *   AG.revealList(containerEl)
 *   AG.animateNumber(el, from, to, ms)
 *   AG.spawnGPSRings(parentEl, count)
 *   AG.burstHoneycomb(onComplete)
 *   AG.startVortex(duration)
 *   AG.transition(href)
 *   AG.animateTabSwitch(from, to)
 *   AG.animateCardIn(card, delay)
 *   AG.pulseStatus(el)
 *   AG.showToastAnim(el)
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    window.AG = window.AG || {};

    /* ─── CDN LOADER ────────────────────────────────────────────── */
    function loadScript(src, id, cb) {
        if (document.getElementById(id)) { if (cb) cb(); return; }
        const s = document.createElement('script');
        s.src = src; s.id = id; s.defer = true;
        s.onload = cb || null;
        s.onerror = () => console.warn('[AG] Failed to load:', src);
        document.head.appendChild(s);
    }

    /* ─── PALETTE ───────────────────────────────────────────────── */
    const PALETTE = {
        cyan:    '#06b6d4',
        blue:    '#3b82f6',
        violet:  '#8b5cf6',
        pink:    '#ec4899',
        emerald: '#10b981',
        amber:   '#f59e0b',
        white:   '#ffffff',
    };
    const COLORS = Object.values(PALETTE);

    /* ─── DEVICE CHECK ──────────────────────────────────────────── */
    const isMobile = window.innerWidth < 768;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ═══════════════════════════════════════════════════════════════
       INJECT BACKGROUND ELEMENTS
    ═══════════════════════════════════════════════════════════════ */
    function injectBackgroundElements(isLoginPage) {
        if (!document.querySelector('.aurora-blob')) {
            [1,2,3,4].forEach(n => {
                const d = document.createElement('div');
                d.className = `aurora-blob aurora-blob-${n}`;
                document.body.appendChild(d);
            });
        }
        if (!document.querySelector('.grid-overlay')) {
            const g = document.createElement('div');
            g.className = 'grid-overlay';
            document.body.appendChild(g);
        }
        if (!document.querySelector('.cursor-glow')) {
            const c = document.createElement('div');
            c.className = 'cursor-glow';
            document.body.appendChild(c);
        }
        if (!isLoginPage && !document.getElementById('three-canvas')) {
            const cv = document.createElement('canvas');
            cv.id = 'three-canvas';
            document.body.insertBefore(cv, document.body.firstChild);
        }
    }

    /* ═══════════════════════════════════════════════════════════════
       THREE.JS — NEBULA PARTICLE FIELD
    ═══════════════════════════════════════════════════════════════ */
    function initThreeParticles() {
        const canvas = document.getElementById('three-canvas');
        if (!canvas || !window.THREE) return;

        const THREE = window.THREE;
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 5;

        /* Star field */
        const starCount = isMobile ? 600 : 2000;
        const starGeo = new THREE.BufferGeometry();
        const starPos = new Float32Array(starCount * 3);
        const starColors = new Float32Array(starCount * 3);
        const colorList = [
            new THREE.Color('#06b6d4'),
            new THREE.Color('#3b82f6'),
            new THREE.Color('#8b5cf6'),
            new THREE.Color('#ec4899'),
            new THREE.Color('#ffffff'),
            new THREE.Color('#10b981'),
        ];
        for (let i = 0; i < starCount; i++) {
            starPos[i*3]   = (Math.random() - 0.5) * 30;
            starPos[i*3+1] = (Math.random() - 0.5) * 30;
            starPos[i*3+2] = (Math.random() - 0.5) * 20;
            const c = colorList[Math.floor(Math.random() * colorList.length)];
            starColors[i*3] = c.r; starColors[i*3+1] = c.g; starColors[i*3+2] = c.b;
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
        const starMat = new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.75, sizeAttenuation: true });
        const stars = new THREE.Points(starGeo, starMat);
        scene.add(stars);

        /* Nebula dust */
        const dustCount = isMobile ? 80 : 220;
        const dustGeo = new THREE.BufferGeometry();
        const dustPos = new Float32Array(dustCount * 3);
        const dustCol = new Float32Array(dustCount * 3);
        for (let i = 0; i < dustCount; i++) {
            dustPos[i*3]   = (Math.random() - 0.5) * 18;
            dustPos[i*3+1] = (Math.random() - 0.5) * 18;
            dustPos[i*3+2] = (Math.random() - 0.5) * 10;
            const c = colorList[Math.floor(Math.random() * 4)];
            dustCol[i*3] = c.r; dustCol[i*3+1] = c.g; dustCol[i*3+2] = c.b;
        }
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
        const dustMat = new THREE.PointsMaterial({ size: 0.32, vertexColors: true, transparent: true, opacity: 0.12, sizeAttenuation: true });
        scene.add(new THREE.Points(dustGeo, dustMat));

        /* Floating wireframe orbs */
        const orbs = [];
        [0x06b6d4, 0x8b5cf6, 0x3b82f6, 0xec4899].forEach(col => {
            const geo = new THREE.IcosahedronGeometry(0.06 + Math.random() * 0.08, 0);
            const mat = new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.35 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set((Math.random()-.5)*8, (Math.random()-.5)*6, (Math.random()-.5)*4);
            mesh.userData = {
                vx: (Math.random()-.5)*0.004,
                vy: (Math.random()-.5)*0.004,
                rx: Math.random()*0.012,
                ry: Math.random()*0.012,
            };
            scene.add(mesh);
            orbs.push(mesh);
        });

        /* Mouse parallax */
        let mx = 0, my = 0;
        document.addEventListener('mousemove', e => {
            mx = (e.clientX / window.innerWidth  - 0.5) * 0.5;
            my = (e.clientY / window.innerHeight - 0.5) * 0.35;
        }, { passive: true });

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        let frame = 0;
        function animate() {
            requestAnimationFrame(animate);
            frame += 0.005;
            stars.rotation.y += 0.00015;
            stars.rotation.x += 0.00008;
            camera.position.x += (mx - camera.position.x) * 0.04;
            camera.position.y += (-my - camera.position.y) * 0.04;
            camera.lookAt(scene.position);
            orbs.forEach(orb => {
                orb.position.x += orb.userData.vx;
                orb.position.y += orb.userData.vy;
                orb.rotation.x += orb.userData.rx;
                orb.rotation.y += orb.userData.ry;
                if (Math.abs(orb.position.x) > 6) orb.userData.vx *= -1;
                if (Math.abs(orb.position.y) > 5) orb.userData.vy *= -1;
            });
            starMat.opacity = 0.65 + Math.sin(frame * 1.5) * 0.1;
            renderer.render(scene, camera);
        }
        animate();
        AG.threeScene = scene;
        AG.threeRenderer = renderer;
    }

    /* ═══════════════════════════════════════════════════════════════
       GSAP — ENTRANCE ANIMATIONS
    ═══════════════════════════════════════════════════════════════ */
    function initGSAPAnimations() {
        if (!window.gsap || prefersReducedMotion) return;
        const gsap = window.gsap;

        /* Page header */
        const header = document.querySelector('.header');
        if (header) {
            gsap.from(header, { y: -60, opacity: 0, duration: 0.8, ease: 'power3.out', clearProps: 'all' });
        }

        /* Nav tabs */
        const tabs = document.querySelectorAll('.nav-tab');
        if (tabs.length) {
            gsap.from(tabs, { y: -20, opacity: 0, stagger: 0.07, duration: 0.5, ease: 'power2.out', delay: 0.3, clearProps: 'all' });
        }

        /* Cards stagger cascade */
        const cards = document.querySelectorAll('.card');
        if (cards.length) {
            gsap.from(cards, {
                y: 40, opacity: 0, scale: 0.96,
                stagger: 0.1, duration: 0.75,
                ease: 'power3.out', delay: 0.5,
                clearProps: 'all',
            });
        }

        /* Login container */
        const container = document.querySelector('.container');
        if (container) {
            gsap.from(container, { y: 60, scale: 0.88, opacity: 0, duration: 1.0, ease: 'elastic.out(1, 0.7)', clearProps: 'all' });
        }

        /* Magnetic buttons */
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('mousemove', e => {
                if (isMobile) return;
                const rect = btn.getBoundingClientRect();
                const dx = e.clientX - (rect.left + rect.width  / 2);
                const dy = e.clientY - (rect.top  + rect.height / 2);
                gsap.to(btn, { x: dx * 0.2, y: dy * 0.2, duration: 0.3, ease: 'power2.out' });
            });
            btn.addEventListener('mouseleave', () => {
                gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
            });
        });

        /* Card tilt */
        document.querySelectorAll('.card').forEach(card => {
            card.addEventListener('mousemove', e => {
                if (isMobile) return;
                const rect = card.getBoundingClientRect();
                const rx = -((e.clientY - rect.top  - rect.height/2) / (rect.height/2)) * 4;
                const ry =  ((e.clientX - rect.left - rect.width /2) / (rect.width /2)) * 4;
                gsap.to(card, { rotationX: rx, rotationY: ry, duration: 0.3, ease: 'power2.out', transformPerspective: 900 });
            });
            card.addEventListener('mouseleave', () => {
                gsap.to(card, { rotationX: 0, rotationY: 0, duration: 0.6, ease: 'elastic.out(1, 0.6)', transformPerspective: 900 });
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       MOTION ONE — MICRO-INTERACTION LAYER
    ═══════════════════════════════════════════════════════════════ */
    function initMotionAnimations() {
        if (!window.Motion || prefersReducedMotion) return;
        const { animate, stagger, spring } = window.Motion;

        /* ── Tab switch animation ── */
        AG.animateTabSwitch = function(fromEl, toEl) {
            if (!fromEl || !toEl) return;
            // Old page slides out left
            animate(fromEl, { opacity: [1, 0], x: [0, -30], filter: ['blur(0px)', 'blur(4px)'] },
                { duration: 0.22, easing: [0.4, 0, 1, 1] });
            // New page slides in from right
            animate(toEl, { opacity: [0, 1], x: [30, 0], filter: ['blur(4px)', 'blur(0px)'] },
                { duration: 0.35, easing: spring({ stiffness: 300, damping: 28 }), delay: 0.08 });
        };

        /* ── Card entrance (called after dynamic content loads) ── */
        AG.animateCardIn = function(card, delay) {
            if (!card) return;
            animate(card,
                { opacity: [0, 1], y: [24, 0], scale: [0.97, 1] },
                { duration: 0.45, easing: spring({ stiffness: 320, damping: 26 }), delay: delay || 0 }
            );
        };

        /* ── Student row reveal ── */
        AG.revealStudentRows = function(container) {
            if (!container) return;
            const rows = container.querySelectorAll('.student-row');
            if (!rows.length) return;
            animate(rows,
                { opacity: [0, 1], x: [-18, 0] },
                { delay: stagger(0.06), duration: 0.4, easing: spring({ stiffness: 400, damping: 30 }) }
            );
        };

        /* ── Badge pulse ── */
        AG.pulseBadge = function(el) {
            if (!el) return;
            animate(el, { scale: [1, 1.15, 1] }, { duration: 0.4, easing: spring({ stiffness: 500, damping: 20 }) });
        };

        /* ── Status breathing effect ── */
        AG.pulseStatus = function(el) {
            if (!el) return;
            animate(el,
                { boxShadow: ['0 0 0px rgba(16,185,129,0)', '0 0 16px rgba(16,185,129,0.6)', '0 0 0px rgba(16,185,129,0)'] },
                { duration: 2, easing: 'ease-in-out', repeat: Infinity }
            );
        };

        /* ── Toast show animation ── */
        AG.showToastAnim = function(el) {
            if (!el) return;
            animate(el,
                { opacity: [0, 1], x: [60, 0], scale: [0.92, 1] },
                { duration: 0.38, easing: spring({ stiffness: 380, damping: 28 }) }
            );
        };

        /* ── Toast hide animation ── */
        AG.hideToastAnim = function(el, cb) {
            if (!el) return;
            animate(el,
                { opacity: [1, 0], x: [0, 60], scale: [1, 0.9] },
                { duration: 0.28, easing: [0.4, 0, 1, 1] }
            ).finished.then(() => { el.remove(); if (cb) cb(); });
        };

        /* ── Modal open ── */
        AG.openModal = function(overlay, card) {
            if (!overlay) return;
            overlay.style.display = 'flex';
            animate(overlay, { opacity: [0, 1] }, { duration: 0.25 });
            if (card) {
                animate(card,
                    { opacity: [0, 1], scale: [0.88, 1], y: [20, 0] },
                    { duration: 0.45, easing: spring({ stiffness: 350, damping: 24 }) }
                );
            }
        };

        /* ── Modal close ── */
        AG.closeModal = function(overlay, card, cb) {
            if (!overlay) return;
            const done = () => { overlay.style.display = 'none'; if (cb) cb(); };
            if (card) {
                animate(card, { opacity: [1, 0], scale: [1, 0.9], y: [0, 16] }, { duration: 0.22 });
            }
            animate(overlay, { opacity: [1, 0] }, { duration: 0.25, delay: 0.1 }).finished.then(done);
        };

        /* ── Number ticker ── */
        AG.animateNumber = function(el, from, to, durationMs) {
            if (!el) return;
            const start = performance.now();
            const diff = to - from;
            const dur = durationMs || 900;
            function tick(now) {
                const t = Math.min((now - start) / dur, 1);
                const eased = 1 - Math.pow(1 - t, 4);
                el.textContent = Math.round(from + eased * diff);
                if (t < 1) requestAnimationFrame(tick);
                else el.textContent = to;
            }
            requestAnimationFrame(tick);
        };

        /* ── Alert card shake ── */
        AG.shake = function(el) {
            if (!el) return;
            animate(el,
                { x: [-8, 8, -6, 6, -3, 3, 0] },
                { duration: 0.5, easing: 'ease-out' }
            );
        };

        /* ── Shimmer loading skeleton ── */
        AG.shimmer = function(el) {
            if (!el) return;
            el.classList.add('ag-shimmer');
        };
        AG.unshimmer = function(el) {
            if (!el) return;
            el.classList.remove('ag-shimmer');
        };

    }

    /* ═══════════════════════════════════════════════════════════════
       CURSOR GLOW
    ═══════════════════════════════════════════════════════════════ */
    function initCursorGlow() {
        if (isMobile) return;
        const glow = document.querySelector('.cursor-glow');
        if (!glow) return;
        let tx = 0, ty = 0, cx = 0, cy = 0;
        document.addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
        function animCursor() {
            cx += (tx - cx) * 0.1;
            cy += (ty - cy) * 0.1;
            glow.style.left = cx + 'px';
            glow.style.top  = cy + 'px';
            requestAnimationFrame(animCursor);
        }
        animCursor();

        /* Expand glow over buttons */
        document.addEventListener('mouseover', e => {
            if (e.target.closest('.btn')) glow.classList.add('over-btn');
            else glow.classList.remove('over-btn');
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       RIPPLE ON CLICK
    ═══════════════════════════════════════════════════════════════ */
    function initRipple() {
        document.addEventListener('click', e => {
            const btn = e.target.closest('.btn');
            if (!btn || btn.disabled) return;
            const rect = btn.getBoundingClientRect();
            const ripple = document.createElement('span');
            ripple.className = 'ag-ripple';
            const size = Math.max(rect.width, rect.height);
            ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px;`;
            btn.style.position = 'relative';
            btn.appendChild(ripple);
            setTimeout(() => ripple.remove(), 650);
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       COUNTER-UP
    ═══════════════════════════════════════════════════════════════ */
    function initCounterUp() {
        document.querySelectorAll('[data-counter]').forEach(el => {
            const target = parseFloat(el.dataset.counter);
            const duration = 1400;
            const startTime = performance.now();
            function update(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = 1 - Math.pow(1 - progress, 3);
                el.textContent = Math.floor(ease * target);
                if (progress < 1) requestAnimationFrame(update);
                else el.textContent = target;
            }
            requestAnimationFrame(update);
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       TAB SWITCH INTERCEPTION — hook into tab navigation
    ═══════════════════════════════════════════════════════════════ */
    function initTabAnimations() {
        // Find all .nav-tab elements and intercept their click
        const navTabs = document.querySelectorAll('.nav-tab');
        if (!navTabs.length) return;

        navTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Give the tab's own onclick a moment to run, then find newly active page
                requestAnimationFrame(() => {
                    const activePage = document.querySelector('.page.active');
                    if (activePage && window.Motion) {
                        const { animate, spring } = window.Motion;
                        // Slide in the new active page
                        animate(activePage,
                            { opacity: [0, 1], y: [18, 0] },
                            { duration: 0.38, easing: spring({ stiffness: 340, damping: 28 }) }
                        );
                        // Animate child cards with stagger
                        const cards = activePage.querySelectorAll('.card');
                        if (cards.length) {
                            animate(cards,
                                { opacity: [0, 1], y: [22, 0], scale: [0.97, 1] },
                                { delay: (i) => i * 0.07 + 0.05, duration: 0.4, easing: spring({ stiffness: 360, damping: 28 }) }
                            );
                        }
                    }
                    // Animate tab indicator
                    navTabs.forEach(t => t.classList.remove('ag-tab-active-anim'));
                    this.classList.add('ag-tab-active-anim');
                });
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       SUCCESS OVERLAY
    ═══════════════════════════════════════════════════════════════ */
    function buildSuccessOverlay() {
        if (document.getElementById('ag-success-overlay')) return;
        const el = document.createElement('div');
        el.id = 'ag-success-overlay';
        el.innerHTML = `
            <div class="ag-success-card">
                <div class="ag-success-rings">
                    <div class="ag-success-ring ag-ring-1"></div>
                    <div class="ag-success-ring ag-ring-2"></div>
                    <div class="ag-success-ring ag-ring-3"></div>
                </div>
                <span class="ag-success-icon" id="ag-success-icon">✅</span>
                <div class="ag-success-title" id="ag-success-title">Success!</div>
                <div class="ag-success-msg" id="ag-success-msg"></div>
                <button class="ag-success-btn" id="ag-success-close-btn">Continue →</button>
            </div>
        `;
        document.body.appendChild(el);
        document.getElementById('ag-success-close-btn').addEventListener('click', AG.hideSuccess);

        const style = document.createElement('style');
        style.textContent = `
            #ag-success-overlay {
                position:fixed;inset:0;z-index:99995;
                display:flex;align-items:center;justify-content:center;
                background:rgba(0,0,0,0.75);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
                opacity:0;pointer-events:none;transition:opacity 0.3s ease;
            }
            #ag-success-overlay.ag-active { opacity:1; pointer-events:all; }
            .ag-success-card {
                position:relative;overflow:hidden;
                background:linear-gradient(135deg,rgba(16,185,129,0.12),rgba(10,18,42,0.94));
                border:1px solid rgba(16,185,129,0.3);border-radius:28px;
                padding:44px 38px;text-align:center;max-width:350px;width:92%;
                transform:scale(0.82) translateY(32px);
                transition:transform 0.48s cubic-bezier(0.34,1.56,0.64,1);
                box-shadow:0 32px 80px rgba(0,0,0,0.75),0 0 60px rgba(16,185,129,0.1),inset 0 1px 0 rgba(255,255,255,0.06);
            }
            #ag-success-overlay.ag-active .ag-success-card { transform:scale(1) translateY(0); }
            .ag-success-rings { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none; }
            .ag-success-ring {
                position:absolute;border-radius:50%;border:1px solid rgba(16,185,129,0.2);
                animation:ag-ring-expand 2.4s ease-out infinite;
            }
            .ag-ring-1 { width:120px;height:120px; }
            .ag-ring-2 { width:180px;height:180px;animation-delay:0.8s; }
            .ag-ring-3 { width:240px;height:240px;animation-delay:1.6s; }
            @keyframes ag-ring-expand {
                from { transform:scale(0.5);opacity:0.8; }
                to   { transform:scale(1.5);opacity:0; }
            }
            .ag-success-icon { font-size:72px;margin-bottom:16px;display:block;animation:ag-bounce-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both; }
            @keyframes ag-bounce-in { from{transform:scale(0) rotate(-20deg);opacity:0}to{transform:scale(1) rotate(0deg);opacity:1} }
            .ag-success-title { font-size:22px;font-weight:800;color:#10b981;margin-bottom:10px;font-family:'Outfit',sans-serif;letter-spacing:-0.02em; }
            .ag-success-msg { font-size:14px;color:rgba(255,255,255,0.6);line-height:1.6;font-family:'Outfit',sans-serif; }
            .ag-success-btn {
                margin-top:24px;padding:12px 36px;border-radius:14px;
                background:linear-gradient(135deg,#10b981,#059669);color:white;
                font-size:15px;font-weight:700;border:none;cursor:pointer;
                font-family:'Outfit',sans-serif;transition:transform 0.2s,box-shadow 0.2s;
                letter-spacing:0.02em;
            }
            .ag-success-btn:hover { transform:translateY(-3px);box-shadow:0 10px 28px rgba(16,185,129,0.45); }
        `;
        document.head.appendChild(style);
    }

    AG.showSuccess = function(title, msg, icon) {
        buildSuccessOverlay();
        document.getElementById('ag-success-title').textContent = title || 'Success!';
        document.getElementById('ag-success-msg').textContent   = msg   || '';
        document.getElementById('ag-success-icon').textContent  = icon  || '✅';
        const overlay = document.getElementById('ag-success-overlay');
        overlay.classList.add('ag-active');
        if (window.gsap) {
            window.gsap.from('.ag-success-icon', { scale:0, rotation:-30, duration:0.5, ease:'elastic.out(1,0.5)' });
        }
    };

    AG.hideSuccess = function() {
        const el = document.getElementById('ag-success-overlay');
        if (el) el.classList.remove('ag-active');
    };

    /* ═══════════════════════════════════════════════════════════════
       GPS PULSE RINGS
    ═══════════════════════════════════════════════════════════════ */
    AG.spawnGPSRings = function(parentEl, count) {
        if (!parentEl) return;
        parentEl.style.position = 'relative';
        for (let i = 0; i < (count || 3); i++) {
            const ring = document.createElement('div');
            ring.className = 'ag-gps-ring';
            const size = 60 + i * 40;
            ring.style.cssText = `width:${size}px;height:${size}px;top:50%;left:50%;transform:translate(-50%,-50%);animation-delay:${i*0.55}s;`;
            parentEl.appendChild(ring);
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       FLOATING PARTICLE RAIN
    ═══════════════════════════════════════════════════════════════ */
    function spawnParticleRain() {
        const count = isMobile ? 8 : 20;
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const p = document.createElement('div');
                p.className = 'ag-particle';
                const size = 2 + Math.random() * 5;
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                p.style.cssText = `width:${size}px;height:${size}px;background:${color};box-shadow:0 0 ${size*2}px ${color};left:${Math.random()*100}vw;bottom:-20px;animation-duration:${8+Math.random()*10}s;animation-delay:${Math.random()*4}s;opacity:0;`;
                document.body.appendChild(p);
                setTimeout(() => p.remove(), 22000);
            }, i * 400);
        }
        setInterval(spawnParticleRain, 25000);
    }

    /* ═══════════════════════════════════════════════════════════════
       HONEYCOMB BURST TRANSITION
    ═══════════════════════════════════════════════════════════════ */
    AG.burstHoneycomb = function(onComplete) {
        let overlay = document.getElementById('honeycomb-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'honeycomb-overlay';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = '';
        const cols = ['color-a','color-b','color-c','color-d'];
        const count = Math.min(30, Math.floor((window.innerWidth * window.innerHeight) / 26000));
        for (let i = 0; i < count; i++) {
            const hex = document.createElement('div');
            hex.className = `hex-tile ${cols[i % 4]}`;
            hex.style.left = Math.random() * 100 + 'vw';
            hex.style.top  = Math.random() * 100 + 'vh';
            hex.style.animationDelay = (Math.random() * 0.4) + 's';
            overlay.appendChild(hex);
        }
        setTimeout(() => { overlay.innerHTML = ''; if (onComplete) onComplete(); }, 1200);
    };

    /* ═══════════════════════════════════════════════════════════════
       VORTEX CANVAS SWIRL
    ═══════════════════════════════════════════════════════════════ */
    AG.startVortex = function(duration) {
        let cv = document.getElementById('vortex-canvas');
        if (!cv) {
            cv = document.createElement('canvas');
            cv.id = 'vortex-canvas';
            document.body.appendChild(cv);
        }
        cv.width = window.innerWidth; cv.height = window.innerHeight;
        cv.classList.add('active');
        const ctx = cv.getContext('2d');
        const cx = cv.width/2, cy = cv.height/2;
        let angle = 0, frame = 0, fading = false, alphaOut = 0;
        function draw() {
            ctx.clearRect(0, 0, cv.width, cv.height);
            for (let i = 0; i < 120; i++) {
                const a = angle + (i/120) * Math.PI * 8;
                const r = 4 + (i/120) * Math.min(cv.width, cv.height) * 0.45;
                const x = cx + Math.cos(a)*r, y = cy + Math.sin(a)*r;
                const hue = (frame*2 + i*3) % 360;
                ctx.beginPath();
                ctx.arc(x, y, 1.5 + (i/120)*2.5, 0, Math.PI*2);
                ctx.fillStyle = `hsla(${hue},85%,65%,${(1-i/120)*(fading?1-alphaOut:1)})`;
                ctx.fill();
            }
            angle += 0.06; frame++;
            if (fading) { alphaOut += 0.04; if (alphaOut >= 1) { cv.classList.remove('active'); return; } }
            requestAnimationFrame(draw);
        }
        draw();
        setTimeout(() => { fading = true; }, duration || 1600);
    };

    /* ═══════════════════════════════════════════════════════════════
       PAGE TRANSITION
    ═══════════════════════════════════════════════════════════════ */
    AG.transition = function(href) {
        AG.burstHoneycomb(() => {
            AG.startVortex(600);
            setTimeout(() => { window.location.href = href; }, 700);
        });
    };

    /* ═══════════════════════════════════════════════════════════════
       LIST REVEAL (fallback if Motion One not loaded)
    ═══════════════════════════════════════════════════════════════ */
    AG.revealList = function(containerEl) {
        if (!containerEl) return;
        if (window.Motion) {
            AG.revealStudentRows && AG.revealStudentRows(containerEl);
            return;
        }
        const items = containerEl.querySelectorAll('.student-row, .list-item, tr, .data-row');
        items.forEach((item, i) => {
            item.style.opacity = 0;
            item.style.transform = 'translateY(14px)';
            setTimeout(() => {
                item.style.transition = 'all 0.4s ease';
                item.style.opacity = 1;
                item.style.transform = 'none';
            }, i * 60);
        });
    };

    /* ═══════════════════════════════════════════════════════════════
       TOAST INTERCEPT — upgrades existing showToast calls
    ═══════════════════════════════════════════════════════════════ */
    function upgradeToasts() {
        // Observe #toastContainer for added children and animate them
        const tc = document.getElementById('toastContainer');
        if (!tc || !window.MutationObserver) return;

        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (window.Motion) {
                        AG.showToastAnim && AG.showToastAnim(node);
                    } else {
                        node.style.opacity = '0';
                        node.style.transform = 'translateX(60px) scale(0.92)';
                        requestAnimationFrame(() => {
                            node.style.transition = 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)';
                            node.style.opacity = '1';
                            node.style.transform = 'none';
                        });
                    }
                });
            });
        });
        observer.observe(tc, { childList: true });
    }

    /* ═══════════════════════════════════════════════════════════════
       LIVE STATUS BREATHING — auto-apply to .badge-green elements
    ═══════════════════════════════════════════════════════════════ */
    function initStatusBreathing() {
        if (!window.Motion) return;
        const { animate } = window.Motion;
        document.querySelectorAll('.badge-green').forEach(badge => {
            animate(badge,
                { boxShadow: ['0 0 0px rgba(16,185,129,0)', '0 0 12px rgba(16,185,129,0.5)', '0 0 0px rgba(16,185,129,0)'] },
                { duration: 2.2, easing: 'ease-in-out', repeat: Infinity }
            );
        });
        document.querySelectorAll('.badge-red').forEach(badge => {
            animate(badge,
                { boxShadow: ['0 0 0px rgba(244,63,94,0)', '0 0 12px rgba(244,63,94,0.5)', '0 0 0px rgba(244,63,94,0)'] },
                { duration: 1.8, easing: 'ease-in-out', repeat: Infinity }
            );
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       SCROLL-LINKED HEADER SHRINK (GSAP ScrollTrigger)
    ═══════════════════════════════════════════════════════════════ */
    function initScrollEffects() {
        if (!window.gsap || !window.ScrollTrigger) return;
        window.gsap.registerPlugin(window.ScrollTrigger);

        const header = document.querySelector('.header');
        if (header) {
            window.ScrollTrigger.create({
                start: 'top top',
                end: '+=80',
                onUpdate: self => {
                    const progress = self.progress;
                    header.style.boxShadow = `0 ${4 + progress*12}px ${20 + progress*30}px rgba(0,0,0,${0.2 + progress*0.3})`;
                    header.style.backdropFilter = `blur(${16 + progress*8}px)`;
                },
            });
        }
    }

    /* ═══════════════════════════════════════════════════════════════
       INJECT ANIMATION CSS
    ═══════════════════════════════════════════════════════════════ */
    (function injectAnimCSS() {
        const id = 'ag-anim-v4-css';
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
            /* ── Shake ── */
            @keyframes ag-shake {
                0%,100%{transform:translateX(0)}
                20%{transform:translateX(-8px)}
                40%{transform:translateX(8px)}
                60%{transform:translateX(-5px)}
                80%{transform:translateX(5px)}
            }

            /* ── Fade Up ── */
            .ag-fade-up { animation:ag-fade-up-kf 0.55s cubic-bezier(0.16,1,0.3,1) both; }
            @keyframes ag-fade-up-kf {
                from{opacity:0;transform:translateY(20px);}
                to{opacity:1;transform:none;}
            }

            /* ── Tab active pulse ── */
            .ag-tab-active-anim {
                animation: ag-tab-pulse 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
            }
            @keyframes ag-tab-pulse {
                0%  { transform: scaleX(0.92); }
                60% { transform: scaleX(1.04); }
                100%{ transform: scaleX(1); }
            }

            /* ── Cursor glow over button ── */
            .cursor-glow.over-btn {
                width: 80px !important;
                height: 80px !important;
                opacity: 0.6 !important;
                background: radial-gradient(circle, rgba(59,130,246,0.5) 0%, transparent 70%) !important;
            }

            /* ── Shimmer skeleton ── */
            .ag-shimmer {
                position: relative;
                overflow: hidden;
                background: rgba(255,255,255,0.04) !important;
                color: transparent !important;
                border-color: transparent !important;
                pointer-events: none;
            }
            .ag-shimmer::after {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%);
                animation: ag-shimmer-sweep 1.4s ease-in-out infinite;
            }
            @keyframes ag-shimmer-sweep {
                from { transform: translateX(-100%); }
                to   { transform: translateX(100%); }
            }

            /* ── Card entrance (JS-applied class) ── */
            .ag-card-enter {
                animation: ag-card-enter-kf 0.5s cubic-bezier(0.34,1.4,0.64,1) both;
            }
            @keyframes ag-card-enter-kf {
                from { opacity:0; transform:translateY(28px) scale(0.96); }
                to   { opacity:1; transform:none; }
            }

            /* ── Student row enter ── */
            .ag-row-enter {
                animation: ag-row-enter-kf 0.4s cubic-bezier(0.16,1,0.3,1) both;
            }
            @keyframes ag-row-enter-kf {
                from { opacity:0; transform:translateX(-16px); }
                to   { opacity:1; transform:none; }
            }

            /* ── Success pulse border ── */
            @keyframes ag-success-pulse {
                0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
                50%     { box-shadow: 0 0 0 8px rgba(16,185,129,0.2); }
            }

            /* ── Floating badge ── */
            .ag-badge-float {
                animation: ag-badge-float-kf 3s ease-in-out infinite;
            }
            @keyframes ag-badge-float-kf {
                0%,100% { transform:translateY(0); }
                50%     { transform:translateY(-4px); }
            }

            /* ── Entrance for whole page sections ── */
            .ag-page-enter {
                animation: ag-fade-up-kf 0.4s cubic-bezier(0.16,1,0.3,1) both;
            }

            /* ── Nav tab global style corrections for high contrast ── */
            .nav-tab {
                position: relative !important;
                overflow: hidden !important;
                color: var(--text-muted, #7d8fa9) !important;
                opacity: 1 !important;
            }
            .nav-tab:hover {
                color: var(--text-main, #f1f5f9) !important;
            }
            .nav-tab.active {
                color: var(--primary, #06b6d4) !important;
            }

            /* ── Core Background Elements (Fixed position fallback) ── */
            #three-canvas {
                position: fixed !important;
                top: 0 !important; left: 0 !important;
                width: 100vw !important; height: 100vh !important;
                z-index: -3 !important;
                pointer-events: none !important;
            }
            .aurora-blob {
                position: fixed !important;
                border-radius: 50% !important;
                filter: blur(100px) !important;
                opacity: 0.25 !important;
                pointer-events: none !important;
                z-index: -2 !important;
                will-change: transform !important;
            }
            .aurora-blob-1 {
                width: 700px; height: 700px;
                background: radial-gradient(circle, #06b6d4, transparent 65%) !important;
                top: -15%; left: -15%;
                animation: auroraFloat1 20s ease-in-out infinite alternate;
            }
            .aurora-blob-2 {
                width: 800px; height: 800px;
                background: radial-gradient(circle, #8b5cf6, transparent 65%) !important;
                bottom: -20%; right: -15%;
                animation: auroraFloat2 25s ease-in-out infinite alternate;
            }
            .aurora-blob-3 {
                width: 500px; height: 500px;
                background: radial-gradient(circle, #3b82f6, transparent 65%) !important;
                top: 40%; left: 50%;
                animation: auroraFloat3 18s ease-in-out infinite alternate;
            }
            .aurora-blob-4 {
                width: 400px; height: 400px;
                background: radial-gradient(circle, #ec4899, transparent 65%) !important;
                top: 20%; right: 10%;
                opacity: 0.12 !important;
                animation: auroraFloat1 22s ease-in-out infinite alternate-reverse;
            }
            .grid-overlay {
                position: fixed !important;
                top: 0 !important; left: 0 !important;
                width: 100% !important; height: 100% !important;
                background-image:
                    linear-gradient(rgba(6, 182, 212, 0.025) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(6, 182, 212, 0.025) 1px, transparent 1px) !important;
                background-size: 48px 48px !important;
                mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%) !important;
                -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%) !important;
                z-index: -1 !important;
                pointer-events: none !important;
                animation: gridPulse 8s ease-in-out infinite;
            }
            .cursor-glow {
                position: fixed !important;
                width: 420px !important; height: 420px !important;
                background: radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 65%) !important;
                border-radius: 50% !important;
                pointer-events: none !important;
                transform: translate(-50%, -50%) !important;
                z-index: 0 !important;
                will-change: left, top !important;
            }
            @keyframes auroraFloat1 {
                0%   { transform: translate(0, 0) scale(1); }
                33%  { transform: translate(80px, -60px) scale(1.1); }
                66%  { transform: translate(-40px, 40px) scale(0.95); }
                100% { transform: translate(60px, -80px) scale(1.08); }
            }
            @keyframes auroraFloat2 {
                0%   { transform: translate(0, 0) scale(1); }
                33%  { transform: translate(-60px, 50px) scale(1.12); }
                66%  { transform: translate(50px, -30px) scale(0.9); }
                100% { transform: translate(-80px, 60px) scale(1.05); }
            }
            @keyframes auroraFloat3 {
                0%   { transform: translate(-50%, 0) scale(1); }
                50%  { transform: translate(-50%, -40px) scale(1.15); }
                100% { transform: translate(-50%, 20px) scale(0.9); }
            }
            @keyframes gridPulse {
                0%, 100% { opacity: 0.5; }
                50% { opacity: 1; }
            }
        `;
        document.head.appendChild(s);
    })();

    /* ═══════════════════════════════════════════════════════════════
       BOOT SEQUENCE
     ═══════════════════════════════════════════════════════════════ */
    function boot() {
        const isLoginPage = !!document.getElementById('loginBtn') || 
                            window.location.pathname.endsWith('index.html') || 
                            window.location.pathname === '/' || 
                            document.title.toLowerCase().includes('login');

        injectBackgroundElements(isLoginPage);
        initCursorGlow();
        initRipple();
        initCounterUp();
        upgradeToasts();

        if (isLoginPage) {
            const threeCanvas = document.getElementById('three-canvas');
            if (threeCanvas) threeCanvas.remove();
            loadScript(
                'gsap.min.js',
                'gsap-cdn',
                () => requestAnimationFrame(initGSAPAnimations)
            );
            return;
        }

        /* Dashboard — full immersive experience */
        if (!isMobile) spawnParticleRain();

        /* Load Motion One (locally hosted) */
        loadScript(
            'motion.js',
            'motion-one-cdn',
            function() {
                /* Motion One exports as window.Motion */
                requestAnimationFrame(() => {
                    initMotionAnimations();
                    initTabAnimations();
                    initStatusBreathing();
                });
            }
        );

        /* Load Three.js (locally hosted) */
        loadScript(
            'three.min.js',
            'three-js-cdn',
            () => setTimeout(initThreeParticles, 100)
        );

        /* Load GSAP + ScrollTrigger (locally hosted) */
        loadScript(
            'gsap.min.js',
            'gsap-cdn',
            function() {
                requestAnimationFrame(initGSAPAnimations);
                loadScript(
                    'ScrollTrigger.min.js',
                    'gsap-st-cdn',
                    () => requestAnimationFrame(initScrollEffects)
                );
            }
        );
    }

    /* Boot when DOM is ready */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.AG = AG;

})();
