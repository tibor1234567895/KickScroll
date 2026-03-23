(() => {
    const KS = window.KickScroll;
    const { dom, state, settings, utils, log, constants } = KS;
    const controlPanel = dom.controlPanel;

    KS.scheduleAutoCollapse = function scheduleAutoCollapse() {
        if (state.autoCollapseTimeout) {
            clearTimeout(state.autoCollapseTimeout);
        }
        state.autoCollapseTimeout = setTimeout(() => {
            if (!state.isPanelCollapsed && state.panelToggleRef && state.panelContentRef && state.controlPanelRef) {
                state.isPanelCollapsed = true;
                state.controlPanelRef.classList.add('collapsed');
                state.controlPanelRef.classList.remove('expanded');
                state.panelContentRef.style.display = 'none';
                state.panelToggleRef.textContent = '▶';
            }
        }, constants.AUTO_COLLAPSE_DELAY);
    };

    KS.cancelAutoCollapse = function cancelAutoCollapse() {
        if (state.autoCollapseTimeout) {
            clearTimeout(state.autoCollapseTimeout);
            state.autoCollapseTimeout = null;
        }
    };

    KS.adjustNormalizationTarget = function adjustNormalizationTarget(direction) {
        const step = 1;
        const min = -48;
        const max = -10;

        if (direction === 'up') {
            state.normalizationTargetLufs = Math.min(max, state.normalizationTargetLufs + step);
        } else {
            state.normalizationTargetLufs = Math.max(min, state.normalizationTargetLufs - step);
        }

        settings.normalizationTargetLufs = state.normalizationTargetLufs;
        KS.saveSettings();
        if (state.loudnessNormalizer) {
            state.loudnessNormalizer.setTarget(state.normalizationTargetLufs);
            if (state.volumeNormalizationEnabled) {
                state.loudnessNormalizer.enable();
            }
        }
        const displayLufs = Math.round(state.normalizationTargetLufs * 10) / 10;
        KS.showTextOverlay(`Target Loudness: ${displayLufs} LUFS`);
        KS.updateControlPanelState();
    };

    KS.updateCompressor = function updateCompressor() {
        if (!state.compressorNode || !state.audioContext) {
            return;
        }

        state.compressorNode.threshold.setValueAtTime(state.compressorThreshold, state.audioContext.currentTime);
        state.compressorNode.knee.setValueAtTime(state.compressorKnee, state.audioContext.currentTime);
        state.compressorNode.ratio.setValueAtTime(state.compressorRatio, state.audioContext.currentTime);
        state.compressorNode.attack.setValueAtTime(state.compressorAttack, state.audioContext.currentTime);
        state.compressorNode.release.setValueAtTime(state.compressorRelease, state.audioContext.currentTime);
        KS.updateAudioProcessing();
    };

    KS.applyFFZPreset = function applyFFZPreset() {
        const defaults = state.ffzDefaults || {};
        state.compressorEnabled = true;
        state.compressorThreshold = defaults.threshold ?? -50;
        state.compressorKnee = defaults.knee ?? 40;
        state.compressorRatio = defaults.ratio ?? 12;
        state.compressorAttack = defaults.attack ?? 0;
        state.compressorRelease = defaults.release ?? 0.25;
        state.ffzGainEnabled = true;
        state.ffzGainAmount = defaults.gain ?? 1.6;

        settings.compressorEnabled = state.compressorEnabled;
        settings.compressorThreshold = state.compressorThreshold;
        settings.compressorRatio = state.compressorRatio;
        settings.ffzGainEnabled = state.ffzGainEnabled;
        settings.ffzGainAmount = state.ffzGainAmount;
    };

    KS.toggleCompressor = function toggleCompressor() {
        state.compressorEnabled = !state.compressorEnabled;
        if (!state.compressorEnabled) {
            state.ffzModeEnabled = false;
            settings.ffzModeEnabled = false;
        }
        settings.compressorEnabled = state.compressorEnabled;
        KS.saveSettings();
        KS.updateCompressor();
        KS.updateControlPanelState();

        if (state.volumeBoostEnabled || state.volumeNormalizationEnabled || state.compressorEnabled) {
            if (KS.startSafetyMonitor) {
                KS.startSafetyMonitor();
            }
        }

        KS.showTextOverlay(state.compressorEnabled ? 'Compressor ON' : 'Compressor OFF');
    };

    KS.toggleFFZMode = function toggleFFZMode() {
        state.ffzModeEnabled = !state.ffzModeEnabled;
        if (state.ffzModeEnabled) {
            KS.applyFFZPreset();
            state.volumeNormalizationEnabled = false;
            settings.volumeNormalizationEnabled = false;
        }

        settings.ffzModeEnabled = state.ffzModeEnabled;
        KS.saveSettings();
        KS.updateCompressor();
        KS.updateControlPanelState();
        KS.showTextOverlay(state.ffzModeEnabled ? 'FFZ Mode ON' : 'FFZ Mode OFF');
    };

    KS.adjustCompressorThreshold = function adjustCompressorThreshold(direction) {
        const step = 3;
        const min = -50;
        const max = 0;

        if (direction === 'up') {
            state.compressorThreshold = Math.min(max, state.compressorThreshold + step);
        } else {
            state.compressorThreshold = Math.max(min, state.compressorThreshold - step);
        }

        settings.compressorThreshold = state.compressorThreshold;
        KS.saveSettings();
        KS.updateCompressor();
        KS.showTextOverlay(`Threshold: ${state.compressorThreshold}dB`);
    };

    KS.adjustCompressorRatio = function adjustCompressorRatio(direction) {
        const ratios = [1, 2, 3, 4, 6, 8, 12, 20];
        const currentIndex = ratios.indexOf(state.compressorRatio);
        let newIndex;

        if (direction === 'up') {
            newIndex = Math.min(ratios.length - 1, currentIndex + 1);
        } else {
            newIndex = Math.max(0, currentIndex - 1);
        }

        state.compressorRatio = ratios[newIndex];
        settings.compressorRatio = state.compressorRatio;
        KS.saveSettings();
        KS.updateCompressor();
        KS.showTextOverlay(`Ratio: ${state.compressorRatio}:1`);
    };

    KS.adjustFFZGain = function adjustFFZGain(direction) {
        const step = 0.1;
        const min = 0.5;
        const max = 3;

        if (direction === 'up') {
            state.ffzGainAmount = Math.min(max, state.ffzGainAmount + step);
        } else {
            state.ffzGainAmount = Math.max(min, state.ffzGainAmount - step);
        }

        state.ffzGainAmount = Math.round(state.ffzGainAmount * 10) / 10;
        settings.ffzGainAmount = state.ffzGainAmount;
        KS.saveSettings();
        KS.updateAudioProcessing();
        KS.showTextOverlay(`FFZ Gain: ${state.ffzGainAmount.toFixed(1)}x`);
        KS.updateControlPanelState();
    };

    const playbackConfig = (KS.config && KS.config.playback) || {};
    const speedOptions = (Array.isArray(playbackConfig.speedOptions) && playbackConfig.speedOptions.length > 0)
        ? playbackConfig.speedOptions.slice()
        : [0.25, 0.5, 0.75, 1, 1.1, 1.25, 1.5, 1.75, 2];

    KS.changePlaybackSpeed = function changePlaybackSpeed(direction) {
        const video = KS.getVideoElement();
        if (!video) {
            return;
        }

        const currentIndex = speedOptions.indexOf(state.currentPlaybackRate);
        const defaultIndex = speedOptions.indexOf(1) !== -1 ? speedOptions.indexOf(1) : 0;
        let newIndex;

        if (direction === 'up') {
            newIndex = Math.min(speedOptions.length - 1, currentIndex + 1);
        } else if (direction === 'down') {
            newIndex = Math.max(0, currentIndex - 1);
        } else {
            newIndex = defaultIndex;
        }

        if (currentIndex === -1) {
            newIndex = direction === 'down'
                ? Math.max(0, defaultIndex - 1)
                : defaultIndex;
        }

        state.currentPlaybackRate = speedOptions[newIndex];
        video.playbackRate = state.currentPlaybackRate;
        settings.playbackSpeed = state.currentPlaybackRate;
        KS.saveSettings();
        KS.showSpeedOverlay(state.currentPlaybackRate);
        KS.updateControlPanelState();
    };

    KS.setPlaybackSpeed = function setPlaybackSpeed(speed) {
        const video = KS.getVideoElement();
        if (!video) {
            return;
        }

        state.currentPlaybackRate = speed;
        video.playbackRate = state.currentPlaybackRate;
        settings.playbackSpeed = state.currentPlaybackRate;
        KS.saveSettings();
        KS.showSpeedOverlay(state.currentPlaybackRate);
    };

    KS.toggleVolumeBoost = function toggleVolumeBoost() {
        state.volumeBoostEnabled = !state.volumeBoostEnabled;
        settings.volumeBoostEnabled = state.volumeBoostEnabled;
        KS.saveSettings();
        KS.updateAudioProcessing();
        KS.updateControlPanelState();

        if (state.volumeBoostEnabled || state.volumeNormalizationEnabled || state.compressorEnabled) {
            if (KS.startSafetyMonitor) {
                KS.startSafetyMonitor();
            }
        }

        const overlayText = state.volumeBoostEnabled ? `Boost ON (+${state.volumeBoostAmount}dB)` : 'Boost OFF';
        KS.showTextOverlay(overlayText);
    };

    KS.adjustVolumeBoost = function adjustVolumeBoost(direction) {
        const step = 1;
        const min = 0;
        const max = 20;

        if (direction === 'up') {
            state.volumeBoostAmount = Math.min(max, state.volumeBoostAmount + step);
        } else {
            state.volumeBoostAmount = Math.max(min, state.volumeBoostAmount - step);
        }

        settings.volumeBoostAmount = state.volumeBoostAmount;
        KS.saveSettings();
        KS.updateAudioProcessing();
        KS.showTextOverlay(`Boost: +${state.volumeBoostAmount}dB`);
    };

    KS.toggleVolumeNormalization = function toggleVolumeNormalization() {
        if (!state.volumeNormalizationEnabled && state.ffzModeEnabled) {
            KS.showTextOverlay('Disable FFZ Mode to use normalization');
            return;
        }

        state.volumeNormalizationEnabled = !state.volumeNormalizationEnabled;
        settings.volumeNormalizationEnabled = state.volumeNormalizationEnabled;
        KS.saveSettings();

        if (state.loudnessNormalizer) {
            state.loudnessNormalizer.setTarget(state.normalizationTargetLufs);
            if (state.volumeNormalizationEnabled) {
                state.loudnessNormalizer.enable();
            } else {
                state.loudnessNormalizer.disable();
            }
        }

        KS.updateAudioProcessing();

        if (state.volumeBoostEnabled || state.volumeNormalizationEnabled || state.compressorEnabled) {
            if (KS.startSafetyMonitor) {
                KS.startSafetyMonitor();
            }
        }

        KS.showTextOverlay(state.volumeNormalizationEnabled ? 'Normalization ON' : 'Normalization OFF');
        KS.updateControlPanelState();
    };

    KS.toggleDebugLogging = function toggleDebugLogging() {
        state.debugLoggingEnabled = !state.debugLoggingEnabled;
        settings.debugLoggingEnabled = state.debugLoggingEnabled;
        KS.saveSettings();
        KS.updateControlPanelState();
        KS.showTextOverlay(state.debugLoggingEnabled ? 'Debug logs ON' : 'Debug logs OFF');
    };

    KS.togglePiPGuard = function togglePiPGuard() {
        state.pipGuardEnabled = !state.pipGuardEnabled;
        settings.pipGuardEnabled = state.pipGuardEnabled;
        KS.saveSettings();
        if (!state.pipGuardEnabled) {
            KS._suppressPiP = false;
            try { document.dispatchEvent(new CustomEvent('kickscroll-suppress-pip-off')); } catch (e) { }
        }
        KS.updateControlPanelState();
        KS.showTextOverlay(state.pipGuardEnabled ? 'PiP Guard ON' : 'PiP Guard OFF');
    };

    KS.setupControlPanelEvents = function setupControlPanelEvents() {
        if (!controlPanel) {
            return;
        }

        if (state.panelEventsBound) {
            log.debug('Control panel events already bound; skipping rebind');
            return;
        }
        state.panelEventsBound = true;

        const panelToggle = controlPanel.querySelector('#panel-toggle');
        const panelContent = controlPanel.querySelector('#panel-content');
        const panelHeader = controlPanel.querySelector('.control-panel-header');

        state.panelToggleRef = panelToggle;
        state.panelContentRef = panelContent;
        state.controlPanelRef = controlPanel;

        controlPanel.classList.add('collapsed');
        controlPanel.classList.remove('expanded');

        const togglePanel = (event) => {
            log.debug('Panel toggle requested', {
                target: event && event.target ? event.target.tagName : 'unknown',
                isCollapsed: state.isPanelCollapsed,
                hasPanel: !!controlPanel,
                hasContent: !!panelContent,
                hasToggle: !!panelToggle,
                panelHidden: controlPanel.classList.contains('controls-hidden')
            });
            if (KS.cancelAutoCollapse) {
                KS.cancelAutoCollapse();
            }
            state.isPanelCollapsed = !state.isPanelCollapsed;

            if (state.isPanelCollapsed) {
                controlPanel.classList.add('collapsed');
                controlPanel.classList.remove('expanded');
                panelContent.style.display = 'none';
                panelToggle.textContent = '▶';
                log.debug('Panel collapsed');
            } else {
                controlPanel.classList.remove('collapsed');
                controlPanel.classList.add('expanded');
                panelContent.style.display = 'block';
                panelToggle.textContent = '▼';
                log.debug('Panel expanded');
            }
        };

        panelHeader.addEventListener('click', (event) => {
            log.debug('Panel header click', {
                target: event && event.target ? event.target.tagName : 'unknown',
                currentTarget: event && event.currentTarget ? event.currentTarget.tagName : 'unknown',
                isCollapsed: state.isPanelCollapsed,
                panelHidden: controlPanel.classList.contains('controls-hidden')
            });
            togglePanel(event);
        });

        controlPanel.addEventListener('click', () => {
            if (KS.resumeAudioContext) {
                KS.resumeAudioContext();
            }
        });

        controlPanel.addEventListener('mouseenter', () => {
            KS.cancelAutoCollapse();
        });

        const boostToggle = controlPanel.querySelector('#boost-toggle');
        const boostUp = controlPanel.querySelector('#boost-up');
        const boostDown = controlPanel.querySelector('#boost-down');

        boostToggle.addEventListener('click', () => {
            KS.toggleVolumeBoost();
            KS.updateControlPanelState();
        });

        boostUp.addEventListener('click', () => {
            KS.adjustVolumeBoost('up');
            KS.updateControlPanelState();
        });

        boostDown.addEventListener('click', () => {
            KS.adjustVolumeBoost('down');
            KS.updateControlPanelState();
        });

        const normalizeToggle = controlPanel.querySelector('#normalize-toggle');
        const targetUp = controlPanel.querySelector('#target-up');
        const targetDown = controlPanel.querySelector('#target-down');

        normalizeToggle.addEventListener('click', () => {
            KS.toggleVolumeNormalization();
        });

        targetUp.addEventListener('click', () => {
            KS.adjustNormalizationTarget('up');
        });

        targetDown.addEventListener('click', () => {
            KS.adjustNormalizationTarget('down');
        });

        const compressorToggle = controlPanel.querySelector('#compressor-toggle');
        const thresholdUp = controlPanel.querySelector('#threshold-up');
        const thresholdDown = controlPanel.querySelector('#threshold-down');
        const ratioUp = controlPanel.querySelector('#ratio-up');
        const ratioDown = controlPanel.querySelector('#ratio-down');
        const ffzModeToggle = controlPanel.querySelector('#ffz-mode-toggle');
        const ffzGainUp = controlPanel.querySelector('#ffz-gain-up');
        const ffzGainDown = controlPanel.querySelector('#ffz-gain-down');

        compressorToggle.addEventListener('click', () => {
            KS.toggleCompressor();
        });

        ffzModeToggle.addEventListener('click', () => {
            KS.toggleFFZMode();
        });

        thresholdUp.addEventListener('click', () => {
            KS.adjustCompressorThreshold('up');
            KS.updateControlPanelState();
        });

        thresholdDown.addEventListener('click', () => {
            KS.adjustCompressorThreshold('down');
            KS.updateControlPanelState();
        });

        ratioUp.addEventListener('click', () => {
            KS.adjustCompressorRatio('up');
            KS.updateControlPanelState();
        });

        ratioDown.addEventListener('click', () => {
            KS.adjustCompressorRatio('down');
            KS.updateControlPanelState();
        });

        ffzGainUp.addEventListener('click', () => {
            KS.adjustFFZGain('up');
        });

        ffzGainDown.addEventListener('click', () => {
            KS.adjustFFZGain('down');
        });

        const speedUp = controlPanel.querySelector('#speed-up');
        const speedDown = controlPanel.querySelector('#speed-down');
        const speedReset = controlPanel.querySelector('#speed-reset');

        speedUp.addEventListener('click', () => {
            KS.changePlaybackSpeed('up');
        });

        speedDown.addEventListener('click', () => {
            KS.changePlaybackSpeed('down');
        });

        speedReset.addEventListener('click', () => {
            KS.changePlaybackSpeed('reset');
        });

        const presetButtons = controlPanel.querySelectorAll('.preset-btn');
        presetButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const speed = parseFloat(btn.dataset.speed);
                KS.setPlaybackSpeed(speed);
                KS.updateControlPanelState();
            });
        });

        const bitrateToggle = controlPanel.querySelector('#bitrate-toggle');
        const overlayToggle = controlPanel.querySelector('#overlay-toggle');
        const bitrateMode = controlPanel.querySelector('#bitrate-mode');
        const bitrateUnitBtn = controlPanel.querySelector('#bitrate-unit');
        const bitrateReset = controlPanel.querySelector('#bitrate-reset');

        if (bitrateToggle) {
            bitrateToggle.addEventListener('click', () => {
                KS.toggleBitrateMonitor();
            });
        }

        if (overlayToggle) {
            overlayToggle.addEventListener('click', () => {
                KS.toggleBitrateOverlay();
            });
        }

        if (bitrateMode) {
            bitrateMode.addEventListener('click', () => {
                KS.cycleBitrateDisplayMode();
            });
        }

        if (bitrateUnitBtn) {
            bitrateUnitBtn.addEventListener('click', () => {
                KS.cycleBitrateUnit();
            });
        }

        if (bitrateReset) {
            bitrateReset.addEventListener('click', () => {
                KS.resetBitrateMinMax();
            });
        }

        const refreshUp = controlPanel.querySelector('#refresh-up');
        const refreshDown = controlPanel.querySelector('#refresh-down');

        if (refreshUp) {
            refreshUp.addEventListener('click', () => {
                KS.adjustRefreshRate('up');
            });
        }

        if (refreshDown) {
            refreshDown.addEventListener('click', () => {
                KS.adjustRefreshRate('down');
            });
        }

        const opacityUp = controlPanel.querySelector('#opacity-up');
        const opacityDown = controlPanel.querySelector('#opacity-down');

        if (opacityUp) {
            opacityUp.addEventListener('click', () => {
                KS.adjustOpacity('up');
            });
        }

        if (opacityDown) {
            opacityDown.addEventListener('click', () => {
                KS.adjustOpacity('down');
            });
        }

        const colorCycle = controlPanel.querySelector('#color-cycle');

        if (colorCycle) {
            colorCycle.addEventListener('click', (event) => {
                event.stopPropagation();
                KS.showColorPicker();
            });
        }

        const debugToggle = controlPanel.querySelector('#debug-toggle');

        if (debugToggle) {
            debugToggle.addEventListener('click', () => {
                KS.toggleDebugLogging();
            });
        }

        const pipGuardToggle = controlPanel.querySelector('#pip-guard-toggle');

        if (pipGuardToggle) {
            pipGuardToggle.addEventListener('click', () => {
                KS.togglePiPGuard();
            });
        }
    };

    KS.updateControlPanelState = function updateControlPanelState() {
        if (!controlPanel || !controlPanel.parentElement) {
            return;
        }

        const boostToggle = controlPanel.querySelector('#boost-toggle .btn-text');
        const boostValue = controlPanel.querySelector('#boost-value');
        if (boostToggle) {
            boostToggle.textContent = state.volumeBoostEnabled ? 'ON' : 'OFF';
            boostToggle.parentElement.classList.toggle('active', state.volumeBoostEnabled);
        }
        if (boostValue) {
            boostValue.textContent = `${state.volumeBoostAmount}dB`;
        }

        const normalizeToggle = controlPanel.querySelector('#normalize-toggle .btn-text');
        if (normalizeToggle) {
            normalizeToggle.textContent = state.volumeNormalizationEnabled ? 'ON' : 'OFF';
            normalizeToggle.parentElement.classList.toggle('active', state.volumeNormalizationEnabled);
        }

        const targetValue = controlPanel.querySelector('#target-value');
        if (targetValue) {
            const displayTarget = Math.round(state.normalizationTargetLufs * 10) / 10;
            targetValue.textContent = `${displayTarget} LUFS`;
        }
        const compensationElement = controlPanel.querySelector('#normalization-compensation');
        if (compensationElement) {
            if (state.loudnessNormalizer) {
                state.loudnessNormalizer.setDisplayElement(compensationElement);
            } else {
                compensationElement.textContent = '';
            }
        }

        const compressorToggle = controlPanel.querySelector('#compressor-toggle .btn-text');
        if (compressorToggle) {
            compressorToggle.textContent = state.compressorEnabled ? 'ON' : 'OFF';
            compressorToggle.parentElement.classList.toggle('active', state.compressorEnabled);
        }
        const ffzModeToggle = controlPanel.querySelector('#ffz-mode-toggle .btn-text');
        if (ffzModeToggle) {
            ffzModeToggle.textContent = state.ffzModeEnabled ? 'FFZ ON' : 'FFZ';
            ffzModeToggle.parentElement.classList.toggle('active', state.ffzModeEnabled);
        }

        const thresholdValue = controlPanel.querySelector('#threshold-value');
        const ratioValue = controlPanel.querySelector('#ratio-value');
        const ffzGainValue = controlPanel.querySelector('#ffz-gain-value');
        if (thresholdValue) {
            thresholdValue.textContent = `${state.compressorThreshold}dB`;
        }
        if (ratioValue) {
            ratioValue.textContent = `${state.compressorRatio}:1`;
        }
        if (ffzGainValue) {
            ffzGainValue.textContent = `${state.ffzGainAmount.toFixed(1)}x`;
        }

        const speedValue = controlPanel.querySelector('#speed-value');
        if (speedValue) {
            speedValue.textContent = `${state.currentPlaybackRate}x`;
        }

        const presetButtons = controlPanel.querySelectorAll('.preset-btn');
        presetButtons.forEach((btn) => {
            const speed = parseFloat(btn.dataset.speed);
            btn.classList.toggle('active', speed === state.currentPlaybackRate);
        });

        const bitrateToggle = controlPanel.querySelector('#bitrate-toggle .btn-text');
        if (bitrateToggle) {
            bitrateToggle.textContent = state.bitrateMonitorEnabled ? 'ON' : 'OFF';
            bitrateToggle.parentElement.classList.toggle('active', state.bitrateMonitorEnabled);
        }

        const overlayToggle = controlPanel.querySelector('#overlay-toggle .btn-text');
        if (overlayToggle) {
            overlayToggle.textContent = state.bitrateOverlayVisible ? 'ON' : 'OFF';
            overlayToggle.parentElement.classList.toggle('active', state.bitrateOverlayVisible);
        }

        const bitrateModeBtn = controlPanel.querySelector('#bitrate-mode');
        if (bitrateModeBtn) {
            const modeNames = {
                current: 'Current',
                average: 'Average',
                both: 'Both',
                minmax: 'Min/Max'
            };
            bitrateModeBtn.textContent = modeNames[state.bitrateDisplayMode] || 'Current';
        }

        const bitrateUnitBtn = controlPanel.querySelector('#bitrate-unit');
        if (bitrateUnitBtn) {
            bitrateUnitBtn.textContent = state.bitrateUnit;
        }

        const refreshValue = controlPanel.querySelector('#refresh-value');
        if (refreshValue) {
            const seconds = state.bitrateRefreshRate / 1000;
            refreshValue.textContent = `${seconds}s`;
        }

        const opacityValue = controlPanel.querySelector('#opacity-value');
        if (opacityValue) {
            opacityValue.textContent = `${Math.round(state.bitrateOpacity * 100)}%`;
        }

        const debugToggle = controlPanel.querySelector('#debug-toggle .btn-text');
        if (debugToggle) {
            debugToggle.textContent = state.debugLoggingEnabled ? 'ON' : 'OFF';
            debugToggle.parentElement.classList.toggle('active', state.debugLoggingEnabled);
        }

        const pipGuardToggle = controlPanel.querySelector('#pip-guard-toggle .btn-text');
        if (pipGuardToggle) {
            pipGuardToggle.textContent = state.pipGuardEnabled ? 'ON' : 'OFF';
            pipGuardToggle.parentElement.classList.toggle('active', state.pipGuardEnabled);
        }
    };
})();
