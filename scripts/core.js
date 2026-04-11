(() => {
    const KS = window.KickScroll = window.KickScroll || {};
    const config = window.KickScrollConfig || {};
    KS.config = config;

    const configConstants = config.constants || {};

    const constants = KS.constants = {
        AUTO_COLLAPSE_DELAY: configConstants.AUTO_COLLAPSE_DELAY ?? 1500,
        DISABLE_EFFECT_SCALING: configConstants.DISABLE_EFFECT_SCALING ?? false,
        DEBUG_LOGGING: configConstants.DEBUG_LOGGING ?? true,
        LOG_PREFIX: configConstants.LOG_PREFIX ?? '[KickScroll]',
        SAVE_DEBOUNCE_DELAY: configConstants.SAVE_DEBOUNCE_DELAY ?? 500,
        BITRATE_HISTORY_LIMIT_DEFAULT: configConstants.BITRATE_HISTORY_LIMIT_DEFAULT ?? 20,
        BITRATE_HISTORY_LIMIT_MSE: configConstants.BITRATE_HISTORY_LIMIT_MSE ?? 15
    };

    const isDebugLoggingEnabled = () => {
        const st = KS.state;
        if (st && typeof st.debugLoggingEnabled === 'boolean') {
            return st.debugLoggingEnabled;
        }
        return Boolean(constants.DEBUG_LOGGING);
    };

    const log = KS.log = {
        info: (...args) => isDebugLoggingEnabled() && console.log(constants.LOG_PREFIX, ...args),
        warn: (...args) => isDebugLoggingEnabled() && console.warn(constants.LOG_PREFIX, ...args),
        error: (...args) => console.error(constants.LOG_PREFIX, ...args),
        debug: (...args) => isDebugLoggingEnabled() && console.log(constants.LOG_PREFIX, '[DEBUG]', ...args)
    };

    const utils = KS.utils = {
        clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
        dbToLinear: (db) => Math.pow(10, db / 20),
        linearToDb: (linear) => 20 * Math.log10(Math.max(linear, 1e-6)),
        convertLegacyTarget(percent) {
            if (typeof percent !== 'number' || Number.isNaN(percent)) {
                return -20;
            }
            const clamped = utils.clamp(percent, 10, 100);
            const mapped = -48 + ((clamped - 10) / 90) * 38;
            return utils.clamp(mapped, -48, -10);
        }
    };

    const configDefaults = config.defaults || {};
    const defaultSettings = {
        volumeBoostEnabled: false,
        volumeBoostAmount: 6,
        volumeScrollStep: typeof ((config.kvw || {}).step) === 'number' ? utils.clamp(config.kvw.step, 0.01, 0.25) : 0.05,
        volumeNormalizationEnabled: false,
        normalizationTargetLufs: -20,
        compressorEnabled: true,
        ffzModeEnabled: false,
        ffzGainEnabled: true,
        ffzGainAmount: 1.6,
        compressorThreshold: -24,
        compressorRatio: 12,
        playbackSpeed: 1,
        lastVolume: 1,
        bitrateMonitorEnabled: false,
        bitrateOverlayVisible: false,
        bitrateDisplayMode: 'current',
        bitrateUnit: 'Mbps',
        bitrateRefreshRate: 1000,
        bitrateOpacity: 0.85,
        bitrateTextColor: '#00bcd4',
        debugLoggingEnabled: configConstants.DEBUG_LOGGING ?? true
    };

    const mergedSettings = { ...defaultSettings, ...configDefaults };

    KS.settings = KS.settings || mergedSettings;

    const settings = KS.settings;
    const configState = config.state || {};
    const defaultState = {
        isRightMouseDown: false,
        extensionMuted: false,
        pendingNativeSliderPct: null,
        nativeSliderSyncInProgress: false,
        volumeOverlayTimeout: null,
        speedOverlayTimeout: null,
        lastVolume: settings.lastVolume,
        enforcingVolume: false,
        volumeBoostEnabled: settings.volumeBoostEnabled,
        volumeBoostAmount: settings.volumeBoostAmount,
        volumeScrollStep: settings.volumeScrollStep,
        volumeNormalizationEnabled: settings.volumeNormalizationEnabled,
        normalizationTargetLufs: settings.normalizationTargetLufs,
        compressorEnabled: settings.compressorEnabled,
        ffzModeEnabled: settings.ffzModeEnabled,
        ffzGainEnabled: settings.ffzGainEnabled !== false,
        ffzGainAmount: typeof settings.ffzGainAmount === 'number' ? settings.ffzGainAmount : 1.6,
        currentPlaybackRate: settings.playbackSpeed,
        loudnessNormalizer: null,
        audioContext: null,
        normalizationGainNode: null,
        ffzGainNode: null,
        outputGainNode: null,
        sourceNode: null,
        analyzerNode: null,
        compressorNode: null,
        currentVideo: null,
        compressorThreshold: settings.compressorThreshold,
        compressorRatio: settings.compressorRatio,
        compressorKnee: configState.compressorKnee ?? 30,
        compressorAttack: configState.compressorAttack ?? 0.003,
        compressorRelease: configState.compressorRelease ?? 0.25,
        ffzDefaults: configState.ffzDefaults || {
            threshold: -50,
            knee: 40,
            ratio: 12,
            attack: 0,
            release: 0.25,
            gain: 1.6
        },
        controlsVisibilityObserver: null,
        controlsVisible: true,
        hideControlsTimeout: null,
        panelInitialized: false,
        panelEventsBound: false,
        autoCollapseTimeout: null,
        isPanelCollapsed: true,
        panelToggleRef: null,
        panelContentRef: null,
        controlPanelRef: null,
        bitrateMonitorEnabled: settings.bitrateMonitorEnabled,
        bitrateOverlayVisible: settings.bitrateOverlayVisible,
        currentBitrate: 0,
        bitrateHistory: [],
        minBitrate: Infinity,
        maxBitrate: 0,
        lastBufferSize: 0,
        lastBufferTime: 0,
        totalBytesLoaded: 0,
        lastBytesLoaded: 0,
        bitrateUpdateInterval: null,
        sourceBufferMonitor: null,
        bitrateDisplayMode: settings.bitrateDisplayMode,
        bitrateUnit: settings.bitrateUnit,
        bitrateRefreshRate: settings.bitrateRefreshRate,
        bitrateOpacity: settings.bitrateOpacity,
        bitrateTextColor: settings.bitrateTextColor,
        debugLoggingEnabled: settings.debugLoggingEnabled,
        settingsLoadPromise: null,
        settingsLoaded: false,
        initStarted: false,
        fetchInterceptorActive: false,
        originalFetch: null,
        sourceBufferInterceptorActive: false,
        originalAppendBuffer: null,
        bitrateInstrumentationActive: false,
        mseMonitorState: {
            segmentBytes: 0,
            segmentWindowStart: 0,
            measurementWindowMs: 2000
        },
        saveSettingsTimeout: null,
        safetyCheckFrame: null,
        observerTimeout: null,
        observer: null
    };

    KS.state = KS.state || defaultState;

    const state = KS.state;

    // Inject a page-level script that overrides requestPictureInPicture in
    // the page context (not the content-script isolated world) so we can
    // suppress PiP requests triggered by site code when the extension
    // synthesizes clicks. We toggle suppression by dispatching
    // `kickscroll-suppress-pip-on` and `kickscroll-suppress-pip-off` events.
    try {
        // Insert a script tag whose src is the extension file, which runs in
        // the page context and avoids inline-CSP issues.
        const script = document.createElement('script');
        script.setAttribute('type', 'text/javascript');
        script.src = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('scripts/pip-inject.js')
            : 'scripts/pip-inject.js';
        (document.documentElement || document.head || document.body || document.documentElement).appendChild(script);
        // Keep the script element for debugging; do not remove it immediately.
        log.debug('[KS-PiP] Injected page-level PiP suppression script via src');
    } catch (err) {
        log.debug('[KS-PiP] Failed to inject page-level PiP suppression script via src:', err && err.message ? err.message : err);
    }

    document.addEventListener('mouseup', (event) => {
        if (event.button === 2) {
            state.isRightMouseDown = false;
        }
    });

    // Global capture handler to intercept clicks targeted to video region and
    // ensure we handle play/pause toggles before page-level handlers trigger
    // any PiP behavior. This runs at the document capture phase to preempt
    // site handlers.
    try {
        // Known control selectors used by player UIs; clicks inside these
        // should not toggle play/pause.
        const controlSelectors = [
            'button', 'input', '[role="button"]', '[role^="slider"]',
            '.z-controls', '.controls', '.control-bar', '.player-controls', '.player__controls',
            '.ytp-chrome-top', '.ytp-chrome-bottom', '.ks-control-panel', '.ks-control',
            '[data-testid*="control"]', '[data-testid*="volume"]', '[data-testid*="settings"]',
            '[data-testid*="more-options"]', '.volume', '.mute', '.settings', '.quality'
        ];

        const controlQuery = controlSelectors.join(',');
        document.addEventListener('click', (event) => {
            try {
                // Skip processing if this click is part of a synthetic/fallback operation
                if (KS._syntheticClickInProgress) {
                    return;
                }

                if (event.button !== undefined && event.button !== 0) {
                    return; // only intercept left-clicks
                }

                // Respect other high-priority UI (dialogs, menus, chat panes, forms)
                if (event.target.closest && event.target.closest('[role="dialog"], [role="menu"], [aria-live], [data-testid*="chat"], [data-testid*="modal"], a, textarea, select, option, label')) {
                    return;
                }

                const video = KS.getVideoElement();
                if (!video) return;
                // Ignore clicks on our own panel or on native control elements
                const target = event.target;
                if (target.closest && target.closest('#kick-control-panel')) return;
                if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.getAttribute('role') === 'button') return;
                // If click is within the video element itself and not inside
                // a control element, intercept.
                if ((target === video || video.contains(target)) && !(target.closest && target.closest(controlQuery))) {
                    KS._lastUserClick = Date.now();
                    try { event.stopImmediatePropagation(); } catch (e) { }
                    event.preventDefault();
                    requestAnimationFrame(() => KS.togglePlayPause());
                }
            } catch (err) {
                log.debug('[KS-PiP]', 'Global click interceptor error:', err && err.message ? err.message : err);
            }
        }, true);
        log.debug('[KS-PiP]', 'Global click interceptor registered (capture)');
    } catch (err) {
        log.debug('[KS-PiP]', 'Failed to register global click interceptor (ignored):', err && err.message ? err.message : err);
    }

    if (settings !== mergedSettings) {
        Object.entries(configDefaults).forEach(([key, value]) => {
            if (settings[key] === undefined) {
                settings[key] = value;
            }
        });
    }

    KS.loadSettings = function loadSettings() {
        if (state.settingsLoadPromise) {
            return state.settingsLoadPromise;
        }

        state.settingsLoadPromise = new Promise((resolve) => {
            const complete = () => {
                state.settingsLoaded = true;
                resolve();
            };

            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
                log.info('Chrome storage not available, using default settings');
                complete();
                return;
            }

            try {
                chrome.storage.sync.get(['kickScrollSettings'], (result) => {
                    try {
                        if (result && result.kickScrollSettings) {
                            Object.assign(settings, result.kickScrollSettings);

                            state.volumeBoostEnabled = settings.volumeBoostEnabled;
                            state.volumeBoostAmount = settings.volumeBoostAmount;
                            if (typeof settings.volumeScrollStep === 'number') {
                                state.volumeScrollStep = utils.clamp(settings.volumeScrollStep, 0.01, 0.25);
                            }
                            settings.volumeScrollStep = state.volumeScrollStep;
                            state.volumeNormalizationEnabled = settings.volumeNormalizationEnabled;
                            state.ffzModeEnabled = settings.ffzModeEnabled === true;
                            state.ffzGainEnabled = settings.ffzGainEnabled !== false;
                            if (typeof settings.ffzGainAmount === 'number') {
                                state.ffzGainAmount = utils.clamp(settings.ffzGainAmount, 0.5, 3);
                            }

                            if (typeof settings.normalizationTargetLufs === 'number') {
                                state.normalizationTargetLufs = utils.clamp(settings.normalizationTargetLufs, -48, -10);
                            } else if (typeof settings.normalizationTarget === 'number') {
                                state.normalizationTargetLufs = utils.convertLegacyTarget(settings.normalizationTarget);
                            }

                            settings.normalizationTargetLufs = state.normalizationTargetLufs;
                            if ('normalizationTarget' in settings) {
                                delete settings.normalizationTarget;
                            }

                            state.compressorEnabled = settings.compressorEnabled;
                            state.compressorThreshold = settings.compressorThreshold;
                            state.compressorRatio = settings.compressorRatio;
                            state.currentPlaybackRate = settings.playbackSpeed || 1.0;
                            state.pipGuardEnabled = settings.pipGuardEnabled !== false;

                            if (typeof settings.lastVolume === 'number') {
                                state.lastVolume = utils.clamp(settings.lastVolume, 0, 1);
                            }

                            state.bitrateMonitorEnabled = settings.bitrateMonitorEnabled !== false;
                            state.bitrateOverlayVisible = settings.bitrateOverlayVisible !== false;
                            state.bitrateDisplayMode = settings.bitrateDisplayMode || 'current';
                            state.bitrateUnit = settings.bitrateUnit || 'Mbps';
                            state.bitrateRefreshRate = settings.bitrateRefreshRate || 1000;
                            state.bitrateOpacity = settings.bitrateOpacity !== undefined ? settings.bitrateOpacity : 0.85;
                            state.bitrateTextColor = settings.bitrateTextColor || '#00bcd4';
                            state.debugLoggingEnabled = settings.debugLoggingEnabled !== false;
                            settings.debugLoggingEnabled = state.debugLoggingEnabled;
                            settings.ffzModeEnabled = state.ffzModeEnabled;
                            settings.ffzGainEnabled = state.ffzGainEnabled;
                            settings.ffzGainAmount = state.ffzGainAmount;
                        }
                    } finally {
                        complete();
                    }
                });
            } catch (error) {
                log.info('Chrome storage not available, using default settings');
                complete();
            }
        });

        return state.settingsLoadPromise;
    };

    KS.saveSettings = function saveSettings() {
        if (state.saveSettingsTimeout) {
            clearTimeout(state.saveSettingsTimeout);
        }

        state.saveSettingsTimeout = setTimeout(() => {
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || !chrome.storage || !chrome.storage.sync) {
                log.debug('Chrome storage not available or context gone, skipping save');
                state.saveSettingsTimeout = null;
                return;
            }

            try {
                chrome.storage.sync.set({
                    kickScrollSettings: {
                        volumeBoostEnabled: state.volumeBoostEnabled,
                        volumeBoostAmount: state.volumeBoostAmount,
                        volumeScrollStep: state.volumeScrollStep,
                        volumeNormalizationEnabled: state.volumeNormalizationEnabled,
                        normalizationTargetLufs: state.normalizationTargetLufs,
                        compressorEnabled: state.compressorEnabled,
                        pipGuardEnabled: state.pipGuardEnabled,
                        ffzModeEnabled: state.ffzModeEnabled,
                        ffzGainEnabled: state.ffzGainEnabled,
                        ffzGainAmount: state.ffzGainAmount,
                        compressorThreshold: state.compressorThreshold,
                        compressorRatio: state.compressorRatio,
                        playbackSpeed: state.currentPlaybackRate,
                        lastVolume: state.lastVolume,
                        bitrateMonitorEnabled: state.bitrateMonitorEnabled,
                        bitrateOverlayVisible: state.bitrateOverlayVisible,
                        bitrateDisplayMode: state.bitrateDisplayMode,
                        bitrateUnit: state.bitrateUnit,
                        bitrateRefreshRate: state.bitrateRefreshRate,
                        bitrateOpacity: state.bitrateOpacity,
                        bitrateTextColor: state.bitrateTextColor,
                        debugLoggingEnabled: state.debugLoggingEnabled
                    }
                });
                log.info('Settings saved successfully');
            } catch (error) {
                const message = error && error.message ? error.message : error;
                const messageText = typeof message === 'string' ? message : String(message || '');
                if (!chrome.runtime || !chrome.runtime.id || messageText.toLowerCase().includes('extension context invalidated')) {
                    log.debug('Skipping save after context invalidation');
                } else {
                    log.warn('Error saving settings:', messageText);
                }
            }

            state.saveSettingsTimeout = null;
        }, constants.SAVE_DEBOUNCE_DELAY);
    };

    KS.saveSettingsImmediate = function saveSettingsImmediate() {
        if (state.saveSettingsTimeout) {
            clearTimeout(state.saveSettingsTimeout);
            state.saveSettingsTimeout = null;
        }

        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || !chrome.storage || !chrome.storage.sync) {
            log.debug('Chrome storage not available or context gone, skipping save');
            return;
        }

        try {
            chrome.storage.sync.set({
                kickScrollSettings: {
                    volumeBoostEnabled: state.volumeBoostEnabled,
                    volumeBoostAmount: state.volumeBoostAmount,
                    volumeScrollStep: state.volumeScrollStep,
                    volumeNormalizationEnabled: state.volumeNormalizationEnabled,
                    normalizationTargetLufs: state.normalizationTargetLufs,
                    compressorEnabled: state.compressorEnabled,
                    ffzModeEnabled: state.ffzModeEnabled,
                    ffzGainEnabled: state.ffzGainEnabled,
                    ffzGainAmount: state.ffzGainAmount,
                    compressorThreshold: state.compressorThreshold,
                    compressorRatio: state.compressorRatio,
                    playbackSpeed: state.currentPlaybackRate,
                    lastVolume: state.lastVolume,
                    bitrateMonitorEnabled: state.bitrateMonitorEnabled,
                    bitrateOverlayVisible: state.bitrateOverlayVisible,
                    bitrateDisplayMode: state.bitrateDisplayMode,
                    bitrateUnit: state.bitrateUnit,
                    bitrateRefreshRate: state.bitrateRefreshRate,
                    bitrateOpacity: state.bitrateOpacity,
                    bitrateTextColor: state.bitrateTextColor,
                    debugLoggingEnabled: state.debugLoggingEnabled
                }
            });
            log.info('Settings saved immediately');
        } catch (error) {
            const message = error && error.message ? error.message : error;
            const messageText = typeof message === 'string' ? message : String(message || '');
            if (!chrome.runtime || !chrome.runtime.id || messageText.toLowerCase().includes('extension context invalidated')) {
                log.debug('Skipping save after context invalidation');
            } else {
                log.warn('Error saving settings:', messageText);
            }
        }
    };
})();
