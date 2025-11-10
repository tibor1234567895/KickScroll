(() => {
    const KS = window.KickScroll;
    const { utils, log, state, constants } = KS;
    const { clamp, dbToLinear, linearToDb } = utils;

    class LoudnessNormalizer {
        constructor(context, { masterGainProvider } = {}) {
            this.context = context;
            this.masterGainProvider = masterGainProvider || (() => 1);
            this.analyser = null;
            this.gainNode = null;
            this.buffer = null;
            this.enabled = false;
            this.frame = null;
            this.targetLufs = state.normalizationTargetLufs;
            this.currentGainDb = 0;
            this.lastUpdate = performance.now();
            this.silenceTimer = 0;
            this.displayElement = null;
            this.params = {
                attackMs: 120,
                releaseMs: 650,
                gateDb: -60,
                floorDb: -120,
                silenceHoldMs: 400,
                maxTotalGain: 2.5
            };
            this.limits = {
                maxBoostDb: 5,
                softBoostDb: 3,
                maxCutDb: -6
            };
            this.updateDynamicLimits();
        }

        updateDynamicLimits() {
            const normalized = clamp((this.targetLufs + 48) / 38, 0, 1);
            const maxBoost = 3 + normalized * 4;
            const softBoost = maxBoost * 0.6;
            const maxCut = -(3 + (1 - normalized) * 4);
            this.limits.maxBoostDb = maxBoost;
            this.limits.softBoostDb = softBoost;
            this.limits.maxCutDb = maxCut;
        }

        updateNodes({ analyser, gainNode }) {
            if (analyser) {
                this.analyser = analyser;
                this.buffer = new Float32Array(analyser.fftSize || 2048);
            }
            if (gainNode) {
                this.gainNode = gainNode;
                this.gainNode.gain.value = 1;
            }
        }

        setTarget(lufs) {
            this.targetLufs = clamp(lufs, -48, -10);
            this.updateDynamicLimits();
        }

        setDisplayElement(element) {
            this.displayElement = element;
            this.updateDisplay(this.currentGainDb);
        }

        enable() {
            if (this.enabled || !this.analyser || !this.gainNode) {
                return;
            }
            this.enabled = true;
            this.lastUpdate = performance.now();
            this.silenceTimer = 0;
            this.updateDynamicLimits();
            this.schedule();
        }

        disable() {
            if (!this.enabled) {
                return;
            }
            this.enabled = false;
            if (this.frame) {
                cancelAnimationFrame(this.frame);
                this.frame = null;
            }
            this.currentGainDb = 0;
            if (this.gainNode) {
                this.gainNode.gain.setTargetAtTime(1, this.context.currentTime, 0.01);
            }
            this.updateDisplay(0);
        }

        destroy() {
            this.disable();
            this.analyser = null;
            this.gainNode = null;
            this.buffer = null;
            this.displayElement = null;
        }

        schedule() {
            if (!this.enabled || this.frame) {
                return;
            }
            this.frame = requestAnimationFrame(() => this.tick());
        }

        tick() {
            this.frame = null;
            if (!this.enabled || !this.analyser || !this.gainNode) {
                return;
            }

            if (!this.buffer || this.buffer.length !== this.analyser.fftSize) {
                this.buffer = new Float32Array(this.analyser.fftSize || 2048);
            }

            this.analyser.getFloatTimeDomainData(this.buffer);

            let sum = 0;
            for (let i = 0; i < this.buffer.length; i++) {
                const sample = this.buffer[i];
                sum += sample * sample;
            }
            let rms = Math.sqrt(sum / this.buffer.length);
            if (!Number.isFinite(rms)) {
                rms = 0;
            }

            const measuredDb = rms > 0 ? 20 * Math.log10(rms) : this.params.floorDb;
            const now = performance.now();
            const delta = Math.max(now - this.lastUpdate, 1);
            this.lastUpdate = now;

            if (measuredDb < this.params.gateDb) {
                this.silenceTimer += delta;
            } else {
                this.silenceTimer = 0;
            }

            const targetGap = this.targetLufs - measuredDb;
            let desiredGainDb = clamp(targetGap, this.limits.maxCutDb, this.limits.maxBoostDb);

            if (this.silenceTimer > this.params.silenceHoldMs) {
                desiredGainDb = 0;
            } else if (measuredDb < this.targetLufs - 10) {
                desiredGainDb = Math.min(desiredGainDb, this.limits.softBoostDb);
            }

            const increasing = desiredGainDb > this.currentGainDb;
            const smoothingWindow = increasing ? this.params.attackMs : this.params.releaseMs;
            const coeff = Math.exp(-delta / Math.max(smoothingWindow, 1));
            this.currentGainDb = desiredGainDb + (this.currentGainDb - desiredGainDb) * coeff;

            const masterGain = Math.max(this.masterGainProvider(), 0.01);
            const appliedLinear = dbToLinear(this.currentGainDb);
            const combinedGain = appliedLinear * masterGain;

            if (combinedGain > this.params.maxTotalGain) {
                const allowedLinear = this.params.maxTotalGain / masterGain;
                this.currentGainDb = linearToDb(allowedLinear);
                this.gainNode.gain.setTargetAtTime(allowedLinear, this.context.currentTime, 0.01);
            } else {
                this.gainNode.gain.setTargetAtTime(appliedLinear, this.context.currentTime, 0.01);
            }

            this.updateDisplay(this.currentGainDb);
            this.schedule();
        }

        forceCombinedCeiling(maxCombinedLinear) {
            if (!this.gainNode) {
                return;
            }
            const masterGain = Math.max(this.masterGainProvider(), 0.01);
            const allowedLinear = maxCombinedLinear / masterGain;
            const currentLinear = dbToLinear(this.currentGainDb);
            if (currentLinear > allowedLinear) {
                const limited = Math.max(allowedLinear, 0.1);
                this.currentGainDb = linearToDb(limited);
                this.gainNode.gain.setTargetAtTime(limited, this.context.currentTime, 0.01);
                this.updateDisplay(this.currentGainDb);
            }
        }

        updateDisplay(dbValue) {
            if (!this.displayElement) {
                return;
            }
            if (!this.enabled || Math.abs(dbValue) < 0.1) {
                this.displayElement.textContent = '';
                return;
            }
            const rounded = Math.round(dbValue * 10) / 10;
            const sign = rounded > 0 ? '+' : '';
            this.displayElement.textContent = `${sign}${rounded.toFixed(1)} dB`;
        }
    }

    KS.LoudnessNormalizer = LoudnessNormalizer;

    KS.setupAudioProcessing = function setupAudioProcessing(video) {
        try {
            const isNewVideo = state.currentVideo !== video;

            if (!state.audioContext || state.audioContext.state === 'closed') {
                state.audioContext = new (window.AudioContext || window.webkitAudioContext)();

                if (state.audioContext.state === 'suspended') {
                    state.audioContext.resume();
                }

                state.normalizationGainNode = state.audioContext.createGain();
                state.normalizationGainNode.gain.value = 1;
                state.outputGainNode = state.audioContext.createGain();
                state.outputGainNode.gain.value = 1;
                state.analyzerNode = state.audioContext.createAnalyser();
                state.compressorNode = state.audioContext.createDynamicsCompressor();

                state.loudnessNormalizer = new LoudnessNormalizer(state.audioContext, {
                    masterGainProvider: () => (state.outputGainNode ? state.outputGainNode.gain.value : 1)
                });
                state.loudnessNormalizer.updateNodes({ analyser: state.analyzerNode, gainNode: state.normalizationGainNode });
                state.loudnessNormalizer.setTarget(state.normalizationTargetLufs);
                if (state.volumeNormalizationEnabled) {
                    state.loudnessNormalizer.enable();
                }

                state.compressorNode.threshold.setValueAtTime(state.compressorThreshold, state.audioContext.currentTime);
                state.compressorNode.knee.setValueAtTime(state.compressorKnee, state.audioContext.currentTime);
                state.compressorNode.ratio.setValueAtTime(state.compressorRatio, state.audioContext.currentTime);
                state.compressorNode.attack.setValueAtTime(state.compressorAttack, state.audioContext.currentTime);
                state.compressorNode.release.setValueAtTime(state.compressorRelease, state.audioContext.currentTime);

                state.analyzerNode.fftSize = 2048;
                state.analyzerNode.smoothingTimeConstant = 0.8;

                log.info('Audio processing initialized successfully');
            }

            if (isNewVideo) {
                if (state.sourceNode) {
                    try {
                        state.sourceNode.disconnect();
                        log.info('Disconnected old video source');
                    } catch (error) {
                        log.debug('Old source already disconnected');
                    }
                }

                state.sourceNode = state.audioContext.createMediaElementSource(video);
                state.currentVideo = video;

                video.volume = state.lastVolume;
                video.muted = false;

                state.sourceNode.connect(state.analyzerNode);
                state.analyzerNode.connect(state.compressorNode);
                state.compressorNode.connect(state.normalizationGainNode);
                state.normalizationGainNode.connect(state.outputGainNode);
                state.outputGainNode.connect(state.audioContext.destination);

                log.info('Audio graph connected to new video element');
            }

            if (state.loudnessNormalizer) {
                state.loudnessNormalizer.updateNodes({ analyser: state.analyzerNode, gainNode: state.normalizationGainNode });
                state.loudnessNormalizer.setTarget(state.normalizationTargetLufs);
                if (state.volumeNormalizationEnabled) {
                    state.loudnessNormalizer.enable();
                } else {
                    state.loudnessNormalizer.disable();
                }
            }

            KS.updateAudioProcessing();
        } catch (error) {
            log.error('Audio processing setup failed:', error);
            state.volumeBoostEnabled = false;
            state.volumeNormalizationEnabled = false;
        }
    };

    KS.updateAudioProcessing = function updateAudioProcessing() {
        if (!state.outputGainNode || !state.audioContext) {
            return;
        }

        let boostValue = 1;

        if (state.volumeBoostEnabled) {
            let boostAmount = state.volumeBoostAmount;
            if (!constants.DISABLE_EFFECT_SCALING && (state.compressorEnabled || state.volumeNormalizationEnabled)) {
                boostAmount = Math.min(boostAmount, 8);
            }
            boostValue = dbToLinear(boostAmount);
        }

        boostValue = Math.min(boostValue, 3.5);
        state.outputGainNode.gain.setValueAtTime(boostValue, state.audioContext.currentTime);

        if (state.loudnessNormalizer) {
            state.loudnessNormalizer.setTarget(state.normalizationTargetLufs);
            if (state.volumeNormalizationEnabled) {
                state.loudnessNormalizer.enable();
            } else {
                state.loudnessNormalizer.disable();
            }
        }
    };
})();
