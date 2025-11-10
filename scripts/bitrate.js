(() => {
    const KS = window.KickScroll;
    const { log, state, dom, constants } = KS;

    function resetMseMonitorState() {
        state.mseMonitorState.segmentBytes = 0;
        state.mseMonitorState.segmentWindowStart = 0;
    }

    function pushBitrateSample(bitrateMbps, limit = constants.BITRATE_HISTORY_LIMIT_DEFAULT) {
        if (!Number.isFinite(bitrateMbps) || bitrateMbps <= 0 || bitrateMbps > 100) {
            return;
        }
        state.bitrateHistory.push(bitrateMbps);
        if (state.bitrateHistory.length > limit) {
            state.bitrateHistory.splice(0, state.bitrateHistory.length - limit);
        }
    }

    function refreshCurrentBitrate() {
        if (state.bitrateHistory.length === 0) {
            state.currentBitrate = 0;
            return;
        }
        const sliceStart = Math.max(0, state.bitrateHistory.length - 3);
        const recent = state.bitrateHistory.slice(sliceStart);
        const sum = recent.reduce((acc, value) => acc + value, 0);
        state.currentBitrate = sum / recent.length;
        if (state.currentBitrate > 0) {
            state.minBitrate = Math.min(state.minBitrate, state.currentBitrate);
            state.maxBitrate = Math.max(state.maxBitrate, state.currentBitrate);
        }
    }

    function isMediaSegmentUrl(url) {
        if (!url) {
            return false;
        }
        const lowered = String(url).toLowerCase();
        return lowered.includes('.ts') || lowered.includes('.m4s') || lowered.includes('segment') || lowered.includes('chunk');
    }

    KS.enableFetchInterceptor = function enableFetchInterceptor() {
        if (state.fetchInterceptorActive || typeof window === 'undefined' || typeof window.fetch !== 'function') {
            return;
        }

        state.originalFetch = window.fetch;
        window.fetch = function patchedFetch(...args) {
            const result = state.originalFetch.apply(this, args);
            if (!result || typeof result.then !== 'function') {
                return result;
            }
            return result.then((response) => {
                if (!state.bitrateInstrumentationActive) {
                    return response;
                }
                try {
                    const request = args[0];
                    const url = typeof request === 'string' ? request : (request && request.url) ? request.url : '';
                    if (!isMediaSegmentUrl(url)) {
                        return response;
                    }
                    const cloned = response.clone();
                    cloned.arrayBuffer().then((buffer) => {
                        const size = buffer.byteLength;
                        state.totalBytesLoaded += size;
                        if (size > 10000) {
                            const estimatedSegmentDuration = 3;
                            const bitrateMbps = (size * 8) / (estimatedSegmentDuration * 1000000);
                            pushBitrateSample(bitrateMbps, constants.BITRATE_HISTORY_LIMIT_MSE);
                            refreshCurrentBitrate();
                            log.debug(`Segment: ${(size / 1024).toFixed(0)}KB, Est bitrate: ${bitrateMbps.toFixed(2)} Mbps`);
                        }
                    }).catch(() => {});
                } catch (error) {
                    log.debug('Fetch interception error:', error.message);
                }
                return response;
            });
        };

        state.fetchInterceptorActive = true;
        log.info('Network request monitoring active');
    };

    KS.disableFetchInterceptor = function disableFetchInterceptor() {
        if (!state.fetchInterceptorActive) {
            return;
        }
        try {
            if (state.originalFetch) {
                window.fetch = state.originalFetch;
            }
        } catch (error) {
            log.debug('Failed to restore window.fetch:', error.message);
        }
        state.originalFetch = null;
        state.fetchInterceptorActive = false;
    };

    KS.enableSourceBufferInterceptor = function enableSourceBufferInterceptor() {
        if (state.sourceBufferInterceptorActive || typeof window === 'undefined') {
            return;
        }
        const SourceBufferProto = window.SourceBuffer && window.SourceBuffer.prototype;
        if (!SourceBufferProto || typeof SourceBufferProto.appendBuffer !== 'function') {
            return;
        }

        state.originalAppendBuffer = SourceBufferProto.appendBuffer;
        SourceBufferProto.appendBuffer = function appendBufferWrapper(data) {
            if (state.bitrateInstrumentationActive && data) {
                const now = performance.now();
                const size = typeof data.byteLength === 'number' ? data.byteLength : (data.buffer && data.buffer.byteLength) || 0;
                if (!size) {
                    return state.originalAppendBuffer.call(this, data);
                }
                state.mseMonitorState.segmentBytes += size;
                state.totalBytesLoaded += size;
                if (!state.mseMonitorState.segmentWindowStart) {
                    state.mseMonitorState.segmentWindowStart = now;
                }
                const elapsed = now - state.mseMonitorState.segmentWindowStart;
                if (elapsed >= state.mseMonitorState.measurementWindowMs) {
                    const seconds = elapsed / 1000;
                    const bytesPerSecond = state.mseMonitorState.segmentBytes / Math.max(seconds, 0.001);
                    const bitrateMbps = (bytesPerSecond * 8) / 1000000;
                    pushBitrateSample(bitrateMbps, constants.BITRATE_HISTORY_LIMIT_MSE);
                    refreshCurrentBitrate();
                    state.mseMonitorState.segmentBytes = 0;
                    state.mseMonitorState.segmentWindowStart = now;
                }
            }
            return state.originalAppendBuffer.call(this, data);
        };

        state.sourceBufferInterceptorActive = true;
        log.info('MSE SourceBuffer monitoring active');
    };

    KS.disableSourceBufferInterceptor = function disableSourceBufferInterceptor() {
        if (!state.sourceBufferInterceptorActive) {
            return;
        }
        try {
            if (state.originalAppendBuffer && window.SourceBuffer && window.SourceBuffer.prototype) {
                window.SourceBuffer.prototype.appendBuffer = state.originalAppendBuffer;
            }
        } catch (error) {
            log.debug('Failed to restore SourceBuffer.appendBuffer:', error.message);
        }
        state.originalAppendBuffer = null;
        state.sourceBufferInterceptorActive = false;
        resetMseMonitorState();
    };

    function convertBitrateUnit(bitrateMbps) {
        switch (state.bitrateUnit) {
            case 'kbps':
                return { value: bitrateMbps * 1000, unit: 'kbps' };
            case 'Mbps':
                return { value: bitrateMbps, unit: 'Mbps' };
            case 'kBps':
                return { value: (bitrateMbps * 1000) / 8, unit: 'kB/s' };
            case 'MBps':
                return { value: bitrateMbps / 8, unit: 'MB/s' };
            default:
                return { value: bitrateMbps, unit: 'Mbps' };
        }
    }

    function formatBitrate(bitrateMbps, decimals = 2) {
        const converted = convertBitrateUnit(bitrateMbps);
        return `${converted.value.toFixed(decimals)} ${converted.unit}`;
    }

    function getQualityIndicator(bitrateMbps) {
        if (bitrateMbps >= 8) return { emoji: '🟢', text: 'Excellent' };
        if (bitrateMbps >= 5) return { emoji: '🟡', text: 'Good' };
        if (bitrateMbps >= 2.5) return { emoji: '🟠', text: 'Fair' };
        if (bitrateMbps > 0) return { emoji: '🔴', text: 'Poor' };
        return { emoji: '⚫', text: 'N/A' };
    }

    KS.updateBitrateDisplay = function updateBitrateDisplay() {
        const bitrateDisplay = document.querySelector('#bitrate-display');
        if (!bitrateDisplay) {
            return;
        }

        if (!state.bitrateMonitorEnabled || state.currentBitrate === 0) {
            bitrateDisplay.textContent = `-- ${state.bitrateUnit}`;
            return;
        }

        let displayText = '';
        const quality = getQualityIndicator(state.currentBitrate);

        switch (state.bitrateDisplayMode) {
            case 'current':
                displayText = `${quality.emoji} ${formatBitrate(state.currentBitrate)}`;
                break;
            case 'average':
                if (state.bitrateHistory.length > 0) {
                    const avg = state.bitrateHistory.reduce((a, b) => a + b, 0) / state.bitrateHistory.length;
                    displayText = `${quality.emoji} ${formatBitrate(avg)} (avg)`;
                } else {
                    displayText = `-- ${state.bitrateUnit}`;
                }
                break;
            case 'both':
                if (state.bitrateHistory.length > 0) {
                    const avgBoth = state.bitrateHistory.reduce((a, b) => a + b, 0) / state.bitrateHistory.length;
                    displayText = `${formatBitrate(state.currentBitrate)} / ${formatBitrate(avgBoth)}`;
                } else {
                    displayText = formatBitrate(state.currentBitrate);
                }
                break;
            case 'minmax':
                if (state.maxBitrate > 0 && state.minBitrate !== Infinity) {
                    displayText = `${formatBitrate(state.currentBitrate)} (${formatBitrate(state.minBitrate, 1)}-${formatBitrate(state.maxBitrate, 1)})`;
                } else {
                    displayText = formatBitrate(state.currentBitrate);
                }
                break;
        }

        bitrateDisplay.textContent = displayText;
    };

    KS.updateBitrateOverlay = function updateBitrateOverlay() {
        const overlay = dom.bitrateOverlay;
        if (!overlay) {
            return;
        }

        if (!state.bitrateMonitorEnabled || !state.bitrateOverlayVisible) {
            overlay.style.opacity = '0';
            overlay.textContent = '';
            return;
        }

        if (state.currentBitrate === 0) {
            overlay.textContent = '⏳ Waiting...';
            overlay.style.opacity = '1';
            return;
        }

        const quality = getQualityIndicator(state.currentBitrate);
        let overlayText = '';

        switch (state.bitrateDisplayMode) {
            case 'current':
                overlayText = `${quality.emoji} ${formatBitrate(state.currentBitrate)}`;
                break;
            case 'average':
                if (state.bitrateHistory.length > 0) {
                    const avg = state.bitrateHistory.reduce((a, b) => a + b, 0) / state.bitrateHistory.length;
                    overlayText = `${quality.emoji} ${formatBitrate(avg)}`;
                } else {
                    overlayText = `${quality.emoji} ${formatBitrate(state.currentBitrate)}`;
                }
                break;
            case 'both':
                if (state.bitrateHistory.length > 0) {
                    const avgBoth = state.bitrateHistory.reduce((a, b) => a + b, 0) / state.bitrateHistory.length;
                    overlayText = `${formatBitrate(state.currentBitrate)}\n${formatBitrate(avgBoth)} avg`;
                } else {
                    overlayText = formatBitrate(state.currentBitrate);
                }
                break;
            case 'minmax':
                if (state.maxBitrate > 0 && state.minBitrate !== Infinity) {
                    overlayText = `${formatBitrate(state.currentBitrate)}\n↓${formatBitrate(state.minBitrate, 1)} ↑${formatBitrate(state.maxBitrate, 1)}`;
                } else {
                    overlayText = formatBitrate(state.currentBitrate);
                }
                break;
        }

        overlay.textContent = overlayText;
        overlay.style.opacity = '1';
        overlay.style.setProperty('background-color', `rgba(0, 0, 0, ${state.bitrateOpacity})`, 'important');
        overlay.style.setProperty('color', state.bitrateTextColor, 'important');
        overlay.style.setProperty('text-shadow', `0 0 10px ${state.bitrateTextColor}80`, 'important');
        overlay.style.setProperty('border-color', `${state.bitrateTextColor}4D`, 'important');
    };

    KS.startBitrateMonitoring = function startBitrateMonitoring(video) {
        if (!state.bitrateMonitorEnabled || !video) {
            return;
        }

        KS.stopBitrateMonitoring();
        log.info('Starting bitrate monitoring...');

        KS.enableFetchInterceptor();
        KS.enableSourceBufferInterceptor();
        resetMseMonitorState();
        state.bitrateInstrumentationActive = true;

        let bytesReceived = typeof video.webkitVideoDecodedByteCount === 'number'
            ? video.webkitVideoDecodedByteCount
            : 0;
        let lastCheckTime = Date.now();

        const monitorVideoStats = () => {
            try {
                if (!video) {
                    return;
                }

                const now = performance.now();
                const perfEntries = performance.getEntriesByType('resource');
                let recentBytes = 0;
                let recentCount = 0;

                perfEntries.forEach((entry) => {
                    if (entry.responseEnd > now - 5000 && entry.transferSize > 0 && isMediaSegmentUrl(entry.name)) {
                        recentBytes += entry.transferSize;
                        recentCount++;
                    }
                });

                if (recentBytes > 0 && recentCount > 0) {
                    const avgSegmentSize = recentBytes / recentCount;
                    const bitrateMbps = (avgSegmentSize * 8) / (3 * 1000000);
                    if (bitrateMbps > 0.1 && bitrateMbps < 50) {
                        pushBitrateSample(bitrateMbps, constants.BITRATE_HISTORY_LIMIT_DEFAULT);
                        log.debug(`Perf API: ${recentCount} segments, ${(recentBytes / 1024).toFixed(0)}KB, ${bitrateMbps.toFixed(2)} Mbps`);
                    }
                }

                if (typeof video.webkitVideoDecodedByteCount === 'number') {
                    const decodedBytes = video.webkitVideoDecodedByteCount;
                    const currentTime = Date.now();
                    const timeDelta = (currentTime - lastCheckTime) / 1000;

                    if (timeDelta > 0) {
                        const bytesDelta = decodedBytes - bytesReceived;
                        if (bytesDelta > 0) {
                            const bitrateMbps = (bytesDelta * 8) / (timeDelta * 1000000);
                            if (bitrateMbps > 0.1 && bitrateMbps < 50) {
                                pushBitrateSample(bitrateMbps, constants.BITRATE_HISTORY_LIMIT_DEFAULT);
                                log.debug(`Decoded: ${bitrateMbps.toFixed(2)} Mbps`);
                            }
                        }
                    }

                    bytesReceived = decodedBytes;
                    lastCheckTime = currentTime;
                }

                if (state.bitrateHistory.length === 0) {
                    log.debug('No bitrate data yet');
                }

                refreshCurrentBitrate();
            } catch (error) {
                log.error('Bitrate monitoring error:', error);
            }
        };

        monitorVideoStats();
        KS.updateBitrateDisplay();
        KS.updateBitrateOverlay();

        state.bitrateUpdateInterval = setInterval(() => {
            monitorVideoStats();
            KS.updateBitrateDisplay();
            KS.updateBitrateOverlay();
        }, state.bitrateRefreshRate);

        log.info('Bitrate monitoring started');
    };

    KS.stopBitrateMonitoring = function stopBitrateMonitoring() {
        state.bitrateInstrumentationActive = false;
        KS.disableFetchInterceptor();
        KS.disableSourceBufferInterceptor();
        if (state.bitrateUpdateInterval) {
            clearInterval(state.bitrateUpdateInterval);
            state.bitrateUpdateInterval = null;
        }
        state.bitrateHistory = [];
        state.currentBitrate = 0;
        state.minBitrate = Infinity;
        state.maxBitrate = 0;
        state.lastBufferSize = 0;
        state.lastBufferTime = 0;
        resetMseMonitorState();
        KS.updateBitrateDisplay();
        KS.updateBitrateOverlay();

        const overlay = dom.bitrateOverlay;
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.textContent = '';
        }
    };

    KS.toggleBitrateMonitor = function toggleBitrateMonitor() {
        state.bitrateMonitorEnabled = !state.bitrateMonitorEnabled;
        KS.settings.bitrateMonitorEnabled = state.bitrateMonitorEnabled;
        KS.saveSettings();

        const video = KS.getVideoElement();
        if (state.bitrateMonitorEnabled) {
            KS.startBitrateMonitoring(video);
            if (KS.showTextOverlay) {
                KS.showTextOverlay('Bitrate Monitor ON');
            }
        } else {
            KS.stopBitrateMonitoring();
            if (KS.showTextOverlay) {
                KS.showTextOverlay('Bitrate Monitor OFF');
            }
        }

        if (KS.updateControlPanelState) {
            KS.updateControlPanelState();
        }
    };

    KS.toggleBitrateOverlay = function toggleBitrateOverlay() {
        state.bitrateOverlayVisible = !state.bitrateOverlayVisible;
        KS.settings.bitrateOverlayVisible = state.bitrateOverlayVisible;
        KS.saveSettings();

        KS.attachBitrateOverlayToPage();

        setTimeout(() => {
            KS.updateBitrateOverlay();
        }, 50);

        if (KS.showTextOverlay) {
            KS.showTextOverlay(state.bitrateOverlayVisible ? 'Overlay ON' : 'Overlay OFF');
        }
        if (KS.updateControlPanelState) {
            KS.updateControlPanelState();
        }
    };

    KS.cycleBitrateDisplayMode = function cycleBitrateDisplayMode() {
        const modes = ['current', 'average', 'both', 'minmax'];
        const currentIndex = modes.indexOf(state.bitrateDisplayMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        state.bitrateDisplayMode = modes[nextIndex];

        KS.settings.bitrateDisplayMode = state.bitrateDisplayMode;
        KS.saveSettings();

        const modeNames = {
            current: 'Current',
            average: 'Average',
            both: 'Both',
            minmax: 'Min/Max'
        };

        if (KS.showTextOverlay) {
            KS.showTextOverlay(`Mode: ${modeNames[state.bitrateDisplayMode]}`);
        }
        if (KS.updateControlPanelState) {
            KS.updateControlPanelState();
        }
        KS.updateBitrateDisplay();
        KS.updateBitrateOverlay();
    };

    KS.cycleBitrateUnit = function cycleBitrateUnit() {
        const units = ['Mbps', 'kbps', 'MBps', 'kBps'];
        const currentIndex = units.indexOf(state.bitrateUnit);
        const nextIndex = (currentIndex + 1) % units.length;
        state.bitrateUnit = units[nextIndex];

        KS.settings.bitrateUnit = state.bitrateUnit;
        KS.saveSettings();

        if (KS.showTextOverlay) {
            KS.showTextOverlay(`Unit: ${state.bitrateUnit}`);
        }
        if (KS.updateControlPanelState) {
            KS.updateControlPanelState();
        }
        KS.updateBitrateDisplay();
        KS.updateBitrateOverlay();
    };

    KS.resetBitrateMinMax = function resetBitrateMinMax() {
        state.minBitrate = state.currentBitrate > 0 ? state.currentBitrate : Infinity;
        state.maxBitrate = state.currentBitrate > 0 ? state.currentBitrate : 0;
        if (KS.showTextOverlay) {
            KS.showTextOverlay('Min/Max Reset');
        }
        KS.updateBitrateDisplay();
        KS.updateBitrateOverlay();
    };

    KS.adjustRefreshRate = function adjustRefreshRate(direction) {
        const rates = [250, 500, 1000, 2000, 5000];
        const currentIndex = rates.indexOf(state.bitrateRefreshRate);
        let newIndex;

        if (direction === 'up') {
            newIndex = Math.min(rates.length - 1, currentIndex + 1);
        } else {
            newIndex = Math.max(0, currentIndex - 1);
        }

        state.bitrateRefreshRate = rates[newIndex];
        KS.settings.bitrateRefreshRate = state.bitrateRefreshRate;
        KS.saveSettings();

        if (state.bitrateMonitorEnabled) {
            const video = KS.getVideoElement();
            KS.stopBitrateMonitoring();
            KS.startBitrateMonitoring(video);
        }

        const seconds = state.bitrateRefreshRate / 1000;
        if (KS.showTextOverlay) {
            KS.showTextOverlay(`Refresh: ${seconds}s`);
        }
        if (KS.updateControlPanelState) {
            KS.updateControlPanelState();
        }
    };

    KS.adjustOpacity = function adjustOpacity(direction) {
        const step = 0.05;

        if (direction === 'up') {
            state.bitrateOpacity = Math.min(1, state.bitrateOpacity + step);
        } else {
            state.bitrateOpacity = Math.max(0.1, state.bitrateOpacity - step);
        }

        KS.settings.bitrateOpacity = state.bitrateOpacity;
        KS.saveSettings();

        if (KS.showTextOverlay) {
            KS.showTextOverlay(`Opacity: ${Math.round(state.bitrateOpacity * 100)}%`);
        }
        KS.updateBitrateOverlay();
        if (KS.updateControlPanelState) {
            KS.updateControlPanelState();
        }
    };

    const configuredColors = (KS.config && KS.config.ui && KS.config.ui.bitrateColors) || null;
    const bitrateColors = (Array.isArray(configuredColors) && configuredColors.length > 0)
        ? configuredColors.map((color) => ({ ...color }))
        : [
            { name: 'Cyan', value: '#00bcd4' },
            { name: 'Green', value: '#4CAF50' },
            { name: 'Yellow', value: '#FFC107' },
            { name: 'Orange', value: '#FF9800' },
            { name: 'Red', value: '#F44336' },
            { name: 'Purple', value: '#9C27B0' },
            { name: 'Blue', value: '#2196F3' },
            { name: 'White', value: '#FFFFFF' }
        ];

    KS.showColorPicker = function showColorPicker() {
        const existingPicker = document.querySelector('#bitrate-color-picker');
        if (existingPicker) {
            existingPicker.remove();
            return;
        }

        const picker = document.createElement('div');
        picker.id = 'bitrate-color-picker';
        picker.className = 'color-picker-menu';

        bitrateColors.forEach((color) => {
            const colorOption = document.createElement('button');
            colorOption.className = 'color-option';
            if (color.value === state.bitrateTextColor) {
                colorOption.classList.add('active');
            }
            colorOption.innerHTML = `
                <span class="color-swatch" style="background-color: ${color.value}"></span>
                <span class="color-name">${color.name}</span>
            `;
            colorOption.addEventListener('click', () => {
                state.bitrateTextColor = color.value;
                KS.settings.bitrateTextColor = state.bitrateTextColor;
                KS.saveSettings();
                if (KS.showTextOverlay) {
                    KS.showTextOverlay(`Color: ${color.name}`);
                }
                KS.updateBitrateOverlay();
                if (KS.updateControlPanelState) {
                    KS.updateControlPanelState();
                }
                picker.remove();
            });
            picker.appendChild(colorOption);
        });

        const colorBtn = document.querySelector('#color-cycle');
        if (colorBtn) {
            const rect = colorBtn.getBoundingClientRect();
            picker.style.position = 'fixed';
            picker.style.top = `${rect.bottom + 5}px`;
            picker.style.right = `${window.innerWidth - rect.right}px`;
        }

        document.body.appendChild(picker);

        setTimeout(() => {
            const closeHandler = (event) => {
                if (!picker.contains(event.target) && event.target.id !== 'color-cycle') {
                    picker.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    };
})();
