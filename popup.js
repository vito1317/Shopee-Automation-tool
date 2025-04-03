// popup.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Define Switch Elements and Storage Keys ---
    const switches = {
        master: { el: document.getElementById('masterSwitch'), key: 'masterEnabled', textEl: document.getElementById('masterStatusText'), default: true, label: '所有功能' },
        queueing: { el: document.getElementById('featureQueueingSwitch'), key: 'featureQueueingEnabled', textEl: document.getElementById('featureQueueingStatusText'), default: true, label: '自動叫號' },
        checkout: { el: document.getElementById('featureCheckoutSwitch'), key: 'featureCheckoutEnabled', textEl: document.getElementById('featureCheckoutStatusText'), default: true, label: '自動結帳' },
        boxScan: { el: document.getElementById('featureBoxScanSwitch'), key: 'featureBoxScanEnabled', textEl: document.getElementById('featureBoxScanStatusText'), default: true, label: '自動刷取物流箱單' },
        nextDay: { el: document.getElementById('featureNextDaySwitch'), key: 'featureNextDayEnabled', textEl: document.getElementById('featureNextDayStatusText'), default: true, label: '自動完成隔日' },
        // Child of 'nextDay'
        nextDayAutoStart: { el: document.getElementById('featureNextDayAutoStartSwitch'), key: 'featureNextDayAutoStartEnabled', textEl: document.getElementById('featureNextDayAutoStartStatusText'), default: true, label: '↳ 自動開始下一筆', parentKey: 'nextDay' },
        fileScan: { el: document.getElementById('featureFileScanSwitch'), key: 'featureFileScanEnabled', textEl: document.getElementById('featureFileScanStatusText'), default: true, label: '自動刷取電子檔' }
    };

    // --- Helper Functions ---

    // Updates the text description and color next to a switch
    function updateStatusText(switchConfig, isEnabled) {
        if (!switchConfig || !switchConfig.textEl) return;
        let statusText = '';
        let color = '#6c757d'; // Default grey
        const lastError = chrome.runtime.lastError;

        // Check for storage errors first
        // Ignore "message port closed" which happens if popup closes during async ops
        if (lastError && !lastError.message?.includes("message port closed")) {
             statusText = `${switchConfig.label} (讀取/儲存錯誤)`;
             color = '#dc3545'; // Red for error
        } else {
            // Standard status text
            let statusPrefix = isEnabled ? '已啟用' : '已停用';
            color = isEnabled ? '#28a745' : '#6c757d'; // Green if enabled, grey if disabled
            if (switchConfig.key === 'masterEnabled') {
                statusPrefix = isEnabled ? '啟用' : '停用'; // Slightly different wording for master
                statusText = `${statusPrefix} ${switchConfig.label}`;
            } else {
                statusText = `${switchConfig.label} (${statusPrefix})`;
            }
        }
        // Ensure the text element still exists in the DOM before updating
        if (document.body.contains(switchConfig.textEl)) {
            switchConfig.textEl.textContent = statusText;
            switchConfig.textEl.style.color = color;
        }
    }

    // Loads all switch states from chrome.storage.sync on popup open
    function loadAllStates() {
        const keysToGet = {};
        // Prepare object with keys and their default values
        Object.values(switches).forEach(config => {
            keysToGet[config.key] = config.default;
        });

        chrome.storage.sync.get(keysToGet, (data) => {
            const lastError = chrome.runtime.lastError;
            // Handle potential storage read errors
            if (lastError && !lastError.message?.includes("message port closed")) {
                console.error("Error loading states:", lastError.message || lastError);
                // Indicate error state for all switches if loading fails
                Object.values(switches).forEach(config => updateStatusText(config, false));
                return;
            }
            if (!data) {
                console.error("Failed to retrieve data from storage (data is null/undefined).");
                 Object.values(switches).forEach(config => updateStatusText(config, false));
                 return;
            }

            console.log("Loaded states from storage:", data);

            // --- Initial UI Update Loop ---
            // Set the '.checked' state and text for each switch based on loaded data
            Object.entries(switches).forEach(([key, config]) => {
                if (config.el) {
                    // Use loaded value if available, otherwise fallback to default
                    const isEnabled = typeof data[config.key] !== 'undefined' ? data[config.key] : config.default;
                    config.el.checked = isEnabled;
                    updateStatusText(config, isEnabled);
                }
            });

            // --- Post-Load UI Consistency Checks ---
            // These checks ensure the popup UI is consistent even if the stored states
            // were somehow left inconsistent (e.g., child ON, parent OFF).

            // 1. Sync NextDay / NextDayAutoStart UI
            const nextDayState = switches.nextDay.el.checked;
            const autoStartSwitch = switches.nextDayAutoStart.el;
            const autoStartConfig = switches.nextDayAutoStart;
            if (autoStartSwitch) {
                // If AutoStart is ON but NextDay is OFF, force NextDay ON (in UI)
                if (autoStartSwitch.checked && !nextDayState) {
                    console.log("Initial load UI sync: Forcing 'NextDay' ON because 'AutoStart' is ON.");
                    switches.nextDay.el.checked = true;
                    updateStatusText(switches.nextDay, true);
                    // Note: We don't save here, load is just for initial display consistency.
                }
                // If NextDay is OFF but AutoStart is ON, force AutoStart OFF (in UI)
                // (This takes precedence over the above rule if both are inconsistent)
                 if (!nextDayState && autoStartSwitch.checked) {
                     console.log("Initial load UI sync: Forcing 'AutoStart' OFF because 'NextDay' is OFF.");
                    autoStartSwitch.checked = false;
                    updateStatusText(autoStartConfig, false);
                 }
                 // If NextDay is ON but AutoStart is OFF (this is valid, no sync needed)
            }


            // 2. Sync Master / Children UI
            const masterSwitch = switches.master.el;
            if (masterSwitch) {
                let isAnyChildOn = false;
                let areAllChildrenOff = true;
                Object.entries(switches).forEach(([key, config]) => {
                    if (key !== 'master' && config.el && config.el.checked) {
                        isAnyChildOn = true;
                        areAllChildrenOff = false;
                    }
                });

                // If Master is OFF but at least one child is ON, force Master ON (in UI)
                if (!masterSwitch.checked && isAnyChildOn) {
                    console.log("Initial load UI sync: Forcing Master ON because children are ON.");
                    masterSwitch.checked = true;
                    updateStatusText(switches.master, true);
                     // Note: No save during load.
                }
                // If Master is ON but ALL children are OFF, force Master OFF (in UI)
                else if (masterSwitch.checked && areAllChildrenOff) {
                    console.log("Initial load UI sync: Forcing Master OFF because all children are OFF.");
                     masterSwitch.checked = false;
                     updateStatusText(switches.master, false);
                      // Note: No save during load.
                }
            }
             console.log("Initial UI states updated and synced.");
        });
    }

    // Saves a specific key-value pair to chrome.storage.sync
    function saveState(key, value, callback) {
        chrome.storage.sync.set({ [key]: value }, () => {
            const lastError = chrome.runtime.lastError;
            // Handle and log potential storage write errors
             if (lastError && !lastError.message?.includes("message port closed")) {
                console.error(`Error saving state for ${key}:`, lastError.message || lastError);
                // Try to update the status text to reflect the error for the specific switch
                const config = Object.values(switches).find(c => c.key === key);
                if (config) updateStatusText(config, value); // Update text even on error
             } else if (!lastError) {
                // Log success only if no error occurred
                console.log(`State saved: ${key} = ${value}`);
             }
             // Execute callback if provided (and popup didn't close)
             if (typeof callback === 'function') {
                 if (!lastError || !lastError.message?.includes("message port closed")) {
                    callback(lastError); // Pass error object (or null) to callback
                 } else {
                    console.log("Popup likely closed during save, skipping callback for", key);
                 }
             }
        });
    }

    // --- Load Initial States ---
    loadAllStates();

    // --- Add Event Listeners to all Switches ---
    Object.entries(switches).forEach(([key, config]) => {
        if (config.el) {
            config.el.addEventListener('change', () => {
                const newState = config.el.checked;
                const changedKey = config.key; // The key of the switch that was toggled

                console.log(`Switch change detected: ${config.label} (${changedKey}) set to ${newState}`);

                let masterStateMayChange = false; // Flag to track if master needs saving later
                let masterFinalState = switches.master.el.checked; // Store potential future master state

                // --- Synchronization Logic ---

                // 1. Handle Master Switch Toggled Directly
                if (changedKey === switches.master.key) {
                    console.log(`Sync: Master toggled directly to ${newState}. Applying to children.`);
                    // Master switch controls all children
                    Object.values(switches).forEach(childConfig => {
                        // Update child only if it's not the master and its state differs
                        if (childConfig.key !== switches.master.key && childConfig.el && childConfig.el.checked !== newState) {
                            console.log(`  - Setting ${childConfig.label} to ${newState}`);
                            childConfig.el.checked = newState;
                            // Save each child's state
                            saveState(childConfig.key, newState, (err) => updateStatusText(childConfig, newState));
                        }
                    });
                    // Finally, save the master state itself
                     saveState(changedKey, newState, (error) => {
                         updateStatusText(config, newState); // Update master text
                    });
                }
                // 2. Handle Child Switch Toggled
                else {
                    // First, save the state of the child that was actually clicked
                    console.log(`Sync: Saving state for toggled child: ${config.label} (${changedKey}) = ${newState}`);
                    saveState(changedKey, newState, (error) => {
                         updateStatusText(config, newState); // Update child text
                    });

                    // 2a. Handle NextDay <-> NextDayAutoStart Dependency
                    if (changedKey === switches.nextDay.key) { // If 'Next Day' was toggled
                        const autoStartConfig = switches.nextDayAutoStart;
                        // If 'Next Day' was turned OFF, turn 'Auto Start' OFF too
                        if (!newState && autoStartConfig.el.checked) {
                            console.log(`Sync: 'NextDay' OFF -> 'AutoStart' OFF`);
                            autoStartConfig.el.checked = false;
                            saveState(autoStartConfig.key, false, (err) => updateStatusText(autoStartConfig, false));
                        }
                    } else if (changedKey === switches.nextDayAutoStart.key) { // If 'Auto Start' was toggled
                         const parentConfig = switches.nextDay;
                        // If 'Auto Start' was turned ON, ensure 'Next Day' is ON too
                        if (newState && !parentConfig.el.checked) {
                            console.log(`Sync: 'AutoStart' ON -> 'NextDay' ON`);
                            parentConfig.el.checked = true;
                            saveState(parentConfig.key, true, (err) => updateStatusText(parentConfig, true));
                        }
                    }

                    // 2b. Handle Child -> Master Dependency
                    const masterConfig = switches.master;
                    const masterSwitch = masterConfig.el;

                    if (newState === true) { // If a child was turned ON...
                        if (!masterSwitch.checked) { // ...and Master is currently OFF...
                            console.log(`Sync: Child '${config.label}' ON -> Master ON (UI)`);
                            masterSwitch.checked = true; // ...turn Master ON (in UI only for now)
                            updateStatusText(masterConfig, true);
                            masterStateMayChange = true; // Mark master state for saving later
                            masterFinalState = true;
                        }
                    } else { // If a child was turned OFF...
                        // Check if ALL children are now OFF (check current UI state)
                        let areAllChildrenNowOff = true;
                        Object.values(switches).forEach(c => {
                            if (c.key !== masterConfig.key && c.el && c.el.checked) {
                                areAllChildrenNowOff = false;
                            }
                        });

                        if (areAllChildrenNowOff && masterSwitch.checked) { // If all children are OFF and Master is ON...
                            console.log(`Sync: Last Child '${config.label}' OFF -> Master OFF (UI)`);
                            masterSwitch.checked = false; // ...turn Master OFF (in UI only for now)
                            updateStatusText(masterConfig, false);
                            masterStateMayChange = true; // Mark master state for saving later
                            masterFinalState = false;
                        }
                    }

                     // 2c. Save Master State if Changed Indirectly by a Child Toggle
                     if (masterStateMayChange) {
                         console.log(`Sync: Saving potentially changed Master state: ${masterFinalState}`);
                         saveState(masterConfig.key, masterFinalState, (err) => { /* Master text already updated */ });
                     }
                }

                // --- User Feedback & Known Issues ---
                // Add a note if the problematic feature's state was changed.
                if (changedKey === switches.nextDay.key || changedKey === switches.master.key) {
                     console.warn("Note: Changes to 'Master' or '自動完成隔日' state saved. However, due to content script limitations, the '自動完成隔日' feature might not fully stop/start its background checks immediately or correctly on the page.");
                }

            }); // End event listener callback
        }
    }); // End Object.entries loop

}); // End DOMContentLoaded