(() => {
    const KS = window.KickScroll;
    const { log, state, settings } = KS;

    let lastPlayPauseClick = 0;
    let playPauseInProgress = false;
    const playerConfig = (KS.config && KS.config.player) || {};
    const playPauseDebounceDelay = typeof playerConfig.playPauseDebounceMs === 'number'
        ? playerConfig.playPauseDebounceMs
        : 150;
    const playPauseProgressWindow = typeof playerConfig.playPauseProgressWindowMs === 'number'
        ? playerConfig.playPauseProgressWindowMs
        : 500;
    const playPauseSelectors = (Array.isArray(playerConfig.playPauseSelectors) && playerConfig.playPauseSelectors.length > 0)
        ? playerConfig.playPauseSelectors.slice()
        : [
            'button[data-testid*="play"]',
            'button[data-testid*="pause"]',
            'button[aria-label*="play"]',
            'button[aria-label*="pause"]',
            'button[aria-label*="Play"]',
            'button[aria-label*="Pause"]',
            '.play-button',
            '.pause-button',
            '[class*="play-button"]',
            '[class*="pause-button"]'
        ];

    KS.togglePlayPause = function togglePlayPause() {
        const now = Date.now();
        if (now - lastPlayPauseClick < playPauseDebounceDelay) {
            log.debug('Play/Pause debounced - click too rapid');
            return;
        }

        if (playPauseInProgress && (now - lastPlayPauseClick) < playPauseProgressWindow) {
            log.debug('Play/Pause already in progress');
            return;
        }

        lastPlayPauseClick = now;
        playPauseInProgress = true;

        const video = KS.getVideoElement();
        if (!video) {
            log.error('Cannot toggle play/pause - video element not found');
            playPauseInProgress = false;
            return;
        }

        const wasPaused = video.paused;
        log.info('Toggling playback - current state:', wasPaused ? 'PAUSED' : 'PLAYING');

        try {
            if (wasPaused) {
                log.debug('Attempting to play video...');
                const playPromise = video.play();
                if (playPromise && typeof playPromise.then === 'function') {
                    playPromise
                        .then(() => {
                            log.info('✓ Video playback started successfully');
                            playPauseInProgress = false;
                        })
                        .catch((error) => {
                            if (error.name === 'AbortError' || error.message.includes('interrupted')) {
                                log.debug('Play interrupted by native player - trying click simulation');
                            } else {
                                log.warn('Direct play() failed:', error.message);
                            }
                            KS.tryClickSimulation();
                            playPauseInProgress = false;
                        });
                } else {
                    setTimeout(() => {
                        if (video.paused === wasPaused) {
                            log.debug('Play action needs verification, attempting click simulation');
                            KS.tryClickSimulation();
                        } else {
                            log.info('✓ Video playback started (legacy method)');
                        }
                        playPauseInProgress = false;
                    }, 50);
                }
            } else {
                log.debug('Attempting to pause video...');
                video.pause();
                setTimeout(() => {
                    if (!video.paused) {
                        log.debug('Pause may have been interrupted, attempting click simulation');
                        KS.tryClickSimulation();
                    } else {
                        log.info('✓ Video paused successfully');
                    }
                    playPauseInProgress = false;
                }, 50);
            }
        } catch (error) {
            log.error('Exception in togglePlayPause:', error);
            KS.tryClickSimulation();
            playPauseInProgress = false;
        }
    };

    KS.tryAlternativePlayMethod = function tryAlternativePlayMethod() {
        const video = KS.getVideoElement();
        if (!video) {
            return false;
        }

        setTimeout(() => {
            if (video.paused) {
                const playPromise = video.play();
                if (playPromise && typeof playPromise.then === 'function') {
                    playPromise.catch((error) => {
                        log.error('Alternative play method failed:', error.message);
                    });
                }
            }
        }, 50);

        return true;
    };

    KS.tryClickSimulation = function tryClickSimulation() {
        for (const selector of playPauseSelectors) {
            const button = document.querySelector(selector);
            if (button && button.offsetParent) {
                try {
                    button.click();
                    log.info('✓ Clicked native play/pause button:', selector);
                    return true;
                } catch (error) {
                    log.debug('Failed to click button:', selector, error.message);
                }
            }
        }

        try {
            const video = KS.getVideoElement();
            if (video && video.parentElement) {
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 0,
                    buttons: 1
                });

                const targets = [
                    video.parentElement.querySelector('.video-player'),
                    video.parentElement,
                    video
                ].filter(Boolean);

                for (const target of targets) {
                    if (target) {
                        target.dispatchEvent(clickEvent);
                        log.debug('Dispatched synthetic click to:', target.tagName);
                        break;
                    }
                }
            }
        } catch (error) {
            log.error('Click simulation failed:', error);
        }

        return false;
    };

    KS.tryAlternativePauseMethod = function tryAlternativePauseMethod() {
        const video = KS.getVideoElement();
        if (!video) {
            return false;
        }

        setTimeout(() => {
            if (!video.paused) {
                video.pause();
            }
        }, 50);

        return true;
    };

    KS.toggleMute = function toggleMute() {
        const video = KS.getVideoElement();
        if (!video) {
            return;
        }

        if (video.muted) {
            video.muted = false;
            state.enforcingVolume = true;
            const enforceVolume = () => {
                if (!video.muted && Math.abs(video.volume - state.lastVolume) > 0.01) {
                    video.volume = state.lastVolume;
                }
            };
            enforceVolume();
            const enforcementInterval = setInterval(enforceVolume, 50);
            setTimeout(() => {
                clearInterval(enforcementInterval);
                state.enforcingVolume = false;
                KS.showVolumeOverlay(state.lastVolume);
            }, 500);
        } else {
            if (video.volume > 0) {
                state.lastVolume = video.volume;
            }
            video.muted = true;
            KS.showVolumeOverlay('Muted');
        }

        settings.lastVolume = state.lastVolume;
        KS.saveSettings();
    };

    KS.adjustVolume = function adjustVolume(event) {
        const video = KS.getVideoElement();
        if (!video) {
            return;
        }

        let adjustment = -event.deltaY / 3300;
        let newVolume = video.volume + adjustment;
        newVolume = Math.min(1, Math.max(0, newVolume));
        video.volume = newVolume;
        if (newVolume > 0) {
            state.lastVolume = newVolume;
            settings.lastVolume = state.lastVolume;
            KS.saveSettings();
        }
        if (video.muted && newVolume > 0) {
            video.muted = false;
        }
        KS.showVolumeOverlay(newVolume);

        if (KS.syncNativeSliderTo) {
            KS.syncNativeSliderTo(newVolume * 100);
        }
    };

    KS.attachListeners = function attachListeners(video) {
        if (video.__customListenersAttached) {
            return;
        }
        video.__customListenersAttached = true;

        video.classList.add('kickscroll-controlled');
        video.style.pointerEvents = 'auto';

        video.addEventListener('volumechange', () => {
            if (!video.muted && video.volume > 0 && !state.enforcingVolume) {
                state.lastVolume = video.volume;
                settings.lastVolume = state.lastVolume;
                KS.saveSettings();
            }
        });

        video.addEventListener('click', (event) => {
            log.debug('Click event detected - target:', event.target.tagName, event.target.className.substring(0, 50));

            if (event.button !== undefined && event.button !== 0) {
                log.debug('Ignoring non-left-click');
                return;
            }

            const target = event.target;

            if (target.closest('#kick-control-panel')) {
                log.debug('Ignoring click on extension control panel');
                return;
            }

            if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.getAttribute('role') === 'button') {
                log.debug('Ignoring click on native control element:', target.tagName);
                return;
            }

            log.info('Processing click for play/pause toggle');
            event.preventDefault();

            requestAnimationFrame(() => {
                KS.togglePlayPause();
            });
        }, false);

        video.addEventListener('mousedown', (event) => {
            if (event.button === 1) {
                KS.toggleMute();
                event.stopPropagation();
                event.preventDefault();
            } else if (event.button === 2) {
                state.isRightMouseDown = true;
                event.stopPropagation();
                event.preventDefault();
            }
        });

        video.addEventListener('mouseup', (event) => {
            if (event.button === 2) {
                state.isRightMouseDown = false;
                event.stopPropagation();
                event.preventDefault();
            }
        });

        const resumeAudioContext = () => {
            if (state.audioContext && state.audioContext.state === 'suspended') {
                state.audioContext.resume().then(() => {
                    log.info('AudioContext resumed on user gesture');
                });
            }
        };

        video.addEventListener('click', resumeAudioContext, { once: false });
        video.addEventListener('mousedown', resumeAudioContext, { once: false });
        video.addEventListener('wheel', resumeAudioContext, { once: false });

        video.addEventListener('wheel', (event) => {
            if (state.isRightMouseDown) {
                KS.adjustVolume(event);
                event.stopPropagation();
                event.preventDefault();
            }
        }, { passive: false });

        video.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
    };
})();
