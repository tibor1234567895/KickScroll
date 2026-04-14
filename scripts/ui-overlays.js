(() => {
    const KS = window.KickScroll;
    const { dom, state } = KS;

    function attachOverlayToActiveVideo(overlay) {
        if (!overlay) {
            return false;
        }

        const activeVideo = state.currentVideo && state.currentVideo.isConnected
            ? state.currentVideo
            : KS.getVideoElement();
        if (!activeVideo) {
            return false;
        }

        return dom.ensureOverlayForVideo(activeVideo, overlay);
    }

    function ensureVolumeOverlayStructure(overlay) {
        if (!overlay) {
            return null;
        }

        let icon = overlay.querySelector('.kvw-icon');
        let label = overlay.querySelector('.kvw-label');
        let bar = overlay.querySelector('.kvw-bar');
        let fill = bar ? bar.firstElementChild : null;
        let text = overlay.querySelector('.kvw-text');

        if (!icon) {
            icon = document.createElement('span');
            icon.className = 'kvw-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = '🔊';
            overlay.prepend(icon);
        }

        if (!label) {
            label = document.createElement('span');
            label.className = 'kvw-label';
            if (icon.nextSibling) {
                overlay.insertBefore(label, icon.nextSibling);
            } else {
                overlay.appendChild(label);
            }
        }

        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'kvw-bar';
            bar.setAttribute('role', 'progressbar');
            bar.setAttribute('aria-valuemin', '0');
            bar.setAttribute('aria-valuemax', '100');
            fill = document.createElement('span');
            bar.appendChild(fill);
            overlay.appendChild(bar);
        } else if (!fill) {
            fill = document.createElement('span');
            bar.appendChild(fill);
        }

        if (!text) {
            text = document.createElement('span');
            text.className = 'kvw-text';
            text.hidden = true;
            overlay.appendChild(text);
        }

        return { icon, label, bar, fill, text };
    }

    KS.showVolumeOverlay = function showVolumeOverlay(vol) {
        const overlay = dom.volumeOverlay;
        if (!overlay) {
            return;
        }

        attachOverlayToActiveVideo(overlay);
        if (!overlay.parentElement) {
            return;
        }

        const parts = ensureVolumeOverlayStructure(overlay);
        if (!parts) {
            return;
        }

        const pct = vol === 'Muted' ? 0 : Math.round(Math.max(0, Math.min(1, Number(vol))) * 100);
        const muted = vol === 'Muted';
        const { icon, label, bar, fill, text } = parts;

        overlay.classList.remove('text-only');
        if (text) {
            text.hidden = true;
            text.textContent = '';
        }

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

        attachOverlayToActiveVideo(overlay);
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

        attachOverlayToActiveVideo(overlay);
        if (!overlay.parentElement) {
            return;
        }

        const parts = ensureVolumeOverlayStructure(overlay);
        if (!parts) {
            return;
        }

        const { icon, label, bar, text: textNode } = parts;

        overlay.classList.add('text-only', 'show');

        if (icon) {
            icon.textContent = '';
        }
        if (label) {
            label.textContent = '';
        }
        if (bar) {
            bar.setAttribute('aria-valuenow', '0');
        }
        if (textNode) {
            textNode.hidden = false;
            textNode.textContent = text;
        }

        clearTimeout(state.volumeOverlayTimeout);
        state.volumeOverlayTimeout = setTimeout(() => {
            overlay.classList.remove('show');
        }, 1000);
    };
})();
