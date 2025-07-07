// services/CryptoExchangeService.js

const ccxt = require('ccxt');

// Function to get an exchange client
async function getExchangeClient(exchangeId, apiKey, secret) {
    try {
        const exchange = new ccxt[exchangeId]({
            apiKey: apiKey,
            secret: secret,
            enableRateLimit: true, // This is crucial for not hitting exchange rate limits
            options: {
                defaultType: 'spot', // Ensure default type is spot for fetchBalance
            },
        });
        await exchange.loadMarkets(); // Load markets for the exchange
        return exchange;
    } catch (error) {
        console.error(`Error initializing exchange client for ${exchangeId}:`, error);
        throw new Error(`Failed to initialize exchange client: ${exchangeId}`);
    }
}

// Renamed and Refactored: getSpotHoldings -> getBinanceSpotHoldings
async function getBinanceSpotHoldings(exchangeClient) {
    try {
        // Ensure exchangeClient is an instance of Binance
        if (exchangeClient.id !== 'binance') {
            throw new Error('This function is specifically for Binance exchange client.');
        }

        const balance = await exchangeClient.fetchBalance();
        const spotHoldings = [];

        for (const symbol in balance.total) {
            const totalAmount = balance.total[symbol];
            const freeAmount = balance.free[symbol];
            const usedAmount = balance.used[symbol];

            if (totalAmount > 0) {
                spotHoldings.push({
                    symbol: symbol,
                    total: totalAmount,
                    free: freeAmount,
                    used: usedAmount // Including used for completeness, though not strictly required by MVP description for sum
                });
            }
        }
        return spotHoldings;
    } catch (error) {
        console.error('Error fetching Binance spot holdings:', error);
        return []; // Return empty array on error
    }
}

// New function: getBinanceEarnFlexibleHoldings
async function getBinanceEarnFlexibleHoldings(exchangeClient) {
    try {
        // Ensure exchangeClient is an instance of Binance
        if (exchangeClient.id !== 'binance') {
            throw new Error('This function is specifically for Binance exchange client.');
        }

        const flexiblePositions = await exchangeClient.sapiGetSimpleEarnFlexiblePosition();
        const flexibleHoldingsMap = new Map();

        if (flexiblePositions && Array.isArray(flexiblePositions.rows)) {
            flexiblePositions.rows.forEach(position => {
                const asset = position.asset;
                const totalAmount = parseFloat(position.totalAmount);
                if (totalAmount > 0) {
                    flexibleHoldingsMap.set(asset, (flexibleHoldingsMap.get(asset) || 0) + totalAmount);
                }
            });
        }
        return flexibleHoldingsMap;
    } catch (error) {
        console.error('Error fetching Binance Flexible Earn holdings:', error);
        return new Map(); // Return empty Map on error
    }
}

// New function: getBinanceEarnLockedHoldings
async function getBinanceEarnLockedHoldings(exchangeClient) {
    try {
        // Ensure exchangeClient is an instance of Binance
        if (exchangeClient.id !== 'binance') {
            throw new Error('This function is specifically for Binance exchange client.');
        }

        const lockedPositions = await exchangeClient.sapiGetSimpleEarnLockedPosition();
        const lockedHoldingsMap = new Map();

        if (lockedPositions && Array.isArray(lockedPositions.rows)) {
            lockedPositions.rows.forEach(position => {
                const asset = position.asset;
                const amount = parseFloat(position.amount); // For locked, it's 'amount' field
                if (amount > 0) {
                    lockedHoldingsMap.set(asset, (lockedHoldingsMap.get(asset) || 0) + amount);
                }
            });
        }
        return lockedHoldingsMap;
    } catch (error) {
        console.error('Error fetching Binance Locked Earn holdings:', error);
        return new Map(); // Return empty Map on error
    }
}


// Placeholder for other exchanges (MVP focuses on Binance)
async function getAccountBalance(exchangeId, apiKey, secret) {
    console.warn(`getAccountBalance for ${exchangeId} is a placeholder and needs implementation for other exchanges.`);
    // Example: For other exchanges, you'd use exchangeClient.fetchBalance()
    return {};
}

// Placeholder for other types of holdings (MVP focuses on Binance spot and earn)
async function getOtherHoldings(exchangeId, apiKey, secret) {
    console.warn(`getOtherHoldings for ${exchangeId} is a placeholder and needs specific implementation.`);
    return [];
}

module.exports = {
    getExchangeClient,
    getBinanceSpotHoldings, // Export the renamed function
    getBinanceEarnFlexibleHoldings, // Export new earn function
    getBinanceEarnLockedHoldings, // Export new earn function
    getAccountBalance, // Keep existing export
    getOtherHoldings // Keep existing export
};