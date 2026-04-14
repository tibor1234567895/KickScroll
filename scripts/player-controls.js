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
        log.warn(PIP_LOG_TAG, 'Failed to wrap HTMLVideoElement.prototype.requestPictureInPicture:', err && err.message ? err.message : err);
    }

    let lastPlayPauseClick = 0;
    let playPauseInProgress = false;
    // Incremented on each togglePlayPause call to invalidate stale promise handlers
    let currentActionToken = 0;
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
    const pipSuppressionWindow = Math.max(playPauseProgressWindow, 500); // keep PiP suppression active through fallback window
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

    // Helper to find native play/pause button by SVG icon path
    const findNativePlayPauseButton = () => {
        // Look for buttons containing SVG with play icon path
        const playIconPath = 'M8.4,3.2v25.9l20.4-13L8.4,3.2z';
        const pauseIconPaths = ['M6,3.5v25h7.3v-25H6z', 'M18.7,3.5v25H26v-25H18.7z'];
        
        const buttons = document.querySelectorAll('button');
        for (const button of buttons) {
            const svg = button.querySelector('svg');
            if (!svg) continue;
            
            const paths = svg.querySelectorAll('path');
            for (const path of paths) {
                const d = path.getAttribute('d');
                if (d === playIconPath || pauseIconPaths.includes(d)) {
                    return button;
                }
            }
        }
        
        // Fallback: look for button with size-11 class near video
        const sizeButton = document.querySelector('button.size-11');
        if (sizeButton && sizeButton.querySelector('svg')) {
            return sizeButton;
        }
        
        return null;
    };

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
        currentActionToken++;
        const actionToken = currentActionToken;

        const video = KS.getVideoElement();
        if (!video) {
            log.error('Cannot toggle play/pause - video element not found');
            playPauseInProgress = false;
            return;
        }

        const wasPaused = video.paused;
        log.debug(PIP_LOG_TAG, 'togglePlayPause called - wasPaused:', wasPaused, 'document.pictureInPictureElement:', !!document.pictureInPictureElement);
        log.info('Toggling playback - current state:', wasPaused ? 'PAUSED' : 'PLAYING');

        try {
            KS._suppressPiP = true;
            
            // Try to find and click native play/pause button first
            const nativeButton = findNativePlayPauseButton();
            if (nativeButton) {
                log.debug(PIP_LOG_TAG, 'Found native play/pause button, clicking it');
                nativeButton.click();
            } else {
                // Fallback to direct video API
                log.debug(PIP_LOG_TAG, 'No native button found, using direct API');
                if (wasPaused) {
                    log.debug('Calling video.play()');
                    const playPromise = video.play();
                    if (playPromise && typeof playPromise.then === 'function') {
                        playPromise.catch((err) => {
                            log.debug('play() promise rejected:', err.name || err.message);
                        });
                    }
                } else {
                    log.debug('Calling video.pause()');
                    video.pause();
                }
            }
            
            // Verify and clean up after a short delay
            setTimeout(() => {
                if (actionToken !== currentActionToken) {
                    return;
                }
                
                const currentVideo = KS.getVideoElement();
                const nowPaused = currentVideo && currentVideo.paused;
                
                // Check if state changed as expected
                if (nowPaused !== wasPaused) {
                    log.info('✓ Playback toggled successfully - now:', nowPaused ? 'PAUSED' : 'PLAYING');
                } else {
                    log.debug(PIP_LOG_TAG, 'State unchanged after toggle, retrying with direct API...');
                    // One retry with direct API
                    if (wasPaused && currentVideo) {
                        currentVideo.play().catch(() => {});
                    } else if (!wasPaused && currentVideo) {
                        currentVideo.pause();
                    }
                }
                
                // Exit PiP if it opened
                if (document.pictureInPictureElement) {
                    log.debug(PIP_LOG_TAG, 'Exiting PiP that opened during toggle');
                    document.exitPictureInPicture().catch(() => {});
                }
                
                KS._suppressPiP = false;
                playPauseInProgress = false;
            }, 100);
            
        } catch (error) {
            log.error('Exception in togglePlayPause:', error);
            KS._suppressPiP = false;
            KS._syntheticClickInProgress = false;
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

        const currentlyMuted = Boolean(state.extensionMuted || video.muted || video.defaultMuted);

        if (currentlyMuted) {
            state.enforcingVolume = true;
            const targetVolume = Math.max(0, Math.min(1, typeof state.lastVolume === 'number' ? state.lastVolume : video.volume));
            const hadNativeMute = Boolean(video.muted || video.defaultMuted);
            const outputGainNode = state.outputGainNode;
            const audioContext = state.audioContext;
            const restoreOutputGain = hadNativeMute && outputGainNode && audioContext
                ? outputGainNode.gain.value
                : null;
            const enforceVolume = () => {
                if (Math.abs(video.volume - targetVolume) > 0.01) {
                    video.volume = targetVolume;
                }
            };

            if (restoreOutputGain !== null) {
                outputGainNode.gain.setValueAtTime(0, audioContext.currentTime);
            }

            enforceVolume();
            state.extensionMuted = false;
            if (video.defaultMuted) {
                video.defaultMuted = false;
            }
            if (video.muted) {
                video.muted = false;
            }

            if (KS.syncNativeSliderTo) {
                KS.syncNativeSliderTo(targetVolume * 100);
            }

            // Show feedback immediately instead of waiting for the enforcement window
            KS.showVolumeOverlay(targetVolume);
            enforceVolume();
            const enforcementInterval = setInterval(enforceVolume, 50);
            setTimeout(() => {
                clearInterval(enforcementInterval);
                if (restoreOutputGain !== null && state.outputGainNode === outputGainNode && state.audioContext === audioContext) {
                    outputGainNode.gain.setValueAtTime(restoreOutputGain, audioContext.currentTime);
                }
                state.enforcingVolume = false;
                KS.showVolumeOverlay(targetVolume);
            }, 125);
        } else {
            if (video.volume > 0) {
                state.lastVolume = video.volume;
            }
            state.extensionMuted = true;
            state.enforcingVolume = true;
            video.defaultMuted = true;
            video.muted = true;
            KS.showVolumeOverlay('Muted');
            setTimeout(() => {
                state.enforcingVolume = false;
            }, 125);
        }

        settings.lastVolume = state.lastVolume;
        KS.saveSettings();
    };

    KS.resumeAudioContext = function resumeAudioContext() {
        if (state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume().then(() => {
                log.info('AudioContext resumed successfully');
            }).catch(err => {
                log.warn('Failed to resume AudioContext:', err);
            });
        }
    };

    KS.adjustVolume = function adjustVolume(event) {
        const video = KS.getVideoElement();
        if (!video) {
            return;
        }

        const direction = event.deltaY < 0 ? 1 : (event.deltaY > 0 ? -1 : 0);
        if (direction === 0) {
            return;
        }

        const volumeStep = typeof state.volumeScrollStep === 'number' ? state.volumeScrollStep : 0.05;
        let newVolume = video.volume + (direction * volumeStep);
        newVolume = Math.min(1, Math.max(0, newVolume));
        video.volume = newVolume;
        if (newVolume > 0) {
            state.extensionMuted = false;
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

        // Disable PiP completely to prevent native player from triggering it
        try {
            video.disablePictureInPicture = true;
            log.debug(PIP_LOG_TAG, 'Disabled PiP on video element');
        } catch (e) {
            log.debug(PIP_LOG_TAG, 'Could not disable PiP:', e.message);
        }

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
            log.warn(PIP_LOG_TAG, 'Failed to wrap requestPictureInPicture:', err && err.message ? err.message : err);
        }
        video.style.pointerEvents = 'auto';

        video.addEventListener('volumechange', () => {
            if (state.enforcingVolume) {
                return;
            }

            if (video.muted || video.defaultMuted) {
                state.extensionMuted = true;
                return;
            }

            state.extensionMuted = false;
            if (video.volume > 0) {
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
                KS.resumeAudioContext();
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
            log.warn(PIP_LOG_TAG, 'Failed to wrap document.exitPictureInPicture:', err && err.message ? err.message : err);
        }

        video.addEventListener('mousedown', (event) => {
            log.debug(PIP_LOG_TAG, 'mousedown - button:', event.button, 'target:', event.target && event.target.tagName);
            if (event.button === 0) {
                // Left-click: stop propagation to prevent native player from
                // receiving the event and toggling playback on its own
                event.stopImmediatePropagation();
                event.preventDefault();
            } else if (event.button === 1) {
                KS.toggleMute();
                event.stopImmediatePropagation();
                event.preventDefault();
            } else if (event.button === 2) {
                state.isRightMouseDown = true;
                event.stopImmediatePropagation();
                event.preventDefault();
            }
        }, true);

        video.addEventListener('mouseup', (event) => {
            log.debug(PIP_LOG_TAG, 'mouseup - button:', event.button, 'target:', event.target && event.target.tagName);
            if (event.button === 0) {
                // Left-click: stop propagation to prevent native player handlers
                event.stopImmediatePropagation();
                event.preventDefault();
            } else if (event.button === 1) {
                event.stopImmediatePropagation();
                event.preventDefault();
            } else if (event.button === 2) {
                state.isRightMouseDown = false;
                event.stopImmediatePropagation();
                event.preventDefault();
            }
        }, true);

        video.addEventListener('auxclick', (event) => {
            if (event.button === 1 || event.button === 2) {
                log.debug(PIP_LOG_TAG, 'auxclick suppressed - button:', event.button, 'target:', event.target && event.target.tagName);
                event.stopImmediatePropagation();
                event.preventDefault();
            }
        }, true);

        video.addEventListener('click', KS.resumeAudioContext, { once: false });
        video.addEventListener('mousedown', KS.resumeAudioContext, { once: false });
        video.addEventListener('wheel', KS.resumeAudioContext, { once: false });

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
