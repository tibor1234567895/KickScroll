(() => {
    const KS = window.KickScroll;
    const { dom, log, state } = KS;
    const selectorsConfig = (KS.config && KS.config.selectors) || {};

    const videoSelectors = (Array.isArray(selectorsConfig.video) && selectorsConfig.video.length > 0)
        ? selectorsConfig.video.slice()
        : [
            '#video-player',
            "video[data-testid='video-player']",
            '.video-player video',
            'video'
        ];

    KS.getVideoElement = function getVideoElement() {
        for (const selector of videoSelectors) {
            const element = document.querySelector(selector);
            if (element && element.tagName === 'VIDEO') {
                return element;
            }
        }
        return null;
    };

    KS.attachBitrateOverlayToPage = function attachBitrateOverlayToPage() {
        const overlay = dom.bitrateOverlay;
        if (!overlay) {
            return;
        }
        if (!document.querySelector('#bitrate-overlay') && !document.body.contains(overlay)) {
            document.body.appendChild(overlay);
            log.info('Bitrate overlay attached to body (fixed position)');
            if (state.bitrateMonitorEnabled && state.bitrateOverlayVisible && KS.updateBitrateOverlay) {
                KS.updateBitrateOverlay();
            }
        }
    };

    KS.attachOverlayToVideo = function attachOverlayToVideo(video) {
        if (!video) {
            return;
        }

        const { ensureOverlayForVideo } = dom;
        ensureOverlayForVideo(video, dom.volumeOverlay);
        ensureOverlayForVideo(video, dom.speedOverlay);

        KS.attachBitrateOverlayToPage();

        if (!video.parentElement.querySelector('#kick-control-panel')) {
            video.parentElement.appendChild(dom.controlPanel);
            log.info('Control panel attached to video container');

            dom.controlPanel.classList.add('controls-hidden');
            state.controlsVisible = false;
            state.panelInitialized = true;

            if (KS.setupControlPanelEvents) {
                KS.setupControlPanelEvents();
            }

            setTimeout(() => {
                if (KS.updateControlPanelState) {
                    KS.updateControlPanelState();
                }
            }, 10);

            setTimeout(() => {
                if (KS.setupControlsVisibilitySync) {
                    KS.setupControlsVisibilitySync(video);
                }
            }, 1000);
        }

        KS.setupAudioProcessing(video);

        if (state.currentPlaybackRate !== 1) {
            video.playbackRate = state.currentPlaybackRate;
        }

        if (state.bitrateMonitorEnabled && KS.startBitrateMonitoring) {
            KS.startBitrateMonitoring(video);
        }
    };
})();
