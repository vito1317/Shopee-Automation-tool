// background.js

// Define the keys of the switches to be disabled at midnight
// IMPORTANT: Keep this list consistent with the keys in popup.js's switches object
const FEATURE_KEYS = [
    'masterEnabled',
    'featureFileScanEnabled',
    'featureBoxScanEnabled',
    'featureQueueingEnabled',
    'featureNextDayEnabled',
    'featureNextDayAutoStartEnabled',
    'featureCheckoutEnabled'
];

// Define a unique name for the alarm
const ALARM_NAME = 'disableFeaturesAtMidnight';

// Function to disable all specified features in storage
function disableAllFeatures() {
    const statesToSave = {};
    // Create an object where each feature key is set to false
    FEATURE_KEYS.forEach(key => {
        statesToSave[key] = false;
    });

    // Save the disabled states to chrome.storage.sync
    chrome.storage.sync.set(statesToSave, () => {
        // Check for errors during the save operation
        if (chrome.runtime.lastError) {
            console.error("Background: Error disabling features at midnight:", chrome.runtime.lastError);
        } else {
            // Log success
            console.log("Background: All features automatically disabled at midnight.", new Date());
        }
    });
}

// Function to schedule the alarm for the next midnight
function scheduleAlarm() {
    // Calculate the time until the next midnight in the user's local timezone
    const now = new Date();
    const nextMidnight = new Date(now);
    // Set time to 00:00:00.000 of the *next* day
    nextMidnight.setHours(24, 0, 0, 0);

    // Calculate milliseconds until the calculated midnight time
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    // Clear any existing alarm with the same name before creating a new one.
    // This prevents duplicate alarms if this function is called multiple times.
    chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
        console.log(`Background: Attempting to clear previous alarm '${ALARM_NAME}'. Was cleared: ${wasCleared}`);

        // Create the alarm
        chrome.alarms.create(ALARM_NAME, {
            // 'when': Specifies the exact time (in milliseconds since epoch) for the first trigger.
            // This is more precise than delayInMinutes for the initial run.
            when: Date.now() + msUntilMidnight,
            // 'periodInMinutes': Specifies the interval for repeating the alarm (24 hours = 1440 minutes).
            periodInMinutes: 24 * 60
        });
        console.log(`Background: '${ALARM_NAME}' alarm scheduled to run next at:`, nextMidnight, `(repeating every 24 hours)`);

        // Optional: Log all current alarms for debugging purposes
        // chrome.alarms.getAll(alarms => console.log("Current alarms:", alarms));
    });
}

// --- Event Listeners ---

// Fired when the extension is first installed, updated, or Chrome is updated.
// This is the primary place to set up initial state or recurring tasks like alarms.
chrome.runtime.onInstalled.addListener((details) => {
    console.log(`Background: onInstalled event triggered (reason: ${details.reason}). Scheduling midnight disable alarm.`);
    scheduleAlarm();
});

// Fired when a profile that has this extension installed first starts up.
// Good for ensuring tasks like alarms are running if the browser was closed.
chrome.runtime.onStartup.addListener(() => {
    console.log("Background: Chrome started. Ensuring midnight disable alarm is scheduled.");
    // Re-scheduling is safe because scheduleAlarm() clears the existing one first.
    scheduleAlarm();
});

// Fired when an alarm set by the extension goes off.
chrome.alarms.onAlarm.addListener((alarm) => {
    console.log("Background: Alarm triggered!", alarm);
    // Check if the triggered alarm is the one we set
    if (alarm.name === ALARM_NAME) {
        console.log("Background: Running scheduled task to disable all features...");
        disableAllFeatures();
        // The alarm will automatically repeat based on 'periodInMinutes', no need to reschedule here.
    }
});

// Log that the background script has loaded and listeners are active.
console.log("Background script loaded and listeners attached.");

// --- Initial Scheduling Call (Consideration) ---
// Calling scheduleAlarm() here directly ensures it runs immediately when the script loads,
// which is useful during development reloading. However, for production,
// onInstalled and onStartup should be sufficient. If uncommented, it's harmless
// due to the clear() call inside scheduleAlarm().
// scheduleAlarm();