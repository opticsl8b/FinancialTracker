// services/ExchangeRateService.js

const axios = require('axios');
const cheerio = require('cheerio');

// -- (getTwdAudExchangeRate 函式保持不變，已是最新爬蟲版本) --
// ... (之前的 getTwdAudExchangeRate 程式碼) ...
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


// 抓取 Bitopro 的 TWD/USDT 匯率
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

// 抓取 MAX 交易所的 TWD/USDT 匯率
async function fetchMaxTwdUsdtRate() {
    // 使用您提供的格式：usdttwd
    const maxApiUrl = 'https://max-api.maicoin.com/api/v2/tickers/usdttwd'; 
    try {
        const response = await axios.get(maxApiUrl);
        // MAX 的 API 響應結構是直接的，沒有 'data' 包裹
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


// 重構後的 getTwdUsdtExchangeRate，同時獲取兩家交易所的匯率
async function getTwdUsdtExchangeRate() {
    console.log(`[${new Date().toISOString()}] Fetching TWD/USDT Exchange Rates from Bitopro and MAX...`);
    
    // 使用 Promise.allSettled 來並行執行 API 請求，即使一個失敗，另一個也能繼續
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

    // 您可以根據需求決定返回哪個匯率（例如：Bitopro優先，或MAX優先，或兩者都返回）
    // 目前返回一個包含兩者結果的物件
    return rates;
}


// 現有其他匯率抓取函式 (保持不變)
async function getCryptoPrices(symbols) {
    console.log(`Fetching real crypto prices for ${symbols.join(', ')} from CoinGecko...`);
    // Example using CoinGecko API (requires installing 'coingecko-api' or similar)
    // For MVP, if you are not using a direct API, you might need to scrape or use a free tier
    // For now, let's keep it simulated or ensure you have a working API client
    const prices = {};
    for (const symbol of symbols) {
        // Here you would integrate a real CoinGecko API call
        // For now, continuing with a simulated price or placeholder if no API is set up for it yet
        prices[symbol] = Math.random() * 50000 + 10000; // Simulated price
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
    return prices;
}

module.exports = {
    getTwdAudExchangeRate,
    getTwdUsdtExchangeRate, // 現在它會返回包含 Bitopro 和 MAX 匯率的物件
    getCryptoPrices,
};