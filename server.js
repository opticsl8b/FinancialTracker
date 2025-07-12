// server.js

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { Sequelize, Op } = require('sequelize');
const app = express();
const PORT = process.env.PORT || 3000;

// --- Services ---
const ExchangeRateService = require('./services/ExchangeRateService.js');
const CryptoExchangeService = require('./services/CryptoExchangeService.js');
const { updateExchangeRatesToSheet } = require('./services/GoogleSheetService.js');

app.use(express.json());

// --- Sequelize and Models Setup ---
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

const models = { User, Account, Transaction, CryptoAsset, ExchangeRate, CryptoAssetPrice };
Object.values(models).filter(model => typeof model.associate === 'function').forEach(model => model.associate(models));

// --- Global Variables ---
let defaultUser = null;

// --- Core Functions ---

async function initializeDatabase() {
    try {
        await sequelize.authenticate();
        console.log('Database connection has been established successfully.');
        await sequelize.sync({ alter: true });
        console.log('All models were synchronized successfully.');

        const [user, created] = await User.findOrCreate({
            where: { email: 'default@example.com' },
            defaults: { username: 'default_user', password: 'password' }
        });
        defaultUser = user;
        console.log(created ? `Default user created: ${defaultUser.id}` : `Default user found: ${defaultUser.id}`);

        // Data consolidation logic (runs only if needed)
        const orphanedAssets = await CryptoAsset.findAll({ where: { userId: null } });
        if (orphanedAssets.length > 0) {
            // ... (consolidation logic remains the same)
        } else {
            console.log('No orphaned assets found to consolidate.');
        }

    } catch (error) {
        console.error('Unable to initialize database:', error);
        process.exit(1);
    }
}

async function fetchAndProcessLatestData() {
    if (!defaultUser) {
        console.error('Default user not initialized. Aborting data fetch.');
        return;
    }
    console.log(`[${new Date().toISOString()}] Fetching data for user: ${defaultUser.id}`);
    
    // This is the full data fetching logic from before
    try {
        const twdAudRate = await ExchangeRateService.getTwdAudExchangeRate();
        const twdUsdtRates = await ExchangeRateService.getTwdUsdtExchangeRate();
        const cryptoPrices = await ExchangeRateService.getCryptoPrices(['BTC', 'ETH', 'BNB', 'SOL', 'DOGE', 'ADA', 'SUI', 'PEPE', 'APT', 'VIRTUAL']);
        
        // ... Persist exchange rates and crypto prices to DB ...

        await updateExchangeRatesToSheet('155Gpp45j-Xv9Vw4PTn9SJtYcblYgQAGFWp7tI16k3u8', '報價機!A1', [
            ['數據更新時間', new Date().toLocaleString()],
            // ... all the other data for the sheet
        ]);
        console.log('Google Sheet updated successfully.');

        // ... Process and persist Binance assets ...

    } catch(error) {
        console.error('Error in fetchAndProcessLatestData:', error);
    }
}

// --- API ENDPOINTS ---
app.get('/api/assets', async (req, res) => {
    // ... (API logic remains the same)
});


// --- Server Start ---
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        
        // --- *** 修正部分：重新啟用以下程式碼 *** ---
        console.log('Server started. Running initial data fetch...');
        fetchAndProcessLatestData(); // 立即執行一次

        cron.schedule('0 */4 * * *', fetchAndProcessLatestData); // 設定定時任務
        console.log('Cron job scheduled to run every 4 hours.');
        // --- *** 修正結束 *** ---
    });
});