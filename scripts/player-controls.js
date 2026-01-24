(() => {
    const KS = window.KickScroll;
    const { log, state, settings } = KS;
    const PIP_LOG_TAG = '[KS-PiP]';
    KS._suppressPiP = KS._suppressPiP || false;

    // Override HTMLVideoElement.prototype.requestPictureInPicture to block
    // PiP calls triggered while we are intentionally simulating clicks.
    try {
        const originalProtoRequest = HTMLVideoElement.prototype.requestPictureInPicture;
        if (typeof originalProtoRequest === 'function') {
            HTMLVideoElement.prototype.requestPictureInPicture = function (...args) {
                if (KS._suppressPiP) {
                    const caller = new Error().stack.split('\n')[2]?.trim();
                    log.info(PIP_LOG_TAG, 'Blocked HTMLVideoElement.prototype.requestPictureInPicture due to suppression - caller:', caller);
                    return Promise.resolve();
                }
                return originalProtoRequest.apply(this, args);
            };
        }
    } catch (err) {
        log.debug(PIP_LOG_TAG, 'Failed to wrap HTMLVideoElement.prototype.requestPictureInPicture:', err && err.message ? err.message : err);
    }

    let lastPlayPauseClick = 0;
    let playPauseInProgress = false;
    // Flag to prevent click handlers from re-triggering togglePlayPause during
    // synthetic click operations (fallback clicks, native button clicks, etc.)
    KS._syntheticClickInProgress = false;
    const playerConfig = (KS.config && KS.config.player) || {};
    const playPauseDebounceDelay = typeof playerConfig.playPauseDebounceMs === 'number'
        ? playerConfig.playPauseDebounceMs
        : 250; // Increased from 150ms for more reliable debouncing
    const playPauseProgressWindow = typeof playerConfig.playPauseProgressWindowMs === 'number'
        ? playerConfig.playPauseProgressWindowMs
        : 600; // Increased from 500ms to allow fallback operations to complete
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

        // Block if synthetic click is in progress (fallback mechanism running)
        if (KS._syntheticClickInProgress) {
            log.debug('Play/Pause blocked - synthetic click in progress');
            return;
        }

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
        const targetState = !wasPaused; // true = we want to pause, false = we want to play
        log.debug(PIP_LOG_TAG, 'togglePlayPause called - wasPaused:', wasPaused, 'targetPaused:', targetState, 'document.pictureInPictureElement:', !!document.pictureInPictureElement);
        log.info('Toggling playback - current state:', wasPaused ? 'PAUSED' : 'PLAYING');

        try {
            if (wasPaused) {
                log.debug('Attempting to play video...');
                const playPromise = video.play();
                if (playPromise && typeof playPromise.then === 'function') {
                    playPromise
                        .then(() => {
                            log.info(PIP_LOG_TAG, '✓ Video playback started successfully');
                            try {
                                if (document.pictureInPictureElement) {
                                    log.info(PIP_LOG_TAG, 'Picture-in-Picture detected after play() - attempting exit');
                                    document.exitPictureInPicture()
                                        .then(() => log.info(PIP_LOG_TAG, 'Exited Picture-in-Picture after play()'))
                                        .catch((err) => log.warn(PIP_LOG_TAG, 'Failed to exit Picture-in-Picture:', err && err.message ? err.message : err));
                                }
                            } catch (error) {
                                log.debug(PIP_LOG_TAG, 'PiP exit attempt failed (ignored):', error && error.message ? error.message : error);
                            }
                            playPauseInProgress = false;
                        })
                        .catch((error) => {
                            if (error.name === 'AbortError' || error.message.includes('interrupted')) {
                                log.debug('Play interrupted by native player - trying fallback');
                            } else {
                                log.warn('Direct play() failed:', error.message);
                            }

                            // Set flag to prevent click handlers from re-triggering during fallback
                            KS._syntheticClickInProgress = true;

                            // Fallback: try clicking native control buttons directly
                            // Skip synthetic click on video element as it causes re-entry
                            setTimeout(() => {
                                try {
                                    const currentVideo = KS.getVideoElement();
                                    if (currentVideo && currentVideo.paused === wasPaused) {
                                        // Video state hasn't changed, try native button
                                        log.debug(PIP_LOG_TAG, 'Video still in original state, trying native button fallback');
                                        try { document.dispatchEvent(new CustomEvent('kickscroll-suppress-pip-on')); } catch (e) { }

                                        for (const selector of playPauseSelectors) {
                                            const button = document.querySelector(selector);
                                            if (button && button.offsetParent) {
                                                try {
                                                    button.click();
                                                    log.info(PIP_LOG_TAG, '✓ Clicked native play/pause button (fallback):', selector);
                                                    break;
                                                } catch (btnErr) {
                                                    log.debug('Failed to click button:', selector, btnErr.message);
                                                }
                                            }
                                        }

                                        setTimeout(() => {
                                            try { document.dispatchEvent(new CustomEvent('kickscroll-suppress-pip-off')); } catch (e) { }
                                        }, 350);
                                    } else {
                                        log.info(PIP_LOG_TAG, '✓ Video state changed during fallback wait');
                                    }
                                } catch (fallbackErr) {
                                    log.error('Fallback click failed:', fallbackErr);
                                } finally {
                                    // Clear flag and progress state after a small delay
                                    setTimeout(() => {
                                        KS._syntheticClickInProgress = false;
                                        playPauseInProgress = false;
                                        log.debug(PIP_LOG_TAG, 'Fallback sequence complete - video.paused:', KS.getVideoElement()?.paused);
                                    }, 100);
                                }
                            }, 50);
                        });
                } else {
                    setTimeout(() => {
                        if (video.paused === wasPaused) {
                            log.debug('Play action needs verification, attempting click simulation');
                            KS._syntheticClickInProgress = true;
                            KS.tryClickSimulation();
                            setTimeout(() => {
                                KS._syntheticClickInProgress = false;
                            }, 200);
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
                        KS._syntheticClickInProgress = true;
                        KS.tryClickSimulation();
                        setTimeout(() => {
                            KS._syntheticClickInProgress = false;
                        }, 200);
                    } else {
                        log.info('✓ Video paused successfully');
                    }
                    playPauseInProgress = false;
                }, 50);
            }
        } catch (error) {
            log.error('Exception in togglePlayPause:', error);
            KS._syntheticClickInProgress = true;
            KS.tryClickSimulation();
            setTimeout(() => {
                KS._syntheticClickInProgress = false;
            }, 200);
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
                    log.info(PIP_LOG_TAG, '✓ Clicked native play/pause button:', selector, 'video.paused:', (KS.getVideoElement() && KS.getVideoElement().paused));
                    return true;
                } catch (error) {
                    log.debug('Failed to click button:', selector, error.message);
                }
            }
        }

        try {
            const video = KS.getVideoElement();
            if (video && video.parentElement) {
                const beforePaused = video.paused;
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 0,
                    buttons: 1
                });

                // Try clicking the video element itself first to avoid
                // triggering non-play actions on parent containers (e.g., PiP).
                const targets = [
                    video,
                    video.parentElement && video.parentElement.querySelector('.video-player'),
                    video.parentElement
                ].filter(Boolean);

                for (const target of targets) {
                    if (target) {
                        log.info(PIP_LOG_TAG, 'Dispatching synthetic click to:', target.tagName, 'video.wasPaused:', beforePaused);
                        target.dispatchEvent(clickEvent);
                        const afterPaused = video.paused;
                        log.info(PIP_LOG_TAG, 'Post synthetic click - video.paused:', afterPaused);
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
        log.debug(PIP_LOG_TAG, 'Attaching custom listeners to video', video && video.tagName, 'src', video && (video.currentSrc || video.src));

        video.classList.add('kickscroll-controlled');
        // Wrap requestPictureInPicture on the element to log callers and help
        // identify what's opening PiP when clicks happen.
        try {
            if (typeof video.requestPictureInPicture === 'function') {
                const originalRequest = video.requestPictureInPicture.bind(video);
                video.requestPictureInPicture = function (...args) {
                    log.info(PIP_LOG_TAG, 'video.requestPictureInPicture called by:', new Error().stack.split('\n')[2]?.trim());
                    return originalRequest(...args);
                };
            }
        } catch (err) {
            log.debug(PIP_LOG_TAG, 'Failed to wrap requestPictureInPicture:', err && err.message ? err.message : err);
        }
        video.style.pointerEvents = 'auto';

        video.addEventListener('volumechange', () => {
            if (!video.muted && video.volume > 0 && !state.enforcingVolume) {
                state.lastVolume = video.volume;
                settings.lastVolume = state.lastVolume;
                KS.saveSettings();
            }
        });

        video.addEventListener('click', (event) => {
            // Skip processing if this click is part of a synthetic/fallback operation
            if (KS._syntheticClickInProgress) {
                log.debug('Click ignored - synthetic click in progress');
                event.stopImmediatePropagation();
                event.preventDefault();
                return;
            }

            log.debug('Click event detected - target:', event.target.tagName, event.target.className.substring(0, 50));
            KS._lastUserClick = Date.now();

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

            log.info(PIP_LOG_TAG, 'Processing click for play/pause toggle - target:', target.tagName, target.className ? target.className.substring(0, 50) : '');
            // Prevent the host page from receiving this click and possibly
            // opening Picture-in-Picture or other handlers. Run in capture
            // phase and stop propagation to keep native click handlers out.
            try {
                event.stopImmediatePropagation();
                log.debug(PIP_LOG_TAG, 'Stopped immediate propagation for click event');
            } catch (e) {
                /* If this fails for any reason, fallback to stopPropagation */
                event.stopPropagation();
                log.debug(PIP_LOG_TAG, 'Stopped propagation (fallback) for click event');
            }
            event.preventDefault();

            requestAnimationFrame(() => {
                KS.togglePlayPause();
            });
        }, true);

        // Monitor Picture-in-Picture events on the video element so we can
        // record when the site enters or leaves PiP, and to help debugging.
        try {
            video.addEventListener('enterpictureinpicture', (e) => {
                log.info(PIP_LOG_TAG, 'Video entered Picture-in-Picture:', e && e.target ? e.target.tagName : 'unknown');
                try {
                    const now = Date.now();
                    if (KS._lastUserClick && (now - KS._lastUserClick) < 500) {
                        log.info(PIP_LOG_TAG, 'Auto-closing PiP because it was opened by a recent user click');
                        document.exitPictureInPicture().catch(() => { });
                    }
                } catch (err) {
                    log.debug(PIP_LOG_TAG, 'Failed to auto-close PiP (ignored):', err && err.message ? err.message : err);
                }
            });
            video.addEventListener('leavepictureinpicture', (e) => {
                log.info(PIP_LOG_TAG, 'Video left Picture-in-Picture:', e && e.target ? e.target.tagName : 'unknown');
            });
        } catch (err) {
            log.debug(PIP_LOG_TAG, 'PiP event listeners not supported on this element');
        }

        // Wrap document.exitPictureInPicture once to log calls.
        try {
            if (!KS._pipWrapped) {
                KS._pipWrapped = true;
                if (typeof document.exitPictureInPicture === 'function') {
                    const originalExit = document.exitPictureInPicture.bind(document);
                    document.exitPictureInPicture = function (...args) {
                        log.info(PIP_LOG_TAG, 'document.exitPictureInPicture called by:', new Error().stack.split('\n')[2]?.trim());
                        return originalExit(...args);
                    };
                }
            }
        } catch (err) {
            log.debug(PIP_LOG_TAG, 'Failed to wrap document.exitPictureInPicture:', err && err.message ? err.message : err);
        }

        video.addEventListener('mousedown', (event) => {
            log.debug(PIP_LOG_TAG, 'mousedown - button:', event.button, 'target:', event.target && event.target.tagName);
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
            log.debug(PIP_LOG_TAG, 'mouseup - button:', event.button, 'target:', event.target && event.target.tagName);
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
