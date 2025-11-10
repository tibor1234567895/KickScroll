(() => {
    const KS = window.KickScroll;
    const { state, constants } = KS;
    const kvwConfig = (KS.config && KS.config.kvw) || {};

    const KVW_DEBUG = kvwConfig.debug ?? constants.DEBUG_LOGGING;
    const KVW_STEP = typeof kvwConfig.step === 'number' ? kvwConfig.step : 0.05;
    const KVW_ALLOW_OVER_VIDEO = Boolean(kvwConfig.allowWheelOverVideo);
    const KVW_HOVER_PAD_PX = typeof kvwConfig.hoverPaddingPx === 'number' ? kvwConfig.hoverPaddingPx : 10;
    const KVW_POINTER_SYNC = kvwConfig.pointerSync !== false;

    const klog = (...args) => {
        if (KVW_DEBUG) {
            console.debug('[KVW]', ...args);
        }
    };
    const clamp01 = (x) => Math.min(1, Math.max(0, x));

    const qThumb = () => document.querySelector('[role="slider"][aria-label="Volume"]');

    function qTrack() {
        const thumb = qThumb();
        if (!thumb) {
            return null;
        }

        let up = thumb;
        for (let i = 0; i < 6 && up; i += 1, up = up.parentElement) {
            const oriented = up.querySelector('[data-orientation="horizontal"]');
            if (oriented) {
                const r = oriented.getBoundingClientRect();
                if (r.width >= 60 && r.height <= 40) {
                    return oriented;
                }
            }
        }

        up = thumb.parentElement;
        let best = null;
        let bestW = 0;
        for (let i = 0; i < 6 && up; i += 1, up = up.parentElement) {
            const r = up.getBoundingClientRect();
            if (r.width >= 60 && r.height <= 40 && r.width > bestW) {
                best = up;
                bestW = r.width;
            }
        }
        return best || thumb;
    }

    function getTrackInfo() {
        const track = qTrack();
        if (!track) {
            return null;
        }
        return { track, rect: track.getBoundingClientRect() };
    }

    function firePointerAndMouse(el, type, x, y) {
        const common = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y };
        try {
            el.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', buttons: type === 'pointerup' ? 0 : 1, ...common }));
        } catch (error) {
            klog('Pointer event dispatch failed', error.message);
        }
        const map = { pointerdown: 'mousedown', pointermove: 'mousemove', pointerup: 'mouseup' };
        const mouseType = map[type];
        if (mouseType) {
            el.dispatchEvent(new MouseEvent(mouseType, { button: 0, buttons: type === 'pointerup' ? 0 : 1, ...common }));
        }
        if (type === 'pointerup') {
            el.dispatchEvent(new MouseEvent('click', { button: 0, ...common }));
        }
    }

    function pointInRect(x, y, rect, pad = 0) {
        return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
    }

    function isVisible(el) {
        if (!el) {
            return false;
        }
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    KS.syncNativeSliderTo = function syncNativeSliderTo(targetPct) {
        if (!KVW_POINTER_SYNC) {
            return;
        }
        const info = getTrackInfo();
        if (!info) {
            klog('No slider track found (controls may be hidden)');
            return;
        }
        const { track, rect } = info;
        if (!isVisible(track)) {
            klog('Slider track not visible (controls hidden)');
            const thumb = qThumb();
            if (thumb) {
                thumb.setAttribute('aria-valuenow', String(Math.round(targetPct)));
            }
            return;
        }
        const pct = Math.max(0, Math.min(100, targetPct));
        const x = rect.left + rect.width * (pct / 100);
        const y = rect.top + rect.height / 2;
        klog('Pointer-sync', { pct: Math.round(pct), x: Math.round(x), y: Math.round(y) });
        firePointerAndMouse(track, 'pointerdown', x, y);
        firePointerAndMouse(track, 'pointermove', x, y);
        firePointerAndMouse(track, 'pointerup', x, y);
        const thumb = qThumb();
        if (thumb) {
            thumb.setAttribute('aria-valuenow', String(Math.round(pct)));
        }
    };

    function onGlobalWheel(event) {
        if (state.isRightMouseDown) {
            return;
        }

        const info = getTrackInfo();
        let overTarget = false;
        if (info) {
            const { rect } = info;
            overTarget = pointInRect(event.clientX, event.clientY, rect, KVW_HOVER_PAD_PX);
        }

        if (!overTarget && KVW_ALLOW_OVER_VIDEO) {
            const video = KS.getVideoElement();
            if (video) {
                const rect = video.getBoundingClientRect();
                overTarget = pointInRect(event.clientX, event.clientY, rect, 0);
            }
        }

        if (!overTarget) {
            return;
        }

        if (event.cancelable) {
            event.preventDefault();
        }

        const video = KS.getVideoElement();
        if (!video) {
            return;
        }

        const dir = (event.deltaY ?? 0) < 0 ? 1 : -1;
        const newVol = clamp01(video.volume + dir * KVW_STEP);
        const oldVol = video.volume;
        video.volume = newVol;

        if (typeof KS.showVolumeOverlay === 'function') {
            KS.showVolumeOverlay(newVol);
        }
        klog('volume', { from: oldVol.toFixed(2), to: newVol.toFixed(2) });

        if (typeof KS.syncNativeSliderTo === 'function') {
            KS.syncNativeSliderTo(newVol * 100);
        }
    }

    KS.setupNativeSliderMonitor = function setupNativeSliderMonitor() {
        let lastReportedVolume = -1;
        let volumeChangeTimeout = null;

        const attachVolumeMonitor = () => {
            const video = KS.getVideoElement();
            if (!video) {
                setTimeout(attachVolumeMonitor, 500);
                return;
            }

            if (video.__kvwVolumeMonitorAttached) {
                return;
            }
            video.__kvwVolumeMonitorAttached = true;

            video.addEventListener('volumechange', () => {
                const currentVolume = video.volume;

                if (Math.abs(currentVolume - lastReportedVolume) > 0.001 && !video.muted) {
                    if (volumeChangeTimeout) {
                        clearTimeout(volumeChangeTimeout);
                    }

                    volumeChangeTimeout = setTimeout(() => {
                        if (state.isRightMouseDown) {
                            return;
                        }

                        KS.showVolumeOverlay(currentVolume);

                        lastReportedVolume = currentVolume;
                        klog('Volume changed via native UI', { vol: currentVolume.toFixed(2) });
                    }, 10);
                } else if (!video.muted) {
                    lastReportedVolume = currentVolume;
                }
            });

            klog('Native slider volume monitor attached');
        };

        attachVolumeMonitor();
    };

    KS.attachKVW = function attachKVW() {
        if (window.__KVW_wheelAttached) {
            return;
        }
        window.__KVW_wheelAttached = true;
        window.addEventListener('wheel', onGlobalWheel, { capture: true, passive: false });
        window.addEventListener('mousewheel', onGlobalWheel, { capture: true, passive: false });
        klog('KVW listeners attached (capture:true, passive:false)');

        KS.setupNativeSliderMonitor();
    };

    KS.attachKVW();

    const mo = new MutationObserver(() => {});
    mo.observe(document.documentElement, { childList: true, subtree: true });
})();
