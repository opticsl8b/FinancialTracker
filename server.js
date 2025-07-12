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

const models = { User, Account, Transaction, CryptoAsset, ExchangeRate, CryptoAssetPrice };
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

async function fetchAndProcessLatestData() {
    if (!defaultUser) {
        console.error('Default user not initialized. Aborting data fetch.');
        return;
    }
    console.log(`[${new Date().toISOString()}] Starting data fetch for user: ${defaultUser.id}`);
    
    try {
        // --- 1. Fetch Binance Assets ---
        const binanceClient = await CryptoExchangeService.getExchangeClient(
            'binance', process.env.BINANCE_API_KEY, process.env.BINANCE_SECRET
        );
        
        if (binanceClient) {
            const spotHoldings = await CryptoExchangeService.getBinanceSpotHoldings(binanceClient);
            const flexibleEarnHoldings = await CryptoExchangeService.getBinanceEarnFlexibleHoldings(binanceClient);
            const lockedEarnHoldings = await CryptoExchangeService.getBinanceEarnLockedHoldings(binanceClient);

            const allBinanceAssets = {};
            spotHoldings.forEach(asset => { allBinanceAssets[asset.symbol] = (allBinanceAssets[asset.symbol] || 0) + asset.total; });
            flexibleEarnHoldings.forEach((amount, symbol) => { allBinanceAssets[symbol] = (allBinanceAssets[symbol] || 0) + amount; });
            lockedEarnHoldings.forEach((amount, symbol) => { allBinanceAssets[symbol] = (allBinanceAssets[symbol] || 0) + amount; });

            console.log('--- Fetched & Consolidated Binance Assets ---', allBinanceAssets);

            for (const symbol in allBinanceAssets) {
                const quantity = allBinanceAssets[symbol];
                if (quantity > 0) {
                    await CryptoAsset.upsert({
                        userId: defaultUser.id,
                        exchange: 'Binance',
                        coinSymbol: symbol,
                        quantity: parseFloat(quantity),
                    });
                }
            }
            console.log('Binance assets persisted to database.');
        }

        // --- 2. Fetch Exchange Rates and Prices ---
        // (This part can be expanded to include ExchangeRateService calls as before)

    } catch(error) {
        console.error('Error in fetchAndProcessLatestData:', error);
    }
}


// --- API ENDPOINTS ---

app.delete('/api/crypto-assets/clear', async (req, res) => {
    if (!defaultUser) {
        return res.status(503).json({ error: 'User not initialized.' });
    }
    try {
        const deletedCount = await CryptoAsset.destroy({
            where: { userId: defaultUser.id }
        });
        res.status(200).json({ message: `Successfully deleted ${deletedCount} old crypto asset records.` });
    } catch (error) {
        console.error('Error clearing crypto assets:', error);
        res.status(500).json({ error: 'Failed to clear crypto assets.' });
    }
});


app.get('/api/assets/breakdown', async (req, res) => {
    const displayCurrency = (req.query.currency || 'USD').toUpperCase();
    const validCurrencies = ['USD', 'TWD', 'USDT', 'AUD'];

    if (!validCurrencies.includes(displayCurrency)) {
        return res.status(400).json({ error: 'Invalid currency specified.' });
    }
    if (!defaultUser) {
        return res.status(503).json({ error: 'User not initialized.' });
    }

    try {
        // --- 1. Get latest rates for conversion ---
        const latestUsdToTwdPrice = await CryptoAssetPrice.findOne({ where: { coinSymbol: 'USDT' }, order: [['timestamp', 'DESC']] });
        const usdToTwdRate = latestUsdToTwdPrice ? parseFloat(latestUsdToTwdPrice.twdPrice) : 32.0;

        const latestTwdToAudRate = await ExchangeRate.findOne({ where: { currencyPair: 'TWD/AUD' }, order: [['timestamp', 'DESC']] });
        let twdToAudMidRate = 21.0;
        if (latestTwdToAudRate && latestTwdToAudRate.buyRate && latestTwdToAudRate.sellRate) {
            twdToAudMidRate = (parseFloat(latestTwdToAudRate.buyRate) + parseFloat(latestTwdToAudRate.sellRate)) / 2;
        }

        // --- 2. Calculate value of each asset category in USD ---
        let taiwanAssetsUsd = 0;
        const twdAccounts = await Account.findAll({ where: { userId: defaultUser.id, currency: 'TWD' } });
        for (const acc of twdAccounts) {
            taiwanAssetsUsd += parseFloat(acc.balance) / usdToTwdRate;
        }

        let australiaAssetsUsd = 0;
        const audAccounts = await Account.findAll({ where: { userId: defaultUser.id, currency: 'AUD' } });
        for (const acc of audAccounts) {
            const audInTwd = parseFloat(acc.balance) * twdToAudMidRate;
            australiaAssetsUsd += audInTwd / usdToTwdRate;
        }

        let cryptoAssetsUsd = 0;
        const cryptoAssetsByExchange = {};
        const cryptoAssets = await CryptoAsset.findAll({ where: { userId: defaultUser.id } });

        for (const asset of cryptoAssets) {
            const latestPrice = await CryptoAssetPrice.findOne({ where: { coinSymbol: asset.coinSymbol }, order: [['timestamp', 'DESC']] });
            let assetUsdValue = 0;
            if (latestPrice && latestPrice.usdPrice) {
                assetUsdValue = parseFloat(asset.quantity) * parseFloat(latestPrice.usdPrice);
            }
            cryptoAssetsUsd += assetUsdValue;

            const exchangeName = asset.exchange;
            if (!cryptoAssetsByExchange[exchangeName]) {
                cryptoAssetsByExchange[exchangeName] = { totalValueUsd: 0, assets: [] };
            }
            cryptoAssetsByExchange[exchangeName].totalValueUsd += assetUsdValue;
            cryptoAssetsByExchange[exchangeName].assets.push({
                coinSymbol: asset.coinSymbol,
                quantity: parseFloat(asset.quantity).toFixed(8),
                usdValue: assetUsdValue.toFixed(2)
            });
        }
        
        const totalValueUsd = taiwanAssetsUsd + australiaAssetsUsd + cryptoAssetsUsd;

        // --- 3. Convert all calculated values to the final display currency ---
        const convert = (usdValue) => {
            switch (displayCurrency) {
                case 'TWD': return usdValue * usdToTwdRate;
                case 'AUD': return (usdValue * usdToTwdRate) / twdToAudMidRate;
                case 'USDT': return usdValue;
                default: return usdValue; // USD
            }
        };

        const finalCryptoBreakdown = {};
        for (const exchange in cryptoAssetsByExchange) {
            finalCryptoBreakdown[exchange] = {
                totalValue: convert(cryptoAssetsByExchange[exchange].totalValueUsd).toFixed(2),
                assets: cryptoAssetsByExchange[exchange].assets.map(asset => ({
                    ...asset,
                    value: convert(parseFloat(asset.usdValue)).toFixed(2)
                }))
            };
        }

        // --- 4. Prepare and send the final response ---
        res.status(200).json({
            displayCurrency: displayCurrency,
            breakdown: {
                taiwanAssets: convert(taiwanAssetsUsd).toFixed(2),
                australiaAssets: convert(australiaAssetsUsd).toFixed(2),
                cryptoAssets: {
                    totalValue: convert(cryptoAssetsUsd).toFixed(2),
                    byExchange: finalCryptoBreakdown
                }
            },
            totalValue: convert(totalValueUsd).toFixed(2)
        });

    } catch (error) {
        console.error('Error fetching asset breakdown:', error);
        res.status(500).json({ error: 'Failed to fetch asset breakdown.' });
    }
});

// --- Server Start ---
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        // --- 重啟後立即執行一次數據刷新 ---
        console.log('Server started. Running data fetch to get latest holdings...');
        fetchAndProcessLatestData();
    });
});