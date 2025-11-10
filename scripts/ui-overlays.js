(() => {
    const KS = window.KickScroll;
    const { dom, state } = KS;

    KS.showVolumeOverlay = function showVolumeOverlay(vol) {
        const overlay = dom.volumeOverlay;
        if (!overlay) {
            return;
        }

        if (!overlay.parentElement) {
            const activeVideo = state.currentVideo || KS.getVideoElement();
            dom.ensureOverlayForVideo(activeVideo, overlay);
        }

        if (!overlay.parentElement) {
            return;
        }

        const pct = vol === 'Muted' ? 0 : Math.round(Math.max(0, Math.min(1, Number(vol))) * 100);
        const muted = vol === 'Muted';

        const icon = overlay.querySelector('.kvw-icon');
        const label = overlay.querySelector('.kvw-label');
        const bar = overlay.querySelector('.kvw-bar');
        const fill = bar ? bar.firstElementChild : null;

        if (icon) {
            icon.textContent = muted || pct === 0 ? '🔇' : (pct < 34 ? '🔈' : pct < 67 ? '🔉' : '🔊');
        }
        if (label) {
            label.textContent = muted ? 'Muted' : `${pct}%`;
        }
        if (bar) {
            bar.setAttribute('aria-valuenow', String(pct));
        }
        if (fill) {
            fill.style.right = `${100 - pct}%`;
        }

        overlay.classList.add('show');
        clearTimeout(state.volumeOverlayTimeout);
        state.volumeOverlayTimeout = setTimeout(() => {
            overlay.classList.remove('show');
        }, 800);
    };

    KS.showSpeedOverlay = function showSpeedOverlay(speed) {
        const overlay = dom.speedOverlay;
        if (!overlay) {
            return;
        }

        if (!overlay.parentElement) {
            const activeVideo = state.currentVideo || KS.getVideoElement();
            dom.ensureOverlayForVideo(activeVideo, overlay);
        }
        if (!overlay.parentElement) {
            return;
        }

        overlay.textContent = `${speed}x`;
        overlay.style.opacity = '1';
        clearTimeout(state.speedOverlayTimeout);
        state.speedOverlayTimeout = setTimeout(() => {
            overlay.style.opacity = '0';
        }, 500);
    };

    KS.showTextOverlay = function showTextOverlay(text) {
        const overlay = dom.volumeOverlay;
        if (!overlay) {
            return;
        }
        overlay.textContent = text;
        overlay.style.opacity = '1';
        clearTimeout(state.volumeOverlayTimeout);
        state.volumeOverlayTimeout = setTimeout(() => {
            overlay.style.opacity = '0';
        }, 1000);
    };
})();
