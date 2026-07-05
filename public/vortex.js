/**
 * vortex.js
 * ─────────────────────────────────────────────────────────────
 * Replicates Microsoft PowerPoint's "Vortex" slide transition.
 *
 * The effect:
 *  1. A spiral of glowing ribbon-strips burst outward from the
 *     click origin, spinning with ever-increasing angular velocity.
 *  2. The ribbons fade & shrink as they reach the screen edges.
 *  3. A bright white flash at the center seals the transition —
 *     identical to PowerPoint's blinding vortex flash.
 *
 * Works automatically — wires every .btn on the page.
 * ─────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    /* ── palette ─────────────────────────────────────────── */
    const PALETTE = [
        'rgba(6,182,212,',    // neon cyan
        'rgba(59,130,246,',   // cobalt blue
        'rgba(139,92,246,',   // electric violet
        'rgba(6,214,160,',    // neon emerald
        'rgba(236,72,153,',   // hot pink
        'rgba(251,191,36,',   // amber gold
        'rgba(255,255,255,',  // pure white flash
    ];

    /* ── canvas setup ────────────────────────────────────── */
    const canvas = document.createElement('canvas');
    canvas.id = 'vortex-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    /* ── Particle definition ─────────────────────────────── */
    // Each particle is a ribbon strip that spirals outward.
    class VortexParticle {
        constructor(ox, oy, index, total) {
            this.ox = ox;  // origin x
            this.oy = oy;  // origin y

            // Evenly distribute particles around 360°
            this.baseAngle  = (index / total) * Math.PI * 2;
            this.angle      = this.baseAngle;

            // Random starting radius (tiny)
            this.r          = Math.random() * 8 + 2;

            // Speed outward — varies so ribbons fan differently
            this.speed      = Math.random() * 8 + 5;

            // Angular velocity — constant spin rate (like PPT vortex)
            this.omega      = (Math.random() * 0.15 + 0.18) *
                              (index % 2 === 0 ? 1 : -1); // alternating direction

            // Ribbon dimensions
            this.len        = Math.random() * 120 + 80;
            this.width      = Math.random() * 6  + 3;

            // Color from palette
            this.color      = PALETTE[index % PALETTE.length];

            // Life: 0 → 1
            this.life       = 0;
            this.lifeSpeed  = Math.random() * 0.012 + 0.010;

            // Initial opacity burst
            this.alpha      = 1;

            // Delay so outer rings appear staggered (wave effect)
            this.delay      = (index / total) * 0.35;
            this.born       = false;
        }

        update(t) {
            if (t < this.delay) return false; // not yet active
            if (!this.born) { this.born = true; }

            this.life  += this.lifeSpeed;
            this.r     += this.speed * (1 + this.life * 3); // accelerates outward
            this.angle += this.omega * (1 + this.life * 2); // spins faster over time
            this.alpha  = Math.max(0, 1 - this.life * 1.15);

            return this.life >= 1.0; // true = dead
        }

        draw(ctx) {
            if (!this.born || this.alpha <= 0) return;

            const x = this.ox + Math.cos(this.angle) * this.r;
            const y = this.oy + Math.sin(this.angle) * this.r;

            // Tail point (ribbon trailing edge)
            const trailAngle = this.angle - this.omega * 5;
            const trailR     = this.r * 0.6;
            const tx = this.ox + Math.cos(trailAngle) * trailR;
            const ty = this.oy + Math.sin(trailAngle) * trailR;

            // Draw a tapered ribbon strip
            ctx.save();
            ctx.globalAlpha = this.alpha;

            const grad = ctx.createLinearGradient(tx, ty, x, y);
            grad.addColorStop(0, this.color + '0)');
            grad.addColorStop(0.5, this.color + '0.9)');
            grad.addColorStop(1, this.color + '0)');

            ctx.strokeStyle = grad;
            ctx.lineWidth   = this.width * (1 - this.life * 0.6);
            ctx.lineCap     = 'round';
            ctx.shadowColor = this.color + '1)';
            ctx.shadowBlur  = 18;

            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.quadraticCurveTo(
                this.ox + Math.cos(this.angle - this.omega * 2) * this.r * 0.8,
                this.oy + Math.sin(this.angle - this.omega * 2) * this.r * 0.8,
                x, y
            );
            ctx.stroke();
            ctx.restore();
        }
    }

    /* ── Central flash ring ──────────────────────────────── */
    class FlashRing {
        constructor(x, y) {
            this.x = x; this.y = y;
            this.r = 10;
            this.maxR = Math.max(window.innerWidth, window.innerHeight) * 0.8;
            this.life = 0;
        }
        update() {
            this.life += 0.06;
            this.r = this.maxR * this.life * this.life; // ease out
            return this.life >= 1;
        }
        draw(ctx) {
            const a = Math.max(0, 0.6 - this.life * 0.65);
            const grad = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, this.r
            );
            grad.addColorStop(0,   `rgba(255,255,255,${a})`);
            grad.addColorStop(0.3, `rgba(6,182,212,${a * 0.6})`);
            grad.addColorStop(1,   'rgba(0,0,0,0)');

            ctx.save();
            ctx.globalAlpha = 1;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    /* ── Animation loop ──────────────────────────────────── */
    let particles = [];
    let flashes   = [];
    let rafId     = null;
    let running   = false;
    let globalT   = 0;

    function loop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        globalT += 0.016;

        // Update & draw flash rings
        flashes = flashes.filter(f => {
            const dead = f.update();
            f.draw(ctx);
            return !dead;
        });

        // Update & draw particles
        particles = particles.filter(p => {
            const dead = p.update(globalT);
            p.draw(ctx);
            return !dead;
        });

        if (particles.length === 0 && flashes.length === 0) {
            canvas.classList.remove('active');
            running = false;
            return; // stop loop
        }

        rafId = requestAnimationFrame(loop);
    }

    /* ── Public trigger ──────────────────────────────────── */
    const PARTICLE_COUNT = 80;

    function vortexBurst(ox, oy) {
        globalT = 0;
        particles = [];
        flashes   = [];

        // Spawn all ribbon particles
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push(new VortexParticle(ox, oy, i, PARTICLE_COUNT));
        }

        // Central flash ring
        flashes.push(new FlashRing(ox, oy));

        canvas.classList.add('active');

        if (!running) {
            running = true;
            rafId = requestAnimationFrame(loop);
        }
    }

    /* ── Wire all .btn elements ──────────────────────────── */
    function wireBtns(root) {
        root.querySelectorAll('.btn').forEach(btn => {
            if (btn._vortexWired) return;
            btn._vortexWired = true;

            btn.addEventListener('click', function (e) {
                const rect = btn.getBoundingClientRect();
                const ox = e.clientX || (rect.left + rect.width  / 2);
                const oy = e.clientY || (rect.top  + rect.height / 2);
                vortexBurst(ox, oy);
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => wireBtns(document));

    // Watch for dynamically added buttons
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => m.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            if (node.classList && node.classList.contains('btn')) wireBtns(node.parentElement);
            else if (node.querySelectorAll) wireBtns(node);
        }));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Expose for manual trigger
    window.vortexBurst = vortexBurst;

}());
