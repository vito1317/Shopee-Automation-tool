// popup.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Define Switch Elements and Storage Keys ---
    const switches = {
        master: { el: document.getElementById('masterSwitch'), key: 'masterEnabled', textEl: document.getElementById('masterStatusText'), default: true, label: '所有功能' },

        queueing: { el: document.getElementById('featureQueueingSwitch'), key: 'featureQueueingEnabled', textEl: document.getElementById('featureQueueingStatusText'), default: true, label: '自動叫號' },
        queueingAction: { el: document.getElementById('featureQueueingActionSwitch'), key: 'featureQueueingAction', textEl: document.getElementById('featureQueueingActionStatusText'), default: true, label: '↳ 動作', parentKey: 'queueing', type: 'action', container: document.getElementById('featureQueueingActionContainer') },

        checkout: { el: document.getElementById('featureCheckoutSwitch'), key: 'featureCheckoutEnabled', textEl: document.getElementById('featureCheckoutStatusText'), default: true, label: '自動結帳' },
        checkoutAction: { el: document.getElementById('featureCheckoutActionSwitch'), key: 'featureCheckoutAction', textEl: document.getElementById('featureCheckoutActionStatusText'), default: true, label: '↳ 動作', parentKey: 'checkout', type: 'action', container: document.getElementById('featureCheckoutActionContainer') },

        boxScan: { el: document.getElementById('featureBoxScanSwitch'), key: 'featureBoxScanEnabled', textEl: document.getElementById('featureBoxScanStatusText'), default: true, label: '自動刷取物流箱單' },

        nextDay: { el: document.getElementById('featureNextDaySwitch'), key: 'featureNextDayEnabled', textEl: document.getElementById('featureNextDayStatusText'), default: true, label: '自動完成隔日' },
        nextDayAutoStart: { el: document.getElementById('featureNextDayAutoStartSwitch'), key: 'featureNextDayAutoStartEnabled', textEl: document.getElementById('featureNextDayAutoStartStatusText'), default: true, label: '↳ 自動開始下一筆', parentKey: 'nextDay', type: 'sub-option', container: document.getElementById('featureNextDayAutoStartContainer') },

        fileScan: { el: document.getElementById('featureFileScanSwitch'), key: 'featureFileScanEnabled', textEl: document.getElementById('featureFileScanStatusText'), default: true, label: '自動刷取電子檔' }
    };

    // --- Helper Functions ---

    function updateStatusText(switchConfig, isEnabled, parentIsEnabled = true) {
        if (!switchConfig?.textEl || !document.body.contains(switchConfig.textEl)) {
            // console.warn(`updateStatusText: Cannot update text for ${switchConfig?.key} - Element not found or config missing.`);
            return;
        }

        let statusText = '';
        let color = '#6c757d';
        const isActionSwitch = switchConfig.type === 'action';
        const isSubOption = switchConfig.type === 'sub-option';
        const isDisabledByParent = (isActionSwitch || isSubOption) && !parentIsEnabled;
        const label = switchConfig.label || `[${switchConfig.key}]`;

        if (switchConfig.key === 'masterEnabled') {
            statusText = `${isEnabled ? '啟用' : '停用'} ${label}`;
            color = isEnabled ? '#28a745' : '#6c757d';
        } else if (isActionSwitch) {
            // Using your text for focus option
            const action = isEnabled ? '點擊' : '聚焦(需按Enter鍵)';
            statusText = `${label}: ${action}`;
            color = isDisabledByParent ? '#aaa' : (isEnabled ? '#007bff' : '#ffc107');
        } else if (isSubOption) {
            statusText = `${label} (${isEnabled ? '已啟用' : '已停用'})`;
            color = isDisabledByParent ? '#aaa' : (isEnabled ? '#28a745' : '#6c757d');
        } else {
            statusText = `${label} (${isEnabled ? '已啟用' : '已停用'})`;
            color = isEnabled ? '#28a745' : '#6c757d';
        }

        switchConfig.textEl.textContent = statusText;
        switchConfig.textEl.style.color = color;

        if ((isActionSwitch || isSubOption) && switchConfig.container) {
             switchConfig.container.classList.toggle('disabled-parent', isDisabledByParent);
        }
    }

    function updateChildSwitchUI(childConfig) {
        if (!childConfig?.el || !childConfig.parentKey) {
             // console.warn(`updateChildSwitchUI: Invalid config for key: ${childConfig?.key}`);
             return;
        }

        const parentConfig = Object.values(switches).find(p => p.key === childConfig.parentKey);
        const parentIsEnabled = parentConfig?.el?.checked ?? true; // Assume parent enabled if not found

        childConfig.el.disabled = !parentIsEnabled;
        updateStatusText(childConfig, childConfig.el.checked, parentIsEnabled);
    }

    function loadAllStates() {
        const keysToGet = {};
        Object.values(switches).forEach(config => {
            keysToGet[config.key] = config.default;
        });

        chrome.storage.sync.get(keysToGet, (data) => {
            // --- Error Handling ---
            const lastError = chrome.runtime.lastError;
            if (lastError || !data) {
                console.error("Popup: Error loading states:", lastError?.message || "No data received");
                 Object.values(switches).forEach(config => {
                     if(config.el) config.el.checked = config.default;
                     if(config.textEl && document.body.contains(config.textEl)) {
                        config.textEl.textContent = (config.label || config.key) + (lastError ? " (讀取錯誤)" : " (無資料)");
                        config.textEl.style.color = '#dc3545';
                     }
                     if(config.el && config.parentKey) config.el.disabled = true;
                });
                return;
            }

            console.log("Popup: Loaded states:", data);

            // --- Phase 1: Set '.checked' states ---
            console.log("Popup: Phase 1 - Setting initial checked states...");
            Object.values(switches).forEach(config => {
                if (config.el) {
                    const loadedValue = data[config.key];
                    config.el.checked = typeof loadedValue === 'boolean' ? loadedValue : config.default;
                }
            });

            // --- Phase 2: Update UI (Text, Disabled State) ---
            console.log("Popup: Phase 2 - Updating UI elements...");
            Object.values(switches).forEach(config => {
                if (config.el) {
                    if (config.parentKey) {
                        updateChildSwitchUI(config);
                    } else {
                        updateStatusText(config, config.el.checked);
                    }
                }
            });

            // --- Phase 3: Sync Master Switch UI ---
            console.log("Popup: Phase 3 - Syncing Master Switch UI...");
            syncMasterSwitchUI(false); // Update visual state only

            console.log("Popup: Initial UI load complete.");
        });
    }

    function saveState(key, value, callback) {
        chrome.storage.sync.set({ [key]: value }, () => {
            const lastError = chrome.runtime.lastError;
             if (lastError && !lastError.message?.includes("message port closed")) {
                console.error(`Popup: Error saving state for ${key}:`, lastError.message || lastError);
             }
             if (typeof callback === 'function') {
                 if (!lastError || !lastError.message?.includes("message port closed")) {
                    callback(lastError);
                 }
             }
        });
    }

    function syncMasterSwitchUI(shouldSave = true) {
        const masterConfig = switches.master;
        if (!masterConfig?.el || !document.body.contains(masterConfig.el)) return false;

        const masterSwitch = masterConfig.el;
        let isAnyFeatureOn = false;
        Object.values(switches).forEach(config => {
            if (!config.parentKey && config.key !== masterConfig.key && config.el?.checked) {
                isAnyFeatureOn = true;
            }
        });

        let masterStateChanged = false;
        const currentMasterState = masterSwitch.checked;
        let newMasterState = currentMasterState;

        if (currentMasterState && !isAnyFeatureOn) newMasterState = false;
        else if (!currentMasterState && isAnyFeatureOn) newMasterState = true;

        if (newMasterState !== currentMasterState) {
            masterStateChanged = true;
            masterSwitch.checked = newMasterState;
            updateStatusText(masterConfig, newMasterState);
            console.log(`Popup: Sync Master UI -> ${newMasterState ? 'ON' : 'OFF'}`);

            if (shouldSave) {
                console.log(`Popup: Sync Master - Saving new state: ${newMasterState}`);
                saveState(masterConfig.key, newMasterState);
            }

            // Re-sync children UI after master changes
            Object.values(switches).forEach(childConfig => {
                 if (childConfig.parentKey) updateChildSwitchUI(childConfig);
             });
        }
        return masterStateChanged;
    }

    // --- Load Initial States ---
    loadAllStates();

    // --- Add Event Listeners ---
    console.log("Popup: Setting up event listeners...");
    Object.values(switches).forEach(config => {
        if (config.el) {
            config.el.addEventListener('change', () => {
                if (!config.el || !document.body.contains(config.el)) return; // Element gone?

                const newState = config.el.checked;
                const changedKey = config.key;
                console.log(`\nPopup: Switch change: ${config.label} (${changedKey}) -> ${newState}`);

                // --- 1. Save Toggled Switch State ---
                saveState(changedKey, newState, (error) => {
                    // Update text for this switch in the callback
                     let parentIsEnabled = !config.parentKey || switches[config.parentKey]?.el?.checked;
                     updateStatusText(config, newState, parentIsEnabled);
                });

                // --- 2. Synchronization Logic ---
                if (changedKey === switches.master.key) { // Master Toggled
                    console.log("Popup: Sync - Master Toggled. Applying to features...");
                    Object.values(switches).forEach(childConfig => {
                        if (!childConfig.parentKey && childConfig.key !== switches.master.key && childConfig.el) {
                            if (childConfig.el.checked !== newState) {
                                childConfig.el.checked = newState;
                                saveState(childConfig.key, newState, (err) => updateStatusText(childConfig, newState)); // Save & update feature text
                            }
                            // Update UI of this feature's children
                            Object.values(switches).forEach(subConfig => {
                                if (subConfig.parentKey === childConfig.key) updateChildSwitchUI(subConfig);
                            });
                        }
                    });
                } else if (!config.parentKey) { // Feature Toggled
                    console.log(`Popup: Sync - Feature '${config.label}' Toggled. Updating children UI...`);
                    Object.values(switches).forEach(subConfig => {
                        if (subConfig.parentKey === changedKey && subConfig.el) {
                            updateChildSwitchUI(subConfig); // Update sub-option UI (disabled state/text)
                            // Special case: Turn off dependent sub-option if feature turns off
                            if (!newState && subConfig.key === switches.nextDayAutoStart.key && subConfig.el.checked) {
                                console.log(`Popup: Sync - Forcing '${subConfig.label}' OFF.`);
                                subConfig.el.checked = false;
                                saveState(subConfig.key, false, (err) => updateChildSwitchUI(subConfig)); // Save & update UI
                            }
                        }
                    });
                    syncMasterSwitchUI(true); // Sync master state (and save if needed)
                } else { // Sub-Option Toggled
                    console.log(`Popup: Sync - Sub-switch '${config.label}' Toggled.`);
                    // Special case: Force parent ON if required sub-option turned ON
                    if (newState && config.key === switches.nextDayAutoStart.key) {
                        const parentConfig = switches[config.parentKey];
                        if (parentConfig?.el && !parentConfig.el.checked) {
                            console.log(`Popup: Sync - Forcing parent '${parentConfig.label}' ON.`);
                            parentConfig.el.checked = true;
                            saveState(parentConfig.key, true, (err) => {
                                updateStatusText(parentConfig, true); // Update parent text
                                updateChildSwitchUI(config); // Re-update child (now enabled)
                                syncMasterSwitchUI(true); // Re-sync master
                            });
                        }
                    }
                }
                 console.log(`Popup: Event processing finished for ${changedKey}`);
            });
        } else {
            console.warn(`Popup: Element not found for listener setup: ${config.key}`);
        }
    });
    console.log("Popup: Event listeners attached.");
});