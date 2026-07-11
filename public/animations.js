/**
 * animations.js — Smart Attendance System
 * ═══════════════════════════════════════════════════════════════════
 * Ultra-Premium Animation Engine
 *   • GSAP (GreenSock)  — master timeline & scroll triggers
 *   • Three.js          — WebGL particle nebula background
 *   • Motion.dev (web)  — micro-interaction morphs
 *   • Vanilla JS        — ripple, magnetic, counter-up helpers
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    window.AG = window.AG || {};

    /* ─── CDN SCRIPT LOADER ─────────────────────────────────────── */
    function loadScript(src, id, cb) {
        if (document.getElementById(id)) { if (cb) cb(); return; }
        const s = document.createElement('script');
        s.src = src; s.id = id; s.defer = true;
        s.onload = cb || null;
        document.head.appendChild(s);
    }

    /* ─── COLORS ────────────────────────────────────────────────── */
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

    /* ═══════════════════════════════════════════════════════════════
       PHASE 1 — INJECT AURORA BLOBS + THREE.JS CANVAS on DOM ready
    ═══════════════════════════════════════════════════════════════ */
    function injectBackgroundElements(isLoginPage) {
        /* Aurora blobs */
        if (!document.querySelector('.aurora-blob')) {
            [1,2,3,4].forEach(n => {
                const d = document.createElement('div');
                d.className = `aurora-blob aurora-blob-${n}`;
                document.body.appendChild(d);
            });
        }
        /* Tech grid overlay */
        if (!document.querySelector('.grid-overlay')) {
            const g = document.createElement('div');
            g.className = 'grid-overlay';
            document.body.appendChild(g);
        }
        /* Cursor glow */
        if (!document.querySelector('.cursor-glow')) {
            const c = document.createElement('div');
            c.className = 'cursor-glow';
            document.body.appendChild(c);
        }
        /* Three.js canvas — only inject on dashboard pages */
        if (!isLoginPage && !document.getElementById('three-canvas')) {
            const cv = document.createElement('canvas');
            cv.id = 'three-canvas';
            document.body.insertBefore(cv, document.body.firstChild);
        }
    }

    /* ═══════════════════════════════════════════════════════════════
       PHASE 2 — THREE.JS NEBULA PARTICLE FIELD
    ═══════════════════════════════════════════════════════════════ */
    function initThreeParticles() {
        const canvas = document.getElementById('three-canvas');
        if (!canvas || !window.THREE) return;

        const THREE = window.THREE;
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 5;

        /* ── Star field (2000 tiny dots) ── */
        const starGeo = new THREE.BufferGeometry();
        const starCount = window.innerWidth < 600 ? 800 : 2000;
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
            starColors[i*3]   = c.r;
            starColors[i*3+1] = c.g;
            starColors[i*3+2] = c.b;
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        starGeo.setAttribute('color',    new THREE.BufferAttribute(starColors, 3));

        const starMat = new THREE.PointsMaterial({
            size: 0.055,
            vertexColors: true,
            transparent: true,
            opacity: 0.75,
            sizeAttenuation: true,
        });
        const stars = new THREE.Points(starGeo, starMat);
        scene.add(stars);

        /* ── Nebula dust cloud (larger diffuse points) ── */
        const dustGeo = new THREE.BufferGeometry();
        const dustCount = window.innerWidth < 600 ? 120 : 280;
        const dustPos = new Float32Array(dustCount * 3);
        const dustCol = new Float32Array(dustCount * 3);
        for (let i = 0; i < dustCount; i++) {
            dustPos[i*3]   = (Math.random() - 0.5) * 18;
            dustPos[i*3+1] = (Math.random() - 0.5) * 18;
            dustPos[i*3+2] = (Math.random() - 0.5) * 10;
            const c = colorList[Math.floor(Math.random() * 4)]; // only blue spectrum
            dustCol[i*3]   = c.r;
            dustCol[i*3+1] = c.g;
            dustCol[i*3+2] = c.b;
        }
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        dustGeo.setAttribute('color',    new THREE.BufferAttribute(dustCol, 3));
        const dustMat = new THREE.PointsMaterial({
            size: 0.35,
            vertexColors: true,
            transparent: true,
            opacity: 0.12,
            sizeAttenuation: true,
        });
        const dust = new THREE.Points(dustGeo, dustMat);
        scene.add(dust);

        /* ── Floating wireframe icosahedrons ── */
        const orbs = [];
        const orbColors = [0x06b6d4, 0x8b5cf6, 0x3b82f6, 0xec4899];
        for (let i = 0; i < 4; i++) {
            const geo = new THREE.IcosahedronGeometry(0.08 + Math.random() * 0.08, 0);
            const mat = new THREE.MeshBasicMaterial({
                color: orbColors[i],
                wireframe: true,
                transparent: true,
                opacity: 0.4,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 4
            );
            mesh.userData = {
                vx: (Math.random() - 0.5) * 0.004,
                vy: (Math.random() - 0.5) * 0.004,
                rx: Math.random() * 0.012,
                ry: Math.random() * 0.012,
            };
            scene.add(mesh);
            orbs.push(mesh);
        }

        /* ── Mouse parallax ── */
        let mx = 0, my = 0;
        document.addEventListener('mousemove', e => {
            mx = (e.clientX / window.innerWidth  - 0.5) * 0.6;
            my = (e.clientY / window.innerHeight - 0.5) * 0.4;
        }, { passive: true });

        /* ── Resize ── */
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        /* ── Render loop ── */
        let frame = 0;
        function animate() {
            requestAnimationFrame(animate);
            frame += 0.005;

            stars.rotation.y += 0.00015;
            stars.rotation.x += 0.00008;

            dust.rotation.y -= 0.00012;
            dust.rotation.x -= 0.00006;

            /* Mouse parallax tilt */
            camera.position.x += (mx - camera.position.x) * 0.04;
            camera.position.y += (-my - camera.position.y) * 0.04;
            camera.lookAt(scene.position);

            /* Animate orbs */
            orbs.forEach(orb => {
                orb.position.x += orb.userData.vx;
                orb.position.y += orb.userData.vy;
                orb.rotation.x += orb.userData.rx;
                orb.rotation.y += orb.userData.ry;
                /* Bounce bounds */
                if (Math.abs(orb.position.x) > 6) orb.userData.vx *= -1;
                if (Math.abs(orb.position.y) > 5) orb.userData.vy *= -1;
            });

            /* Pulsate star opacity */
            starMat.opacity = 0.65 + Math.sin(frame * 1.5) * 0.1;

            renderer.render(scene, camera);
        }
        animate();

        AG.threeScene = scene;
        AG.threeRenderer = renderer;
    }

    /* ═══════════════════════════════════════════════════════════════
       PHASE 3 — GSAP ENTRANCE ANIMATIONS
    ═══════════════════════════════════════════════════════════════ */
    function initGSAPAnimations() {
        if (!window.gsap) return;
        const gsap = window.gsap;

        /* Container entrance */
        const container = document.querySelector('.container');
        if (container) {
            gsap.from(container, {
                duration: 1.0,
                y: 60,
                scale: 0.88,
                opacity: 0,
                ease: 'elastic.out(1, 0.7)',
                clearProps: 'all',
            });
        }

        /* Stagger cards */
        const cards = document.querySelectorAll('.card');
        if (cards.length) {
            gsap.from(cards, {
                duration: 0.7,
                y: 30,
                opacity: 0,
                scale: 0.96,
                stagger: 0.08,
                ease: 'power3.out',
                delay: 0.3,
                clearProps: 'all',
            });
        }

        /* Header */
        const h2 = document.querySelector('h2');
        if (h2) {
            gsap.from(h2, {
                duration: 0.9,
                y: -20,
                opacity: 0,
                ease: 'power3.out',
                delay: 0.1,
            });
        }

        /* Buttons magnetic hover */
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('mousemove', e => {
                const rect = btn.getBoundingClientRect();
                const dx = e.clientX - (rect.left + rect.width  / 2);
                const dy = e.clientY - (rect.top  + rect.height / 2);
                gsap.to(btn, {
                    x: dx * 0.18,
                    y: dy * 0.18,
                    duration: 0.3,
                    ease: 'power2.out',
                });
            });
            btn.addEventListener('mouseleave', () => {
                gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
            });
        });

        /* Card tilt on mouse */
        document.querySelectorAll('.card').forEach(card => {
            card.addEventListener('mousemove', e => {
                const rect = card.getBoundingClientRect();
                const cx = rect.left + rect.width  / 2;
                const cy = rect.top  + rect.height / 2;
                const rx = -(e.clientY - cy) / (rect.height / 2) * 5;
                const ry =  (e.clientX - cx) / (rect.width  / 2) * 5;
                gsap.to(card, {
                    rotationX: rx,
                    rotationY: ry,
                    duration: 0.3,
                    ease: 'power2.out',
                    transformPerspective: 800,
                    transformOrigin: 'center center',
                });
            });
            card.addEventListener('mouseleave', () => {
                gsap.to(card, {
                    rotationX: 0, rotationY: 0,
                    duration: 0.6, ease: 'elastic.out(1, 0.6)',
                    transformPerspective: 800,
                });
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       PHASE 4 — MAGNETIC CURSOR GLOW
    ═══════════════════════════════════════════════════════════════ */
    function initCursorGlow() {
        const glow = document.querySelector('.cursor-glow');
        if (!glow) return;

        let raf;
        let tx = 0, ty = 0, cx = 0, cy = 0;

        document.addEventListener('mousemove', e => {
            tx = e.clientX; ty = e.clientY;
        }, { passive: true });

        function animCursor() {
            cx += (tx - cx) * 0.1;
            cy += (ty - cy) * 0.1;
            glow.style.left = cx + 'px';
            glow.style.top  = cy + 'px';
            raf = requestAnimationFrame(animCursor);
        }
        animCursor();
    }

    /* ═══════════════════════════════════════════════════════════════
       PHASE 5 — COUNTER-UP ANIMATION (for stat numbers)
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
       PHASE 6 — BUTTON RIPPLE ON CLICK
    ═══════════════════════════════════════════════════════════════ */
    function initRipple() {
        document.addEventListener('click', e => {
            const btn = e.target.closest('.btn');
            if (!btn || btn.disabled) return;

            const rect = btn.getBoundingClientRect();
            const ripple = document.createElement('span');
            ripple.className = 'ag-ripple';
            const size = Math.max(rect.width, rect.height);
            ripple.style.cssText = `
                width: ${size}px; height: ${size}px;
                left: ${e.clientX - rect.left - size/2}px;
                top:  ${e.clientY - rect.top  - size/2}px;
            `;
            btn.style.position = 'relative';
            btn.appendChild(ripple);
            setTimeout(() => ripple.remove(), 650);
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       PHASE 7 — SUCCESS OVERLAY (AG.showSuccess)
    ═══════════════════════════════════════════════════════════════ */
    function buildSuccessOverlay() {
        if (document.getElementById('ag-success-overlay')) return;
        const el = document.createElement('div');
        el.id = 'ag-success-overlay';
        el.innerHTML = `
            <div class="ag-success-card">
                <span class="ag-success-icon" id="ag-success-icon">✅</span>
                <div class="ag-success-title" id="ag-success-title">Success!</div>
                <div class="ag-success-msg"   id="ag-success-msg"></div>
                <button class="ag-success-btn" onclick="AG.hideSuccess()">Continue →</button>
            </div>
        `;
        document.body.appendChild(el);

        /* inject minimal extra CSS for overlay */
        const style = document.createElement('style');
        style.textContent = `
            #ag-success-overlay{position:fixed;inset:0;z-index:99995;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);backdrop-filter:blur(16px);opacity:0;pointer-events:none;transition:opacity 0.35s ease;}
            #ag-success-overlay.ag-active{opacity:1;pointer-events:all;}
            .ag-success-card{background:linear-gradient(135deg,rgba(16,185,129,0.14),rgba(10,18,42,0.92));border:1px solid rgba(16,185,129,0.35);border-radius:28px;padding:40px 36px;text-align:center;max-width:340px;width:92%;transform:scale(0.82) translateY(30px);transition:transform 0.45s cubic-bezier(0.34,1.56,0.64,1);box-shadow:0 30px 70px rgba(0,0,0,0.7),0 0 60px rgba(16,185,129,0.08);}
            #ag-success-overlay.ag-active .ag-success-card{transform:scale(1) translateY(0);}
            .ag-success-icon{font-size:72px;margin-bottom:16px;display:block;animation:ag-bounce-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both;}
            @keyframes ag-bounce-in{from{transform:scale(0) rotate(-20deg);opacity:0}to{transform:scale(1) rotate(0deg);opacity:1}}
            .ag-success-title{font-size:22px;font-weight:800;color:#10b981;margin-bottom:10px;font-family:'Outfit',sans-serif;letter-spacing:-0.02em;}
            .ag-success-msg{font-size:14px;color:rgba(255,255,255,0.6);line-height:1.6;font-family:'Outfit',sans-serif;}
            .ag-success-btn{margin-top:24px;padding:12px 36px;border-radius:14px;background:linear-gradient(135deg,#10b981,#059669);color:white;font-size:15px;font-weight:700;border:none;cursor:pointer;font-family:'Outfit',sans-serif;transition:transform 0.2s,box-shadow 0.2s;letter-spacing:0.02em;}
            .ag-success-btn:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(16,185,129,0.45);}
        `;
        document.head.appendChild(style);
    }

    AG.showSuccess = function(title, msg, icon) {
        buildSuccessOverlay();
        document.getElementById('ag-success-title').textContent = title || 'Success!';
        document.getElementById('ag-success-msg').textContent   = msg   || '';
        document.getElementById('ag-success-icon').textContent  = icon  || '✅';
        document.getElementById('ag-success-overlay').classList.add('ag-active');

        /* GSAP bounce if available */
        if (window.gsap) {
            gsap.from('.ag-success-icon', { scale:0, rotation:-30, duration:0.5, ease:'elastic.out(1,0.5)' });
        }
    };

    AG.hideSuccess = function() {
        const el = document.getElementById('ag-success-overlay');
        if (el) el.classList.remove('ag-active');
    };

    /* ═══════════════════════════════════════════════════════════════
       PHASE 8 — GPS PULSE RINGS
    ═══════════════════════════════════════════════════════════════ */
    AG.spawnGPSRings = function(parentEl, count) {
        if (!parentEl) return;
        parentEl.style.position = 'relative';
        for (let i = 0; i < (count || 3); i++) {
            const ring = document.createElement('div');
            ring.className = 'ag-gps-ring';
            const size = 60 + i * 40;
            ring.style.cssText = `
                width:${size}px; height:${size}px;
                top:50%; left:50%;
                transform:translate(-50%,-50%);
                animation-delay:${i * 0.55}s;
            `;
            parentEl.appendChild(ring);
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       PHASE 9 — FLOATING PARTICLE RAIN
    ═══════════════════════════════════════════════════════════════ */
    function spawnParticleRain() {
        const count = window.innerWidth < 600 ? 10 : 22;
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const p = document.createElement('div');
                p.className = 'ag-particle';
                const size = 2 + Math.random() * 5;
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                p.style.cssText = `
                    width:${size}px; height:${size}px;
                    background:${color};
                    box-shadow: 0 0 ${size*2}px ${color};
                    left:${Math.random()*100}vw;
                    bottom:-20px;
                    animation-duration:${8 + Math.random()*10}s;
                    animation-delay:${Math.random()*4}s;
                    opacity:0;
                `;
                document.body.appendChild(p);
                /* Remove after animation */
                setTimeout(() => p.remove(), 22000);
            }, i * 400);
        }
        /* Respawn continuously */
        setInterval(spawnParticleRain, 25000);
    }

    /* ═══════════════════════════════════════════════════════════════
       PHASE 10 — HONEYCOMB BURST TRANSITION
    ═══════════════════════════════════════════════════════════════ */
    AG.burstHoneycomb = function (onComplete) {
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

        setTimeout(() => {
            overlay.innerHTML = '';
            if (onComplete) onComplete();
        }, 1200);
    };

    /* ═══════════════════════════════════════════════════════════════
       PHASE 11 — VORTEX CANVAS SWIRL
    ═══════════════════════════════════════════════════════════════ */
    AG.startVortex = function (duration) {
        let cv = document.getElementById('vortex-canvas');
        if (!cv) {
            cv = document.createElement('canvas');
            cv.id = 'vortex-canvas';
            document.body.appendChild(cv);
        }
        cv.width  = window.innerWidth;
        cv.height = window.innerHeight;
        cv.classList.add('active');

        const ctx = cv.getContext('2d');
        const cx  = cv.width / 2, cy = cv.height / 2;
        let   angle = 0, frame = 0, fading = false, alphaOut = 0;

        function draw() {
            ctx.clearRect(0, 0, cv.width, cv.height);
            for (let i = 0; i < 120; i++) {
                const a = angle + (i / 120) * Math.PI * 8;
                const r = 4 + (i / 120) * Math.min(cv.width, cv.height) * 0.45;
                const x = cx + Math.cos(a) * r;
                const y = cy + Math.sin(a) * r;
                const hue = (frame * 2 + i * 3) % 360;
                ctx.beginPath();
                ctx.arc(x, y, 1.5 + (i/120)*2.5, 0, Math.PI*2);
                ctx.fillStyle = `hsla(${hue},85%,65%,${(1 - i/120) * (fading ? 1-alphaOut : 1)})`;
                ctx.fill();
            }
            angle += 0.06;
            frame++;
            if (fading) {
                alphaOut += 0.04;
                if (alphaOut >= 1) { cv.classList.remove('active'); return; }
            }
            requestAnimationFrame(draw);
        }
        draw();

        setTimeout(() => { fading = true; }, duration || 1600);
    };

    /* ═══════════════════════════════════════════════════════════════
       PHASE 12 — NUMBER TICKER (for alert counts, attendance %)
    ═══════════════════════════════════════════════════════════════ */
    AG.animateNumber = function(el, from, to, durationMs) {
        if (!el) return;
        const start = performance.now();
        const diff  = to - from;
        const dur   = durationMs || 900;
        function tick(now) {
            const t = Math.min((now - start) / dur, 1);
            const eased = 1 - Math.pow(1 - t, 4);
            el.textContent = Math.round(from + eased * diff);
            if (t < 1) requestAnimationFrame(tick);
            else el.textContent = to;
        }
        requestAnimationFrame(tick);
    };

    /* ═══════════════════════════════════════════════════════════════
       PHASE 13 — NOTIFICATION SHAKE (for alerts)
    ═══════════════════════════════════════════════════════════════ */
    AG.shake = function(el) {
        if (!el) return;
        if (window.gsap) {
            gsap.fromTo(el,
                { x: -8 },
                { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' }
            );
        } else {
            el.style.animation = 'none';
            el.style.animation = 'ag-shake 0.4s ease';
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       PHASE 14 — STAGGER REVEAL for list items
    ═══════════════════════════════════════════════════════════════ */
    AG.revealList = function(containerEl) {
        if (!containerEl) return;
        const items = containerEl.querySelectorAll('.list-item, tr, .data-row');
        if (window.gsap) {
            gsap.from(items, {
                y: 16, opacity: 0, stagger: 0.06,
                duration: 0.5, ease: 'power3.out',
                clearProps: 'all',
            });
        } else {
            items.forEach((item, i) => {
                item.style.opacity = 0;
                item.style.transform = 'translateY(14px)';
                setTimeout(() => {
                    item.style.transition = 'all 0.4s ease';
                    item.style.opacity = 1;
                    item.style.transform = 'none';
                }, i * 60);
            });
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       PHASE 15 — PAGE TRANSITION (route changes)
    ═══════════════════════════════════════════════════════════════ */
    AG.transition = function(href) {
        AG.burstHoneycomb(() => {
            AG.startVortex(600);
            setTimeout(() => { window.location.href = href; }, 700);
        });
    };

    /* ═══════════════════════════════════════════════════════════════
       INIT SEQUENCE
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

        if (isLoginPage) {
            // Disable heavy effects on login page to prevent lagging
            const threeCanvas = document.getElementById('three-canvas');
            if (threeCanvas) threeCanvas.remove();
            
            // Just load GSAP for the simple entrance animation of the login container
            loadScript(
                'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
                'gsap-cdn',
                function () {
                    requestAnimationFrame(initGSAPAnimations);
                }
            );
            return;
        }

        // Dashboard pages load the full immersive experience
        spawnParticleRain();

        /* Load Three.js from CDN then init particles */
        loadScript(
            'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js',
            'three-js-cdn',
            function () {
                /* Delay slightly so DOM is fully painted */
                setTimeout(initThreeParticles, 100);
            }
        );

        /* Load GSAP then run entrance animations */
        loadScript(
            'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
            'gsap-cdn',
            function () {
                requestAnimationFrame(initGSAPAnimations);
            }
        );
    }

    /* ═══════════════════════════════════════════════════════════════
       MINIMAL EXTRA CSS (injected once)
    ═══════════════════════════════════════════════════════════════ */
    (function injectExtraCSS() {
        const id = 'ag-anim-extra-css';
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
            @keyframes ag-shake {
                0%,100%{transform:translateX(0)}
                20%{transform:translateX(-8px)}
                40%{transform:translateX(8px)}
                60%{transform:translateX(-5px)}
                80%{transform:translateX(5px)}
            }
            .ag-fade-up {
                animation: ag-fade-up-kf 0.55s cubic-bezier(0.16,1,0.3,1) both;
            }
            @keyframes ag-fade-up-kf {
                from { opacity:0; transform:translateY(20px); }
                to   { opacity:1; transform:none; }
            }
        `;
        document.head.appendChild(s);
    })();

    /* Boot when DOM is ready */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    /* Export public surface */
    window.AG = AG;

})();
