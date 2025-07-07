// services/ExchangeRateService.js

const axios = require('axios');
const cheerio = require('cheerio');

// -- (getTwdAudExchangeRate 函式) --
async function getTwdAudExchangeRate() {
    const url = 'https://rate.bot.com.tw/xrt?Lang=zh-TW';
    console.log(`[${new Date().toISOString()}] Fetching TWD/AUD Exchange Rate from Bank of Taiwan...`);
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        let audBuyRate = null;
        let audSellRate = null;
        const audRow = $('td:contains("澳幣 (AUD)")').closest('tr');
        if (audRow.length > 0) {
            const buyRateElement = audRow.find('td[data-table="本行現金買入"]');
            const sellRateElement = audRow.find('td[data-table="本行現金賣出"]');
            if (buyRateElement.length > 0 && sellRateElement.length > 0) {
                audBuyRate = buyRateElement.text().trim();
                audSellRate = sellRateElement.text().trim();
                const buy = parseFloat(audBuyRate);
                const sell = parseFloat(audSellRate);
                console.log(`[${new Date().toISOString()}] TWD/AUD Cash Exchange Rate Fetched: Buy ${buy}, Sell ${sell}`);
                return { buy, sell };
            } else {
                console.error(`[${new Date().toISOString()}] Error: Could not find '本行現金買入' or '本行現金賣出' elements for AUD.`);
                return { buy: null, sell: null };
            }
        } else {
            console.error(`[${new Date().toISOString()}] Error: Could not find the row containing '澳幣 (AUD)'.`);
            return { buy: null, sell: null };
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching TWD/AUD Exchange Rate from Bank of Taiwan:`, error.message);
        return { buy: null, sell: null };
    }
}
// -- (getTwdAudExchangeRate 函式結束) --


// -- (getTwdUsdtExchangeRate 函式 - 整合 Bitopro 和 MAX) --
async function fetchBitoproTwdUsdtRate() {
    const bitoproApiUrl = 'https://api.bitopro.com/v3/tickers/USDT_TWD';
    try {
        const response = await axios.get(bitoproApiUrl);
        if (response.data && response.data.data && response.data.data.lastPrice) {
            return parseFloat(response.data.data.lastPrice);
        } else {
            console.error(`[${new Date().toISOString()}] Bitopro API response missing expected data (lastPrice).`, response.data);
            return null;
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching TWD/USDT from Bitopro:`, error.message);
        if (error.response) {
            console.error('Bitopro API Error Response Data:', error.response.data);
            console.error('Bitopro API Error Status:', error.response.status);
        }
        return null;
    }
}

async function fetchMaxTwdUsdtRate() {
    const maxApiUrl = 'https://max-api.maicoin.com/api/v2/tickers/usdttwd'; 
    try {
        const response = await axios.get(maxApiUrl);
        if (response.data && response.data.last) { 
            return parseFloat(response.data.last);
        } else {
            console.error(`[${new Date().toISOString()}] MAX API response missing expected data (lastPrice).`, response.data);
            return null;
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching TWD/USDT from MAX:`, error.message);
        if (error.response) {
            console.error('MAX API Error Response Data:', error.response.data);
            console.error('MAX API Error Status:', error.response.status);
        }
        return null;
    }
}

async function getTwdUsdtExchangeRate() {
    console.log(`[${new Date().toISOString()}] Fetching TWD/USDT Exchange Rates from Bitopro and MAX...`);
    const [bitoproResult, maxResult] = await Promise.allSettled([
        fetchBitoproTwdUsdtRate(),
        fetchMaxTwdUsdtRate()
    ]);
    const rates = {
        bitopro: null,
        max: null
    };
    if (bitoproResult.status === 'fulfilled') {
        rates.bitopro = bitoproResult.value;
        console.log(`[${new Date().toISOString()}] Bitopro TWD/USDT Rate: ${rates.bitopro}`);
    } else {
        console.error(`[${new Date().toISOString()}] Failed to fetch Bitopro TWD/USDT Rate:`, bitoproResult.reason);
    }
    if (maxResult.status === 'fulfilled') {
        rates.max = maxResult.value;
        console.log(`[${new Date().toISOString()}] MAX TWD/USDT Rate: ${rates.max}`);
    } else {
        console.error(`[${new Date().toISOString()}] Failed to fetch MAX TWD/USDT Rate:`, maxResult.reason);
    }
    return rates;
}


// 從 CoinGecko API 獲取真實加密貨幣價格
async function getCryptoPrices(symbols) {
    // CoinGecko ID 映射表，將您提供的符號轉換為 CoinGecko 的 ID
    const coingeckoIdMap = {
        BTC: 'bitcoin',
        ETH: 'ethereum',
        BNB: 'binancecoin',
        SOL: 'solana',
        DOGE: 'dogecoin',
        ADA: 'cardano',
        SUI: 'sui',
        PEPE: 'pepe',
        APT: 'aptos',
        VIRTUAL: 'virtual-protocol'
    };

    const coingeckoIds = symbols.map(s => coingeckoIdMap[s]).filter(id => id);
    const vsCurrencies = 'usd,twd,usdt';

    if (coingeckoIds.length === 0) {
        console.warn(`[${new Date().toISOString()}] No valid CoinGecko IDs found for symbols: ${symbols.join(', ')}. Skipping crypto price fetch.`);
        return {};
    }

    const coingeckoApiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds.join(',')}&vs_currencies=${vsCurrencies}`;
    console.log(`[${new Date().toISOString()}] Fetching real crypto prices for ${symbols.join(', ')} from CoinGecko...`);
    console.log(`[${new Date().toISOString()}] CoinGecko API URL: ${coingeckoApiUrl}`);

    try {
        const response = await axios.get(coingeckoApiUrl);
        const prices = {};

        for (const symbol of symbols) {
            const coingeckoId = coingeckoIdMap[symbol];
            if (coingeckoId && response.data[coingeckoId]) {
                prices[symbol] = {
                    usd: response.data[coingeckoId].usd || null,
                    twd: response.data[coingeckoId].twd || null,
                    usdt: response.data[coingeckoId].usdt || null
                };
            } else {
                prices[symbol] = { usd: null, twd: null, usdt: null };
                console.warn(`[${new Date().toISOString()}] No price data found for ${symbol} (CoinGecko ID: ${coingeckoId || 'N/A'}) from CoinGecko.`);
            }
        }

        console.log(`[${new Date().toISOString()}] Crypto Prices Fetched from CoinGecko (Processed):`, prices);
        return prices;

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching crypto prices from CoinGecko:`, error.message);
        if (error.response) {
            console.error('CoinGecko API Error Response Data:', error.response.data);
            console.error('CoinGecko API Error Status:', error.response.status);
            if (error.response.status === 429) {
                console.error(`[${new Date().toISOString()}] CoinGecko API Rate Limit Exceeded. Please wait and retry.`);
            }
        }
        return {};
    }
}


module.exports = {
    getTwdAudExchangeRate,
    getTwdUsdtExchangeRate,
    getCryptoPrices,
};