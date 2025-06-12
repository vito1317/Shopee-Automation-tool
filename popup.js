document.addEventListener('DOMContentLoaded', () => {
    const switches = {
        masterEnabled: { el: document.getElementById('masterSwitch') },
        featureQueueingEnabled: { el: document.getElementById('featureQueueingSwitch'), group: 'automation' },
        featureQueueingAction: { el: document.getElementById('featureQueueingActionSwitch'), parent: '#featureQueueingSwitch' },
        featureCheckoutEnabled: { el: document.getElementById('featureCheckoutSwitch'), group: 'automation' },
        featureCheckoutAction: { el: document.getElementById('featureCheckoutActionSwitch'), parent: '#featureCheckoutSwitch' },
        featureTTSEnabled: { el: document.getElementById('featureTTSSwitch'), group: 'assistance' },
        featureTTSLocationEnabled: { el: document.getElementById('featureTTSLocationSwitch'), parent: '#featureTTSSwitch' },
        featureTTSAmountEnabled: { el: document.getElementById('featureTTSAmountSwitch'), parent: '#featureTTSSwitch' },
        featureBoxScanEnabled: { el: document.getElementById('featureBoxScanSwitch'), group: 'packing' },
        featureNextDayEnabled: { el: document.getElementById('featureNextDaySwitch'), group: 'packing' },
        featureNextDayAutoStartEnabled: { el: document.getElementById('featureNextDayAutoStartSwitch'), parent: '#featureNextDaySwitch' },
        featureOneItemPerBoxEnabled: { el: document.getElementById('featureOneItemPerBoxSwitch'), parent: '#featureNextDaySwitch' },
        featureNextDayAutoScanEnabled: { el: document.getElementById('featureNextDayAutoScanSwitch'), group: 'packing' },
        featureToAutoScanEnabled: { el: document.getElementById('featureToAutoScanSwitch'), group: 'packing' },
        featureFileScanEnabled: { el: document.getElementById('featureFileScanSwitch'), group: 'assistance' }
    };

    function saveState(key, value) {
        chrome.storage.sync.set({ [key]: value });
    }

    function updateUI() {
        const masterSwitch = switches.masterEnabled.el;
        const masterStatusText = document.getElementById('masterStatusText');
        masterStatusText.textContent = masterSwitch.checked ? '所有功能已啟用' : '所有功能已停用';
        
        Object.values(switches).forEach(config => {
            if (config.parent) {
                const parentSwitch = document.querySelector(config.parent);
                const settingDiv = config.el.closest('.setting');
                if (parentSwitch && settingDiv) {
                    settingDiv.classList.toggle('disabled', !parentSwitch.checked);
                    config.el.disabled = !parentSwitch.checked;
                }
            }
        });

        document.querySelectorAll('.feature-group-toggle').forEach(groupToggle => {
            const group = groupToggle.dataset.group;
            const groupSwitches = Object.values(switches).filter(s => s.group === group);
            const isAllOn = groupSwitches.every(s => s.el.checked);
            groupToggle.checked = isAllOn;
        });
    }

    function loadStatesAndInit() {
        const keys = Object.keys(switches);
        chrome.storage.sync.get(keys, (data) => {
            keys.forEach(key => {
                if (switches[key].el) {
                    switches[key].el.checked = data[key] ?? true;
                }
            });
            updateUI();
        });
    }

    document.body.addEventListener('change', (event) => {
        const target = event.target;
        if (target.type !== 'checkbox') return;

        if (target.id === 'masterSwitch') {
            const isEnabled = target.checked;
            Object.entries(switches).forEach(([key, config]) => {
                if (config.el.checked !== isEnabled) {
                    config.el.checked = isEnabled;
                }
                saveState(key, isEnabled);
            });
        } else if (target.classList.contains('feature-group-toggle')) {
            const group = target.dataset.group;
            const isEnabled = target.checked;
            Object.entries(switches).forEach(([key, config]) => {
                if (config.group === group) {
                    if(config.el.checked !== isEnabled) {
                        config.el.checked = isEnabled;
                    }
                    saveState(key, isEnabled);
                }
            });
        } else {
            const changedSwitch = Object.entries(switches).find(([, config]) => config.el === target);
            if (changedSwitch) {
                const [key, config] = changedSwitch;
                saveState(key, config.el.checked);
            }
        }
        
        updateUI();
    });

    document.body.addEventListener('click', (event) => {
        const header = event.target.closest('.feature-card__header');
        if (header) {
            const card = header.closest('.feature-card');
            if (card) {
                card.querySelector('.feature-card__body').classList.toggle('collapsed');
            }
        }
    });

    loadStatesAndInit();
});