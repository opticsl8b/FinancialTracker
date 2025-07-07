# 專案進度備忘錄

**日期：2025年7月7日**

## 一、目前為止的進度總覽

我們正在開發一個 MVP (最小可行產品) 階段的「財務及交易追蹤 App」後端。核心目標是作為一個一站式平台，幫助用戶整合並即時追蹤分散在不同法幣帳戶和區塊鏈交易所的資產，並提供清晰的匯率換算和交易分析。

目前，我們已成功建立了數據獲取的核心骨架，並確保了多個關鍵外部數據來源的穩定性。

## 二、已完成的 TASK 列表

以下是我們針對 MVP 階段「數據輸入與同步」功能，目前為止已成功完成並驗證的任務：

1.  **後端基礎架構搭建：**
    * Node.js 環境、Express.js 伺服器、PostgreSQL 資料庫、Sequelize (ORM) 基礎設定。
    * `User`、`Account`、`CryptoAsset`、`Transaction` 等資料模型定義與基礎 CRUD API 端點 (理論上已建立)。
    * `services/ExchangeRateService.js` 和 `services/CryptoExchangeService.js` 服務檔案的建立與模組化。

2.  **法幣帳戶數據（手動輸入）：**
    * App 設計上已定義為允許用戶手動輸入交易日誌和餘額，這屬於後續 UI 和資料庫持久化的範疇。

3.  **區塊鏈交易所資產同步 (API 優先)：**
    * **整合幣安 (Binance) 資產：**
        * 成功透過 `ccxt` API 獲取**幣安現貨 (Spot) 錢包餘額**。
        * 成功透過 `ccxt` `sapiGetSimpleEarnFlexiblePosition()` 和 `sapiGetSimpleEarnLockedPosition()` API 獲取**幣安理財 (Earn) 產品（活期與定期）的持倉數據**。
        * 實現了將**幣安現貨與理財資產數據合併匯總**到單一總覽的功能。

4.  **即時匯率獲取：**
    * **獲取台灣銀行 (TWD/AUD) 即時現金匯率：**
        * 成功開發網頁爬蟲，精確地從台灣銀行網站 `https://rate.bot.com.tw/xrt?Lang=zh-TW` 擷取澳幣現金買入/賣出匯率。
        * 處理了網頁結構變動的選擇器問題，使其更為穩健。
    * **獲取 Bitopro 即時 TWD/USDT 匯率：**
        * 成功透過 Bitopro 公共 API (`https://api.bitopro.com/v3/tickers/USDT_TWD`) 獲取 TWD/USDT 即時最新成交價。
        * 解決了交易對格式不正確的問題 (確認為 `USDT_TWD`)。
    * **獲取 MAX 交易所即時 TWD/USDT 匯率：**
        * 成功透過 MAX 交易所公共 API (`https://max-api.maicoin.com/api/v2/tickers/usdttwd`) 獲取 TWD/USDT 即時最新成交價。
        * 解決了交易對格式不正確的問題 (確認為 `usdttwd`)。
    * **獲取多種加密貨幣即時市場價格：**
        * 成功透過 CoinGecko 公共 API (`https://api.coingecko.com/api/v3/simple/price`) 獲取 BTC, ETH, BNB, SOL, DOGE, ADA, SUI, PEPE, APT, VIRTUAL (Virtual Protocol) 等幣種的 USD/TWD/USDT 即時價格。
        * 解決了 CoinGecko ID 映射和移除模擬數據的問題，確保數據真實性。

5.  **核心檔案與架構：**
    * 確認並優化了 `server.js` 和 `services/ExchangeRateService.js` 的檔案內容，使其符合模組化和功能性需求。
    * 排查並解決了 `server.js` 語法錯誤及檔案路徑混淆的問題，確保伺服器正常啟動。

## 三、接下來的規劃 (下一步)

既然所有核心數據來源的獲取都已穩定，我們下一步的重點將是把這些數據**實際應用起來並持久化**。以下是建議的優先級和實作方向：

1.  **資料庫持久化：儲存即時資產與匯率數據 (優先)**
    * **目標：** 將 `fetchAndProcessLatestData()` 抓取到的**所有即時數據（包括整合後的 Binance 資產、CoinGecko 價格、各種匯率）**，持久化儲存到 PostgreSQL 資料庫中。
    * **實作：** 修改 `server.js` 中的 `fetchAndProcessLatestData` 函式，在獲取數據後，呼叫對應的 Sequelize 模型（例如 `CryptoAsset`, `ExchangeRate` 等）來更新或建立記錄。為每種匯率建立或更新 `ExchangeRate` 記錄。
    * **好處：** 建立歷史數據的基礎，為後續的資產變化線型圖和交易分析提供數據源。

2.  **用戶管理與數據歸屬：**
    * **目標：** 實現基本的用戶註冊/登入功能，並將每個用戶的交易所 API Key 和其抓取到的資產數據、手動輸入的法幣數據、交易記錄等與該用戶綁定。
    * **實作：** 實作 `User` 模型的註冊和登入 API 端點。引入 JWT (JSON Web Tokens) 進行用戶身份驗證。修改數據抓取邏輯，使其能夠根據用戶 ID 循環抓取和儲存數據。
    * **好處：** 將 App 從單一測試環境轉變為多用戶可用，實現數據隔離與個性化追蹤。

3.  **核心 API 端點設計：提供數據給前端**
    * **目標：** 建立後端 API 端點，讓未來的前端應用程式可以請求並顯示整合後的資產和匯率數據。
    * **實作：** 設計 `/api/assets` 允許前端獲取某用戶的所有加密貨幣和法幣資產列表。設計 `/api/rates` 允許前端獲取當前所有匯率。這些 API 端點將從資料庫中讀取已持久化的最新數據。
    * **好處：** 為前端開發者提供清晰的數據介面，加速前端開發進度。
    