// server.js

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { Sequelize, Op } = require('sequelize');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Services & Models Setup ---
const ExchangeRateService = require('./services/ExchangeRateService.js');
const CryptoExchangeService = require('./services/CryptoExchangeService.js');
const { updateExchangeRatesToSheet } = require('./services/GoogleSheetService.js');

app.use(express.json());

const DATABASE_URL = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
        ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : false
    }
});

const User = require('./models/User')(sequelize);
const Account = require('./models/Accounts.js')(sequelize);
const Transaction = require('./models/Transaction.js')(sequelize);
const CryptoAsset = require('./models/CryptoAsset.js')(sequelize);
const ExchangeRate = require('./models/ExchangeRate.js')(sequelize);
const CryptoAssetPrice = require('./models/CryptoAssetPrice.js')(sequelize);
const CryptoTransaction = require('./models/CryptoTransaction.js')(sequelize);

const models = { User, Account, Transaction, CryptoAsset, ExchangeRate, CryptoAssetPrice, CryptoTransaction };
Object.values(models).filter(model => typeof model.associate === 'function').forEach(model => model.associate(models));

let defaultUser = null;

// --- Core Functions ---
async function initializeDatabase() {
    try {
        await sequelize.authenticate(); console.log('Database connection has been established successfully.');
        await sequelize.sync({ alter: true }); console.log('All models were synchronized successfully.');
        const [user, created] = await User.findOrCreate({
            where: { email: 'default@example.com' },
            defaults: { username: 'default_user', password: 'password' }
        });
        defaultUser = user;
        console.log(created ? `Default user created: ${defaultUser.id}` : `Default user found: ${defaultUser.id}`);
    } catch (error) {
        console.error('Unable to initialize database:', error); process.exit(1);
    }
}

async function fetchAndPushToSheet() {
    console.log(`[${new Date().toISOString()}] Starting scheduled job: Fetching all rates and prices for Google Sheet.`);

    const sheetId = process.env.GOOGLE_SHEET_ID;
    // *** 變更點 1：從環境變數讀取分頁名稱，如果沒有就預設為 '報價機' ***
    const sheetName = process.env.GOOGLE_SHEET_NAME || '報價機';

    if (!sheetId) {
        console.warn(`[${new Date().toISOString()}] GOOGLE_SHEET_ID is not set in .env file. Skipping Google Sheet update.`);
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

        if (twdAudRates && twdAudRates.buy) {
            sheetData.push(['TWD/AUD (台灣銀行現金)', twdAudRates.buy, twdAudRates.sell]);
        }
        if (twdUsdtRates && twdUsdtRates.bitopro) {
            sheetData.push(['TWD/USDT (Bitopro)', twdUsdtRates.bitopro, 'N/A']);
        }
        if (twdUsdtRates && twdUsdtRates.max) {
            sheetData.push(['TWD/USDT (MAX)', twdUsdtRates.max, 'N/A']);
        }
        sheetData.push(['--- 加密貨幣價格 (USD) ---', '---', '---']);
        for (const symbol of cryptoSymbolsToFetch) {
            const priceInfo = cryptoPrices[symbol];
            if (priceInfo && priceInfo.usd) {
                sheetData.push([`${symbol}/USD`, priceInfo.usd, 'N/A']);
            }
        }
        
        for (let i = 1; i < sheetData.length; i++) {
            if(sheetData[i][0].includes('---')){
                sheetData[i].push(timestamp);
                continue;
            }
            sheetData[i].push(timestamp);
        }

        // *** 變更點 2：使用變數來組合範圍字串 ***
        const range = `${sheetName}!A1`;
        await updateExchangeRatesToSheet(sheetId, range, sheetData);

        console.log(`[${new Date().toISOString()}] Successfully fetched and pushed data to Google Sheet.`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred during the fetchAndPushToSheet job:`, error);
    }
}


// --- API ENDPOINTS ---
app.post('/api/crypto-transactions', async (req, res) => {
    if (!defaultUser) {
        return res.status(503).json({ error: 'User not initialized.' });
    }

    try {
        const newLog = await CryptoTransaction.create({
            ...req.body,
            userId: defaultUser.id
        });
        res.status(201).json(newLog);
    } catch (error) {
        console.error('Error creating crypto transaction log:', error);
        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({ error: error.errors.map(e => e.message).join(', ') });
        }
        res.status(500).json({ error: 'Failed to create crypto transaction log.' });
    }
});


// --- Server Start ---
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        cron.schedule('*/5 * * * *', fetchAndPushToSheet);
        console.log('Running the fetchAndPushToSheet job immediately upon server start...');
        fetchAndPushToSheet();
    });
});
