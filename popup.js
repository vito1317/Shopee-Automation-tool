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
    
    const passwordPromptContainer = document.getElementById('password-prompt-container');
    const passwordInput = document.getElementById('passwordInput');
    const submitPasswordButton = document.getElementById('submitPasswordButton');
    const cancelPasswordButton = document.getElementById('cancelPasswordButton');
    const passwordErrorMessage = document.getElementById('password-error-message');
    
    const correctHash = '9940c16d062ad99bbf20e524d5902cef4f6a405e23ac0242e7d58c8768914fdf';
    
    function saveState(key, value) {
        chrome.storage.sync.set({ [key]: value });
    }

    function getTodayString() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }

    function updateUI() {
        const kioskModeOn = switches.kioskModeEnabled.el.checked;
        const masterOn = switches.masterEnabled.el.checked;
        
        otherFeaturesContainer.style.display = kioskModeOn ? 'none' : '';
        switches.masterEnabled.el.disabled = kioskModeOn;
        if (kioskModeOn) switches.masterEnabled.el.checked = false;

        document.getElementById('masterStatusText').textContent = masterOn ? '所有功能已啟用' : '所有功能已停用';
        
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
        const today = getTodayString();

        chrome.storage.local.get('lastAuthDate', ({ lastAuthDate }) => {
            const authIsValid = lastAuthDate === today;
            chrome.storage.sync.get(keys, (data) => {
                let masterState = data.masterEnabled;

                if (masterState && !authIsValid) {
                    masterState = false;
                    saveState('masterEnabled', false);
                }
                
                keys.forEach(key => {
                    if (switches[key] && switches[key].el) {
                        const defaultValue = key === 'masterEnabled' ? false : (data[key] === undefined);
                        switches[key].el.checked = data[key] === undefined ? defaultValue : data[key];
                    }
                });

                switches.masterEnabled.el.checked = masterState || false;
                updateUI();
            });
        });
    }
    
    function proceedWithEnable() {
        switches.masterEnabled.el.checked = true;
        saveState('masterEnabled', true);
        Object.entries(switches).forEach(([k, config]) => {
            if (config.group) {
                config.el.checked = true;
                saveState(k, true);
            }
        });
        updateUI();
    }
    
    function showPasswordPrompt() {
        passwordErrorMessage.textContent = '';
        passwordInput.value = '';
        passwordPromptContainer.classList.add('visible');
        passwordInput.focus();
    }

    function hidePasswordPrompt() {
        passwordPromptContainer.classList.remove('visible');
        passwordInput.value = '';
        passwordErrorMessage.textContent = '';
    }
    
    submitPasswordButton.addEventListener('click', () => {
        const password = passwordInput.value;
        if (password && sha256(password) === correctHash) {
            const today = getTodayString();
            chrome.storage.local.set({ lastAuthDate: today }, () => {
                hidePasswordPrompt();
                proceedWithEnable();
            });
        } else {
            passwordErrorMessage.textContent = '密碼錯誤';
            passwordInput.value = '';
            passwordInput.focus();
        }
    });

    cancelPasswordButton.addEventListener('click', hidePasswordPrompt);
    
    passwordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            submitPasswordButton.click();
        }
    });

    switches.masterEnabled.el.addEventListener('change', (event) => {
        const isTryingToEnable = event.target.checked;
        
        if (isTryingToEnable) {
            event.preventDefault();
            event.target.checked = false;
            
            const today = getTodayString();
            chrome.storage.local.get('lastAuthDate', ({ lastAuthDate }) => {
                if (lastAuthDate === today) {
                    proceedWithEnable();
                } else {
                    showPasswordPrompt();
                }
            });
        } else {
            saveState('masterEnabled', false);
            updateUI();
        }
    });

    document.body.addEventListener('change', (event) => {
        const target = event.target;
        if (target.type !== 'checkbox' || target.id === 'masterSwitch') return;

        const key = Object.keys(switches).find(k => switches[k].el === target);
        if (key) {
            saveState(key, target.checked);
        }

        if (target.classList.contains('feature-group-toggle')) {
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
            const body = header.closest('.feature-card').querySelector('.feature-card__body');
            if (body) {
                body.classList.toggle('collapsed');
            }
        }
    });
    
    testKioskButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'toggleTestOverlay' }, (response) => {
            if (chrome.runtime.lastError) {
                passwordErrorMessage.textContent = '與背景腳本通訊失敗。';
                return;
            }
            if (!response || !response.success) {
                alert('測試失敗。請確認您已開啟至少一個蝦皮SPX作業分頁。');
            }
        });
    });

    loadStatesAndInit();
});