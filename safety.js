(() => {
    const KS = window.KickScroll;
    const { log, state, utils } = KS;
    const { dbToLinear, linearToDb } = utils;
    const safetyConfig = (KS.config && KS.config.safety) || {};
    const gainLimit = typeof safetyConfig.gainLimit === 'number' ? safetyConfig.gainLimit : 3.0;
    const monitorInterval = typeof safetyConfig.monitorIntervalMs === 'number' ? safetyConfig.monitorIntervalMs : 200;

    KS.startSafetyMonitor = function startSafetyMonitor() {
        if (state.safetyCheckFrame) {
            return;
        }
        state.safetyCheckFrame = requestAnimationFrame(() => {
            if ((state.volumeBoostEnabled || state.volumeNormalizationEnabled || state.compressorEnabled) && state.audioContext) {
                let normalizationLinear = 1;
                let boostLinear = 1;

                if (state.normalizationGainNode) {
                    normalizationLinear = state.normalizationGainNode.gain.value;
                }
                if (state.outputGainNode) {
                    boostLinear = state.outputGainNode.gain.value;
                }

                const combinedGain = normalizationLinear * boostLinear;

                if (combinedGain > gainLimit) {
                    if (state.loudnessNormalizer) {
                        state.loudnessNormalizer.forceCombinedCeiling(gainLimit);
                    }

                    if (state.outputGainNode) {
                        const remaining = gainLimit / Math.max(state.normalizationGainNode ? state.normalizationGainNode.gain.value : 1, 0.01);
                        const clampedBoost = Math.min(state.outputGainNode.gain.value, remaining);
                        state.outputGainNode.gain.setValueAtTime(clampedBoost, state.audioContext.currentTime);
                    }

                    log.warn('⚠️ Emergency gain reduction triggered! Combined gain was:', combinedGain.toFixed(2));
                    KS.showTextOverlay('⚠️ Gain limited for safety');
                }
            }

            state.safetyCheckFrame = null;
            if (state.volumeBoostEnabled || state.volumeNormalizationEnabled || state.compressorEnabled) {
                setTimeout(KS.startSafetyMonitor, monitorInterval);
            }
        });
    };

    KS.cleanup = function cleanup() {
        if (state.audioContext && state.audioContext.state !== 'closed') {
            state.audioContext.close();
        }
        state.audioContext = null;
        state.sourceNode = null;
        state.analyzerNode = null;
        state.compressorNode = null;
        state.normalizationGainNode = null;
        state.outputGainNode = null;
        state.currentVideo = null;
        if (state.controlsVisibilityObserver) {
            state.controlsVisibilityObserver.disconnect();
        }
        if (state.hideControlsTimeout) {
            clearTimeout(state.hideControlsTimeout);
        }
        if (state.loudnessNormalizer) {
            state.loudnessNormalizer.destroy();
            state.loudnessNormalizer = null;
        }
        clearTimeout(state.volumeOverlayTimeout);
        clearTimeout(state.speedOverlayTimeout);
        KS.stopBitrateMonitoring();
    };
})();
