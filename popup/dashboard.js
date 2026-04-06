document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const togNTV = document.getElementById('toggle-ntv');
    const togQuality = document.getElementById('toggle-quality');
    const togSidebar = document.getElementById('toggle-sidebar');
    const togFixes = document.getElementById('toggle-fixes');

    // Load initial states from chrome.storage
    chrome.storage.local.get('userscript_settings', (res) => {
        const prefs = res.userscript_settings || {
            quality: true,
            sidebar: true,
            fixes: true,
            nipahtv: true
        };

        togNTV.checked = prefs.nipahtv;
        togQuality.checked = prefs.quality;
        togSidebar.checked = prefs.sidebar;
        togFixes.checked = prefs.fixes;
    });

    // Save and message background script when toggled
    const saveAndApply = () => {
        const newPrefs = {
            nipahtv: togNTV.checked,
            quality: togQuality.checked,
            sidebar: togSidebar.checked,
            fixes: togFixes.checked
        };
        
        chrome.storage.local.set({ userscript_settings: newPrefs }, () => {
            chrome.runtime.sendMessage({ action: 'apply_userscript_settings' });
            // Optionally, signal active tab to reload so changes occur immediately
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].url.includes("kick.com")) {
                    chrome.tabs.reload(tabs[0].id);
                }
            });
        });
    };

    // Attach listeners
    togNTV.addEventListener('change', saveAndApply);
    togQuality.addEventListener('change', saveAndApply);
    togSidebar.addEventListener('change', saveAndApply);
    togFixes.addEventListener('change', saveAndApply);
});