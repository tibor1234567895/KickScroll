// ==UserScript==
// @name         Kick.com fixes: navbar, no black bars, mute homepage once
// @namespace    http://tampermonkey.net/
// @version      2.8
// @description  Adjust navbar height, zero channel-info height to fill video, and mute homepage previews once
// @match        https://kick.com/*
// @match        https://www.kick.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // --- LOGGING CONTROL ---
  const DEBUG_ENABLED = false; // Set to true to see logs in real-time
  window.KICK_DEBUG_DATA = [];  // Stores logs internally

  function debugLog(message, data = '') {
    const entry = { time: new Date().toLocaleTimeString(), message, data };
    window.KICK_DEBUG_DATA.push(entry);

    if (DEBUG_ENABLED) {
      const STYLE = 'background: #00e701; color: #000; font-weight: bold; padding: 2px 5px; border-radius: 3px;';
      console.log(`%c##KICK_DEBUG##`, STYLE, message, data);
    }
  }

  // Helper for you to check logs manually if it breaks
  window.showKickLogs = () => {
    console.log("--- KICK SCRIPT LOG HISTORY ---");
    console.table(window.KICK_DEBUG_DATA);
  };

  // --- LOGIC ---
  const isHome = () => location.pathname === '/' || location.pathname === '';
  let didMuteOnThisHomeView = false;
  const NAV_SEL = 'nav.bg-surface-lowest, nav.bg-surface-lower, nav.flex.h-\\[--navbar-height\\]';

  function modifyNavbar() {
    const nav = document.querySelector(NAV_SEL);
    if (nav) {
      if (!nav.classList.contains('modified')) {
        debugLog('Navbar found. Applying height fix.');
        nav.classList.remove('h-[--navbar-height]');
        nav.classList.add('h-[--navbar-height-3]', 'modified');
      }
      return true;
    }
    return false;
  }

  function zeroChannelInfoHeight() {
    const root = document.documentElement;
    if (getComputedStyle(root).getPropertyValue('--channel-info-height') !== '0px') {
        root.style.setProperty('--channel-info-height', '0px', 'important');
    }
  }

  function syncNavbarVar() {
    const nav = document.querySelector(NAV_SEL);
    if (nav) {
        const actualHeight = Math.round(nav.getBoundingClientRect().height);
        if (actualHeight > 0) {
            document.documentElement.style.setProperty('--navbar-height', actualHeight + 'px');
        }
    }
  }

  function muteHomepagePreviewsOnce() {
    if (!isHome() || didMuteOnThisHomeView) return;
    didMuteOnThisHomeView = true;

    let attempts = 0;
    const attempt = () => {
      const container = document.getElementById('main-container');
      if (!container && attempts++ < 15) {
          setTimeout(attempt, 300);
          return;
      }

      let acted = false;
      container?.querySelectorAll('button[aria-label="Mute"]').forEach(btn => {
        if (!btn.dataset._autoMuted) {
          btn.click();
          btn.dataset._autoMuted = '1';
          acted = true;
        }
      });

      container?.querySelectorAll('video').forEach(v => {
        if (!v.muted) { v.muted = true; acted = true; }
      });

      if (acted) debugLog('Muted homepage previews.');
      else if (attempts++ < 15) setTimeout(attempt, 300);
    };
    attempt();
  }

  const runAll = () => {
    modifyNavbar();
    syncNavbarVar();
    zeroChannelInfoHeight();
  };

  const observer = new MutationObserver(() => {
    runAll();
  });

  function init() {
    debugLog('Script version 2.8 active.');
    runAll();
    if (document.body) {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }
    if (isHome()) muteHomepagePreviewsOnce();
  }

  init();

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      didMuteOnThisHomeView = false;
      debugLog('URL Change: ' + lastUrl);
      runAll();
      if (isHome()) muteHomepagePreviewsOnce();
    }
  }, 1000);

})();