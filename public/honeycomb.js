/**
 * honeycomb.js
 * ─────────────────────────────────────────────────────────────
 * Replicates PowerPoint's "Honeycomb" slide transition effect.
 * Hexagonal tiles burst outward from a click origin in ripple-waves.
 *
 * Usage (auto-wires all .btn elements on DOM load):
 *   <script src="honeycomb.js"></script>
 *
 * Manual trigger:
 *   honeycombBurst(x, y);
 * ─────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    // ── Config ───────────────────────────────────────────────
    const HEX_W    = 60;   // tile width (px)
    const HEX_H    = 52;   // tile height (px)
    const COLORS   = ['color-a', 'color-b', 'color-c', 'color-d'];
    const MAX_DIST = 1000; // max ripple distance (px)

    // ── Build overlay container ──────────────────────────────
    let overlay = document.getElementById('honeycomb-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'honeycomb-overlay';
        document.body.appendChild(overlay);
    }

    /**
     * Generate a honeycomb grid offset so tiles interlock like real hexagons.
     * @param {number} col - column index
     * @param {number} row - row index
     */
    function hexPos(col, row) {
        const x = col * HEX_W * 0.87;
        const y = row * HEX_H + (col % 2 === 0 ? 0 : HEX_H * 0.5);
        return { x, y };
    }

    /**
     * Create & animate hex tiles bursting from origin (ox, oy).
     * Delay is proportional to distance → gives the PowerPoint ripple wave.
     */
    function honeycombBurst(ox, oy) {
        // Build a grid of hex positions covering the whole screen
        const cols = Math.ceil(window.innerWidth  / (HEX_W * 0.87)) + 2;
        const rows = Math.ceil(window.innerHeight / HEX_H) + 2;

        const tiles = [];

        for (let c = -1; c < cols; c++) {
            for (let r = -1; r < rows; r++) {
                const pos = hexPos(c, r);
                const dist = Math.hypot(pos.x - ox, pos.y - oy);
                if (dist > MAX_DIST) continue;

                tiles.push({ pos, dist });
            }
        }

        // Sort so closer tiles animate first (wave effect)
        tiles.sort((a, b) => a.dist - b.dist);

        const maxD = tiles.length ? tiles[tiles.length - 1].dist : 1;

        tiles.forEach(({ pos, dist }, i) => {
            const delay = (dist / (maxD || 1)) * 500; // 0-500ms sweep

            const hex = document.createElement('div');
            hex.className = `hex-tile ${COLORS[i % COLORS.length]}`;
            hex.style.left  = `${pos.x}px`;
            hex.style.top   = `${pos.y}px`;
            hex.style.animationDelay = `${delay}ms`;
            overlay.appendChild(hex);

            // Remove tile after animation completes
            const totalDuration = delay + 700 + 50; // delay + anim duration + buffer
            setTimeout(() => hex.remove(), totalDuration);
        });
    }

    /**
     * Add pulse ring class to button, remove after animation ends.
     */
    function pulseRing(btn) {
        btn.classList.add('btn-click-ring');
        setTimeout(() => btn.classList.remove('btn-click-ring'), 650);
    }

    /**
     * Wire all .btn elements to fire honeycombBurst on click.
     * Also handles dynamic buttons added later via MutationObserver.
     */
    function wireBtns(root) {
        root.querySelectorAll('.btn').forEach(btn => {
            if (btn._honeycombWired) return;
            btn._honeycombWired = true;

            btn.addEventListener('click', function (e) {
                // Origin: use click coordinates or button center
                const rect = btn.getBoundingClientRect();
                const ox = e.clientX || (rect.left + rect.width / 2);
                const oy = e.clientY || (rect.top  + rect.height / 2);

                pulseRing(btn);
                honeycombBurst(ox, oy);
            });
        });
    }

    // Wire on initial load
    document.addEventListener('DOMContentLoaded', () => wireBtns(document));

    // Also wire any buttons added dynamically (e.g. session cards)
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(m => m.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            if (node.classList && node.classList.contains('btn')) wireBtns(node.parentElement);
            else wireBtns(node);
        }));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Expose globally for manual trigger
    window.honeycombBurst = honeycombBurst;
}());
