(() => {
    const KS = window.KickScroll;
    const { log, state } = KS;
    const initConfig = (KS.config && KS.config.init) || {};
    const videoSetupRetries = typeof initConfig.videoSetupRetries === 'number' ? initConfig.videoSetupRetries : 10;
    const retryDelayMs = typeof initConfig.retryDelayMs === 'number' ? initConfig.retryDelayMs : 500;
    const observerDebounceMs = typeof initConfig.observerDebounceMs === 'number' ? initConfig.observerDebounceMs : 100;

    KS.init = async function init() {
        if (state.initStarted) {
            return;
        }
        state.initStarted = true;

        try {
            await KS.loadSettings();
        } catch (error) {
            const message = error && error.message ? error.message : error;
            log.debug('Settings load encountered an error:', message);
        }

        KS.attachBitrateOverlayToPage();
        if (KS.updateBitrateOverlay) {
            KS.updateBitrateOverlay();
        }

        const setupVideo = (video) => {
            if (!video) {
                return;
            }

            const bindVideo = () => {
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

        state.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
    }
})();
