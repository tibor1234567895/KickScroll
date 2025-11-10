(() => {
    const KS = window.KickScroll;
    const dom = KS.dom = KS.dom || {};

    function ensureContainerIsPositioned(container) {
        if (!container) {
            return;
        }
        const style = window.getComputedStyle(container);
        if (style.position === 'static') {
            container.style.position = 'relative';
        }
    }

    function ensureOverlayForVideo(video, overlayElement) {
        if (!video || !overlayElement) {
            return false;
        }
        const container = video.parentElement;
        if (!container) {
            return false;
        }

        ensureContainerIsPositioned(container);

        if (overlayElement.parentElement !== container) {
            container.appendChild(overlayElement);
        }
        return true;
    }

    const volumeOverlay = document.createElement('div');
    volumeOverlay.id = 'volume-overlay';
    volumeOverlay.innerHTML = `
      <span class="kvw-icon" aria-hidden="true">🔊</span>
      <span class="kvw-label">100%</span>
      <div class="kvw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span></span></div>
    `;

    const speedOverlay = document.createElement('div');
    speedOverlay.id = 'speed-overlay';
    speedOverlay.textContent = '1x';

    const bitrateOverlay = document.createElement('div');
    bitrateOverlay.id = 'bitrate-overlay';
    bitrateOverlay.textContent = '-- Mbps';
    bitrateOverlay.style.opacity = '0';

    const controlPanel = document.createElement('div');
    controlPanel.id = 'kick-control-panel';
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

    dom.ensureContainerIsPositioned = ensureContainerIsPositioned;
    dom.ensureOverlayForVideo = ensureOverlayForVideo;
    dom.volumeOverlay = volumeOverlay;
    dom.speedOverlay = speedOverlay;
    dom.bitrateOverlay = bitrateOverlay;
    dom.controlPanel = controlPanel;
})();
