// server.js (Final Modular Version - Corrected)

require('dotenv').config();
const express = require('express');
const { Sequelize } = require('sequelize');

// --- 引入中介軟體和服務 ---
const authenticateToken = require('./middleware/authenticateToken');
const ExchangeRateService = require('./services/ExchangeRateService.js');

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

// --- *** 修正點：初始化所有需要的模型 *** ---
const User = require('./models/User')(sequelize);
const Account = require('./models/Accounts')(sequelize);
const Transaction = require('./models/Transaction')(sequelize);
const CryptoAsset = require('./models/CryptoAsset')(sequelize);
const CryptoTransaction = require('./models/CryptoTransaction')(sequelize);

// 將所有模型打包成一個物件，方便傳遞和關聯
const models = { User, Account, Transaction, CryptoAsset, CryptoTransaction };

// 建立模型之間的關聯
Object.values(models).forEach(model => {
  if (model.associate) {
    model.associate(models);
  }
});


// --- 路由 ---
// # 公開路由 (註冊/登入)
const userRoutes = require('./routes/userRoutes')(models);
app.use('/api/users', userRoutes);

// # 受保護的路由 (需要 JWT 驗證)
const protectedRouter = express.Router();
protectedRouter.use(authenticateToken);

// GET /api/transactions/crypto/pnl
protectedRouter.get('/crypto/pnl', async (req, res) => {
    const userId = req.user.id;
    try {
        const transactions = await models.CryptoTransaction.findAll({ where: { userId, status: '持有中' }, order: [['transactionDate', 'DESC']] });
        if (transactions.length === 0) return res.json({ details: [], summary: {} });

        const symbolsToFetch = [...new Set(transactions.map(t => t.targetCoinSymbol))];
        const prices = await ExchangeRateService.getCryptoPrices(symbolsToFetch);
        
        const details = transactions.map(tx => {
            const txData = tx.get({ plain: true });
            let pnl = null, roi = null, currentMarketValue = null;
            const currentPrice = prices[txData.targetCoinSymbol]?.usd;
            if (currentPrice) {
                const initialCost = parseFloat(txData.investmentAmount);
                const fees = parseFloat(txData.fee) || 0;
                const quantity = txData.currentQuantity ? parseFloat(txData.currentQuantity) : (initialCost / parseFloat(txData.entryPrice));
                currentMarketValue = quantity * currentPrice;
                pnl = currentMarketValue - initialCost - fees;
                if (initialCost > 0) roi = (pnl / initialCost) * 100;
                else if (pnl > 0) roi = Infinity;
            }
            return { ...txData, pnl, roi: roi === Infinity ? '∞' : (roi ? `${roi.toFixed(2)}%` : null), currentMarketValue, currentPrice };
        });

        const summary = {};
        details.forEach(item => {
            const symbol = item.targetCoinSymbol;
            if (!summary[symbol]) summary[symbol] = { totalInvestment: 0, totalCurrentValue: 0, totalPnl: 0, weightedAvgEntryPrice: 0, totalQuantity: 0, currentPrice: item.currentPrice };
            const initialCost = parseFloat(item.investmentAmount);
            const quantity = item.currentQuantity ? parseFloat(item.currentQuantity) : (initialCost / parseFloat(item.entryPrice));
            summary[symbol].totalInvestment += initialCost;
            summary[symbol].totalCurrentValue += item.currentMarketValue || 0;
            summary[symbol].totalQuantity += quantity;
        });

        for (const symbol in summary) {
            const coin = summary[symbol];
            coin.totalPnl = coin.totalCurrentValue - coin.totalInvestment;
            if (coin.totalInvestment > 0) {
                coin.roi = `${((coin.totalPnl / coin.totalInvestment) * 100).toFixed(2)}%`;
                coin.weightedAvgEntryPrice = coin.totalInvestment / coin.totalQuantity;
            } else if (coin.totalPnl > 0) {
                coin.roi = '∞'; coin.weightedAvgEntryPrice = 0;
            }
        }
        res.json({ details, summary });
    } catch (error) {
        console.error('Error calculating PnL:', error);
        res.status(500).json({ error: 'Failed to calculate PnL.' });
    }
});

// POST /api/transactions/crypto
protectedRouter.post('/crypto', async (req, res) => {
    const userId = req.user.id;
    const data = req.body;
    try {
        let newLogs;
        if (Array.isArray(data)) {
            const transactionsToCreate = data.map(tx => ({ ...tx, userId }));
            newLogs = await models.CryptoTransaction.bulkCreate(transactionsToCreate, { validate: true });
        } else {
            newLogs = await models.CryptoTransaction.create({ ...data, userId });
        }
        res.status(201).json(newLogs);
    } catch (error) {
        console.error('Error creating transaction(s):', error);
        res.status(500).json({ error: 'Failed to create transaction(s).' });
    }
});

// 將設定好守衛的子路由掛載到主應用上
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
        });
    } catch (error) {
        console.error('Unable to start the server:', error);
        process.exit(1);
    }
}

startServer();