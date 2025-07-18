
---
# 蝦皮自動化工具 v6.28.2

<p>
  <a href="https://chromewebstore.google.com/detail/gjlkkpgkdecjgcnekbgbcidokfcnciig">
    <img src="https://img.shields.io/chrome-web-store/v/gjlkkpgkdecjgcnekbgbcidokfcnciig.svg" alt="Chrome Web Store Version">
  </a>
  <a href="https://chromewebstore.google.com/detail/gjlkkpgkdecjgcnekbgbcidokfcnciig">
    <img src="https://img.shields.io/chrome-web-store/stars/gjlkkpgkdecjgcnekbgbcidokfcnciig.svg" alt="Chrome Web Store Stars">
  </a>
  <a href="https://chromewebstore.google.com/detail/gjlkkpgkdecjgcnekbgbcidokfcnciig">
    <img src="https://img.shields.io/chrome-web-store/users/gjlkkpgkdecjgcnekbgbcidokfcnciig.svg" alt="Chrome Web Store Users">
  </a>
  <img src="https://img.shields.io/badge/狀態-內部使用-green.svg" alt="狀態">
</p>

這是一個非官方的 Chrome 瀏覽器擴充功能，旨在自動化蝦皮內部物流平台 (`sp.spx.shopee.tw`) 的部分重複性操作，以提升工作效率。

**注意：本工具僅供蝦皮內部員工使用，請勿外流。**

## ✨ 主要功能

本工具整合了多項自動化功能，可透過彈出式選單獨立開關。

-   **ℹ️ 報到機/寄件機模式**
    -   專為門市的報到機或寄件機設計的專用模式。
    -   啟用後，會在非營業時間（晚上 10:30 至隔日早上 11:30）自動顯示「已打烊」的全螢幕畫面，防止操作。
    -   營業時間內會自動隱藏打烊畫面，恢復正常使用。
    -   為確保穩定性，啟用此模式會自動停用所有其他的自動化功能。

-   **🔀 自動叫號 (`自動叫號`)**
    -   在「寄取任務序列」頁面，自動點擊或聚焦「叫號」按鈕。
    -   可設定為「點擊」或僅「聚焦」(需手動按 Enter)。

-   **🛒 自動結帳 (`自動結帳`)**
    -   在「買家取件」頁面，當所有訂單都已備貨時，自動點擊或聚焦「完成」按鈕。

-   **🔊 TTS 語音播報 (`TTS 語音播報`)**
    -   在「寄取任務序列-->買家取件」頁面，自動朗讀關鍵資訊，減少看螢幕頻率。
    -   可獨立開關播報內容：
        -   **櫃位與末三碼**：例如「櫃位 B 2」、「末三碼 3 4 5」。
        -   **收款與找零金額**：例如「總金額 850 元」、「找 150 元」。

-   **✅ 自動完成 (`自動完成隔日`)**
    -   **自動裝箱**：在「隔日到貨&逾期逐顆裝箱」頁面，聚焦於箱號輸入框時，自動填入箱號並點擊「完成」。
    -   **一件一箱模式**：在「一件一箱」情境下，自動「完成」，實現快速連續作業。
    -   **自動開始下一筆**：完成一筆訂單後，自動導向並開始下一筆訂單的處理流程。

-   **✨ 隔日自動刷件**
    -   **自動修正「無效訂單」錯誤**：在刷入隔日件時，若系統回報「無效訂單」(retcode: 1501010)，工具會**自動攔截此錯誤**，在背景執行寄件任務修正流程，並重新嘗試一次刷件，實現無感刷入，無需手動處理。

-   **🧾 TO單自動刷取 (`TO單自動刷取`)**
    -   在「標準配送&其他離店裝箱-->列印物流單」頁面，當點擊「列印」按鈕後，工具會自動擷取新產生的 TO 單號碼。
    -   並立即「刷取」此 TO 單的動作，實現「列印即刷取」的無縫操作，省去手動掃描步驟。

-   **📄 自動刷取電子檔 (`自動刷取電子檔`)**
    -   在「賣家寄件-->開始賣家寄件」頁面，增加一個檔案上傳介面。
    -   支援多檔案、多格式批次掃描：
        -   **PDF**：自動讀取檔案中的文字與 QR Code 條碼。
        -   **HTML**：自動解析檔案內容，提取條碼。
        -   **圖片 (JPG, PNG)**：自動掃描圖片中的 QR Code。
    -   掃描成功後，會將提取到的條碼自動輸入到頁面的掃描框中。

-   **🌙 安全機制**
    -   所有功能會在每日午夜（台灣時間 00:00）自動關閉，避免因長時間掛機產生非預期問題。

## ⚙️ 自動安裝指南

本工具已上架至 Chrome 線上應用程式商店，可透過以下連結一鍵安裝：

<a href="https://chromewebstore.google.com/detail/gjlkkpgkdecjgcnekbgbcidokfcnciig" target="_blank">
  <img src="https://developer.chrome.com/static/docs/webstore/branding/image/HRs9MPufa1J1h5glNhut.png" alt="前往 Chrome 線上應用程式商店" width="200">
</a>

1.  點擊上方按鈕前往商店頁面。
2.  點擊頁面中的「**新增至 Chrome**」按鈕。
3.  安裝成功後，建議在瀏覽器右上角的擴充功能選單中將「**蝦皮自動化工具**」釘選，方便快速取用。

## ⚙️ 手動安裝指南

1.  下載本專案的所有檔案，並解壓縮至一個固定的資料夾（例如 `C:\Shopee-Automation-tool-main`）。
2.  打開 Chrome 瀏覽器，在網址列輸入 `chrome://extensions` 並按下 Enter。
3.  在頁面的右上角，打開 **「開發人員模式」** 的開關。
4.  點擊左上角的 **「載入未封裝項目」** 按鈕。
5.  在彈出的視窗中，選擇您在步驟 1 中解壓縮的資料夾。
6.  安裝成功後，您會在擴充功能列表中看到「蝦皮自動化工具」，並在瀏覽器右上角看到其圖示。

## 🚀 使用說明

1.  點擊瀏覽器右上角已釘選的擴充功能圖示，即可打開設定選單。
2.  **總開關**：最上方的「啟用所有功能」是一個總開關，可以一鍵啟用或禁用下方所有功能。
3.  **獨立開關**：每個功能都有獨立的開關，可以根據您的需求自由組合。
4.  **子選項**：部分功能（如自動叫號、TTS）有可展開的子選項，提供更細緻的設定。
5.  **情境感知**：所有功能都具備情境感知能力，只會在對應的蝦皮平台網址上才會生效。在其他網站上，本工具不會執行任何動作。

## ⚠️ 免責聲明

<details>
<summary><strong>點此展開閱讀完整的免責聲明</strong></summary>

### **蝦皮自動化工具 (v6.28.2) 免責聲明**

**重要提示：本工具僅限蝦皮 (Shopee) 內部員工基於提升工作效率之目的使用。安裝與使用本工具前，請務必詳細閱讀、理解並同意以下所有條款。**

1.  **按「原樣」提供，不作任何保證**
    本工具是為特定工作流程設計的輔助軟體，按「現狀」及「可用」的基礎提供。開發者不對其功能的完整性、準確性、穩定性、即時性或無錯誤運行提供任何明示或暗示的保證。

2.  **使用者須自行承擔全部責任**
    使用者需對透過本工具執行的所有自動化操作（包括但不限於：自動叫號、自動結帳、自動刷件、自動裝箱、TO單自動刷取等）的結果負全部責任。本工具僅為輔助性質，使用者仍有責任監督其操作過程並核對最終結果的正確性。

3.  **系統依賴與潛在風險**
    本工具的功能高度依賴於蝦皮內部平台 (`sp.spx.shopee.tw`) 的當前結構與應用程式介面 (API)。
    *   **攔截與修改行為**：本工具的部分核心功能（如「隔日自動刷件」、「TO單自動刷取」）會攔截並修改您瀏覽器與蝦皮伺服器之間的網路請求與回應，以實現自動化流程。
    *   **系統變更風險**：若蝦皮內部平台進行任何更新、改版或流程變更，可能導致本工具功能失效、產生非預期錯誤、或造成資料不一致。此類風險由使用者自行承擔。

4.  **數據與操作完整性**
    因系統變更、網路延遲、或工具本身的潛在缺陷，使用本工具可能引發操作失誤、數據錯誤等問題。對於因使用本工具而可能導致的任何直接或間接的營運損失、數據丟失或帳務問題，開發者概不負責。

5.  **非官方支援**
    本工具為非蝦皮官方發布的軟體，不受公司 IT 部門或任何官方團隊的技術支援。所有問題回報與維護皆由開發者在能力所及範圍內進行，不保證即時回應或修復。

6.  **遵守公司規範**
    使用者在使用本工具時，仍應嚴格遵守蝦皮所有的公司政策與內部作業規範。本工具旨在提升效率，不得用於任何違反公司規定的行為。

7.  **自動停用機制**
    本工具內建安全機制，將在每日午夜（台灣時間 00:00）自動禁用所有功能，以避免長時間掛機可能產生的未知問題。使用者需在次日手動重新啟用。

**一旦您點擊「新增至 Chrome」並啟用本擴充功能，即表示您已完整閱讀、充分理解並自願同意上述所有免責聲明條款，並願意自行承擔所有使用風險。**

</details>