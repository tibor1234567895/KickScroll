const updateUserscriptInjections = () => {
    chrome.storage.local.get('userscript_settings', async (res) => {
        const prefs = res.userscript_settings || {
            quality: true,
            sidebar: true,
            fixes: true,
            nipahtv: true
        };

        const MATCHES_URL = ["*://kick.com/*", "*://*.kick.com/*"];
        const scriptsToRegister = [];

        if (prefs.quality) {
            scriptsToRegister.push({
                id: 'userscript-quality',
                matches: MATCHES_URL,
                js: ["scripts/userscript-quality.js"],
                runAt: "document_start",
                world: "MAIN"
            });
        }
        if (prefs.sidebar) {
            scriptsToRegister.push({
                id: 'userscript-sidebar',
                matches: MATCHES_URL,
                js: ["scripts/userscript-sidebar.js"],
                runAt: "document_idle",
                world: "MAIN"
            });
        }
        if (prefs.fixes) {
            scriptsToRegister.push({
                id: 'userscript-fixes',
                matches: MATCHES_URL,
                js: ["scripts/userscript-fixes.js"],
                runAt: "document_end",
                world: "MAIN"
            });
        }
        if (prefs.nipahtv) {
            scriptsToRegister.push({
                id: 'userscript-nipahtv',
                matches: MATCHES_URL,
                js: ["scripts/NipahTV-1.5.79.js"],
                css: ["scripts/nipahtv.css"],
                runAt: "document_end",
                world: "MAIN"
            });
        }

        try {
            await chrome.scripting.unregisterContentScripts();
            if (scriptsToRegister.length > 0) {
                await chrome.scripting.registerContentScripts(scriptsToRegister);
            }
            console.log("Userscripts updated dynamically");
        } catch (err) {
            console.error("Failed handling dynamic scripts:", err);
        }
    });
};

chrome.runtime.onInstalled.addListener(() => {
    updateUserscriptInjections();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'apply_userscript_settings') {
        updateUserscriptInjections();
    }
});