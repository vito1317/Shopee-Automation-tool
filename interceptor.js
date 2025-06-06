(function() {
    'use strict';

    let featureStates = {
        masterEnabled: false,
        featureNextDayAutoScanEnabled: false
    };

    document.addEventListener('extension-settings-loaded', (event) => {
        if (event.detail) {
            featureStates = event.detail;
        }
    });

    const TARGET_URL_PART = '/sp-api/point/sorting/transport/order/add';
    const INVALID_ORDER_RETCODE = 1501010;

    const retryingShipmentIds = new Set();

    function generateRandomDrtId() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateString = `${year}${month}${day}`;
        const randomDigit = Math.floor(Math.random() * 10);
        let randomChars = '';
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let i = 0; i < 4; i++) {
            randomChars += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        }
        return `DRT${dateString}${randomDigit}${randomChars}`;
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

            const receiveTaskId = generateRandomDrtId();
            
            const receiveTaskUrl = 'https://sp.spx.shopee.tw/sp-api/point/dop/receive_task/order/add';
            const receiveTaskBody = { order_id: shipmentId, receive_task_id: receiveTaskId };
            const fixResponse = await fetch(receiveTaskUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(receiveTaskBody)
            });

            if (!fixResponse.ok) {
                 return { success: false };
            }

            const originalUrl = 'https://sp.spx.shopee.tw' + TARGET_URL_PART;
            const retryResponse = await fetch(originalUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: originalBody
            });

            if (retryResponse.ok) {
                const retryResponseText = await retryResponse.text();
                return { success: true, responseText: retryResponseText };
            } else {
                return { success: false };
            }
        } catch (error) {
            console.error('[Interceptor] Error during performFixAndRetry:', error);
            return { success: false };
        } finally {
            if (shipmentId) {
                retryingShipmentIds.delete(shipmentId);
            }
        }
    }

    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._requestMethod = method;
        this._requestUrl = url;
        return originalXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        const isEnabled = featureStates.masterEnabled && featureStates.featureNextDayAutoScanEnabled;
        if (isEnabled && this._requestUrl && this._requestUrl.includes(TARGET_URL_PART) && this._requestMethod.toUpperCase() === 'POST') {
            const originalXhr = this;
            const originalOnReadyStateChange = this.onreadystatechange;
            this.onreadystatechange = async function() {
                if (originalXhr.readyState === 4) {
                    try {
                        const responseData = JSON.parse(originalXhr.responseText);
                        if (responseData.retcode === INVALID_ORDER_RETCODE) {
                            const retryResult = await performFixAndRetry(body);
                            if (retryResult.success) {
                                Object.defineProperty(originalXhr, 'responseText', { value: retryResult.responseText, writable: true });
                                Object.defineProperty(originalXhr, 'status', { value: 200, writable: true });
                                Object.defineProperty(originalXhr, 'statusText', { value: 'OK', writable: true });
                            }
                        }
                    } catch (e) {
                    }
                }
                if (originalOnReadyStateChange) {
                    return originalOnReadyStateChange.apply(originalXhr, arguments);
                }
            };
        }
        return originalXhrSend.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [urlOrRequest, config] = args;
        const isEnabled = featureStates.masterEnabled && featureStates.featureNextDayAutoScanEnabled;
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