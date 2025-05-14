document.addEventListener('DOMContentLoaded', () => {
    const switches = {
        master: { el: document.getElementById('masterSwitch'), key: 'masterEnabled', textEl: document.getElementById('masterStatusText'), default: true, label: '所有功能' },

        queueing: { el: document.getElementById('featureQueueingSwitch'), key: 'featureQueueingEnabled', textEl: document.getElementById('featureQueueingStatusText'), default: true, label: '自動叫號' },
        queueingAction: { el: document.getElementById('featureQueueingActionSwitch'), key: 'featureQueueingAction', textEl: document.getElementById('featureQueueingActionStatusText'), default: true, label: '↳ 動作', parentKey: 'queueing', type: 'action', container: document.getElementById('featureQueueingActionContainer') },

        checkout: { el: document.getElementById('featureCheckoutSwitch'), key: 'featureCheckoutEnabled', textEl: document.getElementById('featureCheckoutStatusText'), default: true, label: '自動結帳' },
        checkoutAction: { el: document.getElementById('featureCheckoutActionSwitch'), key: 'featureCheckoutAction', textEl: document.getElementById('featureCheckoutActionStatusText'), default: true, label: '↳ 動作', parentKey: 'checkout', type: 'action', container: document.getElementById('featureCheckoutActionContainer') },

        boxScan: { el: document.getElementById('featureBoxScanSwitch'), key: 'featureBoxScanEnabled', textEl: document.getElementById('featureBoxScanStatusText'), default: true, label: '自動刷取物流箱單' },

        nextDay: { el: document.getElementById('featureNextDaySwitch'), key: 'featureNextDayEnabled', textEl: document.getElementById('featureNextDayStatusText'), default: true, label: '自動完成隔日' },
        nextDayAutoStart: { el: document.getElementById('featureNextDayAutoStartSwitch'), key: 'featureNextDayAutoStartEnabled', textEl: document.getElementById('featureNextDayAutoStartStatusText'), default: true, label: '↳ 自動開始下一筆', parentKey: 'nextDay', type: 'sub-option', container: document.getElementById('featureNextDayAutoStartContainer') },
        oneItemPerBox: { el: document.getElementById('featureOneItemPerBoxSwitch'), key: 'featureOneItemPerBoxEnabled', textEl: document.getElementById('featureOneItemPerBoxStatusText'), default: true, label: '↳ 一件一箱自動裝箱', parentKey: 'nextDay', type: 'sub-option', container: document.getElementById('featureOneItemPerBoxContainer') },

        fileScan: { el: document.getElementById('featureFileScanSwitch'), key: 'featureFileScanEnabled', textEl: document.getElementById('featureFileScanStatusText'), default: true, label: '自動刷取電子檔' }
    };


    function updateStatusText(switchConfig, isEnabled, parentIsEnabled = true) {
        if (!switchConfig?.textEl || !document.body.contains(switchConfig.textEl)) {
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
             return;
        }

        const parentConfig = Object.values(switches).find(p => p.key === childConfig.parentKey);
        const parentIsEnabled = parentConfig?.el?.checked ?? true;

        childConfig.el.disabled = !parentIsEnabled;
        updateStatusText(childConfig, childConfig.el.checked, parentIsEnabled);
    }

    function loadAllStates() {
        const keysToGet = {};
        Object.values(switches).forEach(config => {
            keysToGet[config.key] = config.default;
        });

        chrome.storage.sync.get(keysToGet, (data) => {
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

            Object.values(switches).forEach(config => {
                if (config.el) {
                    const loadedValue = data[config.key];
                    config.el.checked = typeof loadedValue === 'boolean' ? loadedValue : config.default;
                }
            });

            Object.values(switches).forEach(config => {
                if (config.el) {
                    if (config.parentKey) {
                        updateChildSwitchUI(config);
                    } else {
                        updateStatusText(config, config.el.checked);
                    }
                }
            });
            syncMasterSwitchUI(false);
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
            if (shouldSave) {
                saveState(masterConfig.key, newMasterState);
            }
            Object.values(switches).forEach(childConfig => {
                if (childConfig.parentKey) updateChildSwitchUI(childConfig);
            });
        }
        return masterStateChanged;
    }

    loadAllStates();

    Object.values(switches).forEach(config => {
        if (config.el) {
            config.el.addEventListener('change', () => {
                if (!config.el || !document.body.contains(config.el)) return;

                const newState = config.el.checked;
                const changedKey = config.key;

                saveState(changedKey, newState, (error) => {
                    let parentIsEnabled = !config.parentKey || switches[config.parentKey]?.el?.checked;
                    updateStatusText(config, newState, parentIsEnabled);
                });

                if (changedKey === switches.master.key) {
                    Object.values(switches).forEach(childConfig => {
                        if (!childConfig.parentKey && childConfig.key !== switches.master.key && childConfig.el) {
                            if (childConfig.el.checked !== newState) {
                                childConfig.el.checked = newState;
                                saveState(childConfig.key, newState, (err) => updateStatusText(childConfig, newState));
                            }
                            Object.values(switches).forEach(subConfig => {
                                if (subConfig.parentKey === childConfig.key) updateChildSwitchUI(subConfig);
                            });
                        }
                    });
                } else if (!config.parentKey) {
                    Object.values(switches).forEach(subConfig => {
                        if (subConfig.parentKey === changedKey && subConfig.el) {
                             updateChildSwitchUI(subConfig);
                        }
                    });
                    syncMasterSwitchUI();
                } else {
                    syncMasterSwitchUI();
                }
            });
        }
    });
});
