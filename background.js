const FEATURE_KEYS = [
    'masterEnabled',
    'featureFileScanEnabled',
    'featureQueueingEnabled',
    'featureQueueingAction',
    'featureNextDayEnabled',
    'featureNextDayAutoStartEnabled',
    'featureCheckoutEnabled',
    'featureCheckoutAction',
    'featureOneItemPerBoxEnabled',
    'featureTTSEnabled',
    'featureTTSLocationEnabled',
    'featureTTSAmountEnabled',
    'featureNextDayAutoScanEnabled',
    'featureToAutoScanEnabled'
];

const MIDNIGHT_ALARM = 'disableFeaturesAtMidnight';
const KIOSK_CLOSE_ALARM = 'kioskCloseAtNight';
const KIOSK_OPEN_ALARM = 'kioskOpenInMorning';

function disableAllFeatures() {
    const statesToSave = {};
    FEATURE_KEYS.forEach(key => {
        statesToSave[key] = false;
    });
    chrome.storage.sync.set(statesToSave);
}

function getScheduledTime(hour, minute) {
    const now = new Date();
    const time = new Date();
    time.setHours(hour, minute, 0, 0);
    if (now.getTime() > time.getTime()) {
        time.setDate(time.getDate() + 1);
    }
    return time.getTime();
}

function scheduleKioskAlarms(isKioskEnabled) {
    chrome.alarms.clear(KIOSK_CLOSE_ALARM);
    chrome.alarms.clear(KIOSK_OPEN_ALARM);

    if (isKioskEnabled) {
        chrome.alarms.create(KIOSK_CLOSE_ALARM, { when: getScheduledTime(22, 30), periodInMinutes: 24 * 60 });
        chrome.alarms.create(KIOSK_OPEN_ALARM, { when: getScheduledTime(11, 30), periodInMinutes: 24 * 60 });
    }
}

async function sendMessageToShopeeTabs(message) {
    try {
        const tabs = await chrome.tabs.query({ url: "https://sp.spx.shopee.tw/*" });
        if (!tabs || tabs.length === 0) {
            return false;
        }

        let sentCount = 0;
        for (const tab of tabs) {
            if (tab.id) {
                chrome.tabs.sendMessage(tab.id, message, (response) => {
                    if (chrome.runtime.lastError) { }
                });
                sentCount++;
            }
        }
        return sentCount > 0;
    } catch (error) {
        return false;
    }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === MIDNIGHT_ALARM) {
        disableAllFeatures();
    } else if (alarm.name === KIOSK_CLOSE_ALARM) {
        await sendMessageToShopeeTabs({ action: 'showKioskOverlay' });
    } else if (alarm.name === KIOSK_OPEN_ALARM) {
        await sendMessageToShopeeTabs({ action: 'hideKioskOverlay' });
    }
});

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        const initialStates = {
            kioskModeEnabled: false,
        };
        FEATURE_KEYS.forEach(key => {
            initialStates[key] = false;
        });
        chrome.storage.sync.set(initialStates);
    }

    chrome.alarms.create(MIDNIGHT_ALARM, { when: getScheduledTime(0, 0), periodInMinutes: 24 * 60 });
    
    chrome.storage.sync.get('kioskModeEnabled', ({ kioskModeEnabled }) => {
        scheduleKioskAlarms(!!kioskModeEnabled);
    });
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.kioskModeEnabled) {
        scheduleKioskAlarms(changes.kioskModeEnabled.newValue);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleTestOverlay') {
        (async () => {
            const success = await sendMessageToShopeeTabs({ action: 'toggleKioskOverlay' });
            sendResponse({ success: success });
        })();
        return true;
    } else if (request.action === 'checkKioskStatus') {
        chrome.storage.sync.get('kioskModeEnabled', ({ kioskModeEnabled }) => {
            if (kioskModeEnabled) {
                const now = new Date();
                const openTime = new Date();
                openTime.setHours(11, 30, 0, 0); 
                const closeTime = new Date();
                closeTime.setHours(22, 30, 0, 0);

                const isOpen = now >= openTime && now < closeTime;
                
                sendResponse({ show: !isOpen });
            } else {
                sendResponse({ show: false });
            }
        });
        return true;
    }
});