const FEATURE_KEYS = [
    'masterEnabled',
    'featureFileScanEnabled',
    'featureBoxScanEnabled',
    'featureQueueingEnabled',
    'featureNextDayEnabled',
    'featureNextDayAutoStartEnabled',
    'featureCheckoutEnabled',
    'featureOneItemPerBoxEnabled',
    'featureTTSEnabled'
];

const ALARM_NAME = 'disableFeaturesAtMidnight';

function disableAllFeatures() {
    const statesToSave = {};
    FEATURE_KEYS.forEach(key => {
        statesToSave[key] = false;
    });

    chrome.storage.sync.set(statesToSave, () => {
        if (chrome.runtime.lastError) {
            console.error("Background: Error disabling features at midnight:", chrome.runtime.lastError);
        } else {
            console.log("Background: All features automatically disabled at midnight.", new Date());
        }
    });
}

function scheduleAlarm() {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);

    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
        chrome.alarms.create(ALARM_NAME, {
            when: Date.now() + msUntilMidnight
        });
    });
}


chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        disableAllFeatures();
        scheduleAlarm();
    }
});

chrome.runtime.onInstalled.addListener(() => {
    scheduleAlarm();
});

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.get(ALARM_NAME, (existingAlarm) => {
        if (!existingAlarm) {
            scheduleAlarm();
        } else {
        }
    });
});
