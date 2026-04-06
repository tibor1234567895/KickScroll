// ==UserScript==
// @name         Set Kick.com Stream Quality to Max Available
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Automatically detects and sets the highest available stream quality on Kick.com
// @author       You
// @match        https://kick.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const MONITOR_INTERVAL_MS = 2000;
  const LOG_PREFIX = '[Kick Quality]';
  const DEBUG = false;

  let maxAvailableQuality = null;
  let monitorId = null;
  let lastUrl = location.href;
  let lastChannel = null;
  let urlCheckId = null;
  let fetchedManifestUrls = new Set();

  const log = (...args) => console.log(LOG_PREFIX, ...args);
  const debug = (...args) => { if (DEBUG) console.log(LOG_PREFIX, '[DEBUG]', ...args); };

  // Extract channel name from URL
  const getChannelFromUrl = (url) => {
    const match = url.match(/kick\.com\/([^\/\?]+)/);
    return match ? match[1].toLowerCase() : null;
  };

  // Check if URL is a master manifest
  const isMasterManifestUrl = (url) => {
    if (!url) return false;
    return url.includes('playback.live-video.net') && /\.m3u8(\?|$)/.test(url);
  };

  const setQuality = (quality, reason) => {
    const qualityStr = String(quality);
    log(`${reason}. Setting stream_quality to "${qualityStr}"`);

    // Set in storage
    sessionStorage.setItem('stream_quality', qualityStr);
    sessionStorage.setItem('streamQuality', qualityStr);
    try {
      localStorage.setItem('stream_quality', qualityStr);
      localStorage.setItem('streamQuality', qualityStr);
    } catch (_) { }

    // Dispatch storage event to notify any listeners
    try {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'stream_quality',
        newValue: qualityStr,
        storageArea: sessionStorage
      }));
    } catch (_) { }

    // Try to click quality selector in the player UI
    setTimeout(() => tryClickQualityOption(qualityStr), 500);
    setTimeout(() => tryClickQualityOption(qualityStr), 1500);
  };

  // Try to find and click the quality option in Kick's player
  const tryClickQualityOption = (qualityStr) => {
    // Try to find quality options by text content
    const allButtons = document.querySelectorAll('button, [role="menuitemradio"], [role="option"], [role="menuitem"]');
    for (const btn of allButtons) {
      const text = btn.textContent?.trim() || '';
      if (text.includes(qualityStr + 'p') || text === qualityStr + 'p' || text === `${qualityStr}p60` || text === `${qualityStr}p30`) {
        debug(`Found quality button with text: "${text}", clicking...`);
        btn.click();
        return true;
      }
    }
    return false;
  };

  const parseManifest = (manifestText) => {
    const lines = manifestText.split('\n');
    const qualities = [];
    const groupIdToName = {};

    for (const line of lines) {
      if (line.startsWith('#EXT-X-MEDIA:') && line.includes('TYPE=VIDEO')) {
        const groupIdMatch = line.match(/GROUP-ID="([^"]+)"/);
        const nameMatch = line.match(/NAME="([^"]+)"/);
        if (groupIdMatch && nameMatch) {
          groupIdToName[groupIdMatch[1]] = nameMatch[1];
        }
      }
    }

    for (const line of lines) {
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
        const videoMatch = line.match(/VIDEO="([^"]+)"/);
        if (resMatch && videoMatch) {
          const groupId = videoMatch[1];
          const name = groupIdToName[groupId] || groupId;
          const qualityFromName = name.match(/(\d+)p/);
          const height = qualityFromName ? parseInt(qualityFromName[1], 10) : parseInt(resMatch[2], 10);
          qualities.push({ name, height });
        }
      }
    }
    return qualities.sort((a, b) => b.height - a.height);
  };

  const processManifest = (manifestText, source = 'unknown') => {
    debug(`[${source}] Processing manifest, length: ${manifestText.length}`);

    if (!manifestText.includes('#EXT-X-STREAM-INF')) {
      debug(`[${source}] Not a master playlist`);
      return false;
    }

    const qualities = parseManifest(manifestText);
    debug(`[${source}] Found ${qualities.length} qualities`);

    if (qualities.length > 0) {
      maxAvailableQuality = qualities[0].height;
      log(`[${source}] Available qualities: ${qualities.map(q => q.name).join(', ')}`);
      log(`Max quality: ${maxAvailableQuality}p`);
      setQuality(maxAvailableQuality, 'Setting to max available');
      return true;
    }
    return false;
  };

  // Fetch channel info from Kick API and get playback URL
  const fetchChannelPlaybackUrl = async (channel) => {
    try {
      debug(`[api] Fetching channel info for: ${channel}`);
      const response = await fetch(`https://kick.com/api/v2/channels/${channel}`);
      if (!response.ok) {
        debug(`[api] Response not OK: ${response.status}`);
        return null;
      }
      const data = await response.json();
      const playbackUrl = data?.playback_url;
      if (playbackUrl) {
        debug(`[api] Found playback URL`);
        return playbackUrl;
      }
      debug(`[api] No playback_url in response`);
      return null;
    } catch (e) {
      debug(`[api] Error: ${e.message}`);
      return null;
    }
  };

  // Detect and set quality for a channel
  const detectQualityForChannel = async (channel) => {
    debug(`Detecting quality for channel: ${channel}`);

    // First try to get playback URL from API
    const playbackUrl = await fetchChannelPlaybackUrl(channel);
    if (playbackUrl) {
      try {
        debug(`Fetching manifest from API URL`);
        const manifestResponse = await fetch(playbackUrl);
        const manifestText = await manifestResponse.text();
        if (processManifest(manifestText, 'api')) {
          return true;
        }
      } catch (e) {
        debug(`Error fetching manifest: ${e.message}`);
      }
    }

    // Fallback: try to find in page scripts
    debug(`Trying to find playback URL in page...`);
    for (const script of document.querySelectorAll('script')) {
      const content = script.textContent || '';
      if (!content.includes('.m3u8')) continue;

      const match = content.match(/\\"playback_url\\"\s*:\s*\\"([^"\\]+\.m3u8[^"\\]*)\\"/);
      if (match?.[1]) {
        const url = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        debug(`Found URL in page: ${url.substring(0, 80)}...`);
        try {
          const manifestResponse = await fetch(url);
          const manifestText = await manifestResponse.text();
          if (processManifest(manifestText, 'page')) {
            return true;
          }
        } catch (e) {
          debug(`Error: ${e.message}`);
        }
      }
    }

    return false;
  };

  // Intercept fetch for immediate manifest detection
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (isMasterManifestUrl(url) && !fetchedManifestUrls.has(url)) {
        debug('[fetch] Intercepted master manifest');
        fetchedManifestUrls.add(url);
        const clone = response.clone();
        const text = await clone.text();
        processManifest(text, 'fetch');
      }
    } catch (e) { }
    return response;
  };

  // Monitor for quality drops
  const startMonitoring = () => {
    if (monitorId) return;
    monitorId = setInterval(() => {
      if (!maxAvailableQuality) return;

      const current = sessionStorage.getItem('stream_quality');
      const currentNum = current ? parseInt(current.match(/\d+/)?.[0] || '0', 10) : 0;
      if (currentNum < maxAvailableQuality) {
        setQuality(maxAvailableQuality, `Quality dropped to ${currentNum}p, restoring`);
      }
    }, MONITOR_INTERVAL_MS);
  };

  // URL watcher - detect channel changes
  const startUrlWatcher = () => {
    if (urlCheckId) return;
    urlCheckId = setInterval(() => {
      const currentUrl = location.href;
      const currentChannel = getChannelFromUrl(currentUrl);

      if (currentChannel && currentChannel !== lastChannel) {
        log(`Channel changed to: ${currentChannel}`);
        lastUrl = currentUrl;
        lastChannel = currentChannel;
        maxAvailableQuality = null;
        fetchedManifestUrls.clear();

        // IMMEDIATELY set to 1080 as a guess (before Kick's player starts)
        // This will be corrected after API call if needed
        setQuality(1080, 'Pre-setting to max (will verify)');

        // Fetch actual quality for new channel
        detectQualityForChannel(currentChannel);
      }
    }, 500);
  };

  window.addEventListener('beforeunload', () => {
    if (monitorId) clearInterval(monitorId);
    if (urlCheckId) clearInterval(urlCheckId);
  });

  // Initial detection
  const init = () => {
    const channel = getChannelFromUrl(location.href);
    if (channel) {
      lastChannel = channel;
      log(`Initial channel: ${channel}`);
      detectQualityForChannel(channel);
    }
  };

  log('Loaded v3.1 - Using Kick API');
  startMonitoring();
  startUrlWatcher();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
