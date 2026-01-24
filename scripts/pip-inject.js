(function () {
    'use strict';

    try {
        // page-level suppression flag
        window.__KS_suppressPiP = window.__KS_suppressPiP || false;

        // Wrap the element-level requestPictureInPicture
        const originalReq = HTMLVideoElement.prototype.requestPictureInPicture;
        if (typeof originalReq === 'function') {
            HTMLVideoElement.prototype.requestPictureInPicture = function () {
                if (window.__KS_suppressPiP) {
                    console.info('[KS-PiP] Blocked requestPictureInPicture (page) - caller:', new Error().stack.split('\n')[2]?.trim());
                    return Promise.resolve();
                }
                return originalReq.apply(this, arguments);
            };
        }

        // Also wrap document.exitPictureInPicture for debugging/logging
        const originalExit = document.exitPictureInPicture;
        if (typeof originalExit === 'function') {
            document.exitPictureInPicture = function () {
                console.info('[KS-PiP] document.exitPictureInPicture called (page) - caller:', new Error().stack.split('\n')[2]?.trim());
                return originalExit.apply(this, arguments);
            };
        }

        // Listen for events that toggle the suppression flag
        document.addEventListener('kickscroll-suppress-pip-on', () => { window.__KS_suppressPiP = true; });
        document.addEventListener('kickscroll-suppress-pip-off', () => { window.__KS_suppressPiP = false; });

        console.info('[KS-PiP] Page-level PiP suppression script loaded');
    } catch (e) {
        console.debug('[KS-PiP] Failed to initialize page PiP suppression:', e && e.message ? e.message : e);
    }
})();
