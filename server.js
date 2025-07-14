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
        ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : false,
        client_encoding: 'UTF8'
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
        const range = `${sheetName}!A1`;
        await updateExchangeRatesToSheet(sheetId, range, sheetData);
        console.log(`[${new Date().toISOString()}] Successfully fetched and pushed data to Google Sheet.`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred during the fetchAndPushToSheet job:`, error);
    }
}

// --- API ENDPOINTS ---
app.post('/api/crypto-transactions', async (req, res) => {
    console.log('\n--- Received new POST request on /api/crypto-transactions ---');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('--- End of debug output ---\n');

    if (!defaultUser) {
        return res.status(503).json({ error: 'User not initialized.' });
    }

    const data = req.body;

    try {
        let newLogs;
        if (Array.isArray(data)) {
            const transactionsToCreate = data.map(tx => ({
                ...tx,
                userId: defaultUser.id
            }));
            newLogs = await CryptoTransaction.bulkCreate(transactionsToCreate, { validate: true });
            console.log(`Successfully bulk created ${newLogs.length} transactions.`);
        } else {
            newLogs = await CryptoTransaction.create({
                ...data,
                userId: defaultUser.id
            });
            console.log('Successfully created a single transaction.');
        }
        res.status(201).json(newLogs);

    } catch (error) {
        console.error('Error creating crypto transaction log:', error);
        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({ error: error.errors.map(e => e.message).join(', ') });
        }
        res.status(500).json({ error: 'Failed to create crypto transaction log.' });
    }
});


// --- *** 升級後的 PnL API 端點 *** ---
app.get('/api/crypto-transactions/pnl', async (req, res) => {
    if (!defaultUser) { return res.status(503).json({ error: 'User not initialized.' }); }
    try {
        // 1. 只抓取 "持有中" 的交易
        const transactions = await CryptoTransaction.findAll({
            where: { userId: defaultUser.id, status: '持有中' },
            order: [['transactionDate', 'DESC']]
        });

        if (transactions.length === 0) {
            return res.json({ details: [], summary: {} }); // 回傳空的結構
        }

        // 2. 獲取所有需要的即時價格
        const symbolsToFetch = [...new Set(transactions.map(t => t.targetCoinSymbol))];
        const prices = await ExchangeRateService.getCryptoPrices(symbolsToFetch);

        // 3. 計算每筆獨立交易的詳細數據
        const details = transactions.map(tx => {
            const txData = tx.get({ plain: true });
            let pnl = null;
            let roi = null;
            let currentMarketValue = null;
            const currentPrice = prices[txData.targetCoinSymbol]?.usd;

            if (currentPrice) {
                const initialCost = parseFloat(txData.investmentAmount);
                const fees = parseFloat(txData.fee) || 0;
                const quantity = txData.currentQuantity ? parseFloat(txData.currentQuantity) : (initialCost / parseFloat(txData.entryPrice));
                currentMarketValue = quantity * currentPrice;
                pnl = currentMarketValue - initialCost - fees;
                if (initialCost > 0) {
                    roi = (pnl / initialCost) * 100;
                } else if (pnl > 0) {
                    roi = Infinity;
                }
            }
            return {
                ...txData,
                pnl,
                roi: roi === Infinity ? '∞' : (roi ? `${roi.toFixed(2)}%` : null),
                currentMarketValue,
                currentPrice
            };
        });

        // 4. *** 新增的匯總計算邏輯 ***
        const summary = {};
        details.forEach(item => {
            const symbol = item.targetCoinSymbol;
            if (!summary[symbol]) {
                summary[symbol] = {
                    totalInvestment: 0,
                    totalCurrentValue: 0,
                    totalPnl: 0,
                    weightedAvgEntryPrice: 0,
                    totalQuantity: 0,
                    currentPrice: item.currentPrice
                };
            }
            const initialCost = parseFloat(item.investmentAmount);
            const quantity = item.currentQuantity ? parseFloat(item.currentQuantity) : (initialCost / parseFloat(item.entryPrice));

            summary[symbol].totalInvestment += initialCost;
            summary[symbol].totalCurrentValue += item.currentMarketValue || 0;
            summary[symbol].totalQuantity += quantity;
        });

        // 5. 計算總 PnL、ROI 和加權平均成本
        for (const symbol in summary) {
            const coin = summary[symbol];
            coin.totalPnl = coin.totalCurrentValue - coin.totalInvestment;
            if (coin.totalInvestment > 0) {
                coin.roi = `${((coin.totalPnl / coin.totalInvestment) * 100).toFixed(2)}%`;
                coin.weightedAvgEntryPrice = coin.totalInvestment / coin.totalQuantity;
            } else if (coin.totalPnl > 0) {
                coin.roi = '∞';
                coin.weightedAvgEntryPrice = 0;
            }
        }

        res.json({ details, summary }); // 將詳細列表和匯總結果一起回傳

    } catch (error) {
        console.error('Error calculating PnL:', error);
        res.status(500).json({ error: 'Failed to calculate PnL.' });
    }
});


// --- Server Start ---
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        cron.schedule('*/5 * * * *', fetchAndPushToSheet);
        // Disabling immediate run to avoid clutter during debugging
        // fetchAndPushToSheet();
    });
});