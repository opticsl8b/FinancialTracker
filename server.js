// server.js

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const app = express();
const PORT = process.env.PORT || 3000;

// Import services
const ExchangeRateService = require('./services/ExchangeRateService');
const CryptoExchangeService = require('./services/CryptoExchangeService');

app.use(express.json());

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
        // 注意：这里变量名和日志标签已更新，以反映返回的是一个包含两个交易所数据的对象
        const twdUsdtRates = await ExchangeRateService.getTwdUsdtExchangeRate();
        console.log('TWD/USDT Exchange Rates (Bitopro & MAX):', twdUsdtRates);

        // 获取加密货币的真实市场价格 (从 CoinGecko API 获取)
        // 注意：这里的币种列表已更新，包含了您要求的所有币种，包括 'VIRTUAL'
        const cryptoPrices = await ExchangeRateService.getCryptoPrices([
            'BTC', 'ETH', 'BNB', 'SOL', 'DOGE', 'ADA', 'SUI', 'PEPE', 'APT', 'VIRTUAL'
        ]);
        console.log('Crypto Prices:', cryptoPrices);


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
            // If Binance client initialization fails, we can't proceed with fetching Binance assets.
            // Log the error and gracefully exit this part of the function.
            return;
        }

        // Fetch Binance Spot Holdings
        const spotHoldings = await CryptoExchangeService.getBinanceSpotHoldings(binanceClient);
        console.log('Binance Spot Holdings:', spotHoldings);

        // Fetch Flexible Earn Holdings
        const flexibleEarnHoldings = await CryptoExchangeService.getBinanceEarnFlexibleHoldings(binanceClient);
        console.log('Binance Flexible Earn Holdings:', Object.fromEntries(flexibleEarnHoldings)); // Convert Map to Object for logging

        // Fetch Locked Earn Holdings
        const lockedEarnHoldings = await CryptoExchangeService.getBinanceEarnLockedHoldings(binanceClient);
        console.log('Binance Locked Earn Holdings:', Object.fromEntries(lockedEarnHoldings)); // Convert Map to Object for logging

        // Consolidate All Binance Assets
        const allBinanceAssets = {};

        // Add Spot Holdings
        spotHoldings.forEach(asset => {
            allBinanceAssets[asset.symbol] = (allBinanceAssets[asset.symbol] || 0) + asset.total;
        });

        // Add Flexible Earn Holdings
        for (const [symbol, amount] of flexibleEarnHoldings.entries()) {
            allBinanceAssets[symbol] = (allBinanceAssets[symbol] || 0) + amount;
        }

        // Add Locked Earn Holdings
        for (const [symbol, amount] of lockedEarnHoldings.entries()) {
            allBinanceAssets[symbol] = (allBinanceAssets[symbol] || 0) + amount;
        }

        console.log('--- Consolidated Binance Assets ---', allBinanceAssets);

        // Future: Here you would typically save these consolidated assets to your PostgreSQL database
        // e.g., await CryptoAsset.bulkCreate(formatForDb(allBinanceAssets), { updateOnDuplicate: ['quantity', 'updatedAt'] });

    } catch (error) {
        console.error('Error in fetchAndProcessLatestData:', error);
    }
} // <-- 請確保這個 } 符號存在！它是 fetchAndProcessLatestData 函式的結束

// Schedule the data fetching
// Runs immediately on startup and then every 4 hours
fetchAndProcessLatestData(); // Run on startup
cron.schedule('0 */4 * * *', fetchAndProcessLatestData); // Every 4 hours

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});