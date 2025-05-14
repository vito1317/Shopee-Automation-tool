let featureStates = {
    masterEnabled: true,
    featureFileScanEnabled: true,
    featureBoxScanEnabled: true,
    featureQueueingEnabled: true,
    featureQueueingAction: true,
    featureNextDayEnabled: true,
    featureNextDayAutoStartEnabled: true,
    featureCheckoutEnabled: true,
    featureCheckoutAction: true,
};

function loadFeatureStates() {
    const keysToGet = Object.keys(featureStates);
    chrome.storage.sync.get(keysToGet, (data) => {
        if (chrome.runtime.lastError) {
            console.error("蝦皮自動化: Error loading feature states:", chrome.runtime.lastError);
            return;
        }
        featureStates = { ...featureStates, ...data };
        console.log("蝦皮自動化: Feature states loaded:", featureStates);
        handleFeatureStateChange(true);
        console.log("蝦皮自動化: Performing initial URL check/state reset.");
        checkUrlAndResetStates(window.location.href, true);
    });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        let statesChanged = false;
        for (let key in changes) {
            if (featureStates.hasOwnProperty(key)) {
                featureStates[key] = typeof changes[key].newValue === 'boolean' ? changes[key].newValue : featureStates[key];
                statesChanged = true;
            }
        }
        if (statesChanged) {
            console.log("蝦皮自動化: Updated feature states:", featureStates);
            handleFeatureStateChange(false);
        }
    }
});

function handleFeatureStateChange(isInitialLoad = false) {
    if (featureStates.hasOwnProperty('featureFileScanEnabled')) {
         if (!featureStates.featureFileScanEnabled) { if (typeof window.removeShopeeFileScannerUI === 'function') { window.removeShopeeFileScannerUI(); } else if (!isInitialLoad) { } } else { if (typeof window.triggerShopeeFileScannerCheck === 'function') { window.triggerShopeeFileScannerCheck(); } else if (!isInitialLoad) {} }
    }
    if (featureStates.hasOwnProperty('featureNextDayEnabled')) { if (!featureStates.featureNextDayEnabled) { removeNextDayCheckbox(); } }
     if (featureStates.hasOwnProperty('featureNextDayAutoStartEnabled')) { const nextDayCheckbox = document.getElementById('status'); if (nextDayCheckbox && nextDayCheckbox.checked !== featureStates.featureNextDayAutoStartEnabled) { nextDayCheckbox.checked = featureStates.featureNextDayAutoStartEnabled; } }
}

let currentUrl = window.location.href;
let checkoutActionPerformed = false;

const CHECKOUT_TARGET_URL = 'https://sp.spx.shopee.tw/outbound-management/self-collection-outbound/';

function checkUrlAndResetStates(newUrl, isInitialLoad = false) {
    const isOnTargetUrl = newUrl.startsWith(CHECKOUT_TARGET_URL);
    const previousUrlWasTarget = currentUrl.startsWith(CHECKOUT_TARGET_URL);

    if (!isInitialLoad) {
        console.log(`蝦皮自動化: URL change detected. From: ${currentUrl} | To: ${newUrl}`);
        console.log(`蝦皮自動化: URL Check - Is new URL target? ${isOnTargetUrl}. Was previous URL target? ${previousUrlWasTarget}.`);
    } else {
         console.log(`蝦皮自動化: Initial Load Check - Current URL: ${newUrl}. Is target? ${isOnTargetUrl}.`);
    }


    let needsReset = false;
    if (isInitialLoad) {
        if (!isOnTargetUrl) {
            needsReset = true;
        } else {
        }
    } else {
        if (previousUrlWasTarget && !isOnTargetUrl) {
             needsReset = true;
              console.log(`蝦皮自動化: Flag Reset Logic (Nav Away) - Moved from target to non-target, reset needed.`);
        }
        else if (!previousUrlWasTarget && isOnTargetUrl) {
             needsReset = true;
             console.log(`蝦皮自動化: Flag Reset Logic (Nav To) - Moved from non-target to target, reset needed.`);
        }
        else if (isOnTargetUrl && newUrl === currentUrl && previousUrlWasTarget) {
             needsReset = true;
             console.log(`蝦皮自動化: Flag Reset Logic (Refresh) - Refreshed target page, reset needed.`);
        }
         else {
        }
    }

    if (needsReset && checkoutActionPerformed) {
        console.warn("蝦皮自動化: *** Resetting checkoutActionPerformed flag to FALSE. ***");
        checkoutActionPerformed = false;
    } else if (needsReset && !checkoutActionPerformed) {
         console.log("蝦皮自動化: Flag reset condition met, but flag was already false.");
    } else if (!needsReset && checkoutActionPerformed) {
         console.log("蝦皮自動化: Flag reset condition NOT met, keeping flag TRUE.");
    } else {
    }


    urlChangedFunction_BoxScan(newUrl);

    currentUrl = newUrl;
}

const masterUrlCheckInterval = setInterval(() => {
    const newUrl = window.location.href;
    if (newUrl !== currentUrl) {
        checkUrlAndResetStates(newUrl);
    }
    autoCheckout();

}, 750);

loadFeatureStates();


let currentUrl_BoxScan = window.location.href;

const intervalId_BoxScan = setInterval(function() {
    const newUrl = window.location.href;
    if (newUrl !== currentUrl_BoxScan) {
        currentUrl_BoxScan = newUrl;
        urlChangedFunction_BoxScan();
    }
}, 500);

function urlChangedFunction_BoxScan() {
    if (!featureStates.masterEnabled || !featureStates.featureBoxScanEnabled) {
        console.log("蝦皮自動化: 自動刷取物流箱單 disabled.");
        return;
    }

    if (currentUrl_BoxScan == 'https://sp.spx.shopee.tw/outbound-management/pack-drop-off-to/scan-to') {
        console.log("蝦皮自動化: Checking for Box Scan input on:", currentUrl_BoxScan);
        setTimeout(() => {
            const divElement = document.querySelectorAll('.ssc-input-shape-default');
            if (divElement.length >= 2) {
                const secounddivElement = divElement[1];
                const inputElement = secounddivElement.querySelector('input');
                const check = document.querySelector('.btn-distance')
                if (inputElement) {
                    if (!inputElement.dataset.boxScanListenerAdded) {
                         inputElement.addEventListener('focus', function handleBoxScanFocus() {
                            if (!featureStates.masterEnabled || !featureStates.featureBoxScanEnabled) return;
                            console.log("蝦皮自動化: Autofilling Box Scan input.");
                            this.value = 'BOX999999999';
                            const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
                            this.dispatchEvent(enterEvent);
                            check.click();
                         });
                         inputElement.dataset.boxScanListenerAdded = "true";
                         console.log("蝦皮自動化: Box Scan focus listener added.");
                     }
                } else {
                     console.log("蝦皮自動化: Box Scan input element not found yet.");
                }
            } else {
                console.log("蝦皮自動化: Box Scan container elements not found yet.");
            }
        }, 500);
    }
}

urlChangedFunction_BoxScan();
setInterval(()=>{urlChangedFunction_BoxScan()},1000);


function autoCallNumber() {
    if (!featureStates.masterEnabled || !featureStates.featureQueueingEnabled) {
        return;
    }
    const currentUrl = window.location.href;
    if (currentUrl === 'https://sp.spx.shopee.tw/queueing-management/queueing-task') {
        const button = document.querySelector('.ssc-btn-type-text');
        if (button) {
            if (featureStates.featureQueueingAction === true) {
                button.click();
                console.warn('蝦皮自動化: 自動叫號 - 成功點擊 (Clicked)');
            } else {
                button.focus();
                console.warn('蝦皮自動化: 自動叫號 - 成功聚焦 (Focused)');
            }
        }
    }
}
setInterval(autoCallNumber, 1500);


let nextDayIntervalId = null;
let nextDayCheckInterval = null;

function startNextDayFeature() {
    if (nextDayIntervalId) return;

    nextDayIntervalId = setInterval(function() {
        if (!featureStates.masterEnabled || !featureStates.featureNextDayEnabled) {
            console.log("蝦皮自動化: 自動完成隔日 disabled. Stopping checks.");
            stopNextDayFeature();
            removeNextDayCheckbox();
            return;
        }

        const targetUrl = 'https://sp.spx.shopee.tw/outbound-management/pack-to/detail/';
        const currentUrl = window.location.href;

        if (currentUrl.includes(targetUrl)) {
            runCodeIfUrlContains(targetUrl, function() {
                 if (!featureStates.masterEnabled || !featureStates.featureNextDayEnabled) return;
                checkAndClickNextDay();
                addOrUpdateNextDayCheckbox();
            });
        } else {
            removeNextDayCheckbox();
            if (nextDayCheckInterval) {
                clearInterval(nextDayCheckInterval);
                nextDayCheckInterval = null;
            }
        }
    }, 1000);
     console.log("蝦皮自動化: 自動完成隔日 feature started checking URL.");
}

function stopNextDayFeature() {
    if (nextDayIntervalId) {
        clearInterval(nextDayIntervalId);
        nextDayIntervalId = null;
        console.log("蝦皮自動化: 自動完成隔日 feature stopped checking URL.");
    }
    if (nextDayCheckInterval) {
         clearInterval(nextDayCheckInterval);
         nextDayCheckInterval = null;
         console.log("蝦皮自動化: 自動完成隔日 sub-process check stopped.");
    }
}


function runCodeIfUrlContains(specificString, callback) {
    const currentUrl = window.location.href;
    if (currentUrl.includes(specificString)) {
        callback();
    }
}


function checkAndClickNextDay() {
    if (!featureStates.masterEnabled || !featureStates.featureNextDayEnabled) return;

    const divElements = document.querySelectorAll('.ssc-input-shape-default');
    if (divElements.length >= 3) {
        const secoundDivElement = divElements[2];
        const inputElement = secoundDivElement.querySelector('input');

        if (inputElement && !inputElement.dataset.nextDayListenerAdded) {
             console.log("蝦皮自動化: Adding Next Day input focus listener.");
            inputElement.addEventListener('focus', function() {
                 if (!featureStates.masterEnabled || !featureStates.featureNextDayEnabled) return;
                 console.log("蝦皮自動化: Next Day input focused, autofilling.");
                this.value = 'BOX999999999';
                const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
                this.dispatchEvent(enterEvent);
                console.warn('蝦皮自動化: 已自動完成 (via input focus & Enter)');

                if (featureStates.featureNextDayAutoStartEnabled) {
                    console.log("蝦皮自動化: Sub-option ENABLED in state, executing next step.");
                    executeAfterTwoSscMessages();
                } else {
                     console.log("蝦皮自動化: Sub-option DISABLED in state.");
                }
            });
            inputElement.dataset.nextDayListenerAdded = "true";
        }

        const buttons = document.querySelectorAll('.ssc-button.ssc-btn-type-primary:not(.ssc-btn-plain)');
        buttons.forEach(button => {
             if (!button.dataset.nextDayBtnListenerAdded) {
                 console.log("蝦皮自動化: Adding Next Day button click listener.");
                 button.addEventListener('click', function() {
                     if (!featureStates.masterEnabled || !featureStates.featureNextDayEnabled) return;
                     console.log("蝦皮自動化: Next Day primary button clicked.");
                     console.warn('蝦皮自動化: 主要按鈕已點擊 (原 .btn-distance 邏輯可能需調整)');

                    if (featureStates.featureNextDayAutoStartEnabled) {
                         console.log("蝦皮自動化: Sub-option ENABLED in state, executing next step after button click.");
                        executeAfterTwoSscMessages();
                    } else {
                        console.log("蝦皮自動化: Sub-option DISABLED in state after button click.");
                    }
                 });
                 button.dataset.nextDayBtnListenerAdded = "true";
             }
        });
    }
}

function executeAfterTwoSscMessages() {
    if (!featureStates.masterEnabled || !featureStates.featureNextDayEnabled || !featureStates.featureNextDayAutoStartEnabled) {
        console.log("蝦皮自動化: executeAfterTwoSscMessages disabled by toggles.");
        if(nextDayCheckInterval) clearInterval(nextDayCheckInterval);
        nextDayCheckInterval = null;
        return;
    }

     console.log("蝦皮自動化: [Auto Start Next] Waiting for 2 success messages...");
    if (nextDayCheckInterval) clearInterval(nextDayCheckInterval);

    let checks = 0;
    const maxChecksAutoStart = 50;

    nextDayCheckInterval = setInterval(() => {
        checks++;
         if (!featureStates.masterEnabled || !featureStates.featureNextDayEnabled || !featureStates.featureNextDayAutoStartEnabled || checks > maxChecksAutoStart) {
            clearInterval(nextDayCheckInterval);
            nextDayCheckInterval = null;
            if (checks > maxChecksAutoStart) {
                console.warn("蝦皮自動化: [Auto Start Next] Timed out waiting for success messages or buttons.");
            } else {
                console.log("蝦皮自動化: [Auto Start Next] Aborted by toggle change.");
            }
            return;
        }

        const ssc_messages = document.querySelectorAll('.ssc-message')
        console.log(`蝦皮自動化: [Auto Start Next] Check ${checks}: Found ${ssc_messages.length} success messages.`);

        if (ssc_messages.length >= 2) {
            clearInterval(nextDayCheckInterval);
            nextDayCheckInterval = null;
            console.log("蝦皮自動化: [Auto Start Next] Found 2+ success messages. Attempting to click next...");

            const nowSelector = '.submenu-item.ssc-menu-item.ssc-menu-item-active.ssc-menu-item-selected';
            const now = document.querySelector(nowSelector);
            if (now) {
                 console.log("蝦皮自動化: [Auto Start Next] Found active menu item, clicking it.", now);
                now.click();
            } else {
                 console.warn("蝦皮自動化: [Auto Start Next] Active menu item not found with selector:", nowSelector);
            }

            setTimeout(() => {
                 if (!featureStates.masterEnabled || !featureStates.featureNextDayEnabled || !featureStates.featureNextDayAutoStartEnabled) return;

                 const startSelector = '.ssc-pro-table-tool-btn-wrap > button.ssc-btn-type-primary';
                 const start = document.querySelector(startSelector);
                 if (start) {
                     console.log("蝦皮自動化: [Auto Start Next] Found start button, clicking it.", start);
                     start.click();
                 } else {
                      console.warn("蝦皮自動化: [Auto Start Next] Start button not found with selector:", startSelector);
                      const fallbackStart = document.querySelector('.ssc-pro-table-toolbar .ssc-btn-primary');
                      if (fallbackStart) {
                           console.log("蝦皮自動化: [Auto Start Next] Found fallback start button, clicking it.", fallbackStart);
                           fallbackStart.click();
                      } else {
                           console.warn("蝦皮自動化: [Auto Start Next] Fallback start button also not found.");
                      }
                 }
            }, 700);
        }
    }, 200);
}


function addOrUpdateNextDayCheckbox() {
    if (!featureStates.masterEnabled || !featureStates.featureNextDayEnabled) {
        removeNextDayCheckbox();
        return;
    }

    const sscDiv = document.querySelector('.ssc-breadcrumb');
    if (!sscDiv) {
        return;
    }

    let groupLabel = document.getElementById('group_nextday_auto_start');

    if (!groupLabel) {
        console.log("蝦皮自動化: Creating Next Day sub-option checkbox.");
        groupLabel = document.createElement('label');
        groupLabel.id = 'group_nextday_auto_start';
        groupLabel.style.marginLeft = '20px';
        groupLabel.style.display = 'inline-flex';
        groupLabel.style.alignItems = 'center';
        groupLabel.style.cursor = 'pointer';
        groupLabel.style.verticalAlign = 'middle';


        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'status';
        checkbox.checked = featureStates.featureNextDayAutoStartEnabled;
        checkbox.style.marginRight = '5px';
        checkbox.style.verticalAlign = 'middle';

        checkbox.addEventListener('change', function() {
            const newState = this.checked;
            featureStates.featureNextDayAutoStartEnabled = newState;
            chrome.storage.sync.set({ featureNextDayAutoStartEnabled: newState }, () => {
                 if (chrome.runtime.lastError) {
                    console.error("蝦皮自動化: Error saving sub-option state:", chrome.runtime.lastError);
                 } else {
                     console.log("蝦皮自動化: 自動開始下一筆 state saved:", newState);
                 }
            });
        });

        const span = document.createElement('span');
        span.id = 'text_nextday_auto_start';
        span.textContent = '自動開始下一筆';
        span.style.fontSize = '13px';
        span.style.verticalAlign = 'middle';

        groupLabel.appendChild(checkbox);
        groupLabel.appendChild(span);
        sscDiv.appendChild(groupLabel);

    } else {
         const existingCheckbox = groupLabel.querySelector('#status');
         if (existingCheckbox && existingCheckbox.checked !== featureStates.featureNextDayAutoStartEnabled) {
              console.log("蝦皮自動化: Updating existing checkbox state to match storage.");
             existingCheckbox.checked = featureStates.featureNextDayAutoStartEnabled;
         }
    }
}

function removeNextDayCheckbox() {
    const groupEl = document.getElementById('group_nextday_auto_start');
    if (groupEl) {
        groupEl.remove();
        console.log("蝦皮自動化: Removed Next Day sub-option checkbox.");
    }
    if (nextDayCheckInterval) {
        clearInterval(nextDayCheckInterval);
        nextDayCheckInterval = null;
    }
}

startNextDayFeature();
setInterval(()=>{startNextDayFeature()},1000);

function autoCheckout() {
    console.log("蝦皮自動化: --- autoCheckout() called ---");

    if (!featureStates.masterEnabled || !featureStates.featureCheckoutEnabled) {
         console.log("蝦皮自動化: Checkout - Disabled by toggle.");
        return;
    }
     console.log("蝦皮自動化: Checkout - Feature enabled.");

    const isOnCheckoutUrl = window.location.href.startsWith(CHECKOUT_TARGET_URL);
    if (!isOnCheckoutUrl) {
        console.log(`蝦皮自動化: Checkout - Not on target URL. Current: ${window.location.href} | Target: ${CHECKOUT_TARGET_URL}`);
        return;
    }
     console.log(`蝦皮自動化: Checkout - On target URL: ${window.location.href}`);

    if (checkoutActionPerformed) {
        console.log("蝦皮自動化: Checkout - Action already performed (lock is TRUE). Skipping.");
        return;
    }
     console.log("蝦皮自動化: Checkout - Action not yet performed (lock is FALSE). Proceeding...");

    const operationButton = document.querySelector('.task-operation');
    const rowCount = document.querySelectorAll('.ssc-table-row-normal').length;
    const buttonCount = document.querySelectorAll('.ssc-btn-type-text').length;
    const tableCount = document.querySelectorAll('.ssc-table-header-column-container').length;

    console.log(`蝦皮自動化: Checkout - Element Check: Operation Button found? ${!!operationButton}`);
    console.log(`蝦皮自動化: Checkout - Condition Check: Rows=${rowCount}, Buttons=${buttonCount}, Headers=${tableCount}`);



    const conditionsMet = rowCount > 0 && rowCount === buttonCount && operationButton && buttonCount * 2 === tableCount;

    if (conditionsMet) {

        const actionType = featureStates.featureCheckoutAction ? 'CLICK' : 'FOCUS';

        try {
            if (featureStates.featureCheckoutAction === true) {
                operationButton.click();
            } else {
                operationButton.focus();
            }

            console.warn('蝦皮自動化: Checkout - *** Action performed successfully, setting action lock to TRUE. ***');
            checkoutActionPerformed = true;

        } catch (error) {
             console.error('蝦皮自動化: Checkout - Error during action execution:', error);
        }

    } else {
        console.log('蝦皮自動化: Checkout - Conditions NOT met yet.');
    }
};





(async function() {
    'use strict';

    if (window.shopeeTwExtractorInitialized_FileScan) {
        console.log("蝦皮自動化: FileScan script already initialized.");
        return;
    }
    window.shopeeTwExtractorInitialized_FileScan = true;
    console.log("蝦皮自動化: FileScan Script Initializing (v3.0.5 - Updated UI loading URLs)...");

    const SCRIPT_PREFIX = "ShopeeTWExtractor";

    let uiInitialized = false, fileQueue = [], isProcessing = false, currentFileIndex = 0, totalFilesInBatch = 0, batchScanErrors = [], librariesLoaded = false, checkCounter = 0;
    let totalSimulatedInBatch = 0; 
    const maxChecks = 40, checkIntervalMs = 500; let librariesCheckInterval = null, lastUrl = location.href, navDebounceTimeout = null;
    let initPollingInterval = null;

    const STORAGE_KEYS = { master: 'masterEnabled', fileScan: 'featureFileScanEnabled' };
    const STORAGE_DEFAULTS = { [STORAGE_KEYS.master]: true, [STORAGE_KEYS.fileScan]: true };
    const ALL_FEATURE_STORAGE_KEYS_FOR_LISTENER = [
         'masterEnabled', 'featureQueueingEnabled', 'featureCheckoutEnabled',
         'featureBoxScanEnabled', 'featureNextDayEnabled', 'featureNextDayAutoStartEnabled',
         'featureFileScanEnabled'
    ];

    async function getFeatureStates() {
        return new Promise((resolve) => {
            const keysToGet = {
                [STORAGE_KEYS.master]: STORAGE_DEFAULTS[STORAGE_KEYS.master],
                [STORAGE_KEYS.fileScan]: STORAGE_DEFAULTS[STORAGE_KEYS.fileScan],
            };
            chrome.storage.sync.get(keysToGet, (data) => {
                const lastError = chrome.runtime.lastError;
                if (lastError) {
                     console.error(`${SCRIPT_PREFIX}: Error reading states:`, lastError.message || lastError);
                     resolve({
                         masterEnabled: STORAGE_DEFAULTS[STORAGE_KEYS.master],
                         featureFileScanEnabled: STORAGE_DEFAULTS[STORAGE_KEYS.fileScan]
                     });
                } else {
                    resolve({
                        masterEnabled: data[STORAGE_KEYS.master],
                        featureFileScanEnabled: data[STORAGE_KEYS.fileScan]
                    });
                }
            });
        });
    }

    if (typeof pdfjsLib !== 'undefined') {
        console.log(`${SCRIPT_PREFIX}: pdf.js v${pdfjsLib.version} found.`);
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
             console.warn(`${SCRIPT_PREFIX}: pdf.js workerSrc not set, trying manual.`);
             try { const url = chrome.runtime.getURL('libs/pdf.worker.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc = url; console.log(`${SCRIPT_PREFIX}: Set pdf.js workerSrc.`); }
             catch (e) { console.error(`${SCRIPT_PREFIX}: Failed get worker URL.`, e); }
        }
    } else { console.error(`${SCRIPT_PREFIX}: pdfjsLib missing!`); }

    let html5QrLoadAttempted = false;
    const html5QrCodePath = chrome.runtime.getURL('libs/html5-qrcode.min.js');
    function loadHtml5QrCode() {
        if (typeof Html5Qrcode !== 'undefined'){ if(!librariesLoaded && librariesCheckInterval) checkLibrariesAndInit(); return; }
        if (html5QrLoadAttempted) return; html5QrLoadAttempted = true; console.log(`${SCRIPT_PREFIX}: Manual load html5-qrcode: ${html5QrCodePath}`);
        const s=document.createElement('script'); s.src=html5QrCodePath;
        s.onload=()=>{ console.log(`${SCRIPT_PREFIX}: Manual html5qr load OK.`); if(typeof Html5Qrcode==='undefined') console.error('Html5Qrcode undef after load!'); else if(!librariesLoaded&&librariesCheckInterval) checkLibrariesAndInit(); };
        s.onerror=e=>{ console.error(`${SCRIPT_PREFIX}: Manual html5qr fail!`, e); updateStatusSpan("錯誤:QR庫載入失敗",'red'); };
        (document.head||document.documentElement).appendChild(s);
    }

    async function checkLibrariesAndInit() {
        if (!html5QrLoadAttempted && typeof Html5Qrcode === 'undefined') loadHtml5QrCode();
        if (librariesCheckInterval) return;
        console.log(`${SCRIPT_PREFIX}: Start library check...`); checkCounter=0;
        librariesCheckInterval = setInterval(async () => {
            checkCounter++; const pdfOk=typeof pdfjsLib!=='undefined'&&pdfjsLib.GlobalWorkerOptions.workerSrc; const qrOk=typeof Html5Qrcode!=='undefined';
            const state = await getFeatureStates();
            const enabled = state.masterEnabled && state.featureFileScanEnabled;
            if (!enabled) { clearInterval(librariesCheckInterval); librariesCheckInterval=null; updateStatusSpan("", "grey"); await removeFileScannerUI(); return; }
            if (pdfOk && qrOk) { librariesLoaded=true; console.log(`${SCRIPT_PREFIX}: Libs OK.`); clearInterval(librariesCheckInterval); librariesCheckInterval=null; await checkUrlAndMaybeInitialize(); return; }
            if (checkCounter>=maxChecks) { clearInterval(librariesCheckInterval); librariesCheckInterval=null; librariesLoaded=false; let err="庫載入超時."; const miss=[]; if(!pdfOk)miss.push('pdf'); if(!qrOk)miss.push('html5qr'); if(miss.length>0)err+=` (${miss.join(',')})`; console.error(`${SCRIPT_PREFIX}: ${err}`); updateStatusSpan(`錯誤:${err}`, 'red'); await removeFileScannerUI(); return; }
            if(enabled) { let w=[]; if(!pdfOk)w.push('pdf'); if(!qrOk)w.push('html5qr'); if(w.length>0) updateStatusSpan(`等待程式載入庫(${checkCounter}/${maxChecks}):${w.join(',')}..`, 'grey'); }
        }, checkIntervalMs);
    }

    function updateStatusSpan(text, color = 'grey', allowWrap = false) {
        let span=document.getElementById(`${SCRIPT_PREFIX}_customStatusSpan`);
        if (!span && text !== "") span=createStatusElement();
        if (span) { span.textContent=text; span.style.color=color; span.style.whiteSpace=allowWrap?'normal':'nowrap'; span.style.overflow=allowWrap?'visible':'hidden'; span.style.textOverflow=allowWrap?'clip':'ellipsis'; span.style.maxHeight=allowWrap?'12em':'1.5em'; span.style.display=text===""?'none':'inline-block'; }
    }
    function createStatusElement() {
        const id=`${SCRIPT_PREFIX}_customStatusSpan`; let el=document.getElementById(id); if(el)return el; const target=findTargetContainer(); if(!target)return null;
        try { el=document.createElement('span'); el.id=id; el.style.fontFamily='Arial,sans-serif'; el.style.fontSize='13px'; el.style.marginLeft='10px'; el.style.verticalAlign='middle'; el.style.lineHeight='1.4'; el.style.display='inline-block'; el.style.wordBreak='break-word'; el.style.maxWidth='450px'; el.textContent='初始化..'; el.style.color='grey'; if(document.body.contains(target)){target.appendChild(el);return el;}else { console.warn(`${SCRIPT_PREFIX}: Target invalid during status create.`); return null; } } catch(e){ console.error(`${SCRIPT_PREFIX}: Err create status:`, e); return null; }
    }

    function findTargetContainer() { const sels=['.order-input','div.ssc-input', '.ssc-form-item-control .ssc-input']; for(const s of sels){ try{const c=document.querySelector(s); if(c&&document.body.contains(c)&&c.offsetParent!==null) return c;} catch(e){} } return null; }

    async function initializeElements() {
        const state = await getFeatureStates();
        if (!state.masterEnabled || !state.featureFileScanEnabled) {
            console.log(`${SCRIPT_PREFIX}: Init check: Feature disabled. Ensure UI removed.`);
            await removeFileScannerUI();
            return;
        }

        if (!librariesLoaded) {
            if (!librariesCheckInterval) await checkLibrariesAndInit(); else updateStatusSpan('等庫..', 'grey');
            return;
        }

        const existingInput = document.getElementById(`${SCRIPT_PREFIX}_customFileInput`);
        if (uiInitialized && existingInput && document.body.contains(existingInput)) {
            if (initPollingInterval) {
                 console.log(`${SCRIPT_PREFIX}: Init Polling Interval cleared (already initialized).`);
                 clearInterval(initPollingInterval);
                 initPollingInterval = null;
             }
             const statEl = document.getElementById(`${SCRIPT_PREFIX}_customStatusSpan`); const curStat = statEl?.textContent || ''; if (!isProcessing && !curStat.includes("佇列") && !curStat.includes("處理中") && !curStat.startsWith("錯誤") && !curStat.startsWith("完成，但")) { updateStatusSpan('請選PDF/HTML/JPG/PNG檔(可多選)', 'grey'); } if(!isProcessing) existingInput.disabled=false; if(!document.getElementById(`${SCRIPT_PREFIX}_html5qrReaderDiv`)) createHiddenReaderElement();
            return;
        }

        const target = findTargetContainer();
        if (!target) {
             uiInitialized = false;
            return;
        }

        console.log(`${SCRIPT_PREFIX}: Target container found! Creating/verifying UI elements...`);
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
                    console.log(`${SCRIPT_PREFIX}: Re-attached listener.`);
                }
                fEl.disabled=isProcessing;
            }
            if (!createHiddenReaderElement()) throw new Error("QR reader div creation failed.");
            console.log(`${SCRIPT_PREFIX}: UI Initialization SUCCESSFUL.`);
            uiInitialized = true;
            if (!isProcessing && batchScanErrors.length === 0) updateStatusSpan('請選PDF/HTML/JPG/PNG檔(可多選)','grey');
            if (initPollingInterval) { clearInterval(initPollingInterval); initPollingInterval = null; console.log(`${SCRIPT_PREFIX}: Init Polling Interval cleared (SUCCESS).`); }
            return;
        } catch (err) {
            console.error(`${SCRIPT_PREFIX}: UI init critical error:`, err);
            await removeFileScannerUI(); updateStatusSpan('錯誤:介面初始化失敗','red'); uiInitialized = false;
        }
    }

    function createHiddenReaderElement() {
        const id=`${SCRIPT_PREFIX}_html5qrReaderDiv`; if(document.getElementById(id))return true;
        try{const el=document.createElement("div"); el.id=id; el.style.position='absolute';el.style.top='-9999px';el.style.left='-9999px';el.style.width="300px";el.style.height="300px";el.style.zIndex="-1";el.style.overflow='hidden';el.ariaHidden="true"; document.body.appendChild(el); return true; }
        catch(e){ console.error(`${SCRIPT_PREFIX}: Reader create fail:`,e); return false; }
    }

    async function handleFileSelection(event) {
        const state=await getFeatureStates(); if(!state.masterEnabled||!state.featureFileScanEnabled){ event.target.value=''; return; }
        const fin=event.target; if(isProcessing){ updateStatusSpan("處理中..", "orange"); fin.value=''; return; }
        const files=Array.from(fin.files); if(files.length===0) return;
        
        batchScanErrors=[]; 
        totalSimulatedInBatch = 0; 
        
        fileQueue.push(...files); fin.value=''; updateStatusSpan(`${files.length}檔加入，共${fileQueue.length}個`, 'blue');
        console.log(`${SCRIPT_PREFIX}: Add ${files.length}. Queue:${fileQueue.length}. Errors cleared. Simulated count reset.`);
        
        if(!isProcessing && fileQueue.length>0){
            totalFilesInBatch=fileQueue.length; currentFileIndex=0;
            console.log(`${SCRIPT_PREFIX}: Start batch ${totalFilesInBatch}.`);
            await processNextFileInQueue();
        }
    }

    async function processNextFileInQueue() {
        const state = await getFeatureStates();
        if (!state.masterEnabled || !state.featureFileScanEnabled) {
            fileQueue=[]; isProcessing=false; updateStatusSpan("佇列取消(功能已停用)", "orange"); resetFileInputState(); totalFilesInBatch=0; return;
        }
        if (fileQueue.length === 0) {
            console.log(`${SCRIPT_PREFIX}: Batch complete.`); isProcessing=false; resetFileInputState();
            if(batchScanErrors.length > 0) {
                displayBatchErrorSummary(); 
            } else if (totalFilesInBatch > 0) {
                updateStatusSpan(`全部 ${totalFilesInBatch} 個檔案處理完成。成功模擬輸入 ${totalSimulatedInBatch} 件。`, 'green', true);
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
            console.error(`ERROR Queue Proc ${fNameReport}:`, err);
            updateStatusSpan(statusPrefix + `檔案錯誤: ${err.message || '未知'}`, 'red', true);
            addBatchScanError(fNameReport, null, 'File', 'Processing Error', err.message || 'Unknown');
        } finally {
            await new Promise(r=>setTimeout(r,100));
            const stateAfter=await getFeatureStates();
            if (!stateAfter.masterEnabled||!stateAfter.featureFileScanEnabled){ fileQueue=[];isProcessing=false;updateStatusSpan("佇列取消(功能已停用)","orange");resetFileInputState();totalFilesInBatch=0;}
            else { isProcessing=false; await processNextFileInQueue(); }
        }
    }

    function addBatchScanError(fileName, pageNumber, scanType, errorType, details) {
        const err={ id:Date.now()+Math.random(),fileName:fileName||"N/A",pageNumber,scanType,errorType,details:details||'',timestamp:new Date().toISOString() };
        batchScanErrors.push(err);
    }

    function displayBatchErrorSummary() {
        if(batchScanErrors.length===0 && totalSimulatedInBatch === 0) return; 

        console.warn(`${SCRIPT_PREFIX}: Raw issues (${batchScanErrors.length}):`, JSON.parse(JSON.stringify(batchScanErrors)));
        
        let summary = "";
        if (totalSimulatedInBatch > 0) {
            summary += `成功模擬輸入 ${totalSimulatedInBatch} 件。\n`;
        }

        if (batchScanErrors.length > 0) {
            const errorsToDisplay=[];
            const groupedByFilePage=batchScanErrors.reduce((acc,err)=>{const fk=err.fileName;const pk=err.pageNumber!==null?String(err.pageNumber):'_fLvl'; if(!acc[fk])acc[fk]={}; if(!acc[fk][pk])acc[fk][pk]=[]; acc[fk][pk].push(err); return acc; },{});

            for(const fn in groupedByFilePage){
                const pgs=groupedByFilePage[fn];
                for(const pgS in pgs){
                    if(pgS==='_fLvl') continue;
                    const pgErrs=pgs[pgS];
                    const fullPg=pgErrs.filter(e=>e.scanType==='整頁');
                    const quad=pgErrs.filter(e=>['左上','右上','左下','右下'].includes(e.scanType)); 
                    const others=pgErrs.filter(e=>e.scanType!=='整頁'&&!['左上','右上','左下','右下'].some( qPrefix => e.scanType.startsWith(qPrefix) ) );
                    if(quad.length===4&&fullPg.length>0){ errorsToDisplay.push(fullPg[0]); console.log(`${SCRIPT_PREFIX}:Consolidated Pg ${pgS} in ${fn} to Full Pg Err.`); }
                    else { errorsToDisplay.push(...fullPg,...quad,...others); }
                }
                if(pgs['_fLvl']) errorsToDisplay.push(...pgs['_fLvl']);
            }

            const finalErrCount=errorsToDisplay.length;
            if(finalErrCount > 0) {
                 summary += `❗完成，但有 ${finalErrCount} 個掃描問題，[請嘗試手動掃描]:\n`;
                const finalGrpF=errorsToDisplay.reduce((acc,err)=>{const fk=err.fileName;if(!acc[fk])acc[fk]=[];acc[fk].push(err);return acc;},{});
                let fDispCnt=0;
                for(const fn in finalGrpF){
                    fDispCnt++;const dispFn=fn==="N/A"?"模擬輸入":(fn.length > 40?fn.substring(0,37)+'...':fn);summary+=`${fDispCnt}. ${dispFn}:\n`;
                    const errs=finalGrpF[fn];
                    errs.sort((a,b)=>(a.pageNumber||0)-(b.pageNumber||0)||a.scanType.localeCompare(b.scanType));
                    let lines=0;
                    errs.forEach(err=>{
                        if(lines>=5) return;
                        let line=` - `;
                        if(err.pageNumber!==null) line+=`第 ${err.pageNumber} 頁`; else line+=`檔案/模擬`;
                        line+=` (${err.scanType}): ${err.errorType}`;
                        const dets=(err.details||'').replace(/Error:/i,'').trim();
                        if(dets&&dets!==err.errorType&&dets.length<40) line+=` (${dets})`;
                        summary+=line+'\n'; lines++;
                    });
                    if(lines>=5&&errs.length>5) summary+=` - ...(更多見控制台)\n`;
                    if(Object.keys(finalGrpF).length>1&&fDispCnt<Object.keys(finalGrpF).length) summary+="\n";
                }
                console.warn(`${SCRIPT_PREFIX}: Displayed issues (${finalErrCount}):`, JSON.parse(JSON.stringify(errorsToDisplay)));
                updateStatusSpan(summary.trim(), 'orange', true);
            } else if (totalSimulatedInBatch > 0) { 
                 updateStatusSpan(summary.trim(), 'green', true); 
            }
        } else if (totalSimulatedInBatch > 0) { 
             updateStatusSpan(summary.trim(), 'green', true);
        }
    }

    async function simulateBarcodeInput(code, fileNameForReport) {
        const state = await getFeatureStates();
        if (!state.masterEnabled || !state.featureFileScanEnabled) {
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

            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            inp.dispatchEvent(enterEvent);
            console.log(`${SCRIPT_PREFIX}: Simulated Enter on input for code ${code}`);
        } catch (e) {
            console.error(`${SCRIPT_PREFIX}: Sim err for code ${code}:`, e);
            addBatchScanError(fileNameForReport, null, 'Simulate', 'Execution Error', e.message || String(e));
            throw e; 
        }
    }


    async function processBarcodesAndQRCodes(pdf, processedCodes, statusPrefix, fileNameForReport) {
        const stateInit = await getFeatureStates();
        if (!stateInit.masterEnabled || !stateInit.featureFileScanEnabled) {
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
        } catch (initErr) {
            addBatchScanError(fileNameForReport, null, 'Scan', 'Setup Err', 'QR掃描器初始化失敗');
            return;
        }

        let dupeCnt = 0;
        const ps = [];
        const codesFoundByQRThisFunc = []; 
        updateStatusSpan(statusPrefix + `掃描 ${pdf.numPages} 頁PDF (QR碼)...`, 'grey');
        const SCALE = 2.0;

        for (let pn = 1; pn <= pdf.numPages; pn++) {
            const stateLoop = await getFeatureStates();
            if (!stateLoop.masterEnabled || !stateLoop.featureFileScanEnabled) {
                addBatchScanError(fileNameForReport, pn, 'Scan Loop', 'Cancelled', '功能已停用');
                break;
            }
            ps.push((async (pgNum) => {
                let page = null, cFull = null, cQuad = null, ctxQ = null;
                let fullFound = false;
                const isLast = (pgNum === pdf.numPages);
                let fullTechErr = null;

                const statePageStart = await getFeatureStates();
                if (!statePageStart.masterEnabled || !statePageStart.featureFileScanEnabled) {
                    addBatchScanError(fileNameForReport, pgNum, 'Scan Start', 'Cancelled', '功能已停用');
                    return;
                }
                try {
                    page = await pdf.getPage(pgNum);
                    const vp = page.getViewport({ scale: SCALE });
                    cFull = document.createElement("canvas");
                    const ctx = cFull.getContext("2d", { willReadFrequently: true });
                    cFull.width = vp.width;
                    cFull.height = vp.height;

                    if (pgNum % 5 === 0 || pgNum === 1 || isLast || pdf.numPages < 5) {
                        updateStatusSpan(statusPrefix + `渲染第 ${pgNum} 頁/${pdf.numPages} (QR掃描)..`, 'grey');
                    }
                    await page.render({ canvasContext: ctx, viewport: vp }).promise;

                    const stateRendered = await getFeatureStates();
                    if (!stateRendered.masterEnabled || !stateRendered.featureFileScanEnabled) {
                        addBatchScanError(fileNameForReport, pgNum, 'Render', 'Cancelled', '功能已停用');
                        throw new Error("Op cancelled during render");
                    }

                    updateStatusSpan(statusPrefix + `掃描第 ${pgNum} 頁 (整頁 QR)...`, 'grey');
                    try {
                        const blob = await new Promise((res, rej) => { if (!cFull || cFull.width === 0) return rej(new Error('Canvas invalid')); cFull.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/png'); });
                        const img = new File([blob], `p${pgNum}f.png`, { type: 'image/png' });
                        const result = await qr.scanFile(img, false);
                        const txt = result?.decodedText?.trim() || (typeof result === 'string' ? result.trim() : null);
                        if (txt && /^TW[A-Z0-9]{13}$/.test(txt)) {
                            if (!processedCodes.has(txt)) { 
                                processedCodes.add(txt);
                                codesFoundByQRThisFunc.push(txt); 
                                updateStatusSpan(statusPrefix + `第${pgNum}頁(整頁QR):✔️新增 ${txt.substring(0, 6)}..`, 'grey');
                            } else {
                                dupeCnt++;
                                updateStatusSpan(statusPrefix + `第${pgNum}頁(整頁QR):⚠️重複 ${txt.substring(0, 6)}..`, 'grey');
                            }
                            fullFound = true;
                        } else if (txt) {
                            updateStatusSpan(statusPrefix + `第${pgNum}頁(整頁QR): ❌無效`, 'grey');
                        } else {
                            updateStatusSpan(statusPrefix + `第${pgNum}頁(整頁QR): 未找到`, 'grey');
                        }
                    } catch (scanErr) {
                        const msgL = (scanErr?.message || '').toLowerCase();
                        const dets = scanErr.message || String(scanErr);
                        if (!msgL.includes("not found") && !msgL.includes("unable to find") && !msgL.includes("no qr code found")) {
                            if (msgL.includes("canvas") || msgL.includes("toblob")) fullTechErr = { type: 'Canvas Err', details: dets };
                            else fullTechErr = { type: 'Scan Err', details: dets };
                        }
                        fullFound = false;
                        updateStatusSpan(statusPrefix + `第${pgNum}頁(整頁QR):` + (fullTechErr ? `❗${fullTechErr.type}` : `未找到`), fullTechErr ? 'orange' : 'grey');
                    }

                    if (!fullFound && cFull && cFull.width > 0) {
                        updateStatusSpan(statusPrefix + `掃描第 ${pgNum} 頁 (分區 QR)...`, 'grey');
                        const w = cFull.width, h = cFull.height;
                        const qs = [{ x: 0, y: 0, w: w / 2, h: h / 2, n: '左上' }, { x: w / 2, y: 0, w: w / 2, h: h / 2, n: '右上' }, { x: 0, y: h / 2, w: w / 2, h: h / 2, n: '左下' }, { x: w / 2, y: h / 2, w: w / 2, h: h / 2, n: '右下' }];
                        cQuad = document.createElement('canvas');
                        ctxQ = cQuad.getContext('2d', { willReadFrequently: true });

                        for (const q of qs) {
                            const stateQuadrant = await getFeatureStates();
                            if (!stateQuadrant.masterEnabled || !stateQuadrant.featureFileScanEnabled) {
                                addBatchScanError(fileNameForReport, pgNum, q.n + ' QR', 'Cancelled', '功能已停用'); break;
                            }
                            updateStatusSpan(statusPrefix + `掃描第${pgNum}頁 (${q.n} QR)..`, 'grey');
                            const sx = Math.max(0, Math.floor(q.x)), sy = Math.max(0, Math.floor(q.y)), sw = Math.max(1, Math.ceil(q.w)), sh = Math.max(1, Math.ceil(q.h));
                            if (sw <= 0 || sh <= 0 || sx >= w || sy >= h) { addBatchScanError(fileNameForReport, pgNum, q.n + ' QR', 'Scan Err', 'Invalid Geo'); continue; }
                            cQuad.width = sw; cQuad.height = sh;
                            const ignored = isLast && q.n !== '左上';

                            try {
                                ctxQ.drawImage(cFull, sx, sy, sw, sh, 0, 0, sw, sh);
                                const blobQ = await new Promise((rs, rj) => { if (!cQuad || cQuad.width === 0) return rj(new Error('Quad canvas invalid')); cQuad.toBlob(b => b ? rs(b) : rj(new Error('Quad toBlob null')), 'image/png'); });
                                const imgQ = new File([blobQ], `p${pgNum}${q.n}.png`, { type: 'image/png' });
                                const resQ = await qr.scanFile(imgQ, false);
                                const txtQ = resQ?.decodedText?.trim() || (typeof resQ === 'string' ? resQ.trim() : null);
                                if (txtQ && /^TW[A-Z0-9]{13}$/.test(txtQ)) {
                                    if (!processedCodes.has(txtQ)) {
                                        processedCodes.add(txtQ);
                                        codesFoundByQRThisFunc.push(txtQ);
                                        updateStatusSpan(statusPrefix + `第${pgNum}頁(${q.n} QR):✔️新增 ${txtQ.substring(0, 6)}..`, 'grey');
                                    } else {
                                        dupeCnt++;
                                        updateStatusSpan(statusPrefix + `第${pgNum}頁(${q.n} QR):⚠️重複 ${txtQ.substring(0, 6)}..`, 'grey');
                                    }
                                } else if (txtQ) {
                                    const details = `'${txtQ.substring(0, 10)}...'`;
                                    if (!ignored) addBatchScanError(fileNameForReport, pgNum, q.n + ' QR', 'Invalid Format', details);
                                    updateStatusSpan(statusPrefix + `第${pgNum}頁(${q.n} QR):❌無效` + (ignored ? '(忽略)' : ''), 'grey');
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
                                    let eType = 'Scan Err', color = 'orange';
                                    if (msgLQ.includes("not found") || msgLQ.includes("unable to find") || msgLQ.includes("no qr code found")) { eType = 'Not Found'; color = 'grey'; }
                                    else if (msgLQ.includes("canvas") || msgLQ.includes("toblob")) { eType = 'Canvas Err'; }
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
                    console.error(`${SCRIPT_PREFIX}: Error processing page ${pgNum} of ${fileNameForReport} for QR:`, pageErr);
                    addBatchScanError(fileNameForReport, pgNum, 'Page QR', 'Processing Error', pageErr.message || String(pageErr));
                } finally {
                    if (page) page.cleanup();
                    if (cFull) { cFull.width = 1; cFull.height = 1; cFull = null; }
                    if (cQuad) { cQuad.width = 1; cQuad.height = 1; cQuad = null; }
                }
            })(pn));
        }

        await Promise.all(ps);

        const finalStateCheck = await getFeatureStates();
        if (!finalStateCheck.masterEnabled || !finalStateCheck.featureFileScanEnabled) {
             updateStatusSpan(statusPrefix + "PDF QR掃描已取消(功能停用)", "orange");
             addBatchScanError(fileNameForReport, null, 'QR Scan End', 'Cancelled', '功能已於掃描結束前停用');
             return;
        }

        if (codesFoundByQRThisFunc.length > 0) { 
            updateStatusSpan(statusPrefix + `QR掃描找到 ${codesFoundByQRThisFunc.length} 個新條碼，模擬輸入中...`, 'blue');
            for (let i = 0; i < codesFoundByQRThisFunc.length; i++) {
                const code = codesFoundByQRThisFunc[i];
                const stateSim = await getFeatureStates();
                if (!stateSim.masterEnabled || !stateSim.featureFileScanEnabled) {
                    addBatchScanError(fileNameForReport, null, 'Simulate QR', 'Cancelled', '功能已停用');
                    updateStatusSpan(statusPrefix + "QR模擬輸入已取消(功能停用)", "orange");
                    break;
                }
                try {
                    await simulateBarcodeInput(code, fileNameForReport);
                    totalSimulatedInBatch++; 
                    updateStatusSpan(statusPrefix + `已模擬QR條碼 ${code.substring(0, 6)}... (${i + 1}/${codesFoundByQRThisFunc.length})`, 'grey');
                    await new Promise(r => setTimeout(r, 300));
                } catch (simError) {
                    updateStatusSpan(statusPrefix + `模擬QR條碼 ${code.substring(0, 6)}... 失敗`, 'red');
                }
            }
            const finalSimState = await getFeatureStates();
            if (finalSimState.masterEnabled && finalSimState.featureFileScanEnabled) {
                 updateStatusSpan(statusPrefix + `${codesFoundByQRThisFunc.length} 個新QR條碼處理完成。` + (dupeCnt > 0 ? ` (${dupeCnt} 個重複)` : ''), 'green');
            }
        } else if (dupeCnt > 0 && codesFoundByQRThisFunc.length === 0) { 
            updateStatusSpan(statusPrefix + `所有QR掃描找到的條碼 (${dupeCnt} 個) 均為重複。`, 'orange');
        } else { 
            updateStatusSpan(statusPrefix + 'PDF QR掃描未找到新條碼。', 'grey');
        }
    }


    async function processPDF(file, statusPrefix, fileNameForReport) {
        return new Promise(async (resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const processedCodesThisFile = new Set(); 
                try {
                    let state = await getFeatureStates();
                    if (!state.masterEnabled || !state.featureFileScanEnabled) {
                        addBatchScanError(fileNameForReport, null, 'PDF', 'Cancelled', '功能已停用');
                        resolve(); return;
                    }
                    updateStatusSpan(statusPrefix + '讀取PDF..', 'grey');
                    const pdfDoc = await pdfjsLib.getDocument({ data: e.target.result }).promise;

                    updateStatusSpan(statusPrefix + `提取 ${pdfDoc.numPages} 頁PDF文字..`, 'grey');
                    let allText = '';
                    for (let i = 1; i <= pdfDoc.numPages; i++) {
                        state = await getFeatureStates();
                        if (!state.masterEnabled || !state.featureFileScanEnabled) {
                             addBatchScanError(fileNameForReport, i, 'PDF Text Ext.', 'Cancelled', '功能已停用'); resolve(); return;
                        }
                        const page = await pdfDoc.getPage(i);
                        const textContent = await page.getTextContent();
                        allText += textContent.items.map(item => item.str).join(' ');
                        page.cleanup();
                    }

                    const twBarcodeRegex = /TW[A-Z0-9]{13}/g;
                    let match;
                    const foundTextCodes = [];
                    while ((match = twBarcodeRegex.exec(allText)) !== null) {
                        if (!processedCodesThisFile.has(match[0])) {
                            foundTextCodes.push(match[0]);
                            processedCodesThisFile.add(match[0]);
                        }
                    }

                    if (foundTextCodes.length > 0) {
                        updateStatusSpan(statusPrefix + `PDF文字中找到 ${foundTextCodes.length} 個條碼，優先處理...`, 'blue');
                        for (let i = 0; i < foundTextCodes.length; i++) {
                            const code = foundTextCodes[i];
                            state = await getFeatureStates();
                            if (!state.masterEnabled || !state.featureFileScanEnabled) {
                                addBatchScanError(fileNameForReport, null, 'Simulate Text', 'Cancelled', '功能已停用');
                                updateStatusSpan(statusPrefix + "文字條碼模擬已取消", "orange");
                                break;
                            }
                            try {
                                await simulateBarcodeInput(code, fileNameForReport);
                                totalSimulatedInBatch++; 
                                updateStatusSpan(statusPrefix + `已模擬文字條碼 ${code.substring(0, 6)}... (${i + 1}/${foundTextCodes.length})`, 'grey');
                                await new Promise(r => setTimeout(r, 300));
                            } catch (simError) {
                                updateStatusSpan(statusPrefix + `模擬文字條碼 ${code.substring(0, 6)}... 失敗`, 'red');
                            }
                        }
                        state = await getFeatureStates();
                        if (state.masterEnabled && state.featureFileScanEnabled) {
                           updateStatusSpan(statusPrefix + `PDF文字條碼處理完成 (${foundTextCodes.length}個).`, 'green', true);
                        }
                        resolve(); 
                        return;
                    }

                    updateStatusSpan(statusPrefix + `PDF文字中未找到條碼，嘗試掃描QR碼..`, 'grey');
                    await processBarcodesAndQRCodes(pdfDoc, processedCodesThisFile, statusPrefix, fileNameForReport);
                    
                    if (processedCodesThisFile.size === 0 && !batchScanErrors.some(err => err.fileName === fileNameForReport && (err.scanType?.includes('QR') || err.scanType?.includes('Text')))) {
                         addBatchScanError(fileNameForReport, null, 'PDF Total', 'No Codes Found', '未在PDF中找到任何條碼 (文字或QR)');
                         updateStatusSpan(statusPrefix + '整個PDF未找到條碼.', 'orange', true);
                    }
                    resolve();

                } catch (err) {
                    if (!err.message?.includes("cancel")) addBatchScanError(fileNameForReport, null, 'PDF', 'Proc Err', err.message);
                    console.error(SCRIPT_PREFIX + " PDF Processing Error:", err);
                    updateStatusSpan(statusPrefix + `PDF處理錯誤: ${err.message || '未知'}`, 'red', true);
                    reject(err); 
                }
            };
            reader.onerror = err => {
                addBatchScanError(fileNameForReport, null, 'Read', 'Reader Err', err.message);
                console.error(SCRIPT_PREFIX + " PDF Read Error:", err);
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
                    let state=await getFeatureStates(); if(!state.masterEnabled||!state.featureFileScanEnabled){addBatchScanError(fileNameForReport,null,'HTML','Cancelled','功能已停用');resolve();return;}
                    const html=e.target.result;
                    updateStatusSpan(statusPrefix+'解析HTML..','grey');
                    const parser=new DOMParser();const doc=parser.parseFromString(html,"text/html");
                    const body=doc.body?.textContent?.trim()||'';
                    const titles=Array.from(doc.querySelectorAll('[title]')).map(el=>el.getAttribute('title')?.trim()||'').filter(Boolean);
                    const titleTxt=titles.join('\n');
                    const combinedTextContent=`${body}\n${titleTxt}`;
                    updateStatusSpan(statusPrefix+'HTML解析完成, 模擬條碼 (如果找到)..','grey');

                    const twBarcodeRegex = /TW[A-Z0-9]{13}/g;
                    let match;
                    const foundCodes = new Set(); 
                    while ((match = twBarcodeRegex.exec(combinedTextContent)) !== null) {
                        foundCodes.add(match[0]);
                    }

                    if (foundCodes.size > 0) {
                        updateStatusSpan(statusPrefix + `HTML中找到 ${foundCodes.size} 個條碼，模擬輸入中...`, 'blue');
                        let simulatedCount = 0;
                        for (const code of foundCodes) {
                             state = await getFeatureStates();
                             if (!state.masterEnabled || !state.featureFileScanEnabled) {
                                 addBatchScanError(fileNameForReport, null, 'HTML Sim', 'Cancelled', '功能已停用');
                                 updateStatusSpan(statusPrefix + "HTML模擬輸入已取消", "orange");
                                 break;
                             }
                            try {
                                await simulateBarcodeInput(code, fileNameForReport);
                                totalSimulatedInBatch++; 
                                simulatedCount++;
                                updateStatusSpan(statusPrefix + `已模擬HTML條碼 ${code.substring(0,6)}... (${simulatedCount}/${foundCodes.size})`, 'grey');
                                await new Promise(r => setTimeout(r, 300)); 
                            } catch (simError) {
                                updateStatusSpan(statusPrefix + `HTML模擬 ${code.substring(0,6)}... 失敗`, 'red');
                            }
                        }
                         state = await getFeatureStates();
                         if (state.masterEnabled && state.featureFileScanEnabled) {
                            updateStatusSpan(statusPrefix + `HTML中 ${simulatedCount} 個條碼處理完成`, 'green', true);
                         }
                    } else {
                        updateStatusSpan(statusPrefix + 'HTML中未找到可識別條碼', 'orange', true);
                        addBatchScanError(fileNameForReport, null, 'HTML Scan', 'No Code', '未找到條碼');
                    }
                    resolve();
                } catch(err){
                    if(!err.message?.includes("cancel"))addBatchScanError(fileNameForReport,null,'HTML','Proc Err',err.message);
                    console.error(SCRIPT_PREFIX + " HTML Processing Error:", err);
                    updateStatusSpan(statusPrefix + `HTML處理錯誤: ${err.message || '未知'}`, 'red', true);
                    reject(err);
                }
            };
            r.onerror=err=>{
                addBatchScanError(fileNameForReport,null,'Read','Reader Err',err.message);
                console.error(SCRIPT_PREFIX + " HTML Read Error:", err);
                updateStatusSpan(statusPrefix + `HTML讀取錯誤: ${err.message || '未知'}`, 'red', true);
                reject(err);
            };
            r.readAsText(file);
        });
    }

    async function processImageFile(file, statusPrefix, fileNameForReport) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const state = await getFeatureStates();
                    if (!state.masterEnabled || !state.featureFileScanEnabled) {
                        addBatchScanError(fileNameForReport, null, 'Image', 'Cancelled', '功能已停用');
                        resolve();
                        return;
                    }
                    updateStatusSpan(statusPrefix + '讀取圖片..', 'grey');
                    const imageDataUrl = e.target.result;

                    const readerEl = document.getElementById(`${SCRIPT_PREFIX}_html5qrReaderDiv`);
                    if (typeof Html5Qrcode === 'undefined' || !readerEl) {
                        addBatchScanError(fileNameForReport, null, 'Image Scan', 'Setup Err', 'QR掃描器未就緒');
                        resolve();
                        return;
                    }

                    let html5QrCode;
                    try {
                        html5QrCode = new Html5Qrcode(readerEl.id);
                    } catch (initErr) {
                        addBatchScanError(fileNameForReport, null, 'Image Scan', 'Setup Err', 'QR掃描器初始化失敗');
                        resolve();
                        return;
                    }
                    
                    updateStatusSpan(statusPrefix + '掃描圖片QR碼..', 'grey');
                    
                    try {
                        const decodedTextResult = await html5QrCode.scanFile(file, false);
                        const decodedText = decodedTextResult?.decodedText?.trim() || (typeof decodedTextResult === 'string' ? decodedTextResult.trim() : null);

                        console.log(`${SCRIPT_PREFIX}: Img QR Scan result:`, decodedText);
                        if (decodedText && /TW[A-Z0-9]{13}/.test(decodedText)) {
                            updateStatusSpan(statusPrefix + `圖片QR掃到: ${decodedText.substring(0,10)}...`, 'blue');
                            await simulateBarcodeInput(decodedText, fileNameForReport); 
                            totalSimulatedInBatch++; 
                            updateStatusSpan(statusPrefix + '圖片QR碼處理完成', 'green', true);
                        } else if (decodedText) {
                            updateStatusSpan(statusPrefix + `圖片中找到QR但格式無效: ${decodedText.substring(0,10)}...`, 'orange', true);
                            addBatchScanError(fileNameForReport, null, 'Image Scan', 'Invalid Format', `圖片中QR碼格式無效: ${decodedText.substring(0,20)}`);
                        }
                        else {
                            updateStatusSpan(statusPrefix + '圖片中無有效QR碼', 'orange', true);
                            addBatchScanError(fileNameForReport, null, 'Image Scan', 'No Code', '圖片中未找到有效條碼');
                        }
                    } catch (scanErr) {
                        console.warn(`${SCRIPT_PREFIX}: Img QR Scan Fail:`, scanErr);
                        const errMsg = (scanErr?.message || String(scanErr)).toLowerCase();
                        if (errMsg.includes("not found") || errMsg.includes("unable to find") || errMsg.includes("no qr code found")) {
                             updateStatusSpan(statusPrefix + '圖片中未找到QR碼', 'orange', true);
                             addBatchScanError(fileNameForReport, null, 'Image Scan', 'Not Found', '圖片中未找到QR碼');
                        } else {
                            updateStatusSpan(statusPrefix + '圖片QR掃描失敗', 'red', true);
                            addBatchScanError(fileNameForReport, null, 'Image Scan', 'Scan Err', scanErr.message || '掃描失敗');
                        }
                    } finally {
                        resolve(); 
                    }
                } catch (err) { 
                    if (!err.message?.includes("cancel")) addBatchScanError(fileNameForReport, null, 'Image', 'Proc Err', err.message);
                    console.error(SCRIPT_PREFIX + " Image Processing Error:", err);
                    updateStatusSpan(statusPrefix + `圖片處理錯誤: ${err.message || '未知'}`, 'red', true);
                    reject(err); 
                }
            };
            reader.onerror = err => {
                addBatchScanError(fileNameForReport, null, 'Read', 'Reader Err', err.message);
                console.error(SCRIPT_PREFIX + " Image Read Error:", err);
                updateStatusSpan(statusPrefix + `圖片讀取錯誤: ${err.message || '未知'}`, 'red', true);
                reject(err);
            };
            reader.readAsDataURL(file);
        });
    }


    function resetFileInputState(){ const el=document.getElementById(`${SCRIPT_PREFIX}_customFileInput`); if(el) el.disabled=false; }

    async function removeFileScannerUI() {
        const fEl=document.getElementById(`${SCRIPT_PREFIX}_customFileInput`); if(fEl)fEl.remove();
        const sEl=document.getElementById(`${SCRIPT_PREFIX}_customStatusSpan`); if(sEl)sEl.remove();
        const rEl=document.getElementById(`${SCRIPT_PREFIX}_html5qrReaderDiv`); if(rEl)rEl.remove();
        uiInitialized=false; fileQueue=[]; isProcessing=false;
        if(librariesCheckInterval) { clearInterval(librariesCheckInterval); librariesCheckInterval=null; }
        if(initPollingInterval) { clearInterval(initPollingInterval); initPollingInterval=null; }
        console.log(`${SCRIPT_PREFIX}: UI removed, state reset.`);
    }
    window.removeShopeeFileScannerUI = removeFileScannerUI;

    async function checkUrlAndMaybeInitialize() {
        const state = await getFeatureStates();
        if (!state.masterEnabled || !state.featureFileScanEnabled) {
            if (uiInitialized) await removeFileScannerUI();
            return;
        }
        const targetUrlInboundDetail = 'https://sp.spx.shopee.tw/inbound-management/receive-task/detail/'; 
        const targetUrlInboundCreate = 'https://sp.spx.shopee.tw/inbound-management/receive-task/create/';
        const currentHref = window.location.href;

        if (currentHref.startsWith(targetUrlInboundDetail) ||
            currentHref.startsWith(targetUrlInboundCreate)) {
            if (!uiInitialized || !document.getElementById(`${SCRIPT_PREFIX}_customFileInput`)) {
                console.log(`${SCRIPT_PREFIX}: On target URL. Initializing/Re-initializing UI for: ${currentHref}`);
                await initializeElements();
            }
        } else {
            if (uiInitialized) {
                console.log(`${SCRIPT_PREFIX}: Not on target URL (${currentHref}). Removing UI.`);
                await removeFileScannerUI();
            }
        }
    }
    window.triggerShopeeFileScannerCheck = checkUrlAndMaybeInitialize;

    function handleUrlChange() {
        clearTimeout(navDebounceTimeout);
        navDebounceTimeout = setTimeout(async () => {
            if (window.location.href !== lastUrl) {
                console.log(`${SCRIPT_PREFIX}: URL changed from ${lastUrl} to ${window.location.href}. Re-checking UI requirements.`);
                lastUrl = window.location.href;
                await checkUrlAndMaybeInitialize();
            }
        }, 250);
    }

    const observer = new MutationObserver(handleUrlChange);
    observer.observe(document, { childList: true, subtree: true });
    window.addEventListener('popstate', handleUrlChange);

    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === 'sync') {
            const relevantKeyChanged = ALL_FEATURE_STORAGE_KEYS_FOR_LISTENER.some(key => key in changes);
            if (relevantKeyChanged) {
                console.log(`${SCRIPT_PREFIX}: Relevant feature state changed in storage. Re-evaluating.`);
                const state = await getFeatureStates();
                if (!state.masterEnabled || !state.featureFileScanEnabled) {
                    if (isProcessing) {
                        console.warn(`${SCRIPT_PREFIX}: Feature disabled during processing. Cancelling queue.`);
                        fileQueue = [];
                        updateStatusSpan("佇列取消(功能已停用)", "orange");
                        resetFileInputState();
                    }
                    await removeFileScannerUI();
                } else {
                    await checkUrlAndMaybeInitialize();
                    if (!isProcessing && fileQueue.length > 0) {
                        console.log(`${SCRIPT_PREFIX}: Feature re-enabled with items in queue. Restarting processing.`);
                        totalFilesInBatch = fileQueue.length; currentFileIndex = 0;
                        await processNextFileInQueue();
                    }
                }
            }
        }
    });

    console.log(`${SCRIPT_PREFIX}: Script load. Init checks.`);
    checkLibrariesAndInit();
    await new Promise(resolve => setTimeout(resolve, 400));
    initPollingInterval = setInterval(checkUrlAndMaybeInitialize, 2000);

})();

console.warn('蝦皮自動化: Script loaded. 由vito.ipynb編寫，請勿用於非法用途，請謹慎使用，遇到事情本人概不負責，此代碼僅限用於蝦皮店到店-汐止青山店');