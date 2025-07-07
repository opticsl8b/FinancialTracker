// server.js

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { Sequelize, DataTypes } = require('sequelize'); // 引入 Sequelize 和 DataTypes
const app = express();
const PORT = process.env.PORT || 3000;

// Import services
const ExchangeRateService = require('./services/ExchangeRateService');
const CryptoExchangeService = require('./services/CryptoExchangeService');
const { updateExchangeRatesToSheet } = require('./services/GoogleSheetService'); // 引入 GoogleSheetService

app.use(express.json());

// --- Sequelize 資料庫設定與模型定義 ---
// 從環境變數中獲取資料庫配置
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_NAME = process.env.DB_NAME;

// 構建 DATABASE_URL
const DATABASE_URL = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: false, // 設置為 true 可以看到 Sequelize 生成的 SQL 語句
    dialectOptions: {
        ssl: process.env.DB_SSL === 'true' ? {
            require: true,
            rejectUnauthorized: false // Heroku Postgres usually requires this
        } : false
    }
});

// 載入模型
const CryptoAsset = require('./models/CryptoAsset')(sequelize);
const ExchangeRate = require('./models/ExchangeRate')(sequelize);
const CryptoAssetPrice = require('./models/CryptoAssetPrice')(sequelize);

// 定義模型之間的關聯 (如果有的話，目前沒有明確要求，但未來可能會需要)
// 例如：User.hasMany(CryptoAsset); CryptoAsset.belongsTo(User);

// 測試資料庫連線並同步模型
async function connectDB() {
    try {
        await sequelize.authenticate();
        console.log('Database connection has been established successfully.');
        await sequelize.sync({ alter: true }); // { alter: true } 會根據模型定義更新表結構，不會刪除現有數據
        console.log('All models were synchronized successfully.');
    } catch (error) {
        console.error('Unable to connect to the database or synchronize models:', error);
        process.exit(1); // 連線失敗則退出應用程式
    }
}
// --- Sequelize 設定結束 ---


// Basic API routes (placeholders for now, actual implementation in future)
app.get('/', (req, res) => {
    res.send('Financial Tracker Backend is running!');
});

// ... (existing CRUD API endpoints for User, Account, CryptoAsset, Transaction models would be here) ...
// For MVP, these routes might just be stubs or directly interact with simplified in-memory data for testing,
// before full PostgreSQL integration for all data types.

// Scheduled data fetching function
async function fetchAndProcessLatestData() {
    console.log(`[${new Date().toISOString()}] Fetching and processing latest data...`);

    try {
        // 1. Fetch Exchange Rates and Crypto Prices

        // 获取 TWD/AUD 现金汇率 (从台湾银行网站爬取)
        const twdAudRate = await ExchangeRateService.getTwdAudExchangeRate();
        console.log('TWD/AUD Exchange Rate:', twdAudRate);

        // 获取 TWD/USDT 汇率 (从 Bitopro 和 MAX API 获取)
        const twdUsdtRates = await ExchangeRateService.getTwdUsdtExchangeRate();
        console.log('TWD/USDT Exchange Rates (Bitopro & MAX):', twdUsdtRates);

        // 获取加密貨幣的真實市場價格 (從 CoinGecko API 獲取)
        const cryptoPrices = await ExchangeRateService.getCryptoPrices([
            'BTC', 'ETH', 'BNB', 'SOL', 'DOGE', 'ADA', 'SUI', 'PEPE', 'APT', 'VIRTUAL'
        ]);
        // !!! 請特別注意這裡的輸出，這是診斷問題的關鍵 !!!
        console.log('Crypto Prices:', cryptoPrices);


        // --- 將匯率數據持久化到資料庫 ---
        const now = new Date();

        if (twdAudRate && twdAudRate.buy && twdAudRate.sell) {
            await ExchangeRate.upsert({
                currencyPair: 'TWD/AUD',
                source: 'BankOfTaiwan',
                buyRate: parseFloat(twdAudRate.buy),
                sellRate: parseFloat(twdAudRate.sell),
                timestamp: now
            });
            console.log('Persisted Bank of Taiwan TWD/AUD rates.');
        }

        if (twdUsdtRates && twdUsdtRates.bitopro) {
            await ExchangeRate.upsert({
                currencyPair: 'TWD/USDT',
                source: 'Bitopro',
                rate: parseFloat(twdUsdtRates.bitopro),
                timestamp: now
            });
            console.log('Persisted Bitopro TWD/USDT rate.');
        }

        if (twdUsdtRates && twdUsdtRates.max) {
            await ExchangeRate.upsert({
                currencyPair: 'TWD/USDT',
                source: 'MAX',
                rate: parseFloat(twdUsdtRates.max),
                timestamp: now
            });
            console.log('Persisted MAX TWD/USDT rate.');
        }

        for (const symbol of ['BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'SUI', 'PEPE', 'APT', 'VIRTUAL']) {
            // 這裡的判斷條件是檢查 cryptoPrices 物件中是否存在該大寫符號的鍵
            if (cryptoPrices[symbol]) {
                const priceData = cryptoPrices[symbol]; // 直接使用大寫符號作為鍵
                await CryptoAssetPrice.upsert({
                    coinSymbol: symbol,
                    usdPrice: priceData.usd ? parseFloat(priceData.usd) : null,
                    twdPrice: priceData.twd ? parseFloat(priceData.twd) : null,
                    usdtPrice: priceData.usdt ? parseFloat(priceData.usdt) : null,
                    timestamp: now
                });
                console.log(`Persisted ${symbol} crypto prices.`);
            } else {
                console.warn(`[${new Date().toISOString()}] No price data available for persistence for ${symbol}.`);
            }
        }
        console.log('Exchange rate and crypto price data persistence complete.');
        // --- 匯率數據持久化結束 ---


        // --- 更新 Google Sheet ---
        // 請替換為你的 Google Sheet ID 和你想要寫入的範圍
        const SPREADSHEET_ID = '155Gpp45j-Xv9Vw4PTn9SJtYcblYgQAGFWp7tI16k3u8'; // <--- !!! 替換為你的 Google Sheet ID !!!
        const SHEET_RANGE = '報價機!A1'; // 你想要寫入數據的起始儲存格，例如 'Sheet1!A1'

        const sheetData = [
            ['數據更新時間', new Date().toLocaleString()],
            ['台灣銀行 TWD/AUD 買入', twdAudRate ? twdAudRate.buy : 'N/A'],
            ['台灣銀行 TWD/AUD 賣出', twdAudRate ? twdAudRate.sell : 'N/A'],
            ['Bitopro TWD/USDT', twdUsdtRates && twdUsdtRates.bitopro ? twdUsdtRates.bitopro : 'N/A'],
            ['MAX TWD/USDT', twdUsdtRates && twdUsdtRates.max ? twdUsdtRates.max : 'N/A'],
            // --- 這裡使用大寫符號來訪問 cryptoPrices 物件 ---
            ['BTC/USD', cryptoPrices && cryptoPrices.BTC ? cryptoPrices.BTC.usd : 'N/A'],
            ['ETH/USD', cryptoPrices && cryptoPrices.ETH ? cryptoPrices.ETH.usd : 'N/A'],
            ['SOL/USD', cryptoPrices && cryptoPrices.SOL ? cryptoPrices.SOL.usd : 'N/A'],
            ['DOGE/USD', cryptoPrices && cryptoPrices.DOGE ? cryptoPrices.DOGE.usd : 'N/A'],
            // 如果你還需要其他幣種，例如 BNB/USD:
            // ['BNB/USD', cryptoPrices && cryptoPrices.BNB ? cryptoPrices.BNB.usd : 'N/A'],
            // --- 修改結束 ---
        ];

        await updateExchangeRatesToSheet(SPREADSHEET_ID, SHEET_RANGE, sheetData);
        console.log('Google Sheet updated successfully.');
        // --- Google Sheet 更新結束 ---


        // 2. Process Binance Assets
        let binanceClient;
        try {
            binanceClient = await CryptoExchangeService.getExchangeClient(
                'binance',
                process.env.BINANCE_API_KEY,
                process.env.BINANCE_SECRET
            );
        } catch (error) {
            console.error('Failed to initialize Binance client, skipping Binance data fetch:', error.message);
            binanceClient = null; // Set to null to indicate failure for subsequent steps
        }

        const allBinanceAssets = {}; // Initialize here so it's always available

        if (binanceClient) { // Only proceed if client was successfully initialized
            // Fetch Binance Spot Holdings
            const spotHoldings = await CryptoExchangeService.getBinanceSpotHoldings(binanceClient);
            console.log('Binance Spot Holdings:', spotHoldings);

            // Fetch Flexible Earn Holdings
            const flexibleEarnHoldings = await CryptoExchangeService.getBinanceEarnFlexibleHoldings(binanceClient);
            console.log('Binance Flexible Earn Holdings:', Object.fromEntries(flexibleEarnHoldings));

            // Fetch Locked Earn Holdings
            const lockedEarnHoldings = await CryptoExchangeService.getBinanceEarnLockedHoldings(binanceClient);
            console.log('Binance Locked Earn Holdings:', Object.fromEntries(lockedEarnHoldings));

            // Consolidate All Binance Assets
            spotHoldings.forEach(asset => {
                allBinanceAssets[asset.symbol] = (allBinanceAssets[asset.symbol] || 0) + asset.total;
            });

            for (const [symbol, amount] of flexibleEarnHoldings.entries()) {
                allBinanceAssets[symbol] = (allBinanceAssets[symbol] || 0) + amount;
            }

            for (const [symbol, amount] of lockedEarnHoldings.entries()) {
                allBinanceAssets[symbol] = (allBinanceAssets[symbol] || 0) + amount;
            }

            console.log('--- Consolidated Binance Assets ---', allBinanceAssets);

            // --- 將 Binance 資產持久化到資料庫 ---
            for (const symbol in allBinanceAssets) {
                const quantity = allBinanceAssets[symbol];
                if (quantity > 0) { // 只持久化數量大於 0 的資產
                    await CryptoAsset.upsert({
                        exchange: 'Binance', // 假設都是來自 Binance
                        coinSymbol: symbol,
                        quantity: parseFloat(quantity),
                        // averageCost 和 lastKnownPrice 需要從交易日誌或實時價格獲取，目前暫時為 0
                        averageCost: 0.00,
                        lastKnownPrice: 0.00,
                        // TODO: 未来添加 userId
                    });
                    console.log(`Persisted Binance asset: ${symbol}`);
                }
            }
            console.log('Binance assets persistence complete.');
            // --- Binance 資產持久化結束 ---
        } else {
            console.log('Skipping Binance asset persistence due to client initialization failure.');
        }

    } catch (error) {
        console.error('Error in fetchAndProcessLatestData:', error);
    }
} // fetchAndProcessLatestData 函式的結束

// Schedule the data fetching
cron.schedule('0 */4 * * *', fetchAndProcessLatestData); // Every 4 hours

// Start the server only after connecting to DB and synchronizing models
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        // 在伺服器啟動後立即執行一次數據抓取
        fetchAndProcessLatestData();
    });
});
