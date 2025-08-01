function injectInterceptor() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('interceptor.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
}
injectInterceptor();

function createKioskOverlay() {
    const overlayId = 'kiosk-overlay';
    if (document.getElementById(overlayId)) return;

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.9); z-index: 9999999; display: flex; justify-content: center; align-items: center; color: white; font-size: 3em; font-weight: bold; text-align: center; flex-direction: column; animation: fadeIn 0.5s ease-in-out;`;
    
    const text = document.createElement('p');
    text.textContent = '已打烊，謝謝光臨';
    
    const businessHours = document.createElement('p');
    businessHours.textContent = '營業時間:上午11:30~晚上10:30';
    businessHours.style.cssText = 'font-size: 0.5em; color: #dddddd; margin-top: 10px; font-weight: normal;';

    const animation = document.createElement('div');
    animation.style.cssText = `width: 80px; height: 40px; display: flex; justify-content: space-around; align-items: center; margin-top: 20px;`;
    
    for(let i=0; i<3; i++) {
        const dot = document.createElement('div');
        dot.style.cssText = `width: 15px; height: 15px; border-radius: 50%; background-color: white; animation: pulse 1.4s ease-in-out infinite;`;
        dot.style.animationDelay = `${i * 0.2}s`;
        animation.appendChild(dot);
    }
    
    overlay.appendChild(text);
    overlay.appendChild(businessHours);
    overlay.appendChild(animation);
    
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes pulse { 0%, 70%, 100% { transform: scale(0.6); opacity: 0.5; } 35% { transform: scale(1); opacity: 1; } }`;
    document.head.appendChild(style);
    document.body.appendChild(overlay);
}

function removeKioskOverlay() {
    const overlay = document.getElementById('kiosk-overlay');
    if (overlay) overlay.remove();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showKioskOverlay') {
        createKioskOverlay();
    } else if (request.action === 'hideKioskOverlay') {
        removeKioskOverlay();
    } else if (request.action === 'toggleKioskOverlay') {
        if (document.getElementById('kiosk-overlay')) {
            removeKioskOverlay();
        } else {
            createKioskOverlay();
        }
    }
});

chrome.runtime.sendMessage({ action: 'checkKioskStatus' }, (response) => {
    if (response && response.show) createKioskOverlay();
});

window.addEventListener('DOMContentLoaded', () => {

    let featureStates = {
        masterEnabled: false,
        featureFileScanEnabled: false,
        featureQueueingEnabled: false,
        featureQueueingAction: false,
        featureNextDayEnabled: false,
        featureNextDayAutoStartEnabled: false,
        featureCheckoutEnabled: false,
        featureCheckoutAction: false,
        featureOneItemPerBoxEnabled: false,
        featureTTSEnabled: false,
        featureTTSLocationEnabled: false,
        featureTTSAmountEnabled: false,
        featureNextDayAutoScanEnabled: false,
        featureToAutoScanEnabled: false,
        kioskModeEnabled: false
    };

    function syncFeatureStatesToInterceptor(states) {
        const event = new CustomEvent('extension-settings-loaded', {
            detail: {
                masterEnabled: states.masterEnabled,
                featureNextDayAutoScanEnabled: states.featureNextDayAutoScanEnabled,
                featureToAutoScanEnabled: states.featureToAutoScanEnabled
            }
        });
        document.documentElement.dataset.extensionFeatures = JSON.stringify(event.detail);
        document.dispatchEvent(event);
    }

    function loadFeatureStates() {
        const keysToGet = Object.keys(featureStates);
        chrome.storage.sync.get(keysToGet, (data) => {
            Object.keys(featureStates).forEach(key => {
                featureStates[key] = data[key] ?? featureStates[key];
            });
            syncFeatureStatesToInterceptor(featureStates);
            handleFeatureStateChange();
            checkUrlAndResetStates(window.location.href, true);
        });
    }

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
            let statesChanged = false;
            for (let key in changes) {
                if (featureStates.hasOwnProperty(key)) {
                    featureStates[key] = changes[key].newValue;
                    statesChanged = true;
                }
            }
            if (statesChanged) {
                syncFeatureStatesToInterceptor(featureStates);
                handleFeatureStateChange();
            }
        }
    });

    function handleFeatureStateChange() {
        if (!featureStates.masterEnabled || featureStates.kioskModeEnabled) {
            stopAllFeatures();
            return;
        }

        if (featureStates.featureFileScanEnabled) {
             if (typeof window.triggerShopeeFileScannerCheck === 'function') window.triggerShopeeFileScannerCheck();
        } else {
             if (typeof window.removeShopeeFileScannerUI === 'function') window.removeShopeeFileScannerUI();
        }

        if (featureStates.featureNextDayEnabled) {
            startNextDayFeature();
        } else {
            stopNextDayFeature();
        }

        if (featureStates.featureNextDayAutoScanEnabled || featureStates.featureToAutoScanEnabled) {
            startAutoScanFeatures();
        } else {
            stopAutoScanFeatures();
        }

        if (featureStates.featureQueueingEnabled) {
            startAutoCallNumberFeature();
        } else {
            stopAutoCallNumberFeature();
        }
        
        manageTTSFeature();
    }
    
    function stopAllFeatures() {
        stopNextDayFeature();
        stopAutoScanFeatures();
        stopAutoCallNumberFeature();
        stopCheckoutDataProcessingAndTTS();
        if (typeof window.removeShopeeFileScannerUI === 'function') {
            window.removeShopeeFileScannerUI();
        }
    }

    let currentUrl = window.location.href;
    let checkoutActionPerformed = false;
    const CHECKOUT_TARGET_URL = 'https://sp.spx.shopee.tw/outbound-management/self-collection-outbound/';
    let checkoutDataProcessingIntervalId = null;
    let spokenPhrasesThisSession = new Set();

    function checkUrlAndResetStates(newUrl, isInitialLoad = false) {
        manageTTSFeature();
        let needsCheckoutActionReset = false;
        const isOnTargetUrl = newUrl.startsWith(CHECKOUT_TARGET_URL);
        const previousUrlWasTarget = currentUrl.startsWith(CHECKOUT_TARGET_URL);

        if (isInitialLoad && !isOnTargetUrl) {
            needsCheckoutActionReset = true;
        } else if (previousUrlWasTarget !== isOnTargetUrl) {
            needsCheckoutActionReset = true;
        }

        if (needsCheckoutActionReset && checkoutActionPerformed) {
            checkoutActionPerformed = false;
        }
        currentUrl = newUrl;
    }

    const masterUrlCheckInterval = setInterval(() => {
        const newUrl = window.location.href;
        if (newUrl !== currentUrl) {
            checkUrlAndResetStates(newUrl);
        }
        autoCheckout();
    }, 750);
    
    let autoCallNumberIntervalId = null;

    function performAutoCallNumberLogic() {
        if (window.location.href === 'https://sp.spx.shopee.tw/queueing-management/queueing-task') {
            const button = document.querySelector('.ssc-btn-type-text');
            if (button) {
                if (featureStates.featureQueueingAction) button.click();
                else button.focus();
            }
        }
    }

    function startAutoCallNumberFeature() {
        if (autoCallNumberIntervalId) return;
        autoCallNumberIntervalId = setInterval(performAutoCallNumberLogic, 1500);
    }

    function stopAutoCallNumberFeature() {
        if (autoCallNumberIntervalId) {
            clearInterval(autoCallNumberIntervalId);
            autoCallNumberIntervalId = null;
        }
    }

    let nextDayIntervalId = null;
    let nextDayObserver = null;

    function startNextDayFeature() {
        if (nextDayIntervalId) return;
        nextDayIntervalId = setInterval(() => {
            const targetUrl = 'https://sp.spx.shopee.tw/outbound-management/pack-to/detail/';
            if (window.location.href.includes(targetUrl)) {
                checkAndClickNextDay();
                addOrUpdateNextDayCheckbox();
                addOrUpdateOneItemPerBoxCheckbox();
                if (featureStates.featureOneItemPerBoxEnabled) {
                    autoFocusForSingleItem();
                }
                startNextDayObserver();
            } else {
                stopNextDayObserver();
                removeNextDayCheckbox();
                removeOneItemPerBoxCheckbox();
            }
        }, 1000);
    }
    
    function stopNextDayFeature() {
        if (nextDayIntervalId) {
            clearInterval(nextDayIntervalId);
            nextDayIntervalId = null;
        }
        stopNextDayObserver();
        removeNextDayCheckbox();
        removeOneItemPerBoxCheckbox();
    }
    
    let autoScanIntervalId = null;
    
    function startAutoScanFeatures() {
        if (autoScanIntervalId) return;
        autoScanIntervalId = setInterval(() => {
            const packToUrl = 'https://sp.spx.shopee.tw/outbound-management/pack-to/detail/';
            const dropOffUrl = 'https://sp.spx.shopee.tw/outbound-management/pack-drop-off-to';
            const currentHref = window.location.href;

            if (currentHref.includes(packToUrl) && featureStates.featureNextDayAutoScanEnabled) {
                addOrUpdateNextDayAutoScanCheckbox();
            } else {
                removeNextDayAutoScanCheckbox();
            }
            
            if (currentHref.includes(dropOffUrl) && featureStates.featureToAutoScanEnabled) {
                addOrUpdateToAutoScanCheckbox();
            } else {
                removeToAutoScanCheckbox();
            }
        }, 1000);
    }

    function stopAutoScanFeatures() {
        if (autoScanIntervalId) {
            clearInterval(autoScanIntervalId);
            autoScanIntervalId = null;
        }
        removeNextDayAutoScanCheckbox();
        removeToAutoScanCheckbox();
    }

    function startNextDayObserver() {
        if (nextDayObserver) return;
        nextDayObserver = new MutationObserver((mutationsList) => {
            if (!featureStates.featureNextDayAutoStartEnabled) return;
            for (const mutation of mutationsList) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && node.classList.contains('ssc-message')) {
                        const isSuccess = node.querySelector('.ssc-message-icon.ssc-message-success');
                        const hasSuccessText = node.textContent.includes('列印成功');
                        if (isSuccess && hasSuccessText) {
                            const nowSelector = '.submenu-item.ssc-menu-item.ssc-menu-item-active.ssc-menu-item-selected';
                            const now = document.querySelector(nowSelector);
                            if (now) now.click();
                            setTimeout(() => {
                                 const startSelector = '.ssc-pro-table-tool-btn-wrap > button.ssc-btn-type-primary';
                                 const start = document.querySelector(startSelector);
                                 if (start) start.click();
                                 else {
                                      const fallbackStart = document.querySelector('.ssc-pro-table-toolbar .ssc-btn-primary');
                                      if (fallbackStart) fallbackStart.click();
                                 }
                            }, 700);
                            return; 
                        }
                    }
                }
            }
        });
        nextDayObserver.observe(document.body, { childList: true, subtree: true });
    }
    
    function stopNextDayObserver() {
        if (nextDayObserver) {
            nextDayObserver.disconnect();
            nextDayObserver = null;
        }
    }

    function checkAndClickNextDay() {
        const divElements = document.querySelectorAll('.ssc-input-shape-default');
        if (divElements.length >= 3) {
            const secoundDivElement = divElements[2];
            const inputElement = secoundDivElement.querySelector('input');
            if (inputElement && !inputElement.dataset.nextDayFocusListenerAdded) {
                inputElement.addEventListener('focus', function() {
                    this.value = 'BOX999999999';
                    const btnDistance = document.querySelector('.ssc-button.btn-distance');
                    if (btnDistance) btnDistance.click();
                });
                inputElement.dataset.nextDayFocusListenerAdded = "true";
            }
            const buttons = document.querySelectorAll('.ssc-button.ssc-btn-type-primary:not(.ssc-btn-plain)');
            buttons.forEach(button => {
                if (button.textContent.trim() === '完成') { 
                    if (!button.dataset.myCustomCompletionListener) {
                        button.addEventListener('click', () => {
                            setTimeout(() => {
                                const btnDistance = document.querySelector('.ssc-button.btn-distance');
                                if (btnDistance) btnDistance.click();
                            }, 300);
                        });
                        button.dataset.myCustomCompletionListener = "true"; 
                    }
                }
            });
        }
    }
    
    function autoFocusForSingleItem() {
        const tableRows = document.querySelectorAll('.ssc-table-row.ssc-table-row-normal');
        if (tableRows.length === 1) {
            const divElements = document.querySelectorAll('.ssc-input-shape-default');
            if (divElements.length >= 3) {
                const secoundDivElement = divElements[2];
                const inputElement = secoundDivElement.querySelector('input');
                if (inputElement && document.activeElement !== inputElement) {
                    const btnDistance = document.querySelector('.ssc-button.btn-distance');
                    if (btnDistance) btnDistance.click();
                }
            }
        }
    }

    function createCheckbox(id, checked, onChange, text) {
        const groupLabel = document.createElement('label');
        groupLabel.id = `group_${id}`;
        groupLabel.style.cssText = 'margin-left: 10px; display: inline-flex; align-items: center; cursor: pointer; vertical-align: middle;';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = id;
        checkbox.checked = checked;
        checkbox.style.cssText = 'margin-right: 5px; vertical-align: middle;';
        checkbox.addEventListener('change', onChange);
        const span = document.createElement('span');
        span.textContent = text;
        span.style.cssText = 'font-size: 13px; vertical-align: middle;';
        groupLabel.appendChild(checkbox);
        groupLabel.appendChild(span);
        return groupLabel;
    }

    function addOrUpdateCheckbox(containerSelector, id, state, key, text, afterElId) {
        const container = document.querySelector(containerSelector);
        if (!container) return;
        let groupLabel = document.getElementById(`group_${id}`);
        if (!groupLabel) {
            groupLabel = createCheckbox(id, state, function() {
                featureStates[key] = this.checked;
                chrome.storage.sync.set({ [key]: this.checked });
            }, text);
            const afterEl = afterElId ? document.getElementById(afterElId) : container.lastElementChild;
            if (afterEl && afterEl.parentNode === container) {
                afterEl.insertAdjacentElement('afterend', groupLabel);
            } else {
                container.appendChild(groupLabel);
            }
        } else {
            const checkbox = groupLabel.querySelector(`#${id}`);
            if (checkbox && checkbox.checked !== state) {
                checkbox.checked = state;
            }
        }
    }

    function removeCheckbox(id) {
        const groupEl = document.getElementById(`group_${id}`);
        if (groupEl) groupEl.remove();
    }

    function addOrUpdateNextDayCheckbox() {
        addOrUpdateCheckbox('.ssc-breadcrumb', 'status', featureStates.featureNextDayAutoStartEnabled, 'featureNextDayAutoStartEnabled', '自動開始下一筆');
    }

    function removeNextDayCheckbox() {
        removeCheckbox('status');
    }

    function addOrUpdateOneItemPerBoxCheckbox() {
        addOrUpdateCheckbox('.ssc-breadcrumb', 'oneItemPerBoxFocusCheckbox', featureStates.featureOneItemPerBoxEnabled, 'featureOneItemPerBoxEnabled', '一件一箱', 'group_status');
    }

    function removeOneItemPerBoxCheckbox() {
        removeCheckbox('oneItemPerBoxFocusCheckbox');
    }

    function addOrUpdateNextDayAutoScanCheckbox() {
        addOrUpdateCheckbox('.ssc-layout-item.header-container', 'nextDayAutoScanCheckbox', featureStates.featureNextDayAutoScanEnabled, 'featureNextDayAutoScanEnabled', '隔日自動刷件');
    }

    function removeNextDayAutoScanCheckbox() {
        removeCheckbox('nextDayAutoScanCheckbox');
    }
    
    function addOrUpdateToAutoScanCheckbox() {
        addOrUpdateCheckbox('.ssc-breadcrumb', 'toAutoScanCheckbox', featureStates.featureToAutoScanEnabled, 'featureToAutoScanEnabled', 'TO單自動刷取');
    }

    function removeToAutoScanCheckbox() {
        removeCheckbox('toAutoScanCheckbox');
    }

    loadFeatureStates();
    
    function startCheckoutDataProcessingAndTTS() {
        if (checkoutDataProcessingIntervalId === null) {
            spokenPhrasesThisSession.clear();
            setTimeout(processAndSpeakCheckoutData, 1500);
            checkoutDataProcessingIntervalId = setInterval(processAndSpeakCheckoutData, 4000);
        }
    }

    function stopCheckoutDataProcessingAndTTS() {
        if (checkoutDataProcessingIntervalId !== null) {
            clearInterval(checkoutDataProcessingIntervalId);
            checkoutDataProcessingIntervalId = null;
        }
        if (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
        spokenPhrasesThisSession.clear();
    }

    function manageTTSFeature() {
        const isOnTargetUrl = window.location.href.startsWith(CHECKOUT_TARGET_URL);
        const isTTSEnabled = featureStates.masterEnabled && featureStates.featureTTSEnabled;

        if (isOnTargetUrl && isTTSEnabled) {
            startCheckoutDataProcessingAndTTS();
        } else {
            stopCheckoutDataProcessingAndTTS();
        }
    }

    function processAndSpeakCheckoutData() {
        const formattedTextElements = document.querySelectorAll('.td-content.td-content-ellipsis');
        const regex = /^[A-Za-z]-\d{2}$/;
        const newFormattedTexts = [];
        formattedTextElements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && regex.test(text)) {
                if (!spokenPhrasesThisSession.has(text)) {
                    newFormattedTexts.push(text);
                    spokenPhrasesThisSession.add(text);
                }
            }
        });

        const spanElements = document.querySelectorAll('span[data-v-445825e8]');
        const newLastThreeDigits = [];
        spanElements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length >= 3) {
                const lastThree = text.slice(-3);
                const phrase = "末三碼 " + lastThree;
                if (!spokenPhrasesThisSession.has(phrase)) {
                    newLastThreeDigits.push(phrase);
                    spokenPhrasesThisSession.add(phrase);
                }
            }
        });

        const totalCollectionElements = document.querySelectorAll('.total-collection-content');
        const newTotalCollectionValues = [];
        totalCollectionElements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && !isNaN(parseFloat(text))) {
                const phrase = `總金額 ${text} 元`;
                if (!spokenPhrasesThisSession.has(phrase)) {
                    newTotalCollectionValues.push(phrase);
                    spokenPhrasesThisSession.add(phrase);
                }
            }
        });

        const changeAmountElements = document.querySelectorAll('span[data-v-09bdac12]');
        const newChangeAmountsToSpeak = [];
        changeAmountElements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text !== '-') {
                const phrase = `找 ${text} 元`;
                if (!spokenPhrasesThisSession.has(phrase)) {
                    newChangeAmountsToSpeak.push(phrase);
                    spokenPhrasesThisSession.add(phrase);
                }
            }
        });

        const itemsToSpeakInOrder = [];

        if (featureStates.featureTTSLocationEnabled) {
            if (newFormattedTexts.length > 0) {
                const formattedCabinetCodes = newFormattedTexts.map(text => {
                    return text.replace(/([A-Za-z])-(\d{2})/, (match, p1, p2) => {
                        return `${p1}${parseInt(p2, 10)}`;
                    });
                });

                if (formattedCabinetCodes.length > 0) {
                    itemsToSpeakInOrder.push("櫃位 " + formattedCabinetCodes[0]);
                    itemsToSpeakInOrder.push(...formattedCabinetCodes.slice(1));
                }
            }

            if (newLastThreeDigits.length > 0) {
                itemsToSpeakInOrder.push(...newLastThreeDigits);
            }
        }

        if (featureStates.featureTTSAmountEnabled) {
            if (newTotalCollectionValues.length > 0) {
                itemsToSpeakInOrder.push(...newTotalCollectionValues);
            }
            if (newChangeAmountsToSpeak.length > 0) {
                itemsToSpeakInOrder.push(...newChangeAmountsToSpeak);
            }
        }

        if (itemsToSpeakInOrder.length > 0) {
            speakTextArray(itemsToSpeakInOrder);
        }
    }


    function speakTextArray(items) {
        if (!items || items.length === 0 || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
            return;
        }
        speechSynthesis.cancel();

        let currentIndex = 0;
        function speakNext() {
            if (currentIndex < items.length) {
                let textToSpeak = items[currentIndex];

                if (textToSpeak.startsWith("末三碼 ")) {
                    const numericPart = textToSpeak.substring(4);
                    if (/^\d{3}$/.test(numericPart)) {
                        textToSpeak = "末三碼 " + numericPart.split('').join(' ');
                    }
                } else if (/^\d{3}$/.test(textToSpeak) && !textToSpeak.startsWith("櫃位 ")) {
                     textToSpeak = textToSpeak.split('').join(' ');
                }
                
                textToSpeak = textToSpeak.replace(/(櫃位\s+)?B(\d+)/g, (match, prefix, number) => {
                    return (prefix || '') + 'B ' + number;
                });

                if (textToSpeak.startsWith("櫃位 ")) {
                    textToSpeak = textToSpeak.replace(/D/g, '豬');
                }

                const utterance = new SpeechSynthesisUtterance(textToSpeak);
                utterance.lang = 'zh-TW';
                utterance.rate = 0.9;
                utterance.onend = () => {
                    currentIndex++;
                    setTimeout(speakNext, 300);
                };
                utterance.onerror = (event) => {
                    currentIndex++;
                    setTimeout(speakNext, 300);
                };
                speechSynthesis.speak(utterance);
            }
        }
        speakNext();
    }


    function autoCheckout() {
        const isOnCheckoutUrl = window.location.href.startsWith(CHECKOUT_TARGET_URL);

        if (isOnCheckoutUrl) {
            if (!featureStates.masterEnabled || !featureStates.featureCheckoutEnabled) {
                checkoutActionPerformed = false;
                return;
            }

            if (checkoutActionPerformed) {
                return;
            }

            const operationButton = document.querySelector('.task-operation');
            const rowCount = document.querySelectorAll('.ssc-table-row-normal').length;
            const buttonCount = document.querySelectorAll('.ssc-btn-type-text').length;
            const tableCount = document.querySelectorAll('.ssc-table-header-column-container').length;
            const conditionsMet = rowCount > 0 && rowCount === buttonCount && operationButton && buttonCount * 2 === tableCount;

            if (conditionsMet) {
                try {
                    if (featureStates.featureCheckoutAction === true) {
                        operationButton.click();
                    } else {
                        operationButton.focus();
                    }
                    checkoutActionPerformed = true;
                } catch (error) {}
            }
        } else {
            checkoutActionPerformed = false;
        }
    };


    (async function() {
        'use strict';

        if (window.shopeeTwExtractorInitialized_FileScan) {
            return;
        }
        window.shopeeTwExtractorInitialized_FileScan = true;

        const SCRIPT_PREFIX = "ShopeeTWExtractor";

        let uiInitialized = false, fileQueue = [], isProcessing = false, currentFileIndex = 0, totalFilesInBatch = 0, batchScanErrors = [], librariesLoaded = false, checkCounter = 0;
        let totalSimulatedInBatch = 0;
        const maxChecks = 40, checkIntervalMs = 500;
        let librariesCheckInterval = null, lastUrl = location.href, navDebounceTimeout = null;
        let initPollingInterval = null;

        async function getFeatureStatesFromContent() {
            return new Promise((resolve) => {
                const currentStates = { ...featureStates };
                chrome.storage.sync.get(Object.keys(currentStates), (data) => {
                    if (chrome.runtime.lastError) {
                         resolve(currentStates);
                    } else {
                        resolve({ ...currentStates, ...data });
                    }
                });
            });
        }


        if (typeof pdfjsLib !== 'undefined') {
            if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                 try {
                     const url = chrome.runtime.getURL('libs/pdf.worker.min.js');
                     pdfjsLib.GlobalWorkerOptions.workerSrc = url;
                 }
                 catch (e) {}
            }
        }

        let html5QrLoadAttempted = false;
        const html5QrCodePath = chrome.runtime.getURL('libs/html5-qrcode.min.js');
        function loadHtml5QrCode() {
            if (typeof Html5Qrcode !== 'undefined'){
                if(!librariesLoaded && librariesCheckInterval) checkLibrariesAndInit();
                return;
            }
            if (html5QrLoadAttempted) return;
            html5QrLoadAttempted = true;
            const s=document.createElement('script');
            s.src=html5QrCodePath;
            s.onload=()=>{
                if(typeof Html5Qrcode==='undefined') {}
                else if(!librariesLoaded&&librariesCheckInterval) checkLibrariesAndInit();
            };
            s.onerror=e=>{
                updateStatusSpan("錯誤:QR庫載入失敗",'red');
            };
            (document.head||document.documentElement).appendChild(s);
        }

        async function checkLibrariesAndInit() {
            if (!html5QrLoadAttempted && typeof Html5Qrcode === 'undefined') loadHtml5QrCode();
            if (librariesCheckInterval) return;

            checkCounter=0;
            librariesCheckInterval = setInterval(async () => {
                checkCounter++;
                const pdfOk=typeof pdfjsLib!=='undefined'&&pdfjsLib.GlobalWorkerOptions.workerSrc;
                const qrOk=typeof Html5Qrcode!=='undefined';
                const currentRuntimeFeatureStates = await getFeatureStatesFromContent();
                const enabled = currentRuntimeFeatureStates.masterEnabled && currentRuntimeFeatureStates.featureFileScanEnabled;

                if (!enabled) {
                    clearInterval(librariesCheckInterval); librariesCheckInterval=null;
                    updateStatusSpan("", "grey");
                    await removeFileScannerUI();
                    return;
                }
                if (pdfOk && qrOk) {
                    librariesLoaded=true;
                    clearInterval(librariesCheckInterval); librariesCheckInterval=null;
                    await checkUrlAndMaybeInitialize();
                    return;
                }
                if (checkCounter>=maxChecks) {
                    clearInterval(librariesCheckInterval); librariesCheckInterval=null;
                    librariesLoaded=false;
                    let err="庫載入超時."; const miss=[];
                    if(!pdfOk)miss.push('pdf'); if(!qrOk)miss.push('html5qr');
                    if(miss.length>0)err+=` (${miss.join(',')})`;
                    updateStatusSpan(`錯誤:${err}`, 'red');
                    await removeFileScannerUI();
                    return;
                }
                if(enabled) {
                    let w=[]; if(!pdfOk)w.push('pdf'); if(!qrOk)w.push('html5qr');
                    if(w.length>0) updateStatusSpan(`等待程式載入庫(${checkCounter}/${maxChecks}):${w.join(',')}..`, 'grey');
                }
            }, checkIntervalMs);
        }

        function updateStatusSpan(text, color = 'grey', allowWrap = false) {
            let span=document.getElementById(`${SCRIPT_PREFIX}_customStatusSpan`);
            if (!span && text !== "") span=createStatusElement();
            if (span) {
                span.textContent=text; span.style.color=color;
                span.style.whiteSpace=allowWrap?'normal':'nowrap';
                span.style.overflow=allowWrap?'visible':'hidden';
                span.style.textOverflow=allowWrap?'clip':'ellipsis';
                span.style.maxHeight=allowWrap?'12em':'1.5em';
                span.style.display=text===""?'none':'inline-block';
            }
        }

        function createStatusElement() {
            const id=`${SCRIPT_PREFIX}_customStatusSpan`;
            let el=document.getElementById(id); if(el)return el;
            const target=findTargetContainer(); if(!target)return null;

            try {
                el=document.createElement('span'); el.id=id;
                el.style.fontFamily='Arial,sans-serif'; el.style.fontSize='13px';
                el.style.marginLeft='10px'; el.style.verticalAlign='middle';
                el.style.lineHeight='1.4'; el.style.display='inline-block';
                el.style.wordBreak='break-word'; el.style.maxWidth='450px';
                el.textContent='初始化..'; el.style.color='grey';
                if(document.body.contains(target)){target.appendChild(el);return el;}
                else { return null; }
            } catch(e){ return null; }
        }

        function findTargetContainer() {
            const sels=['.order-input','div.ssc-input', '.ssc-form-item-control .ssc-input'];
            for(const s of sels){
                try{const c=document.querySelector(s); if(c&&document.body.contains(c)&&c.offsetParent!==null) return c;}
                catch(e){}
            }
            return null;
        }

        async function initializeElements() {
            const currentRuntimeFeatureStates = await getFeatureStatesFromContent();
            if (!currentRuntimeFeatureStates.masterEnabled || !currentRuntimeFeatureStates.featureFileScanEnabled) {
                await removeFileScannerUI();
                return;
            }

            if (!librariesLoaded) {
                if (!librariesCheckInterval) await checkLibrariesAndInit();
                else updateStatusSpan('等庫..', 'grey');
                return;
            }

            const existingInput = document.getElementById(`${SCRIPT_PREFIX}_customFileInput`);
            if (uiInitialized && existingInput && document.body.contains(existingInput)) {
                if (initPollingInterval) {
                     clearInterval(initPollingInterval); initPollingInterval = null;
                 }
                 const statEl = document.getElementById(`${SCRIPT_PREFIX}_customStatusSpan`);
                 const curStat = statEl?.textContent || '';
                 if (!isProcessing && !curStat.includes("佇列") && !curStat.includes("處理中") && !curStat.startsWith("錯誤") && !curStat.startsWith("完成，但")) {
                    updateStatusSpan('請選PDF/HTML/JPG/PNG檔(可多選)', 'grey');
                 }
                 if(!isProcessing) existingInput.disabled=false;
                 if(!document.getElementById(`${SCRIPT_PREFIX}_html5qrReaderDiv`)) createHiddenReaderElement();
                return;
            }

            const target = findTargetContainer();
            if (!target) {
                 uiInitialized = false;
                return;
            }

            try {
                let sEl=document.getElementById(`${SCRIPT_PREFIX}_customStatusSpan`);
                if(!sEl) {
                    sEl=createStatusElement();
                    if(!sEl) throw new Error("Status span creation failed despite target found.");
                }
                let fEl=document.getElementById(`${SCRIPT_PREFIX}_customFileInput`);
                if (!fEl) {
                    fEl=document.createElement('input'); fEl.type='file'; fEl.id=`${SCRIPT_PREFIX}_customFileInput`;
                    fEl.accept='.pdf,.html,application/pdf,text/html,.jpg,.jpeg,.png,image/jpeg,image/png';
                    fEl.multiple=true; fEl.style.marginLeft='10px';fEl.style.display='inline-block';fEl.style.verticalAlign='middle';fEl.style.maxWidth='220px';fEl.style.fontSize='12px';
                    fEl.disabled=isProcessing;
                    fEl.addEventListener('change',handleFileSelection); fEl.dataset.listenerAttached='true';
                    if(document.body.contains(target)) target.appendChild(fEl); else throw new Error("Target lost before input append");
                } else {
                    if(!fEl.dataset.listenerAttached){
                        fEl.addEventListener('change',handleFileSelection); fEl.dataset.listenerAttached='true';
                    }
                    fEl.disabled=isProcessing;
                }
                if (!createHiddenReaderElement()) throw new Error("QR reader div creation failed.");
                uiInitialized = true;
                if (!isProcessing && batchScanErrors.length === 0) updateStatusSpan('請選PDF/HTML/JPG/PNG檔(可多選)','grey');
                if (initPollingInterval) { clearInterval(initPollingInterval); initPollingInterval = null; }
                return;
            } catch (err) {
                await removeFileScannerUI(); updateStatusSpan('錯誤:介面初始化失敗','red'); uiInitialized = false;
            }
        }

        function createHiddenReaderElement() {
            const id=`${SCRIPT_PREFIX}_html5qrReaderDiv`; if(document.getElementById(id))return true;
            try{
                const el=document.createElement("div"); el.id=id;
                el.style.position='absolute';el.style.top='-9999px';el.style.left='-9999px';
                el.style.width="300px";el.style.height="300px";el.style.zIndex="-1";el.style.overflow='hidden';el.ariaHidden="true";
                document.body.appendChild(el); return true;
            }
            catch(e){ return false; }
        }

        async function handleFileSelection(event) {
            const currentRuntimeFeatureStates = await getFeatureStatesFromContent();
            if(!currentRuntimeFeatureStates.masterEnabled||!currentRuntimeFeatureStates.featureFileScanEnabled){ event.target.value=''; return; }

            const fin=event.target; if(isProcessing){ updateStatusSpan("處理中..", "orange"); fin.value=''; return; }

            const files=Array.from(fin.files); if(files.length===0) return;

            batchScanErrors=[];
            totalSimulatedInBatch = 0;

            fileQueue.push(...files); fin.value='';
            updateStatusSpan(`${files.length}檔加入，共${fileQueue.length}個`, 'blue');

            if(!isProcessing && fileQueue.length>0){
                totalFilesInBatch=fileQueue.length; currentFileIndex=0;
                await processNextFileInQueue();
            }
        }

        async function processNextFileInQueue() {
            const currentRuntimeFeatureStates = await getFeatureStatesFromContent();
            if (!currentRuntimeFeatureStates.masterEnabled || !currentRuntimeFeatureStates.featureFileScanEnabled) {
                fileQueue = []; isProcessing = false;
                updateStatusSpan("佇列已取消(功能停用)", "orange");
                resetFileInputState(); totalFilesInBatch = 0;
                return;
            }
            if (fileQueue.length === 0) {
                isProcessing = false;
                const fInput = document.getElementById(`${SCRIPT_PREFIX}_customFileInput`);
                if (fInput) fInput.disabled = false;

                if (batchScanErrors.length > 0) {
                    displayBatchErrorSummary();
                } else if (totalFilesInBatch > 0 && totalSimulatedInBatch === 0) {
                    updateStatusSpan(`完成 ${totalFilesInBatch} 個檔案，未找到可輸入的條碼。`, 'orange', true);
                } else if (totalFilesInBatch > 0 && totalSimulatedInBatch > 0) {
                     updateStatusSpan(`完成 ${totalFilesInBatch} 個檔案，已輸入 ${totalSimulatedInBatch} 個條碼。`, 'green', true);
                } else {
                     updateStatusSpan('請選擇檔案','grey');
                }
                totalFilesInBatch = 0;
                return;
            }

            isProcessing = true; currentFileIndex++;
            const file = fileQueue.shift();
            const dName = file.name.length>30 ? file.name.substring(0,27)+'...' : file.name;
            const statusPrefix = `[${currentFileIndex}/${totalFilesInBatch}] ${dName}: `;
            updateStatusSpan(statusPrefix+'準備..','grey');
            const fNameReport = file.name;

            const fInput = document.getElementById(`${SCRIPT_PREFIX}_customFileInput`);
            if(fInput) fInput.disabled = true;

            try {
                const fNameLower = file.name.toLowerCase();
                if (file.type === 'application/pdf' || fNameLower.endsWith('.pdf')) {
                    await processPDF(file, statusPrefix, fNameReport);
                } else if (file.type === 'text/html' || fNameLower.endsWith('.html')) {
                    await processHTML(file, statusPrefix, fNameReport);
                } else if (['image/jpeg', 'image/png'].includes(file.type) || fNameLower.endsWith('.jpg') || fNameLower.endsWith('.jpeg') || fNameLower.endsWith('.png')) {
                    await processImageFile(file, statusPrefix, fNameReport);
                } else {
                    updateStatusSpan(statusPrefix + '不支援', 'orange');
                    addBatchScanError(fNameReport, null, 'File', 'Skipped', 'Unsupported Type');
                }
            } catch (err) {
                updateStatusSpan(statusPrefix + `檔案錯誤: ${err.message || '未知'}`, 'red', true);
                addBatchScanError(fNameReport, null, 'File', 'Processing Error', err.message || 'Unknown');
            } finally {
                await new Promise(r=>setTimeout(r,100));
                const stateAfterProcessing = await getFeatureStatesFromContent();
                if (!stateAfterProcessing.masterEnabled||!stateAfterProcessing.featureFileScanEnabled){
                    fileQueue=[];isProcessing=false;
                    updateStatusSpan("佇列取消(功能已停用)","orange");
                    resetFileInputState();totalFilesInBatch=0;
                } else {
                    isProcessing=false;
                    await processNextFileInQueue();
                }
            }
        }

        function addBatchScanError(fileName, pageNumber, scanType, errorType, details) {
            const err={
                id:Date.now()+Math.random(),fileName:fileName||"N/A",
                pageNumber,scanType,errorType,details:details||'',timestamp:new Date().toISOString()
            };
            batchScanErrors.push(err);
        }

        function displayBatchErrorSummary() {
            if(batchScanErrors.length===0 && totalSimulatedInBatch === 0 && totalFilesInBatch === 0) return;

            let summary = "";
            if (totalSimulatedInBatch > 0) {
                summary += `成功輸入 ${totalSimulatedInBatch} 件。\n`;
            }

            if (batchScanErrors.length > 0) {
                const errorsToDisplay=[];
                const groupedByFilePage=batchScanErrors.reduce((acc,err)=>{
                    const fk=err.fileName; const pk=err.pageNumber!==null?String(err.pageNumber):'_fLvl';
                    if(!acc[fk])acc[fk]={}; if(!acc[fk][pk])acc[fk][pk]=[];
                    acc[fk][pk].push(err); return acc;
                },{});

                for(const fn in groupedByFilePage){
                    const pgs=groupedByFilePage[fn];
                    for(const pgS in pgs){
                        if(pgS==='_fLvl') continue;
                        const pgErrs=pgs[pgS];
                        const fullPg=pgErrs.filter(e=>e.scanType==='整頁');
                        const quad=pgErrs.filter(e=>['左上','右上','左下','右下'].some( qp => e.scanType.startsWith(qp) ));

                        if(quad.length===4&&fullPg.length>0){
                            let allQuadNotFound=true;
                            for(const qe of quad){ if(qe.errorType!=='Not Found'){allQuadNotFound=false;break;} }
                            if(allQuadNotFound && fullPg[0].errorType==='Not Found'){
                                errorsToDisplay.push({f:fn,p:pgS, eT:'整頁與四象限QR均未找到'}); continue;
                            }
                        }
                        pgErrs.forEach(e=>{errorsToDisplay.push({f:e.fileName,p:e.pageNumber,sT:e.scanType,eT:e.errorType,d:e.details})});
                    }
                    if(pgs['_fLvl']) pgs['_fLvl'].forEach(e=>{errorsToDisplay.push({f:e.fileName,p:'N/A',sT:e.scanType,eT:e.errorType,d:e.details})});
                }

                if(errorsToDisplay.length > 0){
                    summary += `發生 ${errorsToDisplay.length} 個問題:\n`;
                    errorsToDisplay.slice(0, 5).forEach(e => {
                        summary += `- ${e.f}${e.p !== 'N/A' && e.p !== null ? ` (頁 ${e.p})` : ''} [${e.sT || 'N/A'}]: ${e.eT} (${(e.d || '').substring(0,30)}...)\n`;
                    });
                    if (errorsToDisplay.length > 5) summary += `...等其他 ${errorsToDisplay.length - 5} 個問題 (詳見控制台)。\n`;
                }
            } else if (totalFilesInBatch > 0 && totalSimulatedInBatch === 0 && batchScanErrors.length === 0) {
                 summary += `完成 ${totalFilesInBatch} 個檔案，未找到可輸入的條碼。\n`;
            }


            updateStatusSpan(summary.trim(), batchScanErrors.length > 0 ? 'orange' : (totalSimulatedInBatch > 0 ? 'green' : 'grey'), true);
        }


        function resetFileInputState() {
            const fInput = document.getElementById(`${SCRIPT_PREFIX}_customFileInput`);
            if (fInput) { fInput.value = ''; fInput.disabled = false; }
        }

        async function simulateBarcodeInput(code, fileNameForReport) {
            const currentRuntimeFeatureStates = await getFeatureStatesFromContent();
            if (!currentRuntimeFeatureStates.masterEnabled || !currentRuntimeFeatureStates.featureFileScanEnabled) {
                addBatchScanError(fileNameForReport, null, 'Simulate', 'Cancelled by Toggle', '功能已停用');
                throw new Error("Op cancelled by toggle");
            }

            const sel = 'div.ssc-input input, .ssc-form-item-control .ssc-input input';
            const inp = document.querySelector(sel);
            if (!inp) {
                addBatchScanError(fileNameForReport, null, 'Simulate', 'Input Not Found', '找不到目標輸入框');
                throw new Error('找不到目標輸入框!');
            }
            try {
                inp.focus();
                await new Promise(r => requestAnimationFrame(r));
                const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                valueSetter.call(inp, code);
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, 50));
                const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
                inp.dispatchEvent(enterEvent);
            } catch (e) {
                addBatchScanError(fileNameForReport, null, 'Simulate', 'Execution Error', e.message || String(e));
                throw e;
            }
        }

        async function processBarcodesAndQRCodes(pdf, processedCodesThisFile, statusPrefix, fileNameForReport) {
            const currentRuntimeFeatureStates = await getFeatureStatesFromContent();
            if (!currentRuntimeFeatureStates.masterEnabled || !currentRuntimeFeatureStates.featureFileScanEnabled) {
                addBatchScanError(fileNameForReport, null, 'Scan', 'Cancelled', '功能已停用');
                return;
            }

            const readerEl = document.getElementById(`${SCRIPT_PREFIX}_html5qrReaderDiv`);
            if (typeof Html5Qrcode === 'undefined' || !readerEl) {
                addBatchScanError(fileNameForReport, null, 'Scan', 'Setup Err', 'QR掃描器未就緒');
                return;
            }
            let qr;
            try {
                 qr = new Html5Qrcode(readerEl.id);
            } catch (qrInitErr) {
                addBatchScanError(fileNameForReport, null, 'QR Init', 'Init Fail', qrInitErr.message || String(qrInitErr));
                updateStatusSpan(statusPrefix + "QR掃描器初始化失敗", "red");
                return;
            }

            const codesFoundByQRThisFunc = []; let dupeCnt = 0;

            const ps = Array.from({ length: pdf.numPages }, (_, i) => (async (pn) => {
                const pgNum = pn + 1;
                let page = null, cFull = null, cQuad = null, ctxQ = null;
                try {
                    let currentRenderState = await getFeatureStatesFromContent();
                    if (!currentRenderState.masterEnabled || !currentRenderState.featureFileScanEnabled) {
                        addBatchScanError(fileNameForReport, pgNum, 'Render', 'Cancelled', '功能已於渲染前停用');
                        return;
                    }
                    page = await pdf.getPage(pgNum);
                    const vp = page.getViewport({ scale: 2 });
                    cFull = document.createElement('canvas'); cFull.width = vp.width; cFull.height = vp.height;
                    const ctxFull = cFull.getContext('2d', { willReadFrequently: true });
                    await page.render({ canvasContext: ctxFull, viewport: vp }).promise;

                    const w = cFull.width, h = cFull.height;
                    const quads = [
                        { n: '左上', x: 0, y: 0, w: w / 2, h: h / 2 },
                        { n: '右上', x: w / 2, y: 0, w: w / 2, h: h / 2 },
                        { n: '左下', x: 0, y: h / 2, w: w / 2, h: h / 2 },
                        { n: '右下', x: w / 2, y: h / 2, w: w / 2, h: h / 2 }
                    ];
                    let fullFound = false;

                    currentRuntimeFeatureStates = await getFeatureStatesFromContent();
                    if (!currentRuntimeFeatureStates.masterEnabled || !currentRuntimeFeatureStates.featureFileScanEnabled) {
                        addBatchScanError(fileNameForReport, pgNum, 'Render', 'Cancelled', '功能已停用');
                        throw new Error("Op cancelled during render");
                    }
                    updateStatusSpan(statusPrefix + `掃描第 ${pgNum} 頁 (整頁 QR)...`, 'grey');
                    try {
                        const blob = await new Promise((res, rej) => {
                            if (!cFull || cFull.width === 0) return rej(new Error('Canvas invalid'));
                            cFull.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/png');
                        });
                        const img = new File([blob], `p${pgNum}f.png`, { type: 'image/png' });
                        const result = await qr.scanFile(img, false);
                        const txt = result?.decodedText?.trim() || (typeof result === 'string' ? result.trim() : null);

                        if (txt && /^TW[A-Z0-9]{13}$/.test(txt)) {
                            if (!processedCodesThisFile.has(txt)) {
                                processedCodesThisFile.add(txt); codesFoundByQRThisFunc.push(txt);
                                updateStatusSpan(statusPrefix + `第${pgNum}頁(整頁QR):✔️新增 ${txt.substring(0,6)}..`, 'grey');
                            } else {
                                dupeCnt++;
                                updateStatusSpan(statusPrefix + `第${pgNum}頁(整頁QR):⚠️重複 ${txt.substring(0,6)}..`, 'grey');
                            }
                            fullFound = true;
                        } else if (txt) {
                            updateStatusSpan(statusPrefix + `第${pgNum}頁(整頁QR): ❌無效`, 'grey');
                            addBatchScanError(fileNameForReport, pgNum, '整頁 QR', 'Invalid Format', `'${txt.substring(0,10)}...'`);
                        } else {
                            updateStatusSpan(statusPrefix + `第${pgNum}頁(整頁QR): 未找到`, 'grey');
                            addBatchScanError(fileNameForReport, pgNum, '整頁 QR', 'Not Found', '');
                        }
                    } catch (err) {
                        const msgL = (err?.message || '').toLowerCase();
                        let eType = 'Scan Err', color='orange';
                        if(msgL.includes("not found") || msgL.includes("unable to find") || msgL.includes("no qr code found") || msgL.includes("multiformat")){ eType='Not Found'; color='grey'; }
                        else if(msgL.includes("canvas")||msgL.includes("toblob")){ eType='Canvas Err'; }
                        addBatchScanError(fileNameForReport, pgNum, '整頁 QR', eType, err.message || String(err));
                        updateStatusSpan(statusPrefix + `第${pgNum}頁(整頁QR):❗${eType}`, color);
                    }

                    if (!fullFound) {
                        cQuad = document.createElement('canvas'); ctxQ = cQuad.getContext('2d', { willReadFrequently: true });
                        for (let qi = 0; qi < quads.length; qi++) {
                            const q = quads[qi];
                            const isLast = qi === quads.length - 1;
                            currentRuntimeFeatureStates = await getFeatureStatesFromContent();
                             if (!currentRuntimeFeatureStates.masterEnabled || !currentRuntimeFeatureStates.featureFileScanEnabled) {
                                addBatchScanError(fileNameForReport, pgNum, q.n + ' QR', 'Cancelled', '功能已停用');
                                break;
                            }
                            updateStatusSpan(statusPrefix + `掃描第 ${pgNum} 頁 (${q.n} QR)...`, 'grey');
                            const sx = Math.floor(q.x), sy = Math.floor(q.y);
                            const sw = Math.max(1, Math.ceil(q.w)), sh = Math.max(1, Math.ceil(q.h));
                            if (sw <= 0 || sh <= 0 || sx >= w || sy >= h) {
                                addBatchScanError(fileNameForReport, pgNum, q.n + ' QR', 'Scan Err', 'Invalid Geo');
                                continue;
                            }
                            cQuad.width = sw; cQuad.height = sh;
                            const ignored = isLast && q.n !== '左上';
                            try {
                                ctxQ.drawImage(cFull, sx, sy, sw, sh, 0, 0, sw, sh);
                                const blobQ = await new Promise((rs, rj) => {
                                    if (!cQuad || cQuad.width === 0) return rj(new Error('Quad canvas invalid'));
                                    cQuad.toBlob(b => b ? rs(b) : rj(new Error('Quad toBlob null')), 'image/png');
                                });
                                const imgQ = new File([blobQ], `p${pgNum}${q.n}.png`, { type: 'image/png' });
                                const resQ = await qr.scanFile(imgQ, false);
                                const txtQ = resQ?.decodedText?.trim() || (typeof resQ === 'string' ? resQ.trim() : null);

                                if (txtQ && /^TW[A-Z0-9]{13}$/.test(txtQ)) {
                                    if (!processedCodesThisFile.has(txtQ)) {
                                        processedCodesThisFile.add(txtQ); codesFoundByQRThisFunc.push(txtQ);
                                        updateStatusSpan(statusPrefix + `第${pgNum}頁(${q.n} QR):✔️新增 ${txtQ.substring(0,6)}..`, 'grey');
                                    } else {
                                        dupeCnt++;
                                        updateStatusSpan(statusPrefix + `第${pgNum}頁(${q.n} QR):⚠️重複 ${txtQ.substring(0,6)}..`, 'grey');
                                    }
                                } else if (txtQ) {
                                    const details = `'${txtQ.substring(0,10)}...'`;
                                    if (!ignored) addBatchScanError(fileNameForReport, pgNum, q.n + ' QR', 'Invalid Format', details);
                                    updateStatusSpan(statusPrefix + `第${pgNum}頁(${q.n} QR):❌無效` + (ignored?'(忽略)':''), 'grey');
                                } else {
                                    if (!ignored) {
                                        addBatchScanError(fileNameForReport, pgNum, q.n + ' QR', 'Not Found', '');
                                        updateStatusSpan(statusPrefix + `第${pgNum}頁(${q.n} QR):未找到`, 'grey');
                                    } else {
                                        updateStatusSpan(statusPrefix + `第${pgNum}頁(${q.n} QR):未找到(忽略)`, 'grey');
                                    }
                                }
                            } catch (qErr) {
                                const msgLQ = (qErr?.message || '').toLowerCase();
                                const detsQ = qErr.message || String(qErr);
                                if (!ignored) {
                                    let eType = 'Scan Err', color='orange';
                                    if(msgLQ.includes("not found") || msgLQ.includes("unable to find") || msgLQ.includes("no qr code found") || msgLQ.includes("multiformat")){ eType='Not Found'; color='grey';}
                                    else if(msgLQ.includes("canvas")||msgLQ.includes("toblob")){ eType='Canvas Err';}
                                    addBatchScanError(fileNameForReport, pgNum, q.n + ' QR', eType, detsQ);
                                    updateStatusSpan(statusPrefix + `第${pgNum}頁(${q.n} QR):❗${eType}`, color);
                                } else {
                                    updateStatusSpan(statusPrefix + `第${pgNum}頁(${q.n} QR):錯誤(忽略)`, 'orange');
                                }
                            }
                        }
                        if (cQuad) { cQuad.width = 1; cQuad.height = 1; cQuad = null; ctxQ = null; }
                    }
                } catch (pageErr) {
                    addBatchScanError(fileNameForReport, pgNum, 'Page QR', 'Processing Error', pageErr.message || String(pageErr));
                } finally {
                    if (page) page.cleanup();
                    if (cFull) { cFull.width = 1; cFull.height = 1; cFull = null; }
                    if (cQuad) { cQuad.width = 1; cQuad.height = 1; cQuad = null; }
                }
            })(i));

            await Promise.all(ps);

            const finalState = await getFeatureStatesFromContent();
            if (!finalState.masterEnabled || !finalState.featureFileScanEnabled) {
                updateStatusSpan(statusPrefix + "PDF QR掃描已取消(功能停用)", "orange");
                addBatchScanError(fileNameForReport, null, 'QR Scan End', 'Cancelled', '功能已於掃描結束前停用');
                return;
            }

            if (codesFoundByQRThisFunc.length > 0) {
                updateStatusSpan(statusPrefix + `QR掃描找到 ${codesFoundByQRThisFunc.length} 個新條碼，輸入中...`, 'blue');
                for (let i = 0; i < codesFoundByQRThisFunc.length; i++) {
                    const code = codesFoundByQRThisFunc[i];
                    const simState = await getFeatureStatesFromContent();
                    if (!simState.masterEnabled || !simState.featureFileScanEnabled) {
                        addBatchScanError(fileNameForReport, null, 'Simulate QR', 'Cancelled', '功能已停用');
                        updateStatusSpan(statusPrefix + "QR輸入輸入已取消(功能停用)", "orange");
                        break;
                    }
                    try {
                        await simulateBarcodeInput(code, fileNameForReport);
                        totalSimulatedInBatch++;
                        updateStatusSpan(statusPrefix + `已輸入QR條碼 ${code.substring(0,6)}... (${i+1}/${codesFoundByQRThisFunc.length})`, 'grey');
                        await new Promise(r => setTimeout(r, 500));
                    } catch (simError) {
                        updateStatusSpan(statusPrefix + `輸入QR條碼 ${code.substring(0,6)}... 失敗`, 'red');
                    }
                }
                const postSimState = await getFeatureStatesFromContent();
                if (postSimState.masterEnabled && postSimState.featureFileScanEnabled) {
                    updateStatusSpan(statusPrefix + `${codesFoundByQRThisFunc.length} 個新QR條碼處理完成。` + (dupeCnt > 0 ? ` (${dupeCnt} 個重複)`:''), 'green');
                }
            } else if (dupeCnt > 0 && codesFoundByQRThisFunc.length === 0) {
                updateStatusSpan(statusPrefix + `QR掃描找到 ${dupeCnt} 個重複條碼，無新增。`, 'grey');
            } else if (codesFoundByQRThisFunc.length === 0 && dupeCnt === 0) {
                updateStatusSpan(statusPrefix + `QR掃描未找到條碼。`, 'grey');
            }
        }


        async function processPDF(file, statusPrefix, fileNameForReport) {
            return new Promise(async (resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        let currentRuntimeFeatureStates = await getFeatureStatesFromContent();
                        if(!currentRuntimeFeatureStates.masterEnabled||!currentRuntimeFeatureStates.featureFileScanEnabled){
                            addBatchScanError(fileNameForReport,null,'PDF','Cancelled','功能已停用'); resolve(); return;
                        }
                        updateStatusSpan(statusPrefix + '讀取PDF..', 'grey');
                        const pdfDoc = await pdfjsLib.getDocument({ data: e.target.result }).promise;
                        const processedCodesThisFile = new Set();

                        updateStatusSpan(statusPrefix + '掃描PDF文字..', 'grey');
                        const foundTextCodes = new Set();
                        for (let i = 1; i <= pdfDoc.numPages; i++) {
                            currentRuntimeFeatureStates = await getFeatureStatesFromContent();
                            if(!currentRuntimeFeatureStates.masterEnabled||!currentRuntimeFeatureStates.featureFileScanEnabled){
                                 addBatchScanError(fileNameForReport,i,'Text Scan','Cancelled','功能已停用'); break;
                            }
                            const page = await pdfDoc.getPage(i);
                            const textContent = await page.getTextContent();
                            textContent.items.forEach(item => {
                                const twBarcodeRegex = /TW[A-Z0-9]{13}/g;
                                let match;
                                while ((match = twBarcodeRegex.exec(item.str)) !== null) {
                                    if (!processedCodesThisFile.has(match[0])) {
                                        foundTextCodes.add(match[0]);
                                        processedCodesThisFile.add(match[0]);
                                    }
                                }
                            });
                            page.cleanup();
                        }

                        if (foundTextCodes.size > 0) {
                            updateStatusSpan(statusPrefix + `PDF文字中找到 ${foundTextCodes.size} 個條碼，輸入中...`, 'blue');
                            let simulatedCount = 0;
                            for (const code of foundTextCodes) {
                                 currentRuntimeFeatureStates = await getFeatureStatesFromContent();
                                 if (!currentRuntimeFeatureStates.masterEnabled || !currentRuntimeFeatureStates.featureFileScanEnabled) {
                                    addBatchScanError(fileNameForReport, null, 'Simulate Text', 'Cancelled', '功能已停用');
                                    updateStatusSpan(statusPrefix + "文字條碼輸入已取消", "orange");
                                    break;
                                 }
                                try {
                                    await simulateBarcodeInput(code, fileNameForReport);
                                    totalSimulatedInBatch++;
                                    simulatedCount++;
                                    updateStatusSpan(statusPrefix + `已輸入文字條碼 ${code.substring(0,6)}... (${simulatedCount}/${foundTextCodes.size})`, 'grey');
                                    await new Promise(r => setTimeout(r, 500));
                                } catch (simError) {
                                    updateStatusSpan(statusPrefix + `輸入文字條碼 ${code.substring(0,6)}... 失敗`, 'red');
                                }
                            }
                            currentRuntimeFeatureStates = await getFeatureStatesFromContent();
                            if (currentRuntimeFeatureStates.masterEnabled && currentRuntimeFeatureStates.featureFileScanEnabled) {
                                updateStatusSpan(statusPrefix + `PDF文字條碼處理完成 (${foundTextCodes.size}個).`, 'green', true);
                            }
                        }

                        if (foundTextCodes.size === 0) {
                            updateStatusSpan(statusPrefix + `PDF文字中未找到條碼，嘗試掃描QR碼..`, 'grey');
                            await processBarcodesAndQRCodes(pdfDoc, processedCodesThisFile, statusPrefix, fileNameForReport);
                        }


                        if (processedCodesThisFile.size === 0 && !batchScanErrors.some(err => err.fileName === fileNameForReport && (err.scanType?.includes('QR') || err.scanType?.includes('Text')) ) ) {
                            addBatchScanError(fileNameForReport, null, 'PDF Total', 'No Codes Found', '未在PDF中找到任何條碼 (文字或QR)');
                            updateStatusSpan(statusPrefix + '整個PDF未找到條碼.', 'orange', true);
                        }
                        resolve();
                    } catch (err) {
                        if (!err.message?.includes("cancel")) addBatchScanError(fileNameForReport, null, 'PDF', 'Proc Err', err.message);
                        updateStatusSpan(statusPrefix + `PDF處理錯誤: ${err.message || '未知'}`, 'red', true);
                        reject(err);
                    }
                };
                reader.onerror = err => {
                    addBatchScanError(fileNameForReport, null, 'Read', 'Reader Err', err.message);
                    updateStatusSpan(statusPrefix + `PDF讀取錯誤: ${err.message || '未知'}`, 'red', true);
                    reject(err);
                };
                reader.readAsArrayBuffer(file);
            });
        }

        async function processHTML(file, statusPrefix, fileNameForReport) {
            return new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = async (e) => {
                    try{
                        let currentRuntimeFeatureStates = await getFeatureStatesFromContent();
                        if(!currentRuntimeFeatureStates.masterEnabled||!currentRuntimeFeatureStates.featureFileScanEnabled){
                            addBatchScanError(fileNameForReport,null,'HTML','Cancelled','功能已停用'); resolve(); return;
                        }
                        const html=e.target.result;
                        updateStatusSpan(statusPrefix+'解析HTML..','grey');
                        const parser=new DOMParser();const doc=parser.parseFromString(html,"text/html");
                        const body=doc.body?.textContent?.trim()||'';
                        const titles=Array.from(doc.querySelectorAll('[title]')).map(el=>el.getAttribute('title')?.trim()||'').filter(Boolean);
                        const titleTxt=titles.join('\n');
                        const combinedTextContent=`${body}\n${titleTxt}`;

                        updateStatusSpan(statusPrefix+'HTML解析完成, 輸入條碼 (如果找到)..','grey');
                        const twBarcodeRegex = /TW[A-Z0-9]{13}/g;
                        let match; const foundCodes = new Set();
                        while ((match = twBarcodeRegex.exec(combinedTextContent)) !== null) {
                            foundCodes.add(match[0]);
                        }

                        if (foundCodes.size > 0) {
                            updateStatusSpan(statusPrefix + `HTML中找到 ${foundCodes.size} 個條碼，輸入中...`, 'blue');
                            let simulatedCount = 0;
                            for (const code of foundCodes) {
                                 currentRuntimeFeatureStates = await getFeatureStatesFromContent();
                                 if (!currentRuntimeFeatureStates.masterEnabled || !currentRuntimeFeatureStates.featureFileScanEnabled) {
                                    addBatchScanError(fileNameForReport, null, 'HTML Sim', 'Cancelled', '功能已停用');
                                    updateStatusSpan(statusPrefix + "HTML輸入已取消", "orange");
                                    break;
                                 }
                                try {
                                    await simulateBarcodeInput(code, fileNameForReport);
                                    totalSimulatedInBatch++; simulatedCount++;
                                    updateStatusSpan(statusPrefix + `已輸入HTML條碼 ${code.substring(0,6)}... (${simulatedCount}/${foundCodes.size})`, 'grey');
                                    await new Promise(r => setTimeout(r, 500));
                                } catch (simError) {
                                    updateStatusSpan(statusPrefix + `HTML輸入 ${code.substring(0,6)}... 失敗`, 'red');
                                }
                            }
                            currentRuntimeFeatureStates = await getFeatureStatesFromContent();
                            if (currentRuntimeFeatureStates.masterEnabled && currentRuntimeFeatureStates.featureFileScanEnabled) {
                                updateStatusSpan(statusPrefix + `HTML條碼處理完成 (${foundCodes.size}個).`, 'green', true);
                            }
                        } else {
                            addBatchScanError(fileNameForReport, null, 'HTML', 'No Codes Found', '未在HTML中找到條碼');
                            updateStatusSpan(statusPrefix + 'HTML中未找到條碼.', 'grey');
                        }
                        resolve();
                    } catch(err){
                        addBatchScanError(fileNameForReport, null, 'HTML', 'Proc Err', err.message);
                        updateStatusSpan(statusPrefix + `HTML處理錯誤: ${err.message || '未知'}`, 'red', true);
                        reject(err);
                    }
                };
                r.onerror = err => {
                    addBatchScanError(fileNameForReport, null, 'Read', 'Reader Err', err.message);
                    updateStatusSpan(statusPrefix + `HTML讀取錯誤: ${err.message || '未知'}`, 'red', true);
                    reject(err);
                };
                r.readAsText(file);
            });
        }

        async function processImageFile(file, statusPrefix, fileNameForReport) {
            let currentRuntimeFeatureStates = await getFeatureStatesFromContent();
            if (!currentRuntimeFeatureStates.masterEnabled || !currentRuntimeFeatureStates.featureFileScanEnabled) {
                addBatchScanError(fileNameForReport, null, 'Image', 'Cancelled', '功能已停用');
                return;
            }
            updateStatusSpan(statusPrefix + '掃描圖像QR..', 'grey');

            const readerEl = document.getElementById(`${SCRIPT_PREFIX}_html5qrReaderDiv`);
            if (typeof Html5Qrcode === 'undefined' || !readerEl) {
                addBatchScanError(fileNameForReport, null, 'Image Scan', 'Setup Err', 'QR掃描器未就緒');
                updateStatusSpan(statusPrefix + "QR掃描器未就緒", "orange");
                return;
            }

            let qr;
            try {
                qr = new Html5Qrcode(readerEl.id);
            } catch (qrInitErr) {
                addBatchScanError(fileNameForReport, null, 'Image QR Init', 'Init Fail', qrInitErr.message || String(qrInitErr));
                updateStatusSpan(statusPrefix + "QR掃描器初始化失敗", "red");
                return;
            }

            const codesFoundThisImage = new Set();
            let imageFullyScanned = false;

            const image = new Image();
            const reader = new FileReader();

            reader.onload = async (e) => {
                image.onload = async () => {
                    const mainCanvas = document.createElement('canvas');
                    mainCanvas.width = image.width;
                    mainCanvas.height = image.height;
                    const mainCtx = mainCanvas.getContext('2d');
                    mainCtx.drawImage(image, 0, 0);

                    let fullScanSuccess = false;
                    updateStatusSpan(statusPrefix + `掃描圖像 (整頁 QR)...`, 'grey');
                    try {
                        const blob = await new Promise(res => mainCanvas.toBlob(res, 'image/png'));
                        const imageFileForScanner = new File([blob], fileNameForReport, { type: 'image/png' });
                        const result = await qr.scanFile(imageFileForScanner, false);
                        const txt = result?.decodedText?.trim() || (typeof result === 'string' ? result.trim() : null);

                        if (txt && /^TW[A-Z0-9]{13}$/.test(txt)) {
                            if (!codesFoundThisImage.has(txt)) {
                                await simulateBarcodeInput(txt, fileNameForReport);
                                totalSimulatedInBatch++;
                                codesFoundThisImage.add(txt);
                                updateStatusSpan(statusPrefix + `圖像QR掃描成功 (整頁): ${txt.substring(0, 6)}...`, 'green');
                            }
                            fullScanSuccess = true;
                        } else if (txt) {
                            addBatchScanError(fileNameForReport, null, '圖像整頁 QR', 'Invalid Format', `'${txt.substring(0, 10)}...'`);
                            updateStatusSpan(statusPrefix + `圖像QR無效 (整頁): ${txt.substring(0, 10)}...`, 'orange');
                        } else {
                            addBatchScanError(fileNameForReport, null, '圖像整頁 QR', 'Not Found', '整頁掃描未找到');
                            updateStatusSpan(statusPrefix + '圖像QR未找到 (整頁).', 'grey');
                        }
                    } catch (err) {
                        const msgL = (err?.message || '').toLowerCase();
                        let eType = 'Scan Err';
                        if (msgL.includes("not found") || msgL.includes("unable to find") || msgL.includes("no qr code found") || msgL.includes("multiformat")) {
                            eType = 'Not Found';
                        }
                        addBatchScanError(fileNameForReport, null, '圖像整頁 QR', eType, err.message || String(err));
                        updateStatusSpan(statusPrefix + `圖像QR掃描失敗 (整頁): ${eType}`, 'orange');
                    }


                    updateStatusSpan(statusPrefix + `準備掃描圖像象限...`, 'grey');
                    const w = mainCanvas.width;
                    const h = mainCanvas.height;
                    const quads = [
                        { n: '左上', x: 0, y: 0, w: w / 2, h: h / 2 },
                        { n: '右上', x: w / 2, y: 0, w: w / 2, h: h / 2 },
                        { n: '左下', x: 0, y: h / 2, w: w / 2, h: h / 2 },
                        { n: '右下', x: w / 2, y: h / 2, w: w / 2, h: h / 2 }
                    ];
                    const quadCanvas = document.createElement('canvas');
                    const quadCtx = quadCanvas.getContext('2d', { willReadFrequently: true });

                    for (const q of quads) {
                        currentRuntimeFeatureStates = await getFeatureStatesFromContent();
                        if (!currentRuntimeFeatureStates.masterEnabled || !currentRuntimeFeatureStates.featureFileScanEnabled) {
                            addBatchScanError(fileNameForReport, null, `圖像 ${q.n} QR`, 'Cancelled', '功能已停用');
                            break;
                        }
                        updateStatusSpan(statusPrefix + `掃描圖像 (${q.n} QR)...`, 'grey');
                        const sx = Math.floor(q.x), sy = Math.floor(q.y);
                        const sw = Math.max(1, Math.ceil(q.w)), sh = Math.max(1, Math.ceil(q.h));
                        if (sw <= 0 || sh <= 0 || sx >= w || sy >= h) {
                            addBatchScanError(fileNameForReport, null, `圖像 ${q.n} QR`, 'Scan Err', 'Invalid Geo');
                            continue;
                        }
                        quadCanvas.width = sw; quadCanvas.height = sh;
                        quadCtx.drawImage(mainCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

                        try {
                            const blobQ = await new Promise(res => quadCanvas.toBlob(res, 'image/png'));
                            const quadImageFile = new File([blobQ], `${fileNameForReport}_${q.n}.png`, { type: 'image/png' });
                            const resultQ = await qr.scanFile(quadImageFile, false);
                            const txtQ = resultQ?.decodedText?.trim() || (typeof resultQ === 'string' ? resultQ.trim() : null);

                            if (txtQ && /^TW[A-Z0-9]{13}$/.test(txtQ)) {
                                if (!codesFoundThisImage.has(txtQ)) {
                                    await simulateBarcodeInput(txtQ, fileNameForReport);
                                    totalSimulatedInBatch++;
                                    codesFoundThisImage.add(txtQ);
                                    updateStatusSpan(statusPrefix + `圖像QR掃描成功 (${q.n}): ${txtQ.substring(0, 6)}...`, 'green');
                                }
                            } else if (txtQ) {
                                addBatchScanError(fileNameForReport, null, `圖像 ${q.n} QR`, 'Invalid Format', `'${txtQ.substring(0, 10)}...'`);
                                updateStatusSpan(statusPrefix + `圖像QR無效 (${q.n}): ${txtQ.substring(0, 10)}...`, 'orange');
                            } else {
                                addBatchScanError(fileNameForReport, null, `圖像 ${q.n} QR`, 'Not Found', `${q.n} 掃描未找到`);
                            }
                        } catch (qErr) {
                            const msgLQ = (qErr?.message || '').toLowerCase();
                            let eTypeQ = 'Scan Err';
                            if (msgLQ.includes("not found") || msgLQ.includes("unable to find") || msgLQ.includes("no qr code found") || msgLQ.includes("multiformat")) {
                                eTypeQ = 'Not Found';
                            }
                            addBatchScanError(fileNameForReport, null, `圖像 ${q.n} QR`, eTypeQ, qErr.message || String(qErr));
                            updateStatusSpan(statusPrefix + `圖像QR掃描失敗 (${q.n}): ${eTypeQ}`, 'orange');
                        }
                    }

                    if (codesFoundThisImage.size === 0) {
                        if (!batchScanErrors.some(err => err.fileName === fileNameForReport && err.scanType?.includes('圖像'))) {
                            addBatchScanError(fileNameForReport, null, '圖像 QR', 'Not Found', '所有掃描嘗試均未找到QR碼');
                        }
                        updateStatusSpan(statusPrefix + '圖像QR掃描完成，未找到條碼.', 'grey');
                    } else {
                        updateStatusSpan(statusPrefix + `圖像QR掃描完成，找到 ${codesFoundThisImage.size} 個條碼.`, 'green');
                    }
                    imageFullyScanned = true;
                };
                image.onerror = () => {
                    addBatchScanError(fileNameForReport, null, 'Image Load', 'Load Error', '無法載入圖像文件');
                    updateStatusSpan(statusPrefix + '無法載入圖像文件', 'red');
                    imageFullyScanned = true;
                };
                image.src = e.target.result;
            };
            reader.onerror = () => {
                addBatchScanError(fileNameForReport, null, 'Image Read', 'Read Error', '無法讀取圖像文件');
                updateStatusSpan(statusPrefix + '無法讀取圖像文件', 'red');
            };
            reader.readAsDataURL(file);
        }


        async function removeFileScannerUI() {
            const fin = document.getElementById(`${SCRIPT_PREFIX}_customFileInput`);
            const span = document.getElementById(`${SCRIPT_PREFIX}_customStatusSpan`);
            const qrDiv = document.getElementById(`${SCRIPT_PREFIX}_html5qrReaderDiv`);
            if (fin) fin.remove();
            if (span) span.remove();
            if (qrDiv) qrDiv.remove();
            uiInitialized = false;
        }
        window.removeShopeeFileScannerUI = removeFileScannerUI;

        async function checkUrlAndMaybeInitialize() {
            const currentRuntimeFeatureStates = await getFeatureStatesFromContent();
            if (!currentRuntimeFeatureStates.masterEnabled || !currentRuntimeFeatureStates.featureFileScanEnabled) {
                if (uiInitialized) await removeFileScannerUI();
                return;
            }

            const targetUrlsForFileInput = [
                'https://sp.spx.shopee.tw/inbound-management/receive-task/detail/',
                'https://sp.spx.shopee.tw/inbound-management/receive-task/create'
            ];
            const currentHref = window.location.href;
            const onTargetUrl = targetUrlsForFileInput.some(url => currentHref.startsWith(url));

            if (onTargetUrl) {
                if (!uiInitialized || !document.getElementById(`${SCRIPT_PREFIX}_customFileInput`)) {
                    await initializeElements();
                }
            } else {
                if (uiInitialized) {
                    await removeFileScannerUI();
                }
            }
        }
        window.triggerShopeeFileScannerCheck = checkUrlAndMaybeInitialize;

        function handleUrlChangeForFileScan() {
            clearTimeout(navDebounceTimeout);
            navDebounceTimeout = setTimeout(async () => {
                if (window.location.href !== lastUrl) {
                    lastUrl = window.location.href;
                    await checkUrlAndMaybeInitialize();
                }
            }, 250);
        }

        const observer = new MutationObserver(handleUrlChangeForFileScan);
        observer.observe(document, { childList: true, subtree: true });
        window.addEventListener('popstate', handleUrlChangeForFileScan);

        await checkLibrariesAndInit();
    })();
    
    loadFeatureStates();

});