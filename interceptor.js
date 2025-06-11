(function() {
    'use strict';

    const originalFetch = window.fetch;
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;
    const originalAudio = window.Audio;

    let featureStates = {
        masterEnabled: false,
        featureNextDayAutoScanEnabled: false,
        featureToAutoScanEnabled: false 
    };
    
    let isExpectingInvalidOrderMessage = false;

    document.addEventListener('extension-settings-loaded', (event) => {
        if (event.detail) {
            featureStates = event.detail;
            document.documentElement.dataset.extensionFeatures = JSON.stringify(featureStates);
        }
    });

    const ADD_ORDER_URL_PART = '/sp-api/point/sorting/transport/order/add';
    const PRINT_TO_URL_PART = '/sp-api/point/sorting/box_to/transport_group/print';
    const SCAN_TO_URL = 'https://sp.spx.shopee.tw/sp-api/point/sorting/box_to/transport/scan';

    const INVALID_ORDER_RETCODE = 1501010;
    const SUCCESS_SOUND_URL = 'https://sp.spx.shopee.tw/static/media/success-alert.c7545e0a.mp3';
    const FAILURE_SOUND_URL = 'https://sp.spx.shopee.tw/static/media/failure-alert.3a69fd73.mp3';
    const RETRY_DELAY_MS = 10;

    const retryingShipmentIds = new Set();
    let messageTimeoutId = null;

    window.Audio = function(url) {
        if (url && typeof url === 'string' && url.includes('failure-alert')) {
            return { play: () => {} };
        }
        return new originalAudio(url);
    };

    function showCustomMessage(text, iconType) {
        let existingBox = document.getElementById('extension-custom-message');
        if(existingBox) existingBox.remove();
        if (messageTimeoutId) clearTimeout(messageTimeoutId);

        const messageBox = document.createElement('div');
        messageBox.id = 'extension-custom-message';
        
        const successIcon = `<svg viewBox="0 0 16 16" fill="#52c41a" width="24" class="ssc-message-icon" style="margin-right: 8px;"><path fill-rule="evenodd" d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.15 4.93L7.1 9.98 4.85 7.73a.5.5 0 10-.7.71l2.6 2.6c.19.2.5.2.7 0l4.4-4.4a.5.5 0 00-.7-.71z"></path></svg>`;
        const errorIcon = `<svg viewBox="0 0 16 16" fill="#f5222d" width="24" class="ssc-message-icon" style="margin-right: 8px;"><path fill-rule="evenodd" d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 6.3L5.88 5.16a.5.5 0 00-.77.64l.06.07L7.3 8l-2.12 2.12a.5.5 0 00.64.77l.07-.06L8 8.7l2.12 2.12a.5.5 0 00.77-.64l-.06-.07L8.7 8l2.12-2.12a.5.5 0 00-.64-.77l-.07.06L8 7.3 5.88 5.17 8 7.3z"></path></svg>`;
        
        messageBox.style.cssText = `top: 64px; position: fixed; z-index: 99999; left: 50%; transform: translateX(-50%); display: flex; align-items: center; padding: 8px 16px; background: #fff; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,.15); pointer-events: none; transition: opacity 0.3s, top 0.3s; opacity: 1;`;
        messageBox.innerHTML = `
            ${iconType === 'success' ? successIcon : errorIcon}
            <p class="ssc-message-content" style="font-size: 14px; margin: 0; color: #333;">${text}</p>
        `;
        document.body.appendChild(messageBox);
        
        messageTimeoutId = setTimeout(() => {
            if (messageBox) {
                 messageBox.style.opacity = '0';
                 messageBox.style.top = '44px';
                 setTimeout(() => messageBox.remove(), 300);
            }
        }, 2000);
    }
    
    function playSound(url) {
        try {
            new originalAudio(url).play();
        } catch (e) {}
    }

    const observer = new MutationObserver((mutationsList) => {
        if (!isExpectingInvalidOrderMessage) return;
        for (const mutation of mutationsList) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1 && node.classList && node.classList.contains('ssc-message') && node.textContent.includes('無效訂單')) {
                    node.style.display = 'none'; 
                    showCustomMessage("正在嘗試刷件", 'success');
                    isExpectingInvalidOrderMessage = false; 
                    return;
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    async function getFeatureStateAsync() {
        const data = document.documentElement.dataset.extensionFeatures;
        if (data) return JSON.parse(data);
        await new Promise(resolve => setTimeout(resolve, 50));
        const finalData = document.documentElement.dataset.extensionFeatures;
        return finalData ? JSON.parse(finalData) : featureStates;
    }

    async function fetchValidDrtId() {
        try {
            const checkUrl = 'https://sp.spx.shopee.tw/sp-api/point/dop/receive_task/create_check?task_type=0';
            const checkResponse = await originalFetch(checkUrl, { method: 'GET' });
            if (checkResponse.ok) {
                const checkData = await checkResponse.json();
                if (checkData.retcode === 0 && checkData.data) {
                    const taskId = checkData.data.receive_task_id || checkData.data.existed_task_id;
                    if (taskId) return taskId;
                }
            }
            const createUrl = 'https://sp.spx.shopee.tw/sp-api/point/dop/receive_task/create';
            const createResponse = await originalFetch(createUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task_type: 0 })
            });
            if (createResponse.ok) {
                const createData = await createResponse.json();
                if (createData.retcode === 0 && createData.data && createData.data.task_id) {
                    return createData.data.task_id;
                }
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    async function performFixAndRetry(originalBody) {
        let shipmentId = null;
        try {
            const requestBody = JSON.parse(originalBody);
            shipmentId = requestBody.shipment_id;
            if (!shipmentId || retryingShipmentIds.has(shipmentId)) return { success: false };
            
            retryingShipmentIds.add(shipmentId);
            const receiveTaskId = await fetchValidDrtId();
            if (!receiveTaskId) return { success: false };
            
            const receiveTaskUrl = 'https://sp.spx.shopee.tw/sp-api/point/dop/receive_task/order/add';
            const receiveTaskBody = { order_id: shipmentId, receive_task_id: receiveTaskId };
            const fixResponse = await originalFetch(receiveTaskUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(receiveTaskBody)
            });
            if (!fixResponse.ok) return { success: false };

            const completeTaskUrl = 'https://sp.spx.shopee.tw/sp-api/point/dop/receive_task/complete';
            const completeTaskBody = {
                esf_flag: false,
                receive_task_id: receiveTaskId,
                operation_info: { operation_mode: 2, operation_device: 1 }
            };
            const completeResponse = await originalFetch(completeTaskUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(completeTaskBody)
            });
            if (!completeResponse.ok) return { success: false };

            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));

            const originalUrl = 'https://sp.spx.shopee.tw' + ADD_ORDER_URL_PART;
            const retryResponse = await originalFetch(originalUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: originalBody
            });

            if (retryResponse.ok) {
                const retryResponseText = await retryResponse.text();
                const retryResponseData = JSON.parse(retryResponseText);
                
                if (retryResponseData.retcode === INVALID_ORDER_RETCODE) {
                    showCustomMessage("無效訂單", 'error');
                    playSound(FAILURE_SOUND_URL);
                    return { success: false }; 
                } else {
                    showCustomMessage("已成功自動刷件，並裝箱", 'success');
                    playSound(SUCCESS_SOUND_URL);
                    return { success: true, responseText: retryResponseText };
                }
            }
            return { success: false };
        } catch (error) {
            return { success: false };
        } finally {
            if (shipmentId) {
                retryingShipmentIds.delete(shipmentId);
            }
        }
    }

    async function performToAutoScan(responseBody) {
        try {
            const data = JSON.parse(responseBody);
            const toNumbers = data?.data?.success_list?.map(item => item.to_number).filter(Boolean);

            if (!toNumbers || toNumbers.length === 0) return;

            showCustomMessage("列印成功，並自動刷取", 'success');
            
            for (const to_number of toNumbers) {
                await originalFetch(SCAN_TO_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to_number })
                });
            }
            playSound(SUCCESS_SOUND_URL);
        } catch (e) {}
    }

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._requestMethod = method;
        this._requestUrl = url;
        return originalXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = async function(body) {
        const localStates = await getFeatureStateAsync();
        if (!localStates.masterEnabled) return originalXhrSend.apply(this, arguments);

        if (this._requestUrl && this._requestMethod.toUpperCase() === 'POST') {
            
            if (localStates.featureNextDayAutoScanEnabled && this._requestUrl.includes(ADD_ORDER_URL_PART)) {
                const originalXhr = this;
                const originalOnReadyStateChange = this.onreadystatechange;
                this.onreadystatechange = async function() {
                    if (originalXhr.readyState === 4) {
                        try {
                            const responseData = JSON.parse(originalXhr.responseText);
                            if (responseData.retcode === INVALID_ORDER_RETCODE) {
                                isExpectingInvalidOrderMessage = true;
                                const retryResult = await performFixAndRetry(body);
                                if (retryResult.success) {
                                    Object.defineProperty(originalXhr, 'responseText', { value: retryResult.responseText, writable: true });
                                    Object.defineProperty(originalXhr, 'status', { value: 200, writable: true });
                                    Object.defineProperty(originalXhr, 'statusText', { value: 'OK', writable: true });
                                }
                            }
                        } catch (e) {}
                    }
                    if (originalOnReadyStateChange) {
                        originalOnReadyStateChange.apply(originalXhr, arguments);
                    }
                };
            }
            
            if (localStates.featureToAutoScanEnabled && this._requestUrl.includes(PRINT_TO_URL_PART)) {
                const originalOnLoad = this.onload;
                this.onload = function(event) {
                    if (this.status === 200) {
                        performToAutoScan(this.responseText);
                    }
                    if (originalOnLoad) {
                        originalOnLoad.apply(this, arguments);
                    }
                };
            }
        }
        return originalXhrSend.apply(this, arguments);
    };

    window.fetch = async function(...args) {
        const [urlOrRequest, config] = args;
        const localStates = await getFeatureStateAsync();
        const isEnabled = localStates.masterEnabled;
        const url = (typeof urlOrRequest === 'string') ? urlOrRequest : urlOrRequest.url;
        const method = (config?.method || urlOrRequest?.method)?.toUpperCase();

        if (isEnabled && method === 'POST') {
            if (localStates.featureNextDayAutoScanEnabled && url.includes(ADD_ORDER_URL_PART)) {
                try {
                    const request = new Request(urlOrRequest, config);
                    const requestClone = request.clone();
                    const response = await originalFetch(request);
                    const responseClone = response.clone();
                    const responseData = await responseClone.json();
                    if (responseData.retcode === INVALID_ORDER_RETCODE) {
                        isExpectingInvalidOrderMessage = true;
                        const retryResult = await performFixAndRetry(await requestClone.text());
                        if (retryResult.success) {
                            return new Response(retryResult.responseText, { status: 200, statusText: 'OK', headers: response.headers });
                        }
                    }
                    return response;
                } catch (error) {
                    return originalFetch(urlOrRequest, config);
                }
            }
            
            if (localStates.featureToAutoScanEnabled && url.includes(PRINT_TO_URL_PART)) {
                const response = await originalFetch(urlOrRequest, config);
                if (response.ok) {
                    const clonedResponse = response.clone();
                    const responseBody = await clonedResponse.text();
                    performToAutoScan(responseBody);
                }
                return response;
            }
        }
        return originalFetch(...args);
    };
})();