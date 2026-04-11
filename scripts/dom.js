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
    <div class="ks-modal-overlay" id="ks-modal-overlay" style="display: none;">
        <div class="ks-modal-container">
            <div class="ks-modal-sidebar">
                <button class="ks-sidebar-item active" data-target="ks-tab-audio">
                    <svg viewBox="0 0 24 24"><path d="M12 3v18M8 8v8M4 11v2M16 8v8M20 11v2" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button class="ks-sidebar-item" data-target="ks-tab-playback">
                    <svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z" stroke="currentColor" fill="none" stroke-width="2" stroke-linejoin="round"/></svg>
                </button>
                <button class="ks-sidebar-item" data-target="ks-tab-bitrate">
                    <svg viewBox="0 0 24 24"><path d="M4 4h16M4 12h16M4 20h16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
                <button class="ks-sidebar-item" data-target="ks-tab-tweaks" title="Tweaks & Extensions">
                    <svg viewBox="0 0 24 24"><path d="M12 9v12M12 9A3 3 0 0012 3a3 3 0 000 6zM8 9A3 3 0 008 3H4v6h4zM16 9A3 3 0 0016 3h4v6h-4M4 15h16M4 21h16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>
            
            <div class="ks-modal-content">
                <div class="ks-modal-header">
                    <h2 class="ks-modal-title">KickScroll Settings</h2>
                    <button class="ks-modal-close" id="ks-close-modal">
                        <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                </div>
                
                <div class="ks-modal-body">
                    <!-- AUDIO TAB -->
                    <div class="ks-tab-content active" id="ks-tab-audio">
                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>Volume Boost</h3>
                                <p>Enhance maximum volume past limits</p>
                            </div>
                            <button class="ks-switch" id="boost-toggle"><div class="ks-knob"></div></button>
                        </div>
                        <div class="ks-setting-row sub-setting">
                            <span class="ks-lbl">Boost Level</span>
                            <div class="ks-stepper">
                                <button id="boost-down">−</button><span id="boost-value"></span><button id="boost-up">+</button>
                            </div>
                        </div>

                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>Normalization</h3>
                                <p>Auto-level quiet streams</p>
                            </div>
                            <button class="ks-switch" id="normalize-toggle"><div class="ks-knob"></div></button>
                        </div>
                        <div class="ks-setting-row sub-setting">
                            <span class="ks-lbl">Target Loudness</span>
                            <div class="ks-stepper">
                                <button id="target-down">−</button><span id="target-value"></span><button id="target-up">+</button>
                            </div>
                        </div>

                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>Compressor</h3>
                                <p>Prevent deafening shouts</p>
                            </div>
                            <button class="ks-switch" id="compressor-toggle"><div class="ks-knob"></div></button>
                        </div>
                        <div class="ks-setting-row sub-setting">
                            <span class="ks-lbl">Threshold</span>
                            <div class="ks-stepper">
                                <button id="threshold-down">−</button><span id="threshold-value"></span><button id="threshold-up">+</button>
                            </div>
                        </div>
                        <div class="ks-setting-row sub-setting">
                            <span class="ks-lbl">Ratio</span>
                            <div class="ks-stepper">
                                <button id="ratio-down">−</button><span id="ratio-value"></span><button id="ratio-up">+</button>
                            </div>
                        </div>
                        <div class="ks-setting-row sub-setting">
                            <span class="ks-lbl">FFZ Gain</span>
                            <div class="ks-stepper">
                                <button id="ffz-gain-down">−</button><span id="ffz-gain-value"></span><button id="ffz-gain-up">+</button>
                            </div>
                        </div>

                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>FFZ Mode</h3>
                                <p>Use FFZ specific audio parameters</p>
                            </div>
                            <button class="ks-switch" id="ffz-mode-toggle"><div class="ks-knob"></div></button>
                        </div>

                    </div>
                    
                    <!-- PLAYBACK TAB -->
                    <div class="ks-tab-content" id="ks-tab-playback">
                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>PiP Guard</h3>
                                <p>Prevent unwanted Picture in Picture transitions</p>
                            </div>
                            <button class="ks-switch" id="pip-guard-toggle"><div class="ks-knob"></div></button>
                        </div>

                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>Playback Speed</h3>
                                <p>Adjust speed for VODs</p>
                            </div>
                            <div class="ks-speed-presets">
                                <button class="ks-speed-btn" data-speed="0.5">0.5x</button>
                                <button class="ks-speed-btn" data-speed="1.0">1x</button>
                                <button class="ks-speed-btn" data-speed="1.25">1.25x</button>
                                <button class="ks-speed-btn" data-speed="1.5">1.5x</button>
                                <button class="ks-speed-btn" data-speed="2.0">2x</button>
                            </div>
                        </div>
                    </div>

                    <!-- BITRATE TAB -->
                    <div class="ks-tab-content" id="ks-tab-bitrate">
                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>Monitor Bitrate</h3>
                                <p>Track stream quality in real-time</p>
                            </div>
                            <button class="ks-switch" id="bitrate-toggle"><div class="ks-knob"></div></button>
                        </div>
                        
                        <div class="ks-setting-row sub-setting" style="background: rgba(0, 231, 1, 0.1); border-radius: 8px; border: 1px solid rgba(0, 231, 1, 0.5);">
                            <span class="ks-lbl" style="color: #00e701; font-weight: bold; letter-spacing: 0.5px;">Live Bitrate:</span>
                            <span id="bitrate-display" style="font-family: inherit; font-size: 14px; font-weight: bold; color: #fff;">-- Mbps</span>
                        </div>

                        <div class="ks-setting-row sub-setting">
                            <span class="ks-lbl">Floating Overlay Unit</span>
                            <button class="ks-switch" id="overlay-toggle"><div class="ks-knob"></div></button>
                        </div>

                        <div class="ks-setting-row sub-setting">
                            <span class="ks-lbl">Update Rate</span>
                            <div class="ks-stepper">
                                <button id="refresh-down">−</button><span id="refresh-value">1s</span><button id="refresh-up">+</button>
                            </div>
                        </div>
                    </div>

                    <!-- TWEAKS TAB -->
                    <div class="ks-tab-content" id="ks-tab-tweaks">
                        <div class="ks-setting-row" style="padding-bottom: 5px;">
                            <span class="ks-lbl" style="font-size: 12px; color: #ffb800; text-align: center; width: 100%; display: block;">Page reload required to apply these changes.</span>
                        </div>
                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>NipahTV (Emotes)</h3>
                                <p>Enable custom 7TV/BTTV/FFZ emotes</p>
                            </div>
                            <button class="ks-switch" id="toggle-ntv"><div class="ks-knob"></div></button>
                        </div>
                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>Max Stream Quality</h3>
                                <p>Force source quality automatically</p>
                            </div>
                            <button class="ks-switch" id="toggle-quality"><div class="ks-knob"></div></button>
                        </div>
                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>Sidebar Tweaks</h3>
                                <p>Collapse and adjust sidebar layout</p>
                            </div>
                            <button class="ks-switch" id="toggle-sidebar"><div class="ks-knob"></div></button>
                        </div>
                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>Display & Navbar Fixes</h3>
                                <p>Various UI improvements and scaling</p>
                            </div>
                            <button class="ks-switch" id="toggle-fixes"><div class="ks-knob"></div></button>
                        </div>
                        <div class="ks-setting-row">
                            <div class="ks-setting-info">
                                <h3>Debug Logging</h3>
                                <p>Print debug info to console</p>
                            </div>
                            <button class="ks-switch" id="debug-toggle"><div class="ks-knob"></div></button>
                        </div>
                    </div>
                </div>
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

    const navButton = document.createElement('button');
    navButton.id = 'ks-nav-button';
    navButton.className = 'ks-nav-button';
    navButton.title = 'KickScroll Settings';
    navButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>';
    dom.navButton = navButton;
})();
