(() => {
    const KS = window.KickScroll;
    const { state, dom, log } = KS;
    const selectorsConfig = (KS.config && KS.config.selectors) || {};
    const initConfig = (KS.config && KS.config.init) || {};

    const controlSelectors = (Array.isArray(selectorsConfig.playerControls) && selectorsConfig.playerControls.length > 0)
        ? selectorsConfig.playerControls.slice()
        : [
            '.video-controls',
            '.player-controls',
            '.control-bar',
            '[class*="control"]',
            '[class*="player-ui"]',
            '[data-testid*="control"]',
            '.video-player-controls'
        ];
    const controlsDiscoveryDelay = typeof initConfig.controlsDiscoveryDelayMs === 'number'
        ? initConfig.controlsDiscoveryDelayMs
        : 2000;

    KS.findPlayerControls = function findPlayerControls() {
        for (const selector of controlSelectors) {
            const controls = document.querySelector(selector);
            if (controls) {
                return controls;
            }
        }
        return null;
    };

    KS.arePlayerControlsVisible = function arePlayerControlsVisible() {
        const controls = KS.findPlayerControls();
        if (!controls) {
            return true;
        }

        const style = window.getComputedStyle(controls);
        return style.opacity !== '0' && style.visibility !== 'hidden' && style.display !== 'none';
    };

    KS.updateControlPanelVisibility = function updateControlPanelVisibility() {
        if (!dom.controlPanel || !dom.controlPanel.parentElement) {
            return;
        }

        const shouldBeVisible = KS.arePlayerControlsVisible();

        if (shouldBeVisible !== state.controlsVisible) {
            state.controlsVisible = shouldBeVisible;
            dom.controlPanel.classList.toggle('controls-hidden', !state.controlsVisible);
        }
    };

    KS.setupControlsVisibilitySync = function setupControlsVisibilitySync(video) {
        const videoContainer = video.parentElement;
        if (!videoContainer) {
            return;
        }

        const panel = dom.controlPanel;
        if (!panel) {
            return;
        }

        state.controlsVisible = false;
        panel.classList.add('controls-hidden');

        let mouseInactivityTimer = null;

        const showControls = () => {
            if (mouseInactivityTimer) {
                clearTimeout(mouseInactivityTimer);
            }
            state.controlsVisible = true;
            panel.classList.remove('controls-hidden');
        };

        const hideControlsAfterDelay = (delay = 300) => {
            if (mouseInactivityTimer) {
                clearTimeout(mouseInactivityTimer);
            }
            mouseInactivityTimer = setTimeout(() => {
                state.controlsVisible = false;
                panel.classList.add('controls-hidden');
            }, delay);
        };

        const handleMouseActivity = () => {
            showControls();
            hideControlsAfterDelay();
        };

        video.addEventListener('mouseenter', () => {
            handleMouseActivity();
            KS.cancelAutoCollapse();
        });
        video.addEventListener('mousemove', handleMouseActivity);
        video.addEventListener('mouseleave', () => {
            hideControlsAfterDelay(200);
            if (!state.isPanelCollapsed) {
                KS.scheduleAutoCollapse();
            }
        });

        panel.addEventListener('mouseenter', () => {
            if (mouseInactivityTimer) {
                clearTimeout(mouseInactivityTimer);
            }
            showControls();
        });

        panel.addEventListener('mouseleave', () => {
            hideControlsAfterDelay(200);
        });

        setTimeout(() => {
            const controls = KS.findPlayerControls();
            if (!controls) {
                log.info('No native player controls detected - control panel will remain visible');
                if (mouseInactivityTimer) {
                    clearTimeout(mouseInactivityTimer);
                }
                state.controlsVisible = true;
                panel.classList.remove('controls-hidden');
            } else {
                log.debug('Native player controls found:', controls.className);
            }
        }, controlsDiscoveryDelay);

        log.info('Control panel visibility sync initialized');
    };
})();
