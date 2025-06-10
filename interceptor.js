(function() {
    'use strict';

    const originalFetch = window.fetch;
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;
    const originalAudio = window.Audio;

    let featureStates = {
        masterEnabled: false,
        featureNextDayAutoScanEnabled: false
    };
    
    let isExpectingInvalidOrderMessage = false;
    let isExpectingSuccessMessage = false;

    document.addEventListener('extension-settings-loaded', (event) => {
        if (event.detail) {
            featureStates = event.detail;
            document.documentElement.dataset.extensionFeatures = JSON.stringify(featureStates);
        }
    });

    const TARGET_URL_PART = '/sp-api/point/sorting/transport/order/add';
    const INVALID_ORDER_RETCODE = 1501010;
    const SUCCESS_SOUND_URL = 'https://sp.spx.shopee.tw/static/media/success-alert.c7545e0a.mp3';
    const FAILURE_SOUND_URL = 'https://sp.spx.shopee.tw/static/media/failure-alert.3a69fd73.mp3';
    const RETRY_DELAY_MS = 1;

    const retryingShipmentIds = new Set();
    let messageTimeoutId = null;

    window.Audio = function(url) {
        if (url && typeof url === 'string' && url.includes('failure-alert')) {
            return { play: () => {} };
        }
        return new originalAudio(url);
    };

    function modifyMessage(targetBox, text, iconType) {
        if (!targetBox) return;
        if (messageTimeoutId) clearTimeout(messageTimeoutId);

        const successIcon = `<svg viewBox="0 0 16 16" fill="#52c41a" width="24" class="ssc-message-icon" style="margin-right: 8px;"><path fill-rule="evenodd" d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.15 4.93L7.1 9.98 4.85 7.73a.5.5 0 10-.7.71l2.6 2.6c.19.2.5.2.7 0l4.4-4.4a.5.5 0 00-.7-.71z"></path></svg>`;
        const errorIcon = `<svg viewBox="0 0 16 16" fill="#f5222d" width="24" class="ssc-message-icon" style="margin-right: 8px;"><path fill-rule="evenodd" d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 6.3L5.88 5.16a.5.5 0 00-.77.64l.06.07L7.3 8l-2.12 2.12a.5.5 0 00.64.77l.07-.06L8 8.7l2.12 2.12a.5.5 0 00.77-.64l-.06-.07L8.7 8l2.12-2.12a.5.5 0 00-.64-.77l-.07.06L8 7.3 5.88 5.17 8 7.3z"></path></svg>`;
        
        targetBox.style.display = 'flex';
        targetBox.innerHTML = `
            ${iconType === 'success' ? successIcon : errorIcon}
            <p class="ssc-message-content" style="font-size: 14px; margin: 0; color: #333;">${text}</p>
        `;

        messageTimeoutId = setTimeout(() => {
            if (targetBox) {
                targetBox.style.display = 'none';
            }
        }, 1500);
    }
    
    function playSound(url) {
        try {
            new originalAudio(url).play();
        } catch (e) {}
    }

    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1 && node.classList && node.classList.contains('ssc-message')) {
                    if (isExpectingInvalidOrderMessage && node.textContent == '無效訂單') {
                        isExpectingInvalidOrderMessage = false;
                        modifyMessage(node, "正在嘗試刷件", 'success');
                        return;
                    }
                    if (isExpectingSuccessMessage && node.textContent.includes('成功')) {
                        isExpectingSuccessMessage = false;
                        modifyMessage(node, "已成功自動刷件，並裝箱", 'success');
                        playSound(SUCCESS_SOUND_URL);
                        return;
                    }
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

            if (!shipmentId || retryingShipmentIds.has(shipmentId)) {
                return { success: false };
            }
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

            const originalUrl = 'https://sp.spx.shopee.tw' + TARGET_URL_PART;
            const retryResponse = await originalFetch(originalUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: originalBody
            });

            if (retryResponse.ok) {
                const retryResponseText = await retryResponse.text();
                const retryResponseData = JSON.parse(retryResponseText);
                
                if (retryResponseData.retcode === INVALID_ORDER_RETCODE) {
                    const messageBox = Array.from(document.querySelectorAll('.ssc-message')).find(m => m.textContent.includes('正在嘗試刷件'));
                    modifyMessage(messageBox, "無效訂單", 'error');
                    playSound(FAILURE_SOUND_URL);
                    return { success: false }; 
                } else {
                    isExpectingSuccessMessage = true;
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

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._requestMethod = method;
        this._requestUrl = url;
        return originalXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = async function(body) {
        const localStates = await getFeatureStateAsync();
        const isEnabled = localStates.masterEnabled && localStates.featureNextDayAutoScanEnabled;

        if (isEnabled && this._requestUrl && this._requestUrl.includes(TARGET_URL_PART) && this._requestMethod.toUpperCase() === 'POST') {
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
                    return originalOnReadyStateChange.apply(originalXhr, arguments);
                }
            };
        }
        return originalXhrSend.apply(this, arguments);
    };

    window.fetch = async function(...args) {
        const [urlOrRequest, config] = args;
        const localStates = await getFeatureStateAsync();
        const isEnabled = localStates.masterEnabled && localStates.featureNextDayAutoScanEnabled;
        const url = (typeof urlOrRequest === 'string') ? urlOrRequest : urlOrRequest.url;
        const method = (config?.method || urlOrRequest?.method)?.toUpperCase();

        if (isEnabled && url.includes(TARGET_URL_PART) && method === 'POST') {
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
                        return new Response(retryResult.responseText, {
                            status: 200,
                            statusText: 'OK',
                            headers: response.headers
                        });
                    }
                }
                return response;
            } catch (error) {
                return originalFetch(urlOrRequest, config);
            }
        }
        return originalFetch(...args);
    };
})();