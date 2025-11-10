(() => {
    // Edit this object to customize KickScroll without touching feature modules.
    window.KickScrollConfig = {
        // App-wide timing, logging, and storage knobs.
        constants: {
            AUTO_COLLAPSE_DELAY: 1500,
            DISABLE_EFFECT_SCALING: false,
            DEBUG_LOGGING: true,
            LOG_PREFIX: '[KickScroll]',
            SAVE_DEBOUNCE_DELAY: 500,
            BITRATE_HISTORY_LIMIT_DEFAULT: 20,
            BITRATE_HISTORY_LIMIT_MSE: 15
        },
        // Initial values written to chrome.storage when no sync data exists yet.
        defaults: {
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
        },
        // Extra audio processor state that is not persisted in storage.
        state: {
            compressorKnee: 30,
            compressorAttack: 0.003,
            compressorRelease: 0.25
        },
        // Styling presets for overlays and picker menus.
        ui: {
            bitrateColors: [
                { name: 'Cyan', value: '#00bcd4' },
                { name: 'Green', value: '#4CAF50' },
                { name: 'Yellow', value: '#FFC107' },
                { name: 'Orange', value: '#FF9800' },
                { name: 'Red', value: '#F44336' },
                { name: 'Purple', value: '#9C27B0' },
                { name: 'Blue', value: '#2196F3' },
                { name: 'White', value: '#FFFFFF' }
            ]
        },
        // Kick Volume Wheel tuning: scroll behavior, hitboxes, and pointer sync.
        kvw: {
            debug: true,
            step: 0.05,
            allowWheelOverVideo: false,
            hoverPaddingPx: 10,
            pointerSync: true
        },
        // Playback speed choices shown in the control panel and hotkeys.
        playback: {
            speedOptions: [0.25, 0.5, 0.75, 1, 1.1, 1.25, 1.5, 1.75, 2]
        },
        // Native player integration thresholds and selector fallbacks.
        player: {
            playPauseDebounceMs: 150,
            playPauseProgressWindowMs: 500,
            playPauseSelectors: [
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
            ]
        },
        // DOM queries for locating Kick elements; override if site markup changes.
        selectors: {
            video: [
                '#video-player',
                "video[data-testid='video-player']",
                '.video-player video',
                'video'
            ],
            playerControls: [
                '.video-controls',
                '.player-controls',
                '.control-bar',
                '[class*="control"]',
                '[class*="player-ui"]',
                '[data-testid*="control"]',
                '.video-player-controls'
            ]
        },
        // Gain guardrails so boosted audio cannot exceed safe thresholds.
        safety: {
            gainLimit: 3.0,
            monitorIntervalMs: 200
        },
        // Bootstrapping behavior when wiring into Kick's SPA lifecycle.
        init: {
            videoSetupRetries: 10,
            retryDelayMs: 500,
            observerDebounceMs: 100,
            controlsDiscoveryDelayMs: 2000
        }
    };
})();
