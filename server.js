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

// 載入模型 - 再次修正路徑為 './models/'
// 根據您提供的檔案結構，server.js 和 models 資料夾是同層級的兄弟目錄
const CryptoAsset = require('./models/CryptoAsset')(sequelize);
const ExchangeRate = require('./models/ExchangeRate')(sequelize);
const CryptoAssetPrice = require('./models/CryptoAssetPrice')(sequelize);
// 根據您提供的截圖，檔案名是 Accounts.js (複數)
const Account = require('./models/Accounts')(sequelize); // 修正為 Accounts (複數)
const Transaction = require('./models/Transaction')(sequelize); // 新增 Transaction 模型

// 定義模型之間的關聯
// Account 和 Transaction 之間的一對多關聯
Account.hasMany(Transaction, { foreignKey: 'accountId', as: 'transactions', onDelete: 'CASCADE' }); // 新增 onDelete: 'CASCADE'
Transaction.belongsTo(Account, { foreignKey: 'accountId', as: 'account' });

// 測試資料庫連線並同步模型
async function connectDB() {
    try {
        await sequelize.authenticate();
        console.log('Database connection has been established successfully.');
        // 使用 { alter: true } 會根據模型定義更新表結構，不會刪除現有數據
        // 注意：如果模型關聯有問題，可能需要先移除 { alter: true } 進行測試，或手動刪除舊表
        await sequelize.sync({ alter: true });
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

// --- 法幣帳戶 (Fiat Account) API 端點 ---

// 創建一個新的法幣帳戶
app.post('/api/fiat-accounts', async (req, res) => {
    try {
        // TODO: 在未來實現用戶認證後，這裡需要加入 userId
        const { accountName, bankName, currency, accountType, balance } = req.body;
        if (!accountName || !bankName || !currency || !accountType || balance === undefined) {
            return res.status(400).json({ error: 'Missing required fields for account creation.' });
        }

        const newAccount = await Account.create({
            accountName,
            bankName,
            currency,
            accountType,
            balance: parseFloat(balance)
        });
        res.status(201).json(newAccount);
    } catch (error) {
        console.error('Error creating fiat account:', error);
        res.status(500).json({ error: 'Failed to create fiat account.' });
    }
});

// 獲取所有法幣帳戶
app.get('/api/fiat-accounts', async (req, res) => {
    try {
        // TODO: 在未來實現用戶認證後，這裡需要根據 userId 過濾
        const accounts = await Account.findAll();
        res.status(200).json(accounts);
    } catch (error) {
        console.error('Error fetching fiat accounts:', error);
        res.status(500).json({ error: 'Failed to fetch fiat accounts.' });
    }
});

// 新增一個 API 端點來刪除所有法幣帳戶
app.delete('/api/fiat-accounts', async (req, res) => {
    try {
        // TODO: 在未來實現用戶認證後，這裡需要加入 userId 並根據 userId 過濾
        // 刪除所有法幣帳戶。由於 Account 和 Transaction 之間設置了 onDelete: 'CASCADE'，
        // 刪除帳戶會自動刪除所有相關聯的交易。
        const deletedAccountsCount = await Account.destroy({
            where: {}, // 空的 where 條件表示刪除所有記錄
            // 移除 truncate: true，讓 Sequelize 執行 DELETE 語句，從而觸發 CASCADE 行為
            // truncate: true
        });
        console.log(`Deleted ${deletedAccountsCount} fiat accounts and their associated transactions.`);
        res.status(200).json({ message: `Successfully deleted ${deletedAccountsCount} fiat accounts and their associated transactions.` });
    } catch (error) {
        console.error('Error deleting all fiat accounts:', error);
        res.status(500).json({ error: 'Failed to delete all fiat accounts.' });
    }
});


// 為指定帳戶新增一筆交易
app.post('/api/fiat-accounts/:accountId/transactions', async (req, res) => {
    try {
        const { accountId } = req.params;
        const { transactionDate, description, amount, transactionType, notes } = req.body;

        const account = await Account.findByPk(accountId);
        if (!account) {
            return res.status(404).json({ error: 'Account not found.' });
        }

        if (!transactionDate || !description || amount === undefined || !transactionType) {
            return res.status(400).json({ error: 'Missing required fields for transaction creation.' });
        }

        const newTransaction = await Transaction.create({
            accountId,
            transactionDate: new Date(transactionDate),
            description,
            amount: parseFloat(amount),
            transactionType,
            notes
        });

        // 更新帳戶餘額
        let newBalance = parseFloat(account.balance);
        if (transactionType === 'income' || transactionType === 'deposit' || transactionType === 'loan_payment') { // 假設貸款支付是減少負債，增加可用餘額
            newBalance += parseFloat(amount);
        } else if (transactionType === 'expense' || transactionType === 'withdrawal') {
            newBalance -= parseFloat(amount);
        }
        // 對於 'transfer' 類型，需要更複雜的邏輯來處理兩個帳戶的餘額變動，這裡暫時不自動處理
        // 如果是貸款帳戶，餘額的增減可能代表貸款餘額的變化，而不是現金餘額。
        // 這部分需要根據實際的會計邏輯來細化。
        // 對於 MVP，簡化為：收入/存入/貸款支付(減少負債) -> 增加餘額；支出/提款 -> 減少餘額。

        await account.update({ balance: newBalance });

        res.status(201).json({ transaction: newTransaction, updatedAccountBalance: newBalance });
    } catch (error) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: 'Failed to create transaction.' });
    }
});

// 獲取指定帳戶的所有交易
app.get('/api/fiat-accounts/:accountId/transactions', async (req, res) => {
    try {
        const { accountId } = req.params;
        const transactions = await Transaction.findAll({
            where: { accountId },
            order: [['transactionDate', 'DESC']] // 按日期降序排列
        });
        res.status(200).json(transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Failed to fetch transactions.' });
    }
});

// --- 法幣帳戶 API 端點結束 ---


// Scheduled data fetching function
async function fetchAndProcessLatestData() {
    console.log(`[${new Date().toISOString()}] Fetching and processing latest data...`);

    try {
        // 1. Fetch Exchange Rates and Crypto Prices

        // 获取 TWD/AUD 现金汇率 (從台灣銀行網站爬取)
        const twdAudRate = await ExchangeRateService.getTwdAudExchangeRate();
        console.log('TWD/AUD Exchange Rate:', twdAudRate);

        // 获取 TWD/USDT 匯率 (從 Bitopro 和 MAX API 获取)
        const twdUsdtRates = await ExchangeRateService.getTwdUsdtExchangeRate();
        console.log('TWD/USDT Exchange Rates (Bitopro & MAX):', twdUsdtRates);

        // 获取加密貨幣的真實市場價格 (從 CoinGecko API 獲取)
        const cryptoPrices = await ExchangeRateService.getCryptoPrices([
            'BTC', 'ETH', 'BNB', 'SOL', 'DOGE', 'ADA', 'SUI', 'PEPE', 'APT', 'VIRTUAL'
        ]);
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

        for (const symbol of ['BTC', 'ETH', 'BNB', 'SOL', 'DOGE', 'ADA', 'SUI', 'PEPE', 'APT', 'VIRTUAL']) {
            if (cryptoPrices[symbol]) {
                const priceData = cryptoPrices[symbol];
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
        const SPREADSHEET_ID = '155Gpp45j-Xv9Vw4PTn9SJtYcblYgQAGFWp7tI16k3u8'; // 請替換為你的 Google Sheet ID
        const SHEET_RANGE = '報價機!A1'; // 請替換為你想要寫入數據的起始儲存格

        const sheetData = [
            ['數據更新時間', new Date().toLocaleString()],
            ['台灣銀行 TWD/AUD 買入', twdAudRate ? twdAudRate.buy : 'N/A'],
            ['台灣銀行 TWD/AUD 賣出', twdAudRate ? twdAudRate.sell : 'N/A'],
            ['Bitopro TWD/USDT', twdUsdtRates && twdUsdtRates.bitopro ? twdUsdtRates.bitopro : 'N/A'],
            ['MAX TWD/USDT', twdUsdtRates && twdUsdtRates.max ? twdUsdtRates.max : 'N/A'],
            // --- 新增並按照指定順序排列的加密貨幣價格 ---
            ['BTC/USD', cryptoPrices && cryptoPrices.BTC ? cryptoPrices.BTC.usd : 'N/A'],
            ['ETH/USD', cryptoPrices && cryptoPrices.ETH ? cryptoPrices.ETH.usd : 'N/A'],
            ['BNB/USD', cryptoPrices && cryptoPrices.BNB ? cryptoPrices.BNB.usd : 'N/A'],
            ['SOL/USD', cryptoPrices && cryptoPrices.SOL ? cryptoPrices.SOL.usd : 'N/A'],
            ['DOGE/USD', cryptoPrices && cryptoPrices.DOGE ? cryptoPrices.DOGE.usd : 'N/A'],
            ['ADA/USD', cryptoPrices && cryptoPrices.ADA ? cryptoPrices.ADA.usd : 'N/A'],
            ['SUI/USD', cryptoPrices && cryptoPrices.SUI ? cryptoPrices.SUI.usd : 'N/A'],
            ['PEPE/USD', cryptoPrices && cryptoPrices.PEPE ? cryptoPrices.PEPE.usd : 'N/A'],
            ['APT/USD', cryptoPrices && cryptoPrices.APT ? cryptoPrices.APT.usd : 'N/A'],
            ['VIRTUAL/USD', cryptoPrices && cryptoPrices.VIRTUAL ? cryptoPrices.VIRTUAL.usd : 'N/A'],
            // --- 加密貨幣價格新增結束 ---
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
