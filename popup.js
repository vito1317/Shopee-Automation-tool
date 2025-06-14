document.addEventListener('DOMContentLoaded', () => {
    const switches = {
        masterEnabled: { el: document.getElementById('masterSwitch') },
        kioskModeEnabled: { el: document.getElementById('kioskModeSwitch') },
        featureQueueingEnabled: { el: document.getElementById('featureQueueingSwitch'), group: 'automation' },
        featureQueueingAction: { el: document.getElementById('featureQueueingActionSwitch'), parent: '#featureQueueingSwitch' },
        featureCheckoutEnabled: { el: document.getElementById('featureCheckoutSwitch'), group: 'automation' },
        featureCheckoutAction: { el: document.getElementById('featureCheckoutActionSwitch'), parent: '#featureCheckoutSwitch' },
        featureTTSEnabled: { el: document.getElementById('featureTTSSwitch'), group: 'assistance' },
        featureTTSLocationEnabled: { el: document.getElementById('featureTTSLocationSwitch'), parent: '#featureTTSSwitch' },
        featureTTSAmountEnabled: { el: document.getElementById('featureTTSAmountSwitch'), parent: '#featureTTSSwitch' },
        featureNextDayEnabled: { el: document.getElementById('featureNextDaySwitch'), group: 'packing' },
        featureNextDayAutoStartEnabled: { el: document.getElementById('featureNextDayAutoStartSwitch'), parent: '#featureNextDaySwitch' },
        featureOneItemPerBoxEnabled: { el: document.getElementById('featureOneItemPerBoxSwitch'), parent: '#featureNextDaySwitch' },
        featureNextDayAutoScanEnabled: { el: document.getElementById('featureNextDayAutoScanSwitch'), group: 'packing' },
        featureToAutoScanEnabled: { el: document.getElementById('featureToAutoScanSwitch'), group: 'packing' },
        featureFileScanEnabled: { el: document.getElementById('featureFileScanSwitch'), group: 'assistance' }
    };
    const otherFeaturesContainer = document.getElementById('other-features-container');
    const testKioskButton = document.getElementById('testKioskButton');
    
    function saveState(key, value) {
        chrome.storage.sync.set({ [key]: value });
    }

    function updateUI() {
        const kioskModeOn = switches.kioskModeEnabled.el.checked;
        const masterOn = switches.masterEnabled.el.checked;
        
        otherFeaturesContainer.style.display = kioskModeOn ? 'none' : '';
        switches.masterEnabled.el.disabled = kioskModeOn;
        if (kioskModeOn) switches.masterEnabled.el.checked = false;

        document.getElementById('masterStatusText').textContent = switches.masterEnabled.el.checked ? '所有功能已啟用' : '所有功能已停用';
        
        Object.entries(switches).forEach(([key, config]) => {
            if (!config.el || key === 'masterEnabled' || key === 'kioskModeEnabled') return;

            let parentSwitch = null;
            if (config.parent) parentSwitch = document.querySelector(config.parent);

            const isParentOn = parentSwitch ? parentSwitch.checked : true;
            const isDisabled = kioskModeOn || !masterOn || !isParentOn;
            
            const settingDiv = config.el.closest('.setting');
            if (settingDiv) settingDiv.classList.toggle('disabled', isDisabled);
            config.el.disabled = isDisabled;
        });

        document.querySelectorAll('.feature-group-toggle').forEach(groupToggle => {
            const group = groupToggle.dataset.group;
            const groupSwitches = Object.values(switches).filter(s => s.group === group);
            groupToggle.checked = groupSwitches.some(s => s.el.checked);
            groupToggle.disabled = kioskModeOn || !masterOn;
        });
    }

    function loadStatesAndInit() {
        const keys = Object.keys(switches);
        chrome.storage.sync.get(keys, (data) => {
            keys.forEach(key => {
                if (switches[key] && switches[key].el) {
                    switches[key].el.checked = data[key] === undefined ? true : data[key];
                }
            });
            updateUI();
        });
    }

    document.body.addEventListener('change', (event) => {
        const target = event.target;
        if (target.type !== 'checkbox') return;

        const key = Object.keys(switches).find(k => switches[k].el === target);
        if (key) {
            saveState(key, target.checked);
        }

        if (target.id === 'masterSwitch') {
            const isEnabled = target.checked;
            Object.entries(switches).forEach(([k, config]) => {
                if (config.group && config.el.checked !== isEnabled) {
                    config.el.checked = isEnabled;
                    saveState(k, isEnabled);
                }
            });
        } else if (target.classList.contains('feature-group-toggle')) {
            const group = target.dataset.group;
            const isEnabled = target.checked;
            Object.entries(switches).forEach(([k, config]) => {
                if (config.group === group && config.el.checked !== isEnabled) {
                    config.el.checked = isEnabled;
                    saveState(k, isEnabled);
                }
            });
        }
        updateUI();
    });

    document.body.addEventListener('click', (event) => {
        const header = event.target.closest('.feature-card__header');
        if (header) {
            header.closest('.feature-card').querySelector('.feature-card__body').classList.toggle('collapsed');
        }
    });
    
    testKioskButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'toggleTestOverlay' }, (response) => {
            if (chrome.runtime.lastError) {
                alert('無法與擴充功能背景通訊，請嘗試重新整理頁面。');
                return;
            }
            if (!response || !response.success) {
                alert('測試失敗。請確認您已開啟至少一個蝦皮SPX作業分頁。');
            }
        });
    });

    loadStatesAndInit();
});