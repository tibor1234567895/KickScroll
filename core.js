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

    const log = KS.log = {
        info: (...args) => constants.DEBUG_LOGGING && console.log(constants.LOG_PREFIX, ...args),
        warn: (...args) => constants.DEBUG_LOGGING && console.warn(constants.LOG_PREFIX, ...args),
        error: (...args) => console.error(constants.LOG_PREFIX, ...args),
        debug: (...args) => constants.DEBUG_LOGGING && console.log(constants.LOG_PREFIX, '[DEBUG]', ...args)
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
        volumeNormalizationEnabled: false,
        normalizationTargetLufs: -20,
        compressorEnabled: false,
        compressorThreshold: -24,
        compressorRatio: 12,
        playbackSpeed: 1,
        lastVolume: 1,
        bitrateMonitorEnabled: true,
        bitrateOverlayVisible: true,
        bitrateDisplayMode: 'current',
        bitrateUnit: 'Mbps',
        bitrateRefreshRate: 1000,
        bitrateOpacity: 0.85,
        bitrateTextColor: '#00bcd4'
    };

    const mergedSettings = { ...defaultSettings, ...configDefaults };

    KS.settings = KS.settings || mergedSettings;

    const settings = KS.settings;
    const configState = config.state || {};
    const defaultState = {
        isRightMouseDown: false,
        volumeOverlayTimeout: null,
        speedOverlayTimeout: null,
        lastVolume: settings.lastVolume,
        enforcingVolume: false,
        volumeBoostEnabled: settings.volumeBoostEnabled,
        volumeBoostAmount: settings.volumeBoostAmount,
        volumeNormalizationEnabled: settings.volumeNormalizationEnabled,
        normalizationTargetLufs: settings.normalizationTargetLufs,
        compressorEnabled: settings.compressorEnabled,
        currentPlaybackRate: settings.playbackSpeed,
        loudnessNormalizer: null,
        audioContext: null,
        normalizationGainNode: null,
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
        controlsVisibilityObserver: null,
        controlsVisible: true,
        hideControlsTimeout: null,
        panelInitialized: false,
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

    document.addEventListener('mouseup', (event) => {
        if (event.button === 2) {
            state.isRightMouseDown = false;
        }
    });

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
                log.debug('Chrome storage not available, using default settings');
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
                            state.volumeNormalizationEnabled = settings.volumeNormalizationEnabled;

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
                            state.currentPlaybackRate = settings.playbackSpeed;

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
                        }
                    } finally {
                        complete();
                    }
                });
            } catch (error) {
                log.debug('Chrome storage not available, using default settings');
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
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
                log.debug('Chrome storage not available, skipping save');
                state.saveSettingsTimeout = null;
                return;
            }

            try {
                chrome.storage.sync.set({
                    kickScrollSettings: {
                        volumeBoostEnabled: state.volumeBoostEnabled,
                        volumeBoostAmount: state.volumeBoostAmount,
                        volumeNormalizationEnabled: state.volumeNormalizationEnabled,
                        normalizationTargetLufs: state.normalizationTargetLufs,
                        compressorEnabled: state.compressorEnabled,
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
                        bitrateTextColor: state.bitrateTextColor
                    }
                });
                log.debug('Settings saved successfully');
            } catch (error) {
                log.debug('Error saving settings:', error.message);
            }

            state.saveSettingsTimeout = null;
        }, constants.SAVE_DEBOUNCE_DELAY);
    };

    KS.saveSettingsImmediate = function saveSettingsImmediate() {
        if (state.saveSettingsTimeout) {
            clearTimeout(state.saveSettingsTimeout);
            state.saveSettingsTimeout = null;
        }

        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
            log.debug('Chrome storage not available, skipping save');
            return;
        }

        try {
            chrome.storage.sync.set({
                kickScrollSettings: {
                    volumeBoostEnabled: state.volumeBoostEnabled,
                    volumeBoostAmount: state.volumeBoostAmount,
                    volumeNormalizationEnabled: state.volumeNormalizationEnabled,
                    normalizationTargetLufs: state.normalizationTargetLufs,
                    compressorEnabled: state.compressorEnabled,
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
                    bitrateTextColor: state.bitrateTextColor
                }
            });
            log.debug('Settings saved immediately');
        } catch (error) {
            log.debug('Error saving settings:', error.message);
        }
    };
})();
