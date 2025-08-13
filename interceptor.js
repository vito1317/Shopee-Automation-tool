(function() {
    'use strict';
    console.log('NDD: interceptor.js 已載入');

    const originalFetch = window.fetch;
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;
    const originalAudio = window.Audio;

    let featureStates = {
        masterEnabled: false,
        featureNextDayAutoScanEnabled: false,
        featureToAutoScanEnabled: false,
        featureNextDayNDDModeEnabled: false
    };
    
    let isExpectingInvalidOrderMessage = false;

    document.addEventListener('extension-settings-loaded', (event) => {
        if (event.detail) {
            console.log('NDD: interceptor 收到功能狀態更新:', event.detail);
            featureStates = event.detail;
            document.documentElement.dataset.extensionFeatures = JSON.stringify(featureStates);
        }
    });

    const ADD_ORDER_URL_PART = '/sp-api/point/sorting/transport/order/add';
    const PRINT_TO_URL_PART = '/sp-api/point/sorting/box_to/transport_group/print';
    const SCAN_TO_URL = 'https://sp.spx.shopee.tw/sp-api/point/sorting/box_to/transport/scan';
    

    const NDD_ADD_ORDER_URL = 'https://sp.spx.shopee.tw/sp-api/point/dop/seller_dropoff/ndd/order/add';
    const NDD_CREATE_TASK_URL = 'https://sp.spx.shopee.tw/sp-api/point/dop/seller_dropoff/ndd/task/create';
    const NDD_COMPLETE_TASK_URL = 'https://sp.spx.shopee.tw/sp-api/point/dop/seller_dropoff/ndd/task/complete';

    const INVALID_ORDER_RETCODE = 1501010;
    const SUCCESS_SOUND_URL = 'https://sp.spx.shopee.tw/static/media/success-alert.c7545e0a.mp3';
    const FAILURE_SOUND_URL = 'https://sp.spx.shopee.tw/static/media/failure-alert.3a69fd73.mp3';
    const RETRY_DELAY_MS = 100;

    const retryingShipmentIds = new Set();
    let messageTimeoutId = null;

    async function completeNDDTask() {
        console.log('NDD: 開始執行 task 完成流程');
        console.log('NDD: 檢查 document 對象是否存在:', typeof document !== 'undefined');
        console.log('NDD: 檢查 document.documentElement 是否存在:', typeof document.documentElement !== 'undefined');
        console.log('NDD: 檢查 dataset.nddReceiveTaskId 是否存在:', typeof document.documentElement.dataset.nddReceiveTaskId !== 'undefined');
        console.log('NDD: 檢查 dataset 的所有屬性:', Object.keys(document.documentElement.dataset || {}));
        try {

            const receiveTaskId = document.documentElement.dataset.nddReceiveTaskId;
            console.log('NDD: 從 dataset 獲取的 receive_task_id:', receiveTaskId);
            console.log('NDD: receive_task_id 的類型:', typeof receiveTaskId);
            console.log('NDD: receive_task_id 是否為空:', !receiveTaskId);
            console.log('NDD: receive_task_id 是否為空字符串:', receiveTaskId === '');
            console.log('NDD: receive_task_id 是否為 undefined:', receiveTaskId === undefined);
            console.log('NDD: receive_task_id 是否為 null:', receiveTaskId === null);
            
            if (!receiveTaskId || receiveTaskId === '' || receiveTaskId === undefined || receiveTaskId === null) {
                console.log('NDD: 沒有找到有效的 receive_task_id');
                console.log('NDD: dataset 的所有屬性:', Object.keys(document.documentElement.dataset).filter(key => key.includes('NDD')));
                return;
            }

            console.log('NDD: 準備發送 complete 請求到:', NDD_COMPLETE_TASK_URL);
            console.log('NDD: 請求數據:', { receive_task_id: receiveTaskId, options: {} });

            const completeResponse = await originalFetch(NDD_COMPLETE_TASK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receive_task_id: receiveTaskId,
                    options: {}
                })
            });

            console.log('NDD: complete 請求響應狀態:', completeResponse.status);
            console.log('NDD: complete 請求響應 ok:', completeResponse.ok);

            if (completeResponse.ok) {
                const completeData = await completeResponse.json();
                console.log('NDD: complete 請求響應數據:', completeData);
                if (completeData.retcode === 0) {
                    console.log('NDD: Task 完成成功', receiveTaskId);

                    if (typeof document !== 'undefined' && document.documentElement) {
                        document.documentElement.dataset.nddReceiveTaskId = '';
                        console.log('NDD: 已清空 dataset.nddReceiveTaskId');
                    }
                } else {
                    console.log('NDD: Task 完成失敗', completeData);
                }
            } else {
                console.log('NDD: Task 完成請求失敗', completeResponse.status);
                const errorText = await completeResponse.text();
                console.log('NDD: 錯誤響應內容:', errorText);
            }
        } catch (error) {
            console.error('NDD: Task 完成時發生錯誤', error);
        }
    }

    document.addEventListener('ndd-complete-task', (event) => {
        console.log('NDD: 收到 complete task 事件');
        completeNDDTask();
    });

    window.Audio = function(url) {
        if (url && typeof url === 'string' && url.includes('failure-alert')) {
            return { play: () => {} };
        }
        return new originalAudio(url);
    };

    function showCustomMessage(text, iconType) {
        if (messageTimeoutId) clearTimeout(messageTimeoutId);

        let messageBox = document.querySelector('.ssc-message:not([style*="display: none"])');
        
        if (!messageBox) {
            messageBox = document.createElement('div');
            messageBox.id = 'extension-custom-message';
            document.body.appendChild(messageBox);
        }
        
        const successIcon = `<svg viewBox="0 0 16 16" fill="#52c41a" width="24" class="ssc-message-icon" style="margin-right: 8px;"><path fill-rule="evenodd" d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.15 4.93L7.1 9.98 4.85 7.73a.5.5 0 10-.7.71l2.6 2.6c.19.2.5.2.7 0l4.4-4.4a.5.5 0 00-.7-.71z"></path></svg>`;
        const errorIcon = `<svg viewBox="0 0 16 16" fill="#f5222d" width="24" class="ssc-message-icon" style="margin-right: 8px;"><path fill-rule="evenodd" d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 6.3L5.88 5.16a.5.5 0 00-.77.64l.06.07L7.3 8l-2.12 2.12a.5.5 0 00.64.77l.07-.06L8 8.7l2.12 2.12a.5.5 0 00.77-.64l-.06-.07L8.7 8l2.12-2.12a.5.5 0 00-.64-.77l-.07.06L8 7.3 5.88 5.17 8 7.3z"></path></svg>`;
        
        messageBox.className = 'ssc-message';
        messageBox.style.cssText = `top: 64px; position: fixed; z-index: 99999; left: 50%; transform: translateX(-50%); display: flex; align-items: center; padding: 8px 16px; background: #fff; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,.15);`;
        
        messageBox.innerHTML = `
            ${iconType === 'success' ? successIcon : errorIcon}
            <p class="ssc-message-content" style="font-size: 14px; margin: 0; color: #333;">${text}</p>
        `;
        
        if (iconType === 'success') {
            playSound(SUCCESS_SOUND_URL);
        } else if (iconType === 'error') {
            playSound(FAILURE_SOUND_URL);
        }
        
        messageTimeoutId = setTimeout(() => {
            if (messageBox) {
                 messageBox.style.display = 'none';
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

    async function fetchValidNDDTaskId() {
        try {
            console.log('NDD: 正在創建新的 task...');
            console.log('NDD: 使用 URL:', NDD_CREATE_TASK_URL);
            const createResponse = await originalFetch(NDD_CREATE_TASK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            console.log('NDD: create API 回應狀態:', createResponse.status);
            if (createResponse.ok) {
                const createData = await createResponse.json();
                console.log('NDD: create API 回應數據:', createData);
                if (createData.retcode === 0 && createData.data && createData.data.receive_task_id) {
                    console.log('NDD: 成功創建 task_id:', createData.data.receive_task_id);
                    return createData.data.receive_task_id;
                } else {
                    console.log('NDD: create API 回應格式錯誤或失敗');
                    console.log('NDD: retcode:', createData.retcode);
                    console.log('NDD: data:', createData.data);
                }
            } else {
                console.log('NDD: create API 請求失敗');
                const errorText = await createResponse.text();
                console.log('NDD: 錯誤回應內容:', errorText);
            }
            return null;
        } catch (error) {
            console.error('NDD: fetchValidNDDTaskId 發生錯誤:', error);
            return null;
        }
    }

    async function performNDDFixAndRetry(originalBody) {
        console.log('NDD: 開始執行 NDD 修復和重試');
        console.log('NDD: 原始請求體:', originalBody);
        console.log('NDD: 檢查是否應該創建新的 task');
        console.log('NDD: 當前 dataset 狀態:', Object.keys(document.documentElement.dataset || {}));
        console.log('NDD: dataset.nddReceiveTaskId 當前值:', document.documentElement.dataset.nddReceiveTaskId);
        
        let shipmentId = null;
        try {
            const requestBody = JSON.parse(originalBody);
            console.log('NDD: 解析後的請求體:', requestBody);
            shipmentId = requestBody.shipment_id;
            console.log('NDD: 解析到的 shipment_id:', shipmentId);
            console.log('NDD: shipment_id 是否為空:', !shipmentId);
            console.log('NDD: shipment_id 是否已在重試中:', retryingShipmentIds.has(shipmentId));
            console.log('NDD: 當前重試中的 shipment_ids:', Array.from(retryingShipmentIds));
            if (!shipmentId) {
                console.log('NDD: shipment_id 無效，返回失敗');
                return { success: false };
            }
            if (retryingShipmentIds.has(shipmentId)) {
                console.log('NDD: shipment_id 已在重試中，清除並繼續');
                retryingShipmentIds.delete(shipmentId);
            }
            
            const firstRetryResult = await performSingleNDDFixAttempt(originalBody, shipmentId);
            if (firstRetryResult.success) {
                return firstRetryResult;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            showCustomMessage("第一次NDD修復失敗，正在進行第二次嘗試...", 'success');
            
            const secondRetryResult = await performSingleNDDFixAttempt(originalBody, shipmentId);
            return secondRetryResult;
            
        } catch (error) {
            return { success: false };
        }
    }

    async function performSingleNDDFixAttempt(originalBody, shipmentId) {
        console.log('NDD: 開始執行單次修復嘗試，shipment_id:', shipmentId);

        let receiveTaskId = null;
        console.log('NDD: 檢查現有的 task_id 在 dataset 中');
        console.log('NDD: document 對象是否存在:', typeof document !== 'undefined');
        console.log('NDD: document.documentElement 是否存在:', typeof document.documentElement !== 'undefined');
        console.log('NDD: dataset 對象是否存在:', typeof document.documentElement.dataset !== 'undefined');
        
        if (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset.nddReceiveTaskId && document.documentElement.dataset.nddReceiveTaskId.trim() !== '') {
            receiveTaskId = document.documentElement.dataset.nddReceiveTaskId;
            console.log('NDD: 使用現有的 task_id:', receiveTaskId);
        } else {
            console.log('NDD: 沒有現有的 task_id，準備創建新的');
            console.log('NDD: dataset.nddReceiveTaskId 的值:', document.documentElement.dataset.nddReceiveTaskId);
            console.log('NDD: dataset 的所有屬性:', Object.keys(document.documentElement.dataset || {}));
            console.log('NDD: 開始調用 fetchValidNDDTaskId()');

            receiveTaskId = await fetchValidNDDTaskId();
            console.log('NDD: fetchValidNDDTaskId() 返回結果:', receiveTaskId);
            
            if (!receiveTaskId) {
                console.log('NDD: 創建 task_id 失敗，返回失敗');
                return { success: false };
            }
            
            console.log('NDD: 成功獲取到新的 task_id:', receiveTaskId);
        }
        
        const addOrderBody = {
            receive_task_id: receiveTaskId,
            shipment_id: shipmentId,
            scene: "forward_dropoff"
        };
        
        console.log('NDD: 發送 add order 請求，數據:', addOrderBody);
        
        const addResponse = await originalFetch(NDD_ADD_ORDER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(addOrderBody)
        });
        if (!addResponse.ok) return { success: false };


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
                return { success: false }; 
            } else {
                setTimeout(() => {
                    const successBox = document.querySelector('.ssc-message.ssc-message-success:not([style*="display: none"])');
                    showCustomMessage(successBox ? "已成功自動刷件，並裝箱(NDD模式)" : "已自動刷件(NDD模式)", 'success');
                }, 50);

                console.log('NDD: 準備存儲 receive_task_id 到 dataset');
                console.log('NDD: receive_task_id 值:', receiveTaskId);
                console.log('NDD: document 對象是否存在:', typeof document !== 'undefined');
                console.log('NDD: document.documentElement 是否存在:', typeof document.documentElement !== 'undefined');
                console.log('NDD: 存儲前 dataset 的所有屬性:', Object.keys(document.documentElement.dataset || {}));
                
                if (typeof document !== 'undefined' && document.documentElement) {
                    document.documentElement.dataset.nddReceiveTaskId = receiveTaskId;
                    console.log('NDD: 已將 receive_task_id 存儲到 dataset:', receiveTaskId);
                    console.log('NDD: 確認 dataset.nddReceiveTaskId 已設置:', document.documentElement.dataset.nddReceiveTaskId);
                    console.log('NDD: 存儲後 dataset 的所有屬性:', Object.keys(document.documentElement.dataset));
                    console.log('NDD: 存儲後 dataset 的 NDD 相關屬性:', Object.keys(document.documentElement.dataset).filter(key => key.includes('NDD')));
                } else {
                    console.log('NDD: document 對象不可用，無法存儲 receive_task_id');
                }
                return { success: true, responseText: retryResponseText, receiveTaskId };
            }
        }
        return { success: false };
    }

    async function performSingleFixAttempt(originalBody, shipmentId) {
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
                    return { success: false }; 
                } else {
                    setTimeout(() => {
                        const successBox = document.querySelector('.ssc-message.ssc-message-success:not([style*="display: none"])');
                        showCustomMessage(successBox ? "已成功自動刷件，並裝箱" : "已自動刷件", 'success');
                    }, 50);
                    return { success: true, responseText: retryResponseText };
                }
            }
            return { success: false };
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
        } catch (e) {}
    }

    async function performFixAndRetry(originalBody) {
        let shipmentId = null;
        try {
            const requestBody = JSON.parse(originalBody);
            shipmentId = requestBody.shipment_id;
            if (!shipmentId || retryingShipmentIds.has(shipmentId)) return { success: false };
            
            retryingShipmentIds.add(shipmentId);
            
            const localStates = await getFeatureStateAsync();
            console.log('NDD: 當前功能狀態:', localStates);
            let retryResult;
            
            if (localStates.featureNextDayNDDModeEnabled) {
                console.log('NDD: 檢測到 NDD 模式已啟用，使用 NDD 修復邏輯');

                retryResult = await performNDDFixAndRetry(originalBody);
            } else {
                console.log('NDD: NDD 模式未啟用，使用原始修復邏輯');

                const firstRetryResult = await performSingleFixAttempt(originalBody, shipmentId);
                if (firstRetryResult.success) {
                    return firstRetryResult;
                }
                

                await new Promise(resolve => setTimeout(resolve, 1000));
                showCustomMessage("第一次修復失敗，正在進行第二次嘗試...", 'success');
                
                retryResult = await performSingleFixAttempt(originalBody, shipmentId);
            }
            
            return retryResult;
            
        } catch (error) {
            return { success: false };
        } finally {
            if (shipmentId) {
                console.log('NDD: 清理 retryingShipmentIds，移除:', shipmentId);
                retryingShipmentIds.delete(shipmentId);
                console.log('NDD: 清理後 retryingShipmentIds:', Array.from(retryingShipmentIds));
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
        if (!localStates.masterEnabled) return originalXhrSend.apply(this, arguments);

        if (this._requestUrl && this._requestMethod.toUpperCase() === 'POST') {
            
            if (localStates.featureNextDayAutoScanEnabled && this._requestUrl.includes(ADD_ORDER_URL_PART)) {
                console.log('NDD: XHR 攔截到 ADD_ORDER 請求');
                const originalXhr = this;
                const originalOnReadyStateChange = this.onreadystatechange;
                this.onreadystatechange = async function() {
                    if (originalXhr.readyState === 4) {
                        try {
                            const responseData = JSON.parse(originalXhr.responseText);
                            console.log('NDD: XHR 回應數據:', responseData);
                            if (responseData.retcode === INVALID_ORDER_RETCODE) {
                                console.log('NDD: 檢測到無效訂單錯誤，開始重試');
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
                console.log('NDD: Fetch 攔截到 ADD_ORDER 請求');
                try {
                    const request = new Request(urlOrRequest, config);
                    const requestClone = request.clone();
                    const response = await originalFetch(request);
                    const responseClone = response.clone();
                    const responseData = await responseClone.json();
                    console.log('NDD: Fetch 回應數據:', responseData);
                    if (responseData.retcode === INVALID_ORDER_RETCODE) {
                        console.log('NDD: Fetch 檢測到無效訂單錯誤，開始重試');
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