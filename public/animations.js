/**
 * animations.js
 * ─────────────────────────────────────────────────────────────
 * Combines Motion.dev (free version) and LottieFiles player
 * to provide a high-end, responsive animation system.
 * ─────────────────────────────────────────────────────────────
 */

(function() {
    'use strict';

    // Verify Motion.dev and Lottie are available, fallback gracefully if not
    const hasMotion = typeof Motion !== 'undefined';

    // ── 1. Create and Handle Global Page-Load Screen ─────────────────
    const loader = document.createElement('div');
    loader.id = 'loading-overlay';
    loader.innerHTML = `
        <lottie-player 
            src="https://lottie.host/f8b9e6e8-2321-4f18-a6dc-a0776bd35a2c/p2e3n8aH9n.json" 
            background="transparent" 
            speed="1" 
            style="width: 140px; height: 140px;" 
            loop 
            autoplay>
        </lottie-player>
        <div class="loading-text">Loading App Console...</div>
    `;
    document.body.appendChild(loader);

    // Safety Timeout: Hide loading overlay after 3 seconds under all circumstances
    setTimeout(() => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
            console.log("Loading overlay hidden via safety timeout.");
        }
    }, 3000);

    function initPageAnimations() {
        try {
            if (hasMotion) {
                Motion.animate("#loading-overlay", { opacity: 0 }, { duration: 0.4 }).then(() => {
                    loader.classList.add('hidden');
                });
                // Container dynamic slide-up
                Motion.animate(".container", { opacity: [0, 1], y: [25, 0] }, { duration: 0.6, easing: [0.16, 1, 0.3, 1] });
                // Stagger card entries
                Motion.animate(".card", { opacity: [0, 1], y: [15, 0] }, { delay: Motion.stagger(0.06), duration: 0.4 });
            } else {
                loader.classList.add('hidden');
            }
        } catch (e) {
            console.error("Animations initialization failed:", e);
            loader.classList.add('hidden');
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initPageAnimations();
    } else {
        window.addEventListener('load', initPageAnimations);
    }

    // ── 2. Add Magnetic Spring Hover to Interactive Controls ──────────
    function wireInteractiveSprings(root) {
        if (!hasMotion) return;
        const selector = '.btn, .tab-btn, .logout-btn, .success-modal-card button';
        root.querySelectorAll(selector).forEach(btn => {
            if (btn._springWired) return;
            btn._springWired = true;

            btn.addEventListener('mouseenter', () => {
                Motion.animate(btn, { scale: 1.04 }, { duration: 0.2, easing: "ease-out" });
            });
            btn.addEventListener('mouseleave', () => {
                Motion.animate(btn, { scale: 1.0 }, { duration: 0.2, easing: "ease-out" });
            });
            btn.addEventListener('mousedown', () => {
                Motion.animate(btn, { scale: 0.95 }, { duration: 0.1 });
            });
            btn.addEventListener('mouseup', () => {
                Motion.animate(btn, { scale: 1.04 }, { duration: 0.15 });
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        wireInteractiveSprings(document);
    });

    // Watch for dynamic node insertions to wire newly created buttons/cards
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => m.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            if (node.classList && (node.classList.contains('btn') || node.classList.contains('card'))) {
                wireInteractiveSprings(node.parentElement);
                if (hasMotion && node.classList.contains('card')) {
                    Motion.animate(node, { opacity: [0, 1], y: [15, 0] }, { duration: 0.35 });
                }
            } else {
                wireInteractiveSprings(node);
                if (hasMotion) {
                    node.querySelectorAll('.card').forEach(card => {
                        Motion.animate(card, { opacity: [0, 1], y: [15, 0] }, { duration: 0.35 });
                    });
                }
            }
        }));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ── 3. Success Modal Checkmark Popup ────────────────────────────
    window.showSuccessLottie = function(message, onCloseCallback) {
        let modal = document.getElementById('success-modal-overlay');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'success-modal-overlay';
            modal.innerHTML = `
                <div class="success-modal-card">
                    <lottie-player 
                        src="https://lottie.host/e7d41f71-2be3-48b7-9556-91e860950669/yQ9vGZ0p4n.json" 
                        background="transparent" 
                        speed="1" 
                        style="width: 130px; height: 130px; margin: 0 auto;" 
                        autoplay>
                    </lottie-player>
                    <h3 style="margin-top: 1rem; color: var(--success); text-align: center;">Verified successfully</h3>
                    <p id="success-modal-text" style="margin-top: 0.5rem; color: var(--text-main); font-size: 0.95rem; line-height: 1.4; text-align: center;"></p>
                    <div style="display:flex; justify-content:center; margin-top: 1.5rem;">
                        <button class="btn" id="success-close-btn" style="max-width: 140px; height: 44px; font-size: 0.85rem; font-weight:700;">OK</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Wire close event
            const closeBtn = modal.querySelector('#success-close-btn');
            closeBtn.addEventListener('click', () => {
                window.hideSuccessLottie(onCloseCallback);
            });
        }
        
        document.getElementById('success-modal-text').innerText = message;
        modal.classList.add('active');

        if (hasMotion) {
            Motion.animate(".success-modal-card", { scale: [0.85, 1], y: [20, 0] }, { duration: 0.45, easing: [0.34, 1.56, 0.64, 1] });
        }
        
        // Auto-close after 4 seconds as fallback
        if (window._successTimeout) clearTimeout(window._successTimeout);
        window._successTimeout = setTimeout(() => {
            window.hideSuccessLottie(onCloseCallback);
        }, 4000);
    };

    window.hideSuccessLottie = function(onCloseCallback) {
        const modal = document.getElementById('success-modal-overlay');
        if (modal && modal.classList.contains('active')) {
            if (hasMotion) {
                Motion.animate(modal, { opacity: 0 }, { duration: 0.25 }).then(() => {
                    modal.classList.remove('active');
                    modal.style.opacity = '';
                    if (onCloseCallback) onCloseCallback();
                });
            } else {
                modal.classList.remove('active');
                if (onCloseCallback) onCloseCallback();
            }
        }
    };

    // ── 4. GPS Verification Map Pulse Overlay ───────────────────────
    window.showGpsLottie = function(statusText) {
        let overlay = document.getElementById('gps-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'gps-overlay';
            overlay.innerHTML = `
                <lottie-player 
                    src="https://lottie.host/c5c8e3cb-33d3-4903-8321-729853922cc1/6kE0zG5D3U.json" 
                    background="transparent" 
                    speed="1" 
                    style="width: 180px; height: 180px;" 
                    loop 
                    autoplay>
                </lottie-player>
                <div class="gps-modal-title">GPS Verification</div>
                <div id="gps-modal-status" class="gps-modal-status">Fetching geofence parameters...</div>
            `;
            document.body.appendChild(overlay);
        }
        document.getElementById('gps-modal-status').innerText = statusText;
        overlay.classList.add('active');
        if (hasMotion) {
            Motion.animate(overlay, { opacity: [0, 1] }, { duration: 0.3 });
        }
    };

    window.hideGpsLottie = function() {
        const overlay = document.getElementById('gps-overlay');
        if (overlay && overlay.classList.contains('active')) {
            if (hasMotion) {
                Motion.animate(overlay, { opacity: 0 }, { duration: 0.25 }).then(() => {
                    overlay.classList.remove('active');
                    overlay.style.opacity = '';
                });
            } else {
                overlay.classList.remove('active');
            }
        }
    };

}());
