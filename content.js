(() => {
    // === CONFIGURATION CONSTANTS ===
    const AUTO_COLLAPSE_DELAY = 1500; // milliseconds - change this value to adjust timing
    const DISABLE_EFFECT_SCALING = false; // Set to true to prevent effects from being weakened when multiple are enabled
    const DEBUG_LOGGING = true; // Set to false to disable console logging
    const LOG_PREFIX = '[KickScroll]'; // Prefix for all console logs

    // === LOGGING HELPERS ===
    const log = {
        info: (...args) => DEBUG_LOGGING && console.log(LOG_PREFIX, ...args),
        warn: (...args) => DEBUG_LOGGING && console.warn(LOG_PREFIX, ...args),
        error: (...args) => console.error(LOG_PREFIX, ...args), // Always log errors
        debug: (...args) => DEBUG_LOGGING && console.log(LOG_PREFIX, '[DEBUG]', ...args)
    };

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const dbToLinear = (db) => Math.pow(10, db / 20);
    const linearToDb = (linear) => 20 * Math.log10(Math.max(linear, 1e-6));

    function convertLegacyTarget(percent) {
        if (typeof percent !== 'number' || Number.isNaN(percent)) {
            return -20;
        }
        const clamped = clamp(percent, 10, 100);
        // Map legacy percentage (10-100) to loudness range (-48dB to -10dB)
        const mapped = -48 + ((clamped - 10) / 90) * 38;
        return clamp(mapped, -48, -10);
    }

    // === MOUSE AND UI STATE ===
    let isRightMouseDown = false;
    let volumeOverlayTimeout;
    let speedOverlayTimeout;
    let lastVolume = 1; // Store the last non-zero volume (default to 1)
    let enforcingVolume = false; // Flag to indicate we're enforcing the volume after unmuting

    // === AUDIO PROCESSING STATE ===
    let volumeBoostEnabled = false;
    let volumeBoostAmount = 6; // dB boost amount (default 6dB)
    let volumeNormalizationEnabled = false;
    let normalizationTargetLufs = -20; // Target loudness in LUFS (negative values)
    let compressorEnabled = false;
    let currentPlaybackRate = 1;
    let loudnessNormalizer = null; // Runtime controller for normalization

    // Web Audio API nodes
    let audioContext = null;
    let normalizationGainNode = null;
    let outputGainNode = null;
    let sourceNode = null;
    let analyzerNode = null;
    let compressorNode = null;
    let currentVideo = null; // Track the current video element

    // Compressor settings
    let compressorThreshold = -24; // dB
    let compressorRatio = 12; // ratio (1-20)
    let compressorKnee = 30; // dB
    let compressorAttack = 0.003; // seconds
    let compressorRelease = 0.25; // seconds

    // === CONTROL PANEL STATE ===
    let controlsVisibilityObserver = null;
    let controlsVisible = true;
    let hideControlsTimeout = null;
    let panelInitialized = false;
    let autoCollapseTimeout = null;
    let isPanelCollapsed = true; // Global state for panel collapse
    let panelToggleRef = null;
    let panelContentRef = null;
    let controlPanelRef = null;
    
    // === BITRATE MONITORING STATE ===
    let bitrateMonitorEnabled = true;
    let bitrateOverlayVisible = true; // Show overlay even when panel closed
    let currentBitrate = 0; // Current bitrate in Mbps
    let bitrateHistory = []; // Store last N measurements
    let minBitrate = Infinity;
    let maxBitrate = 0;
    let lastBufferSize = 0;
    let lastBufferTime = 0;
    let totalBytesLoaded = 0;
    let lastBytesLoaded = 0;
    let bitrateUpdateInterval = null;
    let sourceBufferMonitor = null;
    let bitrateDisplayMode = 'current'; // 'current', 'average', 'both', 'minmax'
    let bitrateUnit = 'Mbps'; // 'Mbps', 'kbps', 'MBps', 'kBps'
    let bitrateRefreshRate = 1000; // Update interval in milliseconds (default 1 second)
    let bitrateOpacity = 0.85; // Background opacity (0-1)
    let bitrateTextColor = '#00bcd4'; // Text color (hex)
    
    // Settings storage
    let settings = {
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
    
    // Load settings from storage
    function loadSettings() {
        try {
            chrome.storage.sync.get(['kickScrollSettings'], (result) => {
                if (result.kickScrollSettings) {
                    settings = { ...settings, ...result.kickScrollSettings };
                    volumeBoostEnabled = settings.volumeBoostEnabled;
                    volumeBoostAmount = settings.volumeBoostAmount;
                    volumeNormalizationEnabled = settings.volumeNormalizationEnabled;
                    if (typeof settings.normalizationTargetLufs === 'number') {
                        normalizationTargetLufs = clamp(settings.normalizationTargetLufs, -48, -10);
                    } else if (typeof settings.normalizationTarget === 'number') {
                        normalizationTargetLufs = convertLegacyTarget(settings.normalizationTarget);
                    }
                    settings.normalizationTargetLufs = normalizationTargetLufs;
                    if ('normalizationTarget' in settings) {
                        delete settings.normalizationTarget;
                    }
                    compressorEnabled = settings.compressorEnabled;
                    compressorThreshold = settings.compressorThreshold;
                    compressorRatio = settings.compressorRatio;
                    currentPlaybackRate = settings.playbackSpeed;
                    if (typeof settings.lastVolume === 'number') {
                        lastVolume = clamp(settings.lastVolume, 0, 1);
                    }
                    bitrateMonitorEnabled = settings.bitrateMonitorEnabled !== false;
                    bitrateOverlayVisible = settings.bitrateOverlayVisible !== false;
                    bitrateDisplayMode = settings.bitrateDisplayMode || 'current';
                    bitrateUnit = settings.bitrateUnit || 'Mbps';
                    bitrateRefreshRate = settings.bitrateRefreshRate || 1000;
                    bitrateOpacity = settings.bitrateOpacity !== undefined ? settings.bitrateOpacity : 0.85;
                    bitrateTextColor = settings.bitrateTextColor || '#00bcd4';
                }
            });
        } catch (e) {
            log.warn('Chrome storage not available, using default settings');
        }
    }
    
    // Save settings to storage
    function saveSettings() {
        try {
            chrome.storage.sync.set({ 
                kickScrollSettings: {
                    volumeBoostEnabled,
                    volumeBoostAmount,
                    volumeNormalizationEnabled,
                    normalizationTargetLufs,
                    compressorEnabled,
                    compressorThreshold,
                    compressorRatio,
                    playbackSpeed: currentPlaybackRate,
                    lastVolume,
                    bitrateMonitorEnabled,
                    bitrateOverlayVisible,
                    bitrateDisplayMode,
                    bitrateUnit,
                    bitrateRefreshRate,
                    bitrateOpacity,
                    bitrateTextColor
                }
            });
            log.debug('Settings saved successfully');
        } catch (e) {
            log.warn('Chrome storage not available, settings not saved');
        }
    }
  
    // Create and style the overlay elements.
    const volumeOverlay = document.createElement("div");
    volumeOverlay.id = "volume-overlay";
    
    const speedOverlay = document.createElement("div");
    speedOverlay.id = "speed-overlay";
    speedOverlay.textContent = "1x";
    
    const bitrateOverlay = document.createElement("div");
    bitrateOverlay.id = "bitrate-overlay";
    bitrateOverlay.textContent = "-- Mbps";
    bitrateOverlay.style.opacity = "0"; // Start hidden
    
    // Create control panel
    const controlPanel = document.createElement("div");
    controlPanel.id = "kick-control-panel";
    controlPanel.innerHTML = `
        <div class="control-panel-header">
            <span class="panel-title">Stream Controls</span>
            <button class="panel-toggle" id="panel-toggle">▶</button>
        </div>
        <div class="control-panel-content" id="panel-content" style="display: none;">
            <div class="control-section">
                <div class="section-title">Volume Boost</div>
                <div class="control-row">
                    <button class="control-btn toggle-btn" id="boost-toggle">
                        <span class="btn-icon">🔊</span>
                        <span class="btn-text">OFF</span>
                    </button>
                    <div class="boost-controls">
                        <button class="control-btn small-btn" id="boost-up">+</button>
                        <span class="boost-value" id="boost-value"></span>
                        <button class="control-btn small-btn" id="boost-down">-</button>
                    </div>
                </div>
            </div>
            
            <div class="control-section">
                <div class="section-title">Volume Normalization</div>
                <div class="control-row">
                    <button class="control-btn toggle-btn" id="normalize-toggle">
                        <span class="btn-icon">📊</span>
                        <span class="btn-text">OFF</span>
                    </button>
                    <span class="normalization-compensation" id="normalization-compensation"></span>
                </div>
                <div class="control-row">
                    <span class="control-label">Target Loudness:</span>
                    <button class="control-btn small-btn" id="target-up">+</button>
                    <span class="compressor-value" id="target-value"></span>
                    <button class="control-btn small-btn" id="target-down">-</button>
                </div>
            </div>
            
            <div class="control-section">
                <div class="section-title">Audio Compressor</div>
                <div class="control-row">
                    <button class="control-btn toggle-btn" id="compressor-toggle">
                        <span class="btn-icon">🎚️</span>
                        <span class="btn-text">OFF</span>
                    </button>
                </div>
                <div class="control-row">
                    <span class="control-label">Threshold:</span>
                    <button class="control-btn small-btn" id="threshold-up">+</button>
                    <span class="compressor-value" id="threshold-value"></span>
                    <button class="control-btn small-btn" id="threshold-down">-</button>
                </div>
                <div class="control-row">
                    <span class="control-label">Ratio:</span>
                    <button class="control-btn small-btn" id="ratio-up">+</button>
                    <span class="compressor-value" id="ratio-value"></span>
                    <button class="control-btn small-btn" id="ratio-down">-</button>
                </div>
            </div>
            
            <div class="control-section">
                <div class="section-title">Bitrate Monitor</div>
                <div class="control-row">
                    <button class="control-btn toggle-btn" id="bitrate-toggle">
                        <span class="btn-icon">📊</span>
                        <span class="btn-text">ON</span>
                    </button>
                    <button class="control-btn toggle-btn small" id="overlay-toggle">
                        <span class="btn-text">Overlay</span>
                    </button>
                </div>
                <div class="control-row">
                    <span class="bitrate-display-full" id="bitrate-display">-- Mbps</span>
                </div>
                <div class="control-row compact-row">
                    <button class="control-btn tiny-btn" id="bitrate-mode">Current</button>
                    <button class="control-btn tiny-btn" id="bitrate-unit">Mbps</button>
                    <button class="control-btn tiny-btn" id="bitrate-reset">Reset</button>
                </div>
                <div class="control-row compact-row">
                    <button class="control-btn tiny-btn" id="refresh-down">−</button>
                    <span class="inline-value" id="refresh-value">1s</span>
                    <button class="control-btn tiny-btn" id="refresh-up">+</button>
                    <button class="control-btn tiny-btn" id="opacity-down">−</button>
                    <span class="inline-value" id="opacity-value">85%</span>
                    <button class="control-btn tiny-btn" id="opacity-up">+</button>
                    <button class="control-btn tiny-btn" id="color-cycle">🎨</button>
                </div>
            </div>
            
            <div class="control-section">
                <div class="section-title">Playback Speed</div>
                <div class="control-row">
                    <button class="control-btn small-btn" id="speed-up">+</button>
                    <span class="speed-value" id="speed-value"></span>
                    <button class="control-btn small-btn" id="speed-down">−</button>
                    <button class="control-btn small-btn" id="speed-reset">1x</button>
                </div>
                <div class="speed-presets">
                    <button class="preset-btn" data-speed="0.5">0.5x</button>
                    <button class="preset-btn" data-speed="0.75">0.75x</button>
                    <button class="preset-btn active" data-speed="1">1x</button>
                    <button class="preset-btn" data-speed="1.25">1.25x</button>
                    <button class="preset-btn" data-speed="1.5">1.5x</button>
                    <button class="preset-btn" data-speed="2">2x</button>
                </div>
            </div>
        </div>
    `;
    
    class LoudnessNormalizer {
        constructor(context, { masterGainProvider } = {}) {
            this.context = context;
            this.masterGainProvider = masterGainProvider || (() => 1);
            this.analyser = null;
            this.gainNode = null;
            this.buffer = null;
            this.enabled = false;
            this.frame = null;
            this.targetLufs = normalizationTargetLufs;
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
            const normalized = clamp((this.targetLufs + 48) / 38, 0, 1); // 0 @ -48 LUFS, 1 @ -10 LUFS
            const maxBoost = 3 + normalized * 4; // 3dB to 7dB ceiling
            const softBoost = maxBoost * 0.6;
            const maxCut = -(3 + (1 - normalized) * 4); // -7dB to -3dB cut
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
            if (this.enabled) return;
            if (!this.analyser || !this.gainNode) return;
            this.enabled = true;
            this.lastUpdate = performance.now();
            this.silenceTimer = 0;
            this.updateDynamicLimits();
            this.schedule();
        }

        disable() {
            if (!this.enabled) return;
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
            if (!this.enabled || this.frame) return;
            this.frame = requestAnimationFrame(() => this.tick());
        }

        tick() {
            this.frame = null;
            if (!this.enabled || !this.analyser || !this.gainNode) return;

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
            if (!this.gainNode) return;
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
            if (!this.displayElement) return;
            if (!this.enabled || Math.abs(dbValue) < 0.1) {
                this.displayElement.textContent = '';
                return;
            }
            const rounded = Math.round(dbValue * 10) / 10;
            const sign = rounded > 0 ? '+' : '';
            this.displayElement.textContent = `${sign}${rounded.toFixed(1)} dB`;
        }
    }

    // Setup audio processing
    function setupAudioProcessing(video) {
        try {
            // Check if we need to reconnect to a new video element
            const isNewVideo = currentVideo !== video;
            
            if (!audioContext || audioContext.state === 'closed') {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // Resume audio context if suspended (required by Chrome)
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
                
                // Create processing nodes
                normalizationGainNode = audioContext.createGain();
                normalizationGainNode.gain.value = 1;
                outputGainNode = audioContext.createGain();
                outputGainNode.gain.value = 1;
                analyzerNode = audioContext.createAnalyser();
                compressorNode = audioContext.createDynamicsCompressor();
                loudnessNormalizer = new LoudnessNormalizer(audioContext, {
                    masterGainProvider: () => outputGainNode ? outputGainNode.gain.value : 1
                });
                loudnessNormalizer.updateNodes({ analyser: analyzerNode, gainNode: normalizationGainNode });
                loudnessNormalizer.setTarget(normalizationTargetLufs);
                if (volumeNormalizationEnabled) {
                    loudnessNormalizer.enable();
                }
                
                // Setup compressor parameters
                compressorNode.threshold.setValueAtTime(compressorThreshold, audioContext.currentTime);
                compressorNode.knee.setValueAtTime(compressorKnee, audioContext.currentTime);
                compressorNode.ratio.setValueAtTime(compressorRatio, audioContext.currentTime);
                compressorNode.attack.setValueAtTime(compressorAttack, audioContext.currentTime);
                compressorNode.release.setValueAtTime(compressorRelease, audioContext.currentTime);
                
                // Setup analyzer for volume normalization
                analyzerNode.fftSize = 2048; // Larger FFT for better time-domain analysis
                analyzerNode.smoothingTimeConstant = 0.8;
                
                log.info('Audio processing initialized successfully');
            }
            
            // Reconnect if video element changed
            if (isNewVideo) {
                // Disconnect old source if exists
                if (sourceNode) {
                    try {
                        sourceNode.disconnect();
                        log.info('Disconnected old video source');
                    } catch (e) {
                        log.debug('Old source already disconnected');
                    }
                }
                
                // Create new source for this video element
                sourceNode = audioContext.createMediaElementSource(video);
                currentVideo = video;
                
                // Restore saved volume level
                // (WebAudio will handle all audio output)
                video.volume = lastVolume; // Restore user's preferred volume
                video.muted = false; // Not technically muted, audio goes through WebAudio
                
                // Connect the audio graph: source -> analyzer -> compressor -> gain -> destination
                sourceNode.connect(analyzerNode);
                analyzerNode.connect(compressorNode);
                compressorNode.connect(normalizationGainNode);
                normalizationGainNode.connect(outputGainNode);
                outputGainNode.connect(audioContext.destination);
                
                log.info('Audio graph connected to new video element');
            }

            if (loudnessNormalizer) {
                loudnessNormalizer.updateNodes({ analyser: analyzerNode, gainNode: normalizationGainNode });
                loudnessNormalizer.setTarget(normalizationTargetLufs);
                if (volumeNormalizationEnabled) {
                    loudnessNormalizer.enable();
                } else {
                    loudnessNormalizer.disable();
                }
            }
            
            updateAudioProcessing();
        } catch (error) {
            log.error('Audio processing setup failed:', error);
            // Fallback: disable audio features if setup fails
            volumeBoostEnabled = false;
            volumeNormalizationEnabled = false;
        }
    }
    
    // Update audio processing based on current settings (SAFE COMBINED VERSION)
    function updateAudioProcessing() {
        if (!outputGainNode) return;
        
        let boostValue = 1;
        
        // Apply volume boost with reduced headroom when other features are active
        if (volumeBoostEnabled) {
            let boostAmount = volumeBoostAmount;
            // Only scale down boost if scaling is enabled
            if (!DISABLE_EFFECT_SCALING && (compressorEnabled || volumeNormalizationEnabled)) {
                boostAmount = Math.min(boostAmount, 8); // Cap at 8dB when combined
            }
            boostValue = dbToLinear(boostAmount);
        }
        
        // Global safety limit - never exceed 3.5x gain regardless of settings
        boostValue = Math.min(boostValue, 3.5);
        outputGainNode.gain.setValueAtTime(boostValue, audioContext.currentTime);

        if (loudnessNormalizer) {
            loudnessNormalizer.setTarget(normalizationTargetLufs);
            if (volumeNormalizationEnabled) {
                loudnessNormalizer.enable();
            } else {
                loudnessNormalizer.disable();
            }
        }
    }
    // Retrieve the video element (using provided hint or fallback to any video element)
    function getVideoElement() {
      // Try multiple common selectors for Kick.com
      const selectors = [
        "#video-player",
        "video[data-testid='video-player']",
        ".video-player video",
        "video"
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.tagName === 'VIDEO') {
          return element;
        }
      }
      return null;
    }
  
    // Attach bitrate overlay to body with fixed positioning
    function attachBitrateOverlayToPage() {
      if (!document.querySelector("#bitrate-overlay") && !document.body.contains(bitrateOverlay)) {
        document.body.appendChild(bitrateOverlay);
        log.info('Bitrate overlay attached to body (fixed position)');
        // Force initial update
        if (bitrateMonitorEnabled && bitrateOverlayVisible) {
          updateBitrateOverlay();
        }
      }
    }
    
    // Attach the overlays and control panel to the video container.
    function attachOverlayToVideo(video) {
      const container = video.parentElement;
      if (container) {
        container.style.position = "relative";
        
        if (!container.querySelector("#volume-overlay")) {
          container.appendChild(volumeOverlay);
        }
        
        if (!container.querySelector("#speed-overlay")) {
          container.appendChild(speedOverlay);
        }
        
        // Attach bitrate overlay to page
        attachBitrateOverlayToPage();
        
        if (!container.querySelector("#kick-control-panel")) {
          container.appendChild(controlPanel);
          log.info('Control panel attached to video container');
          
          // Start hidden - will show when mouse moves over video
          controlPanel.classList.add('controls-hidden');
          controlsVisible = false;
          panelInitialized = true;
          
          setupControlPanelEvents();
          // Force immediate update of all values
          setTimeout(() => {
            updateControlPanelState();
          }, 10);
          
          // Setup visibility synchronization with native player controls after a delay
          setTimeout(() => {
            setupControlsVisibilitySync(video);
          }, 1000); // Give the page time to fully load
        }
        
        // Setup audio processing for volume boost and normalization
        setupAudioProcessing(video);
        
        // Apply saved playback speed
        if (currentPlaybackRate !== 1) {
          video.playbackRate = currentPlaybackRate;
        }
        
        // Start bitrate monitoring
        if (bitrateMonitorEnabled) {
          startBitrateMonitoring(video);
        }
      }
    }
  
    // Display volume or mute state in the overlay.
    function showVolumeOverlay(vol) {
      const volumeText = (vol === "Muted") ? "Muted" : Math.round(vol * 100) + "%";
      const boostText = volumeBoostEnabled ? ` (+${volumeBoostAmount}dB)` : "";
      volumeOverlay.textContent = volumeText + boostText;
      volumeOverlay.style.opacity = "1";
      clearTimeout(volumeOverlayTimeout);
      volumeOverlayTimeout = setTimeout(() => {
        volumeOverlay.style.opacity = "0";
      }, 500);
    }
    
    // Display playback speed in overlay
    function showSpeedOverlay(speed) {
      speedOverlay.textContent = `${speed}x`;
      speedOverlay.style.opacity = "1";
      clearTimeout(speedOverlayTimeout);
      speedOverlayTimeout = setTimeout(() => {
        speedOverlay.style.opacity = "0";
      }, 500);
    }
    
    // Display text-only overlay (for boost and normalization messages)
    function showTextOverlay(text) {
      volumeOverlay.textContent = text;
      volumeOverlay.style.opacity = "1";
      clearTimeout(volumeOverlayTimeout);
      volumeOverlayTimeout = setTimeout(() => {
        volumeOverlay.style.opacity = "0";
      }, 1000);
    }
    
    // Global auto-collapse functions
    function scheduleAutoCollapse() {
      if (autoCollapseTimeout) {
        clearTimeout(autoCollapseTimeout);
      }
      autoCollapseTimeout = setTimeout(() => {
        if (!isPanelCollapsed && panelToggleRef && panelContentRef && controlPanelRef) {
          isPanelCollapsed = true;
          controlPanelRef.classList.add('collapsed');
          controlPanelRef.classList.remove('expanded');
          panelContentRef.style.display = 'none';
          panelToggleRef.textContent = '▶';
        }
      }, AUTO_COLLAPSE_DELAY);
    }
    
    function cancelAutoCollapse() {
      if (autoCollapseTimeout) {
        clearTimeout(autoCollapseTimeout);
        autoCollapseTimeout = null;
      }
    }
    
    // Adjust normalization target level
    function adjustNormalizationTarget(direction) {
        const step = 1; // 1dB adjustments
        const min = -48;
        const max = -10;
        
        if (direction === 'up') {
            normalizationTargetLufs = Math.min(max, normalizationTargetLufs + step);
        } else {
            normalizationTargetLufs = Math.max(min, normalizationTargetLufs - step);
        }
        
        settings.normalizationTargetLufs = normalizationTargetLufs;
        saveSettings();
        if (loudnessNormalizer) {
            loudnessNormalizer.setTarget(normalizationTargetLufs);
            if (volumeNormalizationEnabled) {
                loudnessNormalizer.enable();
            }
        }
        const displayLufs = Math.round(normalizationTargetLufs * 10) / 10;
        showTextOverlay(`Target Loudness: ${displayLufs} LUFS`);
        updateControlPanelState();
    }

    // Toggle audio compressor
    function toggleCompressor() {
      compressorEnabled = !compressorEnabled;
      settings.compressorEnabled = compressorEnabled;
      saveSettings();
      updateCompressor();
      updateControlPanelState();
      
      // Start/stop safety monitoring
      if (volumeBoostEnabled || volumeNormalizationEnabled || compressorEnabled) {
        startSafetyMonitor();
      }
      
      showTextOverlay(compressorEnabled ? "Compressor ON" : "Compressor OFF");
    }
    
    // Update compressor settings
    function updateCompressor() {
        if (!compressorNode) return;
        
        if (compressorEnabled) {
            // Apply compressor settings
            compressorNode.threshold.setValueAtTime(compressorThreshold, audioContext.currentTime);
            compressorNode.ratio.setValueAtTime(compressorRatio, audioContext.currentTime);
        } else {
            // Disable compressor by setting neutral values
            compressorNode.threshold.setValueAtTime(0, audioContext.currentTime); // No compression threshold
            compressorNode.ratio.setValueAtTime(1, audioContext.currentTime); // 1:1 ratio = no compression
        }
    }
    
    // Adjust compressor threshold
    function adjustCompressorThreshold(direction) {
      const step = 3; // 3dB steps
      const min = -50;
      const max = 0;
      
      if (direction === 'up') {
        compressorThreshold = Math.min(max, compressorThreshold + step);
      } else {
        compressorThreshold = Math.max(min, compressorThreshold - step);
      }
      
      settings.compressorThreshold = compressorThreshold;
      saveSettings();
      updateCompressor();
      showTextOverlay(`Threshold: ${compressorThreshold}dB`);
    }
    
    // Adjust compressor ratio
    function adjustCompressorRatio(direction) {
      const ratios = [1, 2, 3, 4, 6, 8, 12, 20];
      const currentIndex = ratios.indexOf(compressorRatio);
      let newIndex;
      
      if (direction === 'up') {
        newIndex = Math.min(ratios.length - 1, currentIndex + 1);
      } else {
        newIndex = Math.max(0, currentIndex - 1);
      }
      
      compressorRatio = ratios[newIndex];
      settings.compressorRatio = compressorRatio;
      saveSettings();
      updateCompressor();
      showTextOverlay(`Ratio: ${compressorRatio}:1`);
    }
    

    
    // Playback speed control
    const speedOptions = [0.25, 0.5, 0.75, 1, 1.1, 1.25, 1.5, 1.75, 2];
    
    function changePlaybackSpeed(direction) {
      const video = getVideoElement();
      if (!video) return;
      
      const currentIndex = speedOptions.indexOf(currentPlaybackRate);
      let newIndex;
      
      if (direction === 'up') {
        newIndex = Math.min(speedOptions.length - 1, currentIndex + 1);
      } else if (direction === 'down') {
        newIndex = Math.max(0, currentIndex - 1);
      } else {
        // Reset to 1x
        newIndex = speedOptions.indexOf(1);
      }
      
      currentPlaybackRate = speedOptions[newIndex];
      video.playbackRate = currentPlaybackRate;
      settings.playbackSpeed = currentPlaybackRate;
      saveSettings();
      showSpeedOverlay(currentPlaybackRate);
      updateControlPanelState();
    }
    
    // === BITRATE MONITORING FUNCTIONS ===
    
    // Convert bitrate to selected unit
    function convertBitrateUnit(bitrateMbps) {
        switch (bitrateUnit) {
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
    
    // Format bitrate with unit
    function formatBitrate(bitrateMbps, decimals = 2) {
        const converted = convertBitrateUnit(bitrateMbps);
        return `${converted.value.toFixed(decimals)} ${converted.unit}`;
    }
    
    // Get quality indicator based on bitrate
    function getQualityIndicator(bitrateMbps) {
        if (bitrateMbps >= 8) return { emoji: '🟢', text: 'Excellent' };
        if (bitrateMbps >= 5) return { emoji: '🟡', text: 'Good' };
        if (bitrateMbps >= 2.5) return { emoji: '🟠', text: 'Fair' };
        if (bitrateMbps > 0) return { emoji: '🔴', text: 'Poor' };
        return { emoji: '⚫', text: 'N/A' };
    }
    
    // Start bitrate monitoring
    function startBitrateMonitoring(video) {
        if (!bitrateMonitorEnabled || !video) return;
        
        stopBitrateMonitoring(); // Clean up any existing monitoring
        
        log.info('Starting bitrate monitoring...');
        
        // Method 1: Simple and reliable - monitor video stats
        let bytesReceived = 0;
        let lastCheckTime = Date.now();
        
        const monitorVideoStats = () => {
            try {
                if (!video) return;
                
                // Try multiple methods to get data
                
                // Method A: Check performance entries
                const perfEntries = performance.getEntriesByType('resource');
                let recentBytes = 0;
                let recentCount = 0;
                
                perfEntries.forEach(entry => {
                    if (entry.responseEnd > performance.now() - 5000) {
                        if (entry.transferSize > 0 && 
                            (entry.name.includes('kick.com') || 
                             entry.name.includes('.ts') || 
                             entry.name.includes('.m4s') ||
                             entry.name.includes('segment'))) {
                            recentBytes += entry.transferSize;
                            recentCount++;
                        }
                    }
                });
                
                if (recentBytes > 0 && recentCount > 0) {
                    // Estimate bitrate from segments
                    const avgSegmentSize = recentBytes / recentCount;
                    const bitrateMbps = (avgSegmentSize * 8) / (3 * 1000000); // 3 sec segments
                    
                    if (bitrateMbps > 0.1 && bitrateMbps < 50) {
                        bitrateHistory.push(bitrateMbps);
                        if (bitrateHistory.length > 20) bitrateHistory.shift();
                        
                        log.debug(`Perf API: ${recentCount} segments, ${(recentBytes/1024).toFixed(0)}KB, ${bitrateMbps.toFixed(2)} Mbps`);
                    }
                }
                
                // Method B: Estimate from playback
                if (video && video.webkitVideoDecodedByteCount !== undefined) {
                    const decodedBytes = video.webkitVideoDecodedByteCount;
                    const currentTime = Date.now();
                    const timeDelta = (currentTime - lastCheckTime) / 1000;
                    
                    if (timeDelta > 0 && bytesReceived > 0) {
                        const bytesDelta = decodedBytes - bytesReceived;
                        if (bytesDelta > 0) {
                            const bitrateMbps = (bytesDelta * 8) / (timeDelta * 1000000);
                            if (bitrateMbps > 0.1 && bitrateMbps < 50) {
                                bitrateHistory.push(bitrateMbps);
                                if (bitrateHistory.length > 20) bitrateHistory.shift();
                                
                                log.debug(`Decoded: ${bitrateMbps.toFixed(2)} Mbps`);
                            }
                        }
                    }
                    
                    bytesReceived = decodedBytes;
                    lastCheckTime = currentTime;
                }
                
                // Update display from history
                if (bitrateHistory.length > 0) {
                    const recent = bitrateHistory.slice(-3);
                    currentBitrate = recent.reduce((a, b) => a + b, 0) / recent.length;
                    
                    if (currentBitrate > 0) {
                        minBitrate = Math.min(minBitrate, currentBitrate);
                        maxBitrate = Math.max(maxBitrate, currentBitrate);
                    }
                } else {
                    log.debug('No bitrate data yet');
                }
            } catch (error) {
                log.error('Bitrate monitoring error:', error);
            }
        };
        
        // Method 2: Try to hook into Media Source Extensions
        const hookMediaSource = () => {
            try {
                // Look for MediaSource objects
                const videos = document.querySelectorAll('video');
                videos.forEach(v => {
                    if (v.src && v.src.startsWith('blob:')) {
                        // This video uses MSE, try to monitor it
                        monitorMSE(v);
                    }
                });
            } catch (error) {
                log.debug('MSE hook failed:', error.message);
            }
        };
        
        // Monitor MSE SourceBuffer updates
        const monitorMSE = (videoElement) => {
            try {
                // Store append data for accurate measurement
                let segmentBytes = 0;
                let segmentStartTime = performance.now();
                let measurementWindow = 2000; // 2 second measurement window
                
                // Intercept SourceBuffer appendBuffer calls
                const originalAppendBuffer = window.SourceBuffer.prototype.appendBuffer;
                
                window.SourceBuffer.prototype.appendBuffer = function(data) {
                    const currentTime = performance.now();
                    const dataSize = data.byteLength;
                    
                    // Accumulate bytes in measurement window
                    segmentBytes += dataSize;
                    totalBytesLoaded += dataSize;
                    
                    const elapsed = currentTime - segmentStartTime;
                    
                    // Calculate bitrate over measurement window
                    if (elapsed >= measurementWindow) {
                        const seconds = elapsed / 1000;
                        const bytesPerSecond = segmentBytes / seconds;
                        const bitrateMbps = (bytesPerSecond * 8) / 1000000;
                        
                        if (bitrateMbps > 0 && bitrateMbps < 100) { // Sanity check
                            bitrateHistory.push(bitrateMbps);
                            if (bitrateHistory.length > 15) {
                                bitrateHistory.shift();
                            }
                        }
                        
                        // Reset measurement window
                        segmentBytes = 0;
                        segmentStartTime = currentTime;
                    }
                    
                    return originalAppendBuffer.call(this, data);
                };
                
                log.info('MSE SourceBuffer monitoring active');
            } catch (error) {
                log.debug('Could not hook SourceBuffer:', error.message);
            }
        };
        
        // Method 3: Monitor network requests (fallback)
        const monitorNetworkRequests = () => {
            try {
                const originalFetch = window.fetch;
                let requestTimes = [];
                
                window.fetch = function(...args) {
                    const startTime = performance.now();
                    
                    return originalFetch.apply(this, args).then(response => {
                        const clone = response.clone();
                        
                        // Check if it's a video segment
                        const url = args[0];
                        if (typeof url === 'string' && (url.includes('.ts') || url.includes('.m4s') || url.includes('segment') || url.includes('chunk'))) {
                            clone.arrayBuffer().then(buffer => {
                                const size = buffer.byteLength;
                                totalBytesLoaded += size;
                                
                                // Calculate bitrate: size / typical segment duration (not download time)
                                // Most HLS/DASH streams use 2-6 second segments
                                if (size > 10000) { // At least 10KB
                                    // Assume typical segment is 3 seconds
                                    const estimatedSegmentDuration = 3;
                                    const bitrateMbps = (size * 8) / (estimatedSegmentDuration * 1000000);
                                    
                                    if (bitrateMbps > 0 && bitrateMbps < 100) { // Sanity check
                                        bitrateHistory.push(bitrateMbps);
                                        if (bitrateHistory.length > 15) {
                                            bitrateHistory.shift();
                                        }
                                        
                                        log.debug(`Segment: ${(size/1024).toFixed(0)}KB, Est bitrate: ${bitrateMbps.toFixed(2)} Mbps`);
                                    }
                                }
                            }).catch(() => {});
                        }
                        
                        return response;
                    });
                };
                
                log.info('Network request monitoring active');
            } catch (error) {
                log.debug('Could not hook fetch:', error.message);
            }
        };
        
        // Start all monitoring methods
        hookMediaSource();
        monitorNetworkRequests();
        
        // Update display based on refresh rate setting
        bitrateUpdateInterval = setInterval(() => {
            monitorVideoStats();
            updateBitrateDisplay();
            updateBitrateOverlay();
        }, bitrateRefreshRate);
        
        log.info('Bitrate monitoring started');
    }
    
    // Stop bitrate monitoring
    function stopBitrateMonitoring() {
        if (bitrateUpdateInterval) {
            clearInterval(bitrateUpdateInterval);
            bitrateUpdateInterval = null;
        }
        bitrateHistory = [];
        currentBitrate = 0;
        minBitrate = Infinity;
        maxBitrate = 0;
        lastBufferSize = 0;
        lastBufferTime = 0;
        updateBitrateDisplay();
        updateBitrateOverlay();
        
        // Ensure overlay is completely hidden and cleared
        if (bitrateOverlay) {
            bitrateOverlay.style.opacity = '0';
            bitrateOverlay.textContent = '';
        }
    }
    
    // Update bitrate display in panel
    function updateBitrateDisplay() {
        const bitrateDisplay = document.querySelector('#bitrate-display');
        if (!bitrateDisplay) return;
        
        if (!bitrateMonitorEnabled || currentBitrate === 0) {
            bitrateDisplay.textContent = `-- ${bitrateUnit}`;
            return;
        }
        
        let displayText = '';
        const quality = getQualityIndicator(currentBitrate);
        
        switch (bitrateDisplayMode) {
            case 'current':
                displayText = `${quality.emoji} ${formatBitrate(currentBitrate)}`;
                break;
            case 'average':
                if (bitrateHistory.length > 0) {
                    const avg = bitrateHistory.reduce((a, b) => a + b, 0) / bitrateHistory.length;
                    displayText = `${quality.emoji} ${formatBitrate(avg)} (avg)`;
                } else {
                    displayText = `-- ${bitrateUnit}`;
                }
                break;
            case 'both':
                if (bitrateHistory.length > 0) {
                    const avg = bitrateHistory.reduce((a, b) => a + b, 0) / bitrateHistory.length;
                    displayText = `${formatBitrate(currentBitrate)} / ${formatBitrate(avg)}`;
                } else {
                    displayText = formatBitrate(currentBitrate);
                }
                break;
            case 'minmax':
                if (maxBitrate > 0 && minBitrate !== Infinity) {
                    displayText = `${formatBitrate(currentBitrate)} (${formatBitrate(minBitrate, 1)}-${formatBitrate(maxBitrate, 1)})`;
                } else {
                    displayText = formatBitrate(currentBitrate);
                }
                break;
        }
        
        bitrateDisplay.textContent = displayText;
    }
    
    // Update bitrate overlay
    function updateBitrateOverlay() {
        if (!bitrateOverlay) return;
        
        if (!bitrateMonitorEnabled || !bitrateOverlayVisible) {
            bitrateOverlay.style.opacity = '0';
            bitrateOverlay.textContent = ''; // Clear text when disabled
            return;
        }
        
        // Show overlay even with zero bitrate (waiting for data)
        if (currentBitrate === 0) {
            bitrateOverlay.textContent = `⏳ Waiting...`;
            bitrateOverlay.style.opacity = '1';
            return;
        }
        
        const quality = getQualityIndicator(currentBitrate);
        let overlayText = '';
        
        switch (bitrateDisplayMode) {
            case 'current':
                overlayText = `${quality.emoji} ${formatBitrate(currentBitrate)}`;
                break;
            case 'average':
                if (bitrateHistory.length > 0) {
                    const avg = bitrateHistory.reduce((a, b) => a + b, 0) / bitrateHistory.length;
                    overlayText = `${quality.emoji} ${formatBitrate(avg)}`;
                } else {
                    overlayText = `${quality.emoji} ${formatBitrate(currentBitrate)}`;
                }
                break;
            case 'both':
                if (bitrateHistory.length > 0) {
                    const avg = bitrateHistory.reduce((a, b) => a + b, 0) / bitrateHistory.length;
                    overlayText = `${formatBitrate(currentBitrate)}\n${formatBitrate(avg)} avg`;
                } else {
                    overlayText = formatBitrate(currentBitrate);
                }
                break;
            case 'minmax':
                if (maxBitrate > 0 && minBitrate !== Infinity) {
                    overlayText = `${formatBitrate(currentBitrate)}\n↓${formatBitrate(minBitrate, 1)} ↑${formatBitrate(maxBitrate, 1)}`;
                } else {
                    overlayText = formatBitrate(currentBitrate);
                }
                break;
        }
        
        bitrateOverlay.textContent = overlayText;
        bitrateOverlay.style.opacity = '1';
        
        // Apply custom styles with !important to override CSS
        bitrateOverlay.style.setProperty('background-color', `rgba(0, 0, 0, ${bitrateOpacity})`, 'important');
        bitrateOverlay.style.setProperty('color', bitrateTextColor, 'important');
        bitrateOverlay.style.setProperty('text-shadow', `0 0 10px ${bitrateTextColor}80`, 'important');
        bitrateOverlay.style.setProperty('border-color', `${bitrateTextColor}4D`, 'important');
    }
    
    // Toggle bitrate monitoring
    function toggleBitrateMonitor() {
        bitrateMonitorEnabled = !bitrateMonitorEnabled;
        settings.bitrateMonitorEnabled = bitrateMonitorEnabled;
        saveSettings();
        
        const video = getVideoElement();
        if (bitrateMonitorEnabled) {
            startBitrateMonitoring(video);
            showTextOverlay('Bitrate Monitor ON');
        } else {
            stopBitrateMonitoring();
            showTextOverlay('Bitrate Monitor OFF');
        }
        
        updateControlPanelState();
    }
    
    // Toggle bitrate overlay visibility
    function toggleBitrateOverlay() {
        bitrateOverlayVisible = !bitrateOverlayVisible;
        settings.bitrateOverlayVisible = bitrateOverlayVisible;
        saveSettings();
        
        // Ensure overlay is attached
        attachBitrateOverlayToPage();
        
        // Force immediate update
        setTimeout(() => {
            updateBitrateOverlay();
        }, 50);
        
        showTextOverlay(bitrateOverlayVisible ? 'Overlay ON' : 'Overlay OFF');
        updateControlPanelState();
    }
    
    // Cycle through bitrate display modes
    function cycleBitrateDisplayMode() {
        const modes = ['current', 'average', 'both', 'minmax'];
        const currentIndex = modes.indexOf(bitrateDisplayMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        bitrateDisplayMode = modes[nextIndex];
        
        settings.bitrateDisplayMode = bitrateDisplayMode;
        saveSettings();
        
        const modeNames = {
            'current': 'Current',
            'average': 'Average',
            'both': 'Both',
            'minmax': 'Min/Max'
        };
        
        showTextOverlay(`Mode: ${modeNames[bitrateDisplayMode]}`);
        updateControlPanelState();
        updateBitrateDisplay();
        updateBitrateOverlay();
    }
    
    // Cycle through bitrate units
    function cycleBitrateUnit() {
        const units = ['Mbps', 'kbps', 'MBps', 'kBps'];
        const currentIndex = units.indexOf(bitrateUnit);
        const nextIndex = (currentIndex + 1) % units.length;
        bitrateUnit = units[nextIndex];
        
        settings.bitrateUnit = bitrateUnit;
        saveSettings();
        
        showTextOverlay(`Unit: ${bitrateUnit}`);
        updateControlPanelState();
        updateBitrateDisplay();
        updateBitrateOverlay();
    }
    
    // Reset min/max bitrate tracking
    function resetBitrateMinMax() {
        minBitrate = currentBitrate > 0 ? currentBitrate : Infinity;
        maxBitrate = currentBitrate > 0 ? currentBitrate : 0;
        showTextOverlay('Min/Max Reset');
        updateBitrateDisplay();
        updateBitrateOverlay();
    }
    
    // Adjust refresh rate
    function adjustRefreshRate(direction) {
        const rates = [250, 500, 1000, 2000, 5000]; // milliseconds
        const currentIndex = rates.indexOf(bitrateRefreshRate);
        let newIndex;
        
        if (direction === 'up') {
            newIndex = Math.min(rates.length - 1, currentIndex + 1);
        } else {
            newIndex = Math.max(0, currentIndex - 1);
        }
        
        bitrateRefreshRate = rates[newIndex];
        settings.bitrateRefreshRate = bitrateRefreshRate;
        saveSettings();
        
        // Restart monitoring with new rate
        if (bitrateMonitorEnabled) {
            const video = getVideoElement();
            stopBitrateMonitoring();
            startBitrateMonitoring(video);
        }
        
        const seconds = bitrateRefreshRate / 1000;
        showTextOverlay(`Refresh: ${seconds}s`);
        updateControlPanelState();
    }
    
    // Adjust overlay opacity
    function adjustOpacity(direction) {
        const step = 0.05;
        
        if (direction === 'up') {
            bitrateOpacity = Math.min(1, bitrateOpacity + step);
        } else {
            bitrateOpacity = Math.max(0.1, bitrateOpacity - step);
        }
        
        settings.bitrateOpacity = bitrateOpacity;
        saveSettings();
        
        showTextOverlay(`Opacity: ${Math.round(bitrateOpacity * 100)}%`);
        updateBitrateOverlay();
        updateControlPanelState();
    }
    
    // Available colors for bitrate display
    const bitrateColors = [
        { name: 'Cyan', value: '#00bcd4' },
        { name: 'Green', value: '#4CAF50' },
        { name: 'Yellow', value: '#FFC107' },
        { name: 'Orange', value: '#FF9800' },
        { name: 'Red', value: '#F44336' },
        { name: 'Purple', value: '#9C27B0' },
        { name: 'Blue', value: '#2196F3' },
        { name: 'White', value: '#FFFFFF' }
    ];
    
    // Show color picker menu
    function showColorPicker() {
        // Remove existing picker if any
        const existingPicker = document.querySelector('#bitrate-color-picker');
        if (existingPicker) {
            existingPicker.remove();
            return;
        }
        
        // Create color picker menu
        const picker = document.createElement('div');
        picker.id = 'bitrate-color-picker';
        picker.className = 'color-picker-menu';
        
        bitrateColors.forEach(color => {
            const colorOption = document.createElement('button');
            colorOption.className = 'color-option';
            if (color.value === bitrateTextColor) {
                colorOption.classList.add('active');
            }
            colorOption.innerHTML = `
                <span class="color-swatch" style="background-color: ${color.value}"></span>
                <span class="color-name">${color.name}</span>
            `;
            colorOption.addEventListener('click', () => {
                bitrateTextColor = color.value;
                settings.bitrateTextColor = bitrateTextColor;
                saveSettings();
                showTextOverlay(`Color: ${color.name}`);
                updateBitrateOverlay();
                updateControlPanelState();
                picker.remove();
            });
            picker.appendChild(colorOption);
        });
        
        // Position it near the color button
        const colorBtn = document.querySelector('#color-cycle');
        if (colorBtn) {
            const rect = colorBtn.getBoundingClientRect();
            picker.style.position = 'fixed';
            picker.style.top = `${rect.bottom + 5}px`;
            picker.style.right = `${window.innerWidth - rect.right}px`;
        }
        
        document.body.appendChild(picker);
        
        // Close when clicking outside
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!picker.contains(e.target) && e.target.id !== 'color-cycle') {
                    picker.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    }
    
    // Toggle volume boost
    function toggleVolumeBoost() {
      volumeBoostEnabled = !volumeBoostEnabled;
      settings.volumeBoostEnabled = volumeBoostEnabled;
      saveSettings();
      updateAudioProcessing();
      updateControlPanelState();
      
      // Start/stop safety monitoring
      if (volumeBoostEnabled || volumeNormalizationEnabled || compressorEnabled) {
        startSafetyMonitor();
      }
      
      const overlayText = volumeBoostEnabled ? `Boost ON (+${volumeBoostAmount}dB)` : "Boost OFF";
      showTextOverlay(overlayText);
    }
    
    // Adjust volume boost amount
    function adjustVolumeBoost(direction) {
      const step = 1; // 1dB steps
      const min = 0;
      const max = 20;
      
      if (direction === 'up') {
        volumeBoostAmount = Math.min(max, volumeBoostAmount + step);
      } else {
        volumeBoostAmount = Math.max(min, volumeBoostAmount - step);
      }
      
      settings.volumeBoostAmount = volumeBoostAmount;
      saveSettings();
      updateAudioProcessing();
      showTextOverlay(`Boost: +${volumeBoostAmount}dB`);
    }
    
    // Toggle volume normalization
    function toggleVolumeNormalization() {
        volumeNormalizationEnabled = !volumeNormalizationEnabled;
        settings.volumeNormalizationEnabled = volumeNormalizationEnabled;
        saveSettings();
        
        if (loudnessNormalizer) {
            loudnessNormalizer.setTarget(normalizationTargetLufs);
            if (volumeNormalizationEnabled) {
                loudnessNormalizer.enable();
            } else {
                loudnessNormalizer.disable();
            }
        }

        updateAudioProcessing();
        
        // Start/stop safety monitoring
        if (volumeBoostEnabled || volumeNormalizationEnabled || compressorEnabled) {
            startSafetyMonitor();
        }
        
        showTextOverlay(volumeNormalizationEnabled ? "Normalization ON" : "Normalization OFF");
        updateControlPanelState();
    }
    
    // Setup control panel event listeners
    function setupControlPanelEvents() {
      // Panel toggle - start collapsed
      const panelToggle = controlPanel.querySelector('#panel-toggle');
      const panelContent = controlPanel.querySelector('#panel-content');
      const panelHeader = controlPanel.querySelector('.control-panel-header');
      
      // Set global references for auto-collapse
      panelToggleRef = panelToggle;
      panelContentRef = panelContent;
      controlPanelRef = controlPanel;
      
      // Set initial collapsed state
      controlPanel.classList.add('collapsed');
      controlPanel.classList.remove('expanded');
      
      // Make entire header clickable
      const togglePanel = () => {
        isPanelCollapsed = !isPanelCollapsed;
        
        if (isPanelCollapsed) {
          // Collapsing
          controlPanel.classList.add('collapsed');
          controlPanel.classList.remove('expanded');
          panelContent.style.display = 'none';
          panelToggle.textContent = '▶';
        } else {
          // Expanding
          controlPanel.classList.remove('collapsed');
          controlPanel.classList.add('expanded');
          panelContent.style.display = 'block';
          panelToggle.textContent = '▼';
        }
      };
      
      // Add click event to entire header
      panelHeader.addEventListener('click', togglePanel);
      
      // Cancel auto-collapse when hovering over panel
      controlPanel.addEventListener('mouseenter', () => {
        cancelAutoCollapse();
      });
      
      // Volume boost controls
      const boostToggle = controlPanel.querySelector('#boost-toggle');
      const boostUp = controlPanel.querySelector('#boost-up');
      const boostDown = controlPanel.querySelector('#boost-down');
      
      boostToggle.addEventListener('click', () => {
        toggleVolumeBoost();
        updateControlPanelState();
      });
      
      boostUp.addEventListener('click', () => {
        adjustVolumeBoost('up');
        updateControlPanelState();
      });
      
      boostDown.addEventListener('click', () => {
        adjustVolumeBoost('down');
        updateControlPanelState();
      });
      
        // Volume normalization
        const normalizeToggle = controlPanel.querySelector('#normalize-toggle');
        const targetUp = controlPanel.querySelector('#target-up');
        const targetDown = controlPanel.querySelector('#target-down');
        
        normalizeToggle.addEventListener('click', () => {
            toggleVolumeNormalization();
        });
        
        targetUp.addEventListener('click', () => {
            adjustNormalizationTarget('up');
        });
        
        targetDown.addEventListener('click', () => {
            adjustNormalizationTarget('down');
        });      // Compressor controls
      const compressorToggle = controlPanel.querySelector('#compressor-toggle');
      const thresholdUp = controlPanel.querySelector('#threshold-up');
      const thresholdDown = controlPanel.querySelector('#threshold-down');
      const ratioUp = controlPanel.querySelector('#ratio-up');
      const ratioDown = controlPanel.querySelector('#ratio-down');
      
      compressorToggle.addEventListener('click', () => {
        toggleCompressor();
      });
      
      thresholdUp.addEventListener('click', () => {
        adjustCompressorThreshold('up');
        updateControlPanelState();
      });
      
      thresholdDown.addEventListener('click', () => {
        adjustCompressorThreshold('down');
        updateControlPanelState();
      });
      
      ratioUp.addEventListener('click', () => {
        adjustCompressorRatio('up');
        updateControlPanelState();
      });
      
      ratioDown.addEventListener('click', () => {
        adjustCompressorRatio('down');
        updateControlPanelState();
      });
      
      // Speed controls
      const speedUp = controlPanel.querySelector('#speed-up');
      const speedDown = controlPanel.querySelector('#speed-down');
      const speedReset = controlPanel.querySelector('#speed-reset');
      
      speedUp.addEventListener('click', () => {
        changePlaybackSpeed('up');
        updateControlPanelState();
      });
      
      speedDown.addEventListener('click', () => {
        changePlaybackSpeed('down');
        updateControlPanelState();
      });
      
      speedReset.addEventListener('click', () => {
        changePlaybackSpeed('reset');
        updateControlPanelState();
      });
      
      // Speed presets
      const presetButtons = controlPanel.querySelectorAll('.preset-btn');
      presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const speed = parseFloat(btn.dataset.speed);
          setPlaybackSpeed(speed);
          updateControlPanelState();
        });
      });
      
      // Bitrate monitor controls
      const bitrateToggle = controlPanel.querySelector('#bitrate-toggle');
      const overlayToggle = controlPanel.querySelector('#overlay-toggle');
      const bitrateMode = controlPanel.querySelector('#bitrate-mode');
      const bitrateUnitBtn = controlPanel.querySelector('#bitrate-unit');
      const bitrateReset = controlPanel.querySelector('#bitrate-reset');
      
      if (bitrateToggle) {
        bitrateToggle.addEventListener('click', () => {
          toggleBitrateMonitor();
        });
      }
      
      if (overlayToggle) {
        overlayToggle.addEventListener('click', () => {
          toggleBitrateOverlay();
        });
      }
      
      if (bitrateMode) {
        bitrateMode.addEventListener('click', () => {
          cycleBitrateDisplayMode();
        });
      }
      
      if (bitrateUnitBtn) {
        bitrateUnitBtn.addEventListener('click', () => {
          cycleBitrateUnit();
        });
      }
      
      if (bitrateReset) {
        bitrateReset.addEventListener('click', () => {
          resetBitrateMinMax();
        });
      }
      
      // Refresh rate controls
      const refreshUp = controlPanel.querySelector('#refresh-up');
      const refreshDown = controlPanel.querySelector('#refresh-down');
      
      if (refreshUp) {
        refreshUp.addEventListener('click', () => {
          adjustRefreshRate('up');
        });
      }
      
      if (refreshDown) {
        refreshDown.addEventListener('click', () => {
          adjustRefreshRate('down');
        });
      }
      
      // Opacity controls
      const opacityUp = controlPanel.querySelector('#opacity-up');
      const opacityDown = controlPanel.querySelector('#opacity-down');
      
      if (opacityUp) {
        opacityUp.addEventListener('click', () => {
          adjustOpacity('up');
        });
      }
      
      if (opacityDown) {
        opacityDown.addEventListener('click', () => {
          adjustOpacity('down');
        });
      }
      
      // Color picker
      const colorCycle = controlPanel.querySelector('#color-cycle');
      
      if (colorCycle) {
        colorCycle.addEventListener('click', (e) => {
          e.stopPropagation();
          showColorPicker();
        });
      }

    }
    
    // Set specific playback speed
    function setPlaybackSpeed(speed) {
      const video = getVideoElement();
      if (!video) return;
      
      currentPlaybackRate = speed;
      video.playbackRate = currentPlaybackRate;
      settings.playbackSpeed = currentPlaybackRate;
      saveSettings();
      showSpeedOverlay(currentPlaybackRate);
    }
    
    // Update control panel button states and values
    function updateControlPanelState() {
      if (!controlPanel.parentElement) return;
      
      // Update boost toggle button
      const boostToggle = controlPanel.querySelector('#boost-toggle .btn-text');
      const boostValue = controlPanel.querySelector('#boost-value');
      if (boostToggle) {
        boostToggle.textContent = volumeBoostEnabled ? 'ON' : 'OFF';
        boostToggle.parentElement.classList.toggle('active', volumeBoostEnabled);
      }
      if (boostValue) {
        boostValue.textContent = `${volumeBoostAmount}dB`;
      }
      
        // Update normalization toggle button
        const normalizeToggle = controlPanel.querySelector('#normalize-toggle .btn-text');
        if (normalizeToggle) {
            normalizeToggle.textContent = volumeNormalizationEnabled ? 'ON' : 'OFF';
            normalizeToggle.parentElement.classList.toggle('active', volumeNormalizationEnabled);
        }
        
        // Update normalization readouts
        const targetValue = controlPanel.querySelector('#target-value');
        if (targetValue) {
            const displayTarget = Math.round(normalizationTargetLufs * 10) / 10;
            targetValue.textContent = `${displayTarget} LUFS`;
        }
        const compensationElement = controlPanel.querySelector('#normalization-compensation');
        if (compensationElement) {
            if (loudnessNormalizer) {
                loudnessNormalizer.setDisplayElement(compensationElement);
            } else {
                compensationElement.textContent = '';
            }
        }
        
      // Update compressor toggle button
      const compressorToggle = controlPanel.querySelector('#compressor-toggle .btn-text');
      if (compressorToggle) {
        compressorToggle.textContent = compressorEnabled ? 'ON' : 'OFF';
        compressorToggle.parentElement.classList.toggle('active', compressorEnabled);
      }
      
      // Update compressor values
      const thresholdValue = controlPanel.querySelector('#threshold-value');
      const ratioValue = controlPanel.querySelector('#ratio-value');
      if (thresholdValue) {
        thresholdValue.textContent = `${compressorThreshold}dB`;
      }
      if (ratioValue) {
        ratioValue.textContent = `${compressorRatio}:1`;
      }
      
      // Update speed value
      const speedValue = controlPanel.querySelector('#speed-value');
      if (speedValue) {
        speedValue.textContent = `${currentPlaybackRate}x`;
      }
      
      // Update speed preset buttons
      const presetButtons = controlPanel.querySelectorAll('.preset-btn');
      presetButtons.forEach(btn => {
        const speed = parseFloat(btn.dataset.speed);
        btn.classList.toggle('active', speed === currentPlaybackRate);
      });
      
      // Update bitrate monitor toggle
      const bitrateToggle = controlPanel.querySelector('#bitrate-toggle .btn-text');
      if (bitrateToggle) {
        bitrateToggle.textContent = bitrateMonitorEnabled ? 'ON' : 'OFF';
        bitrateToggle.parentElement.classList.toggle('active', bitrateMonitorEnabled);
      }
      
      // Update overlay toggle
      const overlayToggle = controlPanel.querySelector('#overlay-toggle .btn-text');
      if (overlayToggle) {
        overlayToggle.textContent = bitrateOverlayVisible ? 'ON' : 'OFF';
        overlayToggle.parentElement.classList.toggle('active', bitrateOverlayVisible);
      }
      
      // Update bitrate display mode button
      const bitrateModeBtn = controlPanel.querySelector('#bitrate-mode');
      if (bitrateModeBtn) {
        const modeNames = {
          'current': 'Current',
          'average': 'Average',
          'both': 'Both',
          'minmax': 'Min/Max'
        };
        bitrateModeBtn.textContent = modeNames[bitrateDisplayMode] || 'Current';
      }
      
      // Update bitrate unit button
      const bitrateUnitBtn = controlPanel.querySelector('#bitrate-unit');
      if (bitrateUnitBtn) {
        bitrateUnitBtn.textContent = bitrateUnit;
      }
      
      // Update refresh rate display
      const refreshValue = controlPanel.querySelector('#refresh-value');
      if (refreshValue) {
        const seconds = bitrateRefreshRate / 1000;
        refreshValue.textContent = `${seconds}s`;
      }
      
      // Update opacity display
      const opacityValue = controlPanel.querySelector('#opacity-value');
      if (opacityValue) {
        opacityValue.textContent = `${Math.round(bitrateOpacity * 100)}%`;
      }
    }
    
    // Find Kick.com player control elements
    function findPlayerControls() {
      // Common selectors for Kick.com player controls
      const controlSelectors = [
        '.video-controls',
        '.player-controls',
        '.control-bar',
        '[class*="control"]',
        '[class*="player-ui"]',
        '[data-testid*="control"]',
        '.video-player-controls'
      ];
      
      for (const selector of controlSelectors) {
        const controls = document.querySelector(selector);
        if (controls) {
          return controls;
        }
      }
      return null;
    }
    
    // Check if native player controls are visible
    function arePlayerControlsVisible() {
      const controls = findPlayerControls();
      if (!controls) {
        return true; // Default to visible if we can't find controls
      }
      
      const style = window.getComputedStyle(controls);
      const isVisible = style.opacity !== '0' && style.visibility !== 'hidden' && style.display !== 'none';
      return isVisible;
    }
    
    // Update control panel visibility based on native controls
    function updateControlPanelVisibility() {
      if (!controlPanel.parentElement) return;
      
      const shouldBeVisible = arePlayerControlsVisible();
      
      if (shouldBeVisible !== controlsVisible) {
        controlsVisible = shouldBeVisible;
        controlPanel.classList.toggle('controls-hidden', !controlsVisible);
      }
    }
    
    // Setup visibility synchronization with native player controls
    function setupControlsVisibilitySync(video) {
      const videoContainer = video.parentElement;
      if (!videoContainer) {
        return;
      }
      
      // Start with panel hidden until we detect native controls
      controlsVisible = false;
      controlPanel.classList.add('controls-hidden');
      
      // Simple mouse-based visibility control
      let mouseInactivityTimer = null;
      
      const showControls = () => {
        if (mouseInactivityTimer) {
          clearTimeout(mouseInactivityTimer);
        }
        controlsVisible = true;
        controlPanel.classList.remove('controls-hidden');
      };
      
      const hideControlsAfterDelay = (delay = 300) => {
        if (mouseInactivityTimer) {
          clearTimeout(mouseInactivityTimer);
        }
        mouseInactivityTimer = setTimeout(() => {
          controlsVisible = false;
          controlPanel.classList.add('controls-hidden');
        }, delay);
      };
      
      // Mouse event listeners
      const handleMouseActivity = () => {
        showControls();
        hideControlsAfterDelay();
      };
      
      // Video events
      video.addEventListener('mouseenter', () => {
        handleMouseActivity();
        cancelAutoCollapse(); // Cancel auto-collapse when mouse returns to video
      });
      video.addEventListener('mousemove', handleMouseActivity);
      video.addEventListener('mouseleave', () => {
        hideControlsAfterDelay(200); // Hide quickly when leaving video
        
        // Schedule auto-collapse if panel is expanded
        if (!isPanelCollapsed) {
          scheduleAutoCollapse();
        }
      });
      
      // Control panel events
      controlPanel.addEventListener('mouseenter', () => {
        if (mouseInactivityTimer) {
          clearTimeout(mouseInactivityTimer);
        }
        showControls();
      });
      
      controlPanel.addEventListener('mouseleave', () => {
        hideControlsAfterDelay(200); // Quicker hide when leaving panel
      });
      
      // Fallback: if no native controls detected, keep always visible
      setTimeout(() => {
        const controls = findPlayerControls();
        if (!controls) {
          log.info('No native player controls detected - control panel will remain visible');
          if (mouseInactivityTimer) {
            clearTimeout(mouseInactivityTimer);
          }
          controlsVisible = true;
          controlPanel.classList.remove('controls-hidden');
        } else {
          log.debug('Native player controls found:', controls.className);
        }
      }, 2000);
      

      
      log.info('Control panel visibility sync initialized');
    }
  
    // Toggle play/pause on left click with improved reliability.
    let lastPlayPauseClick = 0;
    let playPauseInProgress = false;
    const playPauseDebounceDelay = 150; // Debounce clicks within 150ms
    
    function togglePlayPause() {
      const now = Date.now();
      if (now - lastPlayPauseClick < playPauseDebounceDelay) {
        log.debug('Play/Pause debounced - click too rapid');
        return; // Ignore rapid successive clicks
      }
      
      // Don't block if already in progress for too long (max 500ms)
      if (playPauseInProgress && (now - lastPlayPauseClick) < 500) {
        log.debug('Play/Pause already in progress');
        return;
      }
      
      lastPlayPauseClick = now;
      playPauseInProgress = true;
      
      const video = getVideoElement();
      if (!video) {
        log.error('Cannot toggle play/pause - video element not found');
        playPauseInProgress = false;
        return;
      }

      // Store the current state immediately
      const wasPaused = video.paused;
      log.info('Toggling playback - current state:', wasPaused ? 'PAUSED' : 'PLAYING');
      
      try {
        // First try direct video method
        if (wasPaused) {
          log.debug('Attempting to play video...');
          const playPromise = video.play();
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise
              .then(() => {
                log.info('✓ Video playback started successfully');
                playPauseInProgress = false;
              })
              .catch(error => {
                // Check if error is due to native player interference (common issue)
                if (error.name === 'AbortError' || error.message.includes('interrupted')) {
                  log.debug('Play interrupted by native player - this is normal, trying click simulation');
                } else {
                  log.warn('Direct play() failed:', error.message);
                }
                tryClickSimulation();
                playPauseInProgress = false;
              });
          } else {
            // Verify after shorter delay if no promise
            setTimeout(() => {
              if (video.paused === wasPaused) {
                log.debug('Play action needs verification, attempting click simulation');
                tryClickSimulation();
              } else {
                log.info('✓ Video playback started (legacy method)');
              }
              playPauseInProgress = false;
            }, 50);
          }
        } else {
          // Try to pause
          log.debug('Attempting to pause video...');
          video.pause();
          // Shorter verification delay
          setTimeout(() => {
            if (!video.paused) {
              log.debug('Pause may have been interrupted, attempting click simulation');
              tryClickSimulation();
            } else {
              log.info('✓ Video paused successfully');
            }
            playPauseInProgress = false;
          }, 50);
        }
        
      } catch (error) {
        log.error('Exception in togglePlayPause:', error);
        tryClickSimulation();
        playPauseInProgress = false;
      }
    }
    
    // Alternative method: try direct video calls (now used as fallback)
    function tryAlternativePlayMethod() {
      const video = getVideoElement();
      if (!video) return false;
      
      // Try calling play() directly as last resort
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
    }
    
    function tryClickSimulation() {
      // Try to find and click a play/pause button in the UI
      const playPauseSelectors = [
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
      
      for (const selector of playPauseSelectors) {
        const button = document.querySelector(selector);
        if (button && button.offsetParent) { // Check if button is visible
          try {
            button.click();
            log.info('✓ Clicked native play/pause button:', selector);
            return true;
          } catch (error) {
            log.debug('Failed to click button:', selector, error.message);
          }
        }
      }
      
      // If no button found, try creating a synthetic click on the video container
      try {
        const video = getVideoElement();
        if (video && video.parentElement) {
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
            buttons: 1
          });
          
          // Try clicking on different elements that might have handlers
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
    }
    
    function tryAlternativePauseMethod() {
      const video = getVideoElement();
      if (!video) return false;
      
      // Try calling pause() directly
      setTimeout(() => {
        if (!video.paused) {
          video.pause();
        }
      }, 50);
      
      return true;
    }
  
    // Toggle mute. When unmuting, enforce the lastVolume for a short period.
    function toggleMute() {
      const video = getVideoElement();
      if (video) {
        if (video.muted) {
          // Unmuting: disable mute and then enforce volume to lastVolume.
          video.muted = false;
          enforcingVolume = true;
          // Enforce the volume repeatedly for a short period to override any internal resets.
          const enforceVolume = () => {
            if (!video.muted && Math.abs(video.volume - lastVolume) > 0.01) {
              video.volume = lastVolume;
            }
          };
          enforceVolume();
          const enforcementInterval = setInterval(enforceVolume, 50);
          setTimeout(() => {
            clearInterval(enforcementInterval);
            enforcingVolume = false;
            showVolumeOverlay(lastVolume);
          }, 500);
        } else {
          // Muting: update lastVolume if volume > 0, then mute.
          if (video.volume > 0) {
            lastVolume = video.volume;
          }
          video.muted = true;
          showVolumeOverlay("Muted");
        }
        // Save volume state
        settings.lastVolume = lastVolume;
        saveSettings();
      }
    }
  
    // Adjust volume when the right mouse button is held and wheel is used.
    function adjustVolume(e) {
      const video = getVideoElement();
      if (video) {
        // e.deltaY < 0 means scrolling up (increase volume)
        // e.deltaY > 0 means scrolling down (decrease volume)
        let adjustment = -e.deltaY / 3300; // tweak sensitivity as needed
        let newVolume = video.volume + adjustment;
        newVolume = Math.min(1, Math.max(0, newVolume));
        video.volume = newVolume;
        if (newVolume > 0) {
          lastVolume = newVolume;
          settings.lastVolume = lastVolume;
          saveSettings();
        }
        if (video.muted && newVolume > 0) {
          video.muted = false;
        }
        showVolumeOverlay(newVolume);
      }
    }
  
    // Attach all required event listeners directly on the video element.
    function attachListeners(video) {
      if (video.__customListenersAttached) return;
      video.__customListenersAttached = true;
      
      // Add class for styling instead of inline styles
      video.classList.add('kickscroll-controlled');
      
      // Ensure video is clickable
      video.style.pointerEvents = 'auto';
  
      // Update lastVolume on any native volume change (if not muted and not during enforcement).
      video.addEventListener("volumechange", () => {
        if (!video.muted && video.volume > 0 && !enforcingVolume) {
          lastVolume = video.volume;
          settings.lastVolume = lastVolume;
          saveSettings();
        }
      });
  
      // Left click toggles play/pause with improved event handling.
      video.addEventListener("click", (e) => {
        log.debug('Click event detected - target:', e.target.tagName, e.target.className.substring(0, 50));
        
        // Only handle left clicks (button 0) and ignore if other buttons are involved
        if (e.button !== undefined && e.button !== 0) {
          log.debug('Ignoring non-left-click');
          return;
        }
        
        // Check if click is on the video itself
        const target = e.target;
        
        // Ignore clicks on our control panel
        if (target.closest('#kick-control-panel')) {
          log.debug('Ignoring click on extension control panel');
          return;
        }
        
        // Only ignore clicks if they're directly ON a button or control element
        // (not just inside a container with "control" or "button" in the class name)
        if (target.tagName === 'BUTTON' || 
            target.tagName === 'INPUT' ||
            target.getAttribute('role') === 'button') {
          log.debug('Ignoring click on native control element:', target.tagName);
          // Let native controls handle this
          return;
        }
        
        log.info('Processing click for play/pause toggle');
        
        // Only prevent default - don't stop propagation
        e.preventDefault();
        
        // Use requestAnimationFrame for better timing
        requestAnimationFrame(() => {
          togglePlayPause();
        });
      }, false); // Use bubble phase to let native handlers work first

      // mousedown handles middle click (mute) and right click (volume control).
      video.addEventListener("mousedown", (e) => {
        if (e.button === 1) { // Middle click for mute.
          toggleMute();
          e.stopPropagation();
          e.preventDefault();
        } else if (e.button === 2) { // Right click: start volume adjustment.
          isRightMouseDown = true;
          e.stopPropagation();
          e.preventDefault();
        }
      });

      // mouseup clears the right click flag.
      video.addEventListener("mouseup", (e) => {
        if (e.button === 2) {
          isRightMouseDown = false;
          e.stopPropagation();
          e.preventDefault();
        }
      });
      
      // Document-level mouseup to prevent stuck RMB state
      document.addEventListener("mouseup", (e) => {
        if (e.button === 2) {
          isRightMouseDown = false;
        }
      });
      
      // Resume audio context on any user gesture
      const resumeAudioContext = () => {
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().then(() => {
            log.info('AudioContext resumed on user gesture');
          });
        }
      };
      
      video.addEventListener('click', resumeAudioContext, { once: false });
      video.addEventListener('mousedown', resumeAudioContext, { once: false });
      video.addEventListener('wheel', resumeAudioContext, { once: false });

      // Wheel event for adjusting volume while right button is held.
      video.addEventListener("wheel", (e) => {
        if (isRightMouseDown) {
          adjustVolume(e);
          e.stopPropagation();
          e.preventDefault();
        }
      }, { passive: false });
  
      // Always disable the default context menu on the video element.
      video.addEventListener("contextmenu", (e) => {
        e.preventDefault();
      });
      

    }
    // Performance optimization: safety monitoring for gain staging
    let safetyCheckFrame = null;

    // Safety monitor to prevent dangerous audio levels
    function startSafetyMonitor() {
      if (safetyCheckFrame) return;
      safetyCheckFrame = requestAnimationFrame(() => {
        if ((volumeBoostEnabled || volumeNormalizationEnabled || compressorEnabled) && audioContext) {
          const safeLimit = 3.0;
          let normalizationLinear = 1;
          let boostLinear = 1;

          if (normalizationGainNode) {
            normalizationLinear = normalizationGainNode.gain.value;
          }
          if (outputGainNode) {
            boostLinear = outputGainNode.gain.value;
          }

          const combinedGain = normalizationLinear * boostLinear;

          if (combinedGain > safeLimit) {
            if (loudnessNormalizer) {
              loudnessNormalizer.forceCombinedCeiling(safeLimit);
            }

            if (outputGainNode) {
              const remaining = safeLimit / Math.max(normalizationGainNode ? normalizationGainNode.gain.value : 1, 0.01);
              const clampedBoost = Math.min(outputGainNode.gain.value, remaining);
              outputGainNode.gain.setValueAtTime(clampedBoost, audioContext.currentTime);
            }

            log.warn('⚠️ Emergency gain reduction triggered! Combined gain was:', combinedGain.toFixed(2));
            showTextOverlay('⚠️ Gain limited for safety');
          }
        }
        
        safetyCheckFrame = null;
        // Continue monitoring if any audio processing is active
        if (volumeBoostEnabled || volumeNormalizationEnabled || compressorEnabled) {
          setTimeout(startSafetyMonitor, 200); // Check every 200ms
        }
      });
    }
    
    // Cleanup function for performance
    function cleanup() {
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
      audioContext = null;
      sourceNode = null;
      analyzerNode = null;
      compressorNode = null;
      normalizationGainNode = null;
      outputGainNode = null;
      currentVideo = null;
      if (controlsVisibilityObserver) {
        controlsVisibilityObserver.disconnect();
      }
      if (hideControlsTimeout) {
        clearTimeout(hideControlsTimeout);
      }
      if (loudnessNormalizer) {
        loudnessNormalizer.destroy();
        loudnessNormalizer = null;
      }
      clearTimeout(volumeOverlayTimeout);
      clearTimeout(speedOverlayTimeout);
      stopBitrateMonitoring();
    }
    
    // Initialize the extension on the page with better video detection.
    function init() {
      // Load settings first
      loadSettings();
      
      // Wait a moment for settings to load, then attach and update overlay
      setTimeout(() => {
        attachBitrateOverlayToPage();
        // Force initial overlay state update based on loaded settings
        updateBitrateOverlay();
      }, 100);
      
      const video = getVideoElement();
      if (video) {
        // Wait for video to be ready before attaching listeners
        if (video.readyState >= 1) { // HAVE_METADATA or higher
          attachOverlayToVideo(video);
          attachListeners(video);
          if (volumeNormalizationEnabled && loudnessNormalizer) {
            loudnessNormalizer.enable();
          }
          
          // Start safety monitoring if any audio processing is enabled
          if (volumeBoostEnabled || volumeNormalizationEnabled || compressorEnabled) {
            startSafetyMonitor();
          }
        } else {
          // Wait for video metadata to load
          video.addEventListener('loadedmetadata', () => {
            attachOverlayToVideo(video);
            attachListeners(video);
            if (volumeNormalizationEnabled && loudnessNormalizer) {
              loudnessNormalizer.enable();
            }
          }, { once: true });
        }
      } else {
        // If no video found, try again after a short delay (max 10 tries)
        let retryCount = 0;
        const retryInit = () => {
          if (retryCount < 10) {
            retryCount++;
            setTimeout(init, 500);
          }
        };
        retryInit();
      }
    }
  
    // Initialize with multiple strategies
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
    
    // Also try to initialize when the page is fully loaded
    if (document.readyState !== "complete") {
      window.addEventListener("load", init);
    }
    
    // Cleanup on page unload
    window.addEventListener("beforeunload", cleanup);
    window.addEventListener("unload", cleanup);
  
    // Use a MutationObserver to reattach the overlay and listeners if the video element changes.
    let observerTimeout = null;
    const observer = new MutationObserver(() => {
      // Debounce observer calls for performance
      if (observerTimeout) return;
      observerTimeout = setTimeout(() => {
        const video = getVideoElement();
        if (video && !video.__customListenersAttached) {
          attachOverlayToVideo(video);
          attachListeners(video);
          if (volumeNormalizationEnabled && loudnessNormalizer) {
            loudnessNormalizer.enable();
          }
        }
        observerTimeout = null;
      }, 100);
    });
    
    // Observe with throttling for better performance
    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: false,
      characterData: false
    });
  })();
  
