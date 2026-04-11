(() => {
    const KS = window.KickScroll;
    const { log, state } = KS;
    const initConfig = (KS.config && KS.config.init) || {};
    const videoSetupRetries = typeof initConfig.videoSetupRetries === 'number' ? initConfig.videoSetupRetries : 10;
    const retryDelayMs = typeof initConfig.retryDelayMs === 'number' ? initConfig.retryDelayMs : 500;
    const observerDebounceMs = typeof initConfig.observerDebounceMs === 'number' ? initConfig.observerDebounceMs : 100;

    const setupVideo = (video) => {
        if (!video) {
            return;
        }

        const bindVideo = () => {
            // Ensure the player-controls script registered KS.attachListeners
            if (!KS.attachListeners || typeof KS.attachListeners !== 'function') {
                setTimeout(bindVideo, 50);
                return;
            }
            KS.attachOverlayToVideo(video);
            KS.attachListeners(video);
            if (state.volumeNormalizationEnabled && state.loudnessNormalizer) {
                state.loudnessNormalizer.enable();
            }
            if (state.volumeBoostEnabled || state.volumeNormalizationEnabled || state.compressorEnabled) {
                if (KS.startSafetyMonitor) {
                    KS.startSafetyMonitor();
                }
            }
        };

        if (video.readyState >= 1) {
            bindVideo();
        } else {
            video.addEventListener('loadedmetadata', bindVideo, { once: true });
        }
    };

    const injectNavIcon = () => {
        if (!KS.dom || !KS.dom.navButton) return;
        if (document.querySelector('#ks-nav-button')) return;
        
        let targetArea = null;

        // Find elements with 'Get KICKs' using xpath
        const getKicks = document.evaluate('//*[contains(text(), "Get KICKs")]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (getKicks) {
            // Find its closest flex parent that forms the navbar group
            let parent = getKicks.parentElement;
            while(parent && parent.tagName !== 'NAV' && parent.tagName !== 'BODY') {
                const classStr = Array.from(parent.classList).join(' ');
                // Typically Kick nav flexes have gap-X or are flex items-center
                if (classStr.includes('flex') && classStr.includes('items-center')) {
                    if (parent.children.length >= 2) {
                        targetArea = parent;
                        break;
                    }
                }
                parent = parent.parentElement;
            }
        }
        
        // Fallback: look for the user avatar in the nav to find the right-side container
        if (!targetArea) {
            const avatar = document.querySelector('nav img[alt*="avatar"], nav img[src*="avatar"]');
            if (avatar) {
                targetArea = avatar.closest('.flex');
            }
        }

        // Final Fallback: last flex row in nav
        if (!targetArea) {
            const navRight = document.querySelectorAll('nav .flex.items-center.justify-end, nav .flex-row:last-child');
            if (navRight.length) {
                targetArea = navRight[navRight.length - 1];
            }
        }

        if (targetArea) {
            // Apply flex classes safely, reset any fixed styling
            KS.dom.navButton.style.position = 'relative';
            KS.dom.navButton.style.top = 'auto';
            KS.dom.navButton.style.right = 'auto';
            
            // Insert at the beginning of the container (to the left of NipahTV/Sub icons)
            targetArea.insertBefore(KS.dom.navButton, targetArea.firstChild);
        } else {
            // Absolute fallback: Put it fixed on screen if nothing is found
            KS.dom.navButton.style.position = 'fixed';
            KS.dom.navButton.style.top = '12px';
            KS.dom.navButton.style.right = '280px';
            KS.dom.navButton.style.zIndex = '999999';
            document.body.appendChild(KS.dom.navButton);
        }
    };

    setInterval(injectNavIcon, 2000);

    const handleTabVisible = () => {
        if (document.hidden) {
            return;
        }

        const reattach = () => {
            KS.attachBitrateOverlayToPage();
            if (KS.updateBitrateOverlay) {
                KS.updateBitrateOverlay();
            }

            const video = KS.getVideoElement();
            if (video) {
                setupVideo(video);
                if (KS.updateControlPanelVisibility) {
                    KS.updateControlPanelVisibility();
                }
                if (KS.dom && KS.dom.controlPanel && KS.dom.controlPanel.classList.contains('controls-hidden')) {
                    KS.dom.controlPanel.classList.remove('controls-hidden');
                    state.controlsVisible = true;
                }
            }
        };

        if (state.settingsLoaded) {
            reattach();
        } else {
            KS.loadSettings().then(reattach);
        }
    };

    KS.init = async function init() {
        if (state.initStarted) {
            return;
        }
        state.initStarted = true;

        try {
            await KS.loadSettings();
        } catch (error) {
            const message = error && error.message ? error.message : error;
            log.warn('Settings load encountered an error:', message);
        }

        KS.attachBitrateOverlayToPage();
        if (KS.updateBitrateOverlay) {
            KS.updateBitrateOverlay();
        }

        const attemptVideoSetup = (retries = videoSetupRetries) => {
            const video = KS.getVideoElement();
            if (video) {
                setupVideo(video);
                return;
            }
            if (retries > 0) {
                setTimeout(() => attemptVideoSetup(retries - 1), retryDelayMs);
            }
        };

        attemptVideoSetup();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', KS.init);
    } else {
        KS.init();
    }

    if (document.readyState !== 'complete') {
        window.addEventListener('load', KS.init);
    }

    document.addEventListener('visibilitychange', handleTabVisible);
    window.addEventListener('focus', handleTabVisible);

    window.addEventListener('beforeunload', () => {
        KS.saveSettingsImmediate();
        KS.cleanup();
    });
    window.addEventListener('unload', KS.cleanup);

    if (!state.observer) {
        state.observer = new MutationObserver(() => {
            if (state.observerTimeout) {
                return;
            }
            state.observerTimeout = setTimeout(() => {
                const processVideo = () => {
                    const video = KS.getVideoElement();
                    if (video && !video.__customListenersAttached) {
                        KS.attachOverlayToVideo(video);
                        KS.attachListeners(video);
                        if (state.volumeNormalizationEnabled && state.loudnessNormalizer) {
                            state.loudnessNormalizer.enable();
                        }
                    }
                    state.observerTimeout = null;
                };

                if (state.settingsLoaded) {
                    processVideo();
                } else {
                    KS.loadSettings().then(processVideo);
                }
            }, observerDebounceMs);
        });

        const observerTarget = document.body || document.documentElement || document;
        state.observer.observe(observerTarget, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
    }
})();
