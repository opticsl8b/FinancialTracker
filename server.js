// server.js (Final Modular Version with Google Sheet sync on startup)

require('dotenv').config();
const express = require('express');
const cron = require('node-cron'); // 確保 cron 被引入
const { Sequelize } = require('sequelize');

// --- 引入中介軟體和服務 ---
const authenticateToken = require('./middleware/authenticateToken');
const ExchangeRateService = require('./services/ExchangeRateService.js');
const { updateExchangeRatesToSheet } = require('./services/GoogleSheetService.js'); // 確保 Google Sheet 服務被引入

// --- Express App Setup ---
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// --- 資料庫連線 ---
const DATABASE_URL = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
        ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : false,
        client_encoding: 'UTF8'
    }
});

// --- 初始化所有模型 ---
const User = require('./models/User')(sequelize);
const Account = require('./models/Accounts')(sequelize);
const Transaction = require('./models/Transaction')(sequelize);
const CryptoAsset = require('./models/CryptoAsset')(sequelize);
const CryptoTransaction = require('./models/CryptoTransaction')(sequelize);
const models = { User, Account, Transaction, CryptoAsset, CryptoTransaction };

Object.values(models).forEach(model => {
  if (model.associate) {
    model.associate(models);
  }
});

// --- 新增：數據獲取與更新的核心函式 ---
async function fetchAndPushToSheet() {
    console.log(`[${new Date().toISOString()}] Starting job: Fetching all rates and prices for Google Sheet.`);
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = process.env.GOOGLE_SHEET_NAME || '報價機';
    if (!sheetId) {
        console.warn(`[${new Date().toISOString()}] GOOGLE_SHEET_ID is not set. Skipping Google Sheet update.`);
        return;
    }
    try {
        const cryptoSymbolsToFetch = ['BTC', 'ETH', 'BNB', 'SOL', 'DOGE', 'ADA', 'SUI', 'PEPE', 'APT', 'VIRTUAL'];
        const [twdAudRates, twdUsdtRates, cryptoPrices] = await Promise.all([
            ExchangeRateService.getTwdAudExchangeRate(),
            ExchangeRateService.getTwdUsdtExchangeRate(),
            ExchangeRateService.getCryptoPrices(cryptoSymbolsToFetch)
        ]);
        const sheetData = [];
        const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        sheetData.push(['項目', '買入價', '賣出價', '最後更新時間 (Asia/Taipei)']);
        if (twdAudRates && twdAudRates.buy) sheetData.push(['TWD/AUD (台灣銀行現金)', twdAudRates.buy, twdAudRates.sell]);
        if (twdUsdtRates && twdUsdtRates.bitopro) sheetData.push(['TWD/USDT (Bitopro)', twdUsdtRates.bitopro, 'N/A']);
        if (twdUsdtRates && twdUsdtRates.max) sheetData.push(['TWD/USDT (MAX)', twdUsdtRates.max, 'N/A']);
        sheetData.push(['--- 加密貨幣價格 (USD) ---', '---', '---']);
        for (const symbol of cryptoSymbolsToFetch) {
            const priceInfo = cryptoPrices[symbol];
            if (priceInfo && priceInfo.usd) sheetData.push([`${symbol}/USD`, priceInfo.usd, 'N/A']);
        }
        for (let i = 1; i < sheetData.length; i++) {
            if(sheetData[i][0].includes('---')) continue;
            sheetData[i].push(timestamp);
        }
        const range = `${sheetName}!A1`;
        await updateExchangeRatesToSheet(sheetId, range, sheetData);
        console.log(`[${new Date().toISOString()}] Successfully fetched and pushed data to Google Sheet.`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred during the fetchAndPushToSheet job:`, error);
    }
}


// --- 路由 ---
const userRoutes = require('./routes/userRoutes')(models);
app.use('/api/users', userRoutes);

const protectedRouter = express.Router();
protectedRouter.use(authenticateToken);

protectedRouter.get('/crypto/pnl', async (req, res) => {
    // ... (PnL 邏輯不變)
});
protectedRouter.post('/crypto', async (req, res) => {
    // ... (新增交易邏輯不變)
});
app.use('/api/transactions', protectedRouter);


// --- 伺服器啟動 ---
async function startServer() {
    try {
        await sequelize.authenticate();
        console.log('Database connection has been established successfully.');
        await sequelize.sync({ alter: true });
        console.log('All models were synchronized successfully.');
        
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            
            // --- *** 修改點：恢復自動更新功能 *** ---
            // 1. 伺服器啟動時，立即執行一次
            console.log('Running initial data fetch for Google Sheet...');
            fetchAndPushToSheet();

            // 2. 設定排程，每 5 分鐘執行一次
            cron.schedule('*/5 * * * *', fetchAndPushToSheet);
            console.log('Scheduled job for Google Sheet update is active (runs every 5 minutes).');
        });
    } catch (error) {
        console.error('Unable to start the server:', error);
        process.exit(1);
    }
}

startServer();