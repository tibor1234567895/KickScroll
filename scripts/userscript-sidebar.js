// ==UserScript==
// @name         Kick.com Sidebar Tweaks (Auto Show More & Hide Recommended)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Hides Recommended section completely. Auto-clicks until offline, then resumes full auto-click if user manually clicks.
// @author       You
// @match        *://*.kick.com/*
// @match        *://kick.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kick.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- SETTINGS ---
    const CLICK_DELAY_MS = 100; // 100ms delay as requested

    // --- STATE VARIABLES ---
    let isClicking = false;
    let mode = 'EXPAND_ONLINE'; // States: 'EXPAND_ONLINE', 'STOPPED', 'EXPAND_ALL'

    function hideRecommended() {
        const sections = document.querySelectorAll('section');
        sections.forEach(section => {
            const headerDiv = section.querySelector('div');

            if (headerDiv && headerDiv.textContent.trim() === 'Recommended') {
                // 1. Hide the main Recommended list section
                section.style.setProperty('display', 'none', 'important');

                // 2. Hide the stray "Show More / Show Less" buttons that Kick places outside the section
                const nextSibling = section.nextElementSibling;
                if (nextSibling && nextSibling.textContent.includes('Show More')) {
                    nextSibling.style.setProperty('display', 'none', 'important');
                }
            }
        });
    }

    function checkAndClickShowMore() {
        // If we reached the offline channels and are waiting, do nothing
        if (mode === 'STOPPED') return;

        // ONLY target the button belonging to the Following section
        const showMoreBtn = document.querySelector('button[data-testid="sidebar-show-more-following"]');
        if (!showMoreBtn) return;

        // --- DETECT MANUAL USER CLICKS ---
        // If we haven't attached a listener to this button yet, add one
        if (!showMoreBtn.dataset.listenerAttached) {
            showMoreBtn.addEventListener('click', (e) => {
                // e.isTrusted is true ONLY if a real human mouse click triggered it
                // Script-triggered .click() events return false
                if (e.isTrusted) {
                    if (mode === 'STOPPED' || mode === 'EXPAND_ONLINE') {
                        // The user clicked it manually! Switch to EXPAND_ALL mode to grab the rest
                        mode = 'EXPAND_ALL';
                        setTimeout(runTweaks, 250); // Give it a tiny pause to load, then resume auto-clicking
                    }
                }
            });
            showMoreBtn.dataset.listenerAttached = 'true';
        }

        // --- CHECK FOR OFFLINE STREAMERS (Only if we are in EXPAND_ONLINE mode) ---
        if (mode === 'EXPAND_ONLINE') {
            const visibleChannels = Array.from(document.querySelectorAll('a.flex.h-11')).filter(channel => {
                return channel.offsetParent !== null; // Ensure we only check channels visibly on screen
            });

            let offlineStreamerFound = false;
            for (const channel of visibleChannels) {
                // Look for the green live dot
                const hasGreenDot = channel.querySelector('.bg-green-500');
                if (!hasGreenDot) {
                    offlineStreamerFound = true;
                    break;
                }
            }

            // If we found an offline streamer, go to sleep and wait for user to click manually
            if (offlineStreamerFound) {
                mode = 'STOPPED';
                return;
            }
        }

        // --- EXECUTE AUTO CLICK ---
        if (!isClicking) {
            isClicking = true;
            setTimeout(() => {
                // Re-fetch button to ensure it hasn't disappeared from DOM during the 100ms wait
                const btn = document.querySelector('button[data-testid="sidebar-show-more-following"]');

                // If the button exists, isn't greyed out/disabled, and we aren't stopped
                if (btn && !btn.disabled && mode !== 'STOPPED') {
                    btn.click(); // Trigger script click (e.isTrusted will be false)
                }

                isClicking = false;
            }, CLICK_DELAY_MS);
        }
    }

    function runTweaks() {
        hideRecommended();
        checkAndClickShowMore();
    }

    // Run immediately on page load
    runTweaks();

    // Re-run whenever Kick pushes updates to the side-bar dynamically
    const observer = new MutationObserver(() => {
        runTweaks();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();