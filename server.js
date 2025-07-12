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

// *** 修正部分：載入新的 CryptoTransaction 模型 ***
const User = require('./models/User')(sequelize);
const Account = require('./models/Accounts.js')(sequelize);
const Transaction = require('./models/Transaction.js')(sequelize);
const CryptoAsset = require('./models/CryptoAsset.js')(sequelize);
const ExchangeRate = require('./models/ExchangeRate.js')(sequelize);
const CryptoAssetPrice = require('./models/CryptoAssetPrice.js')(sequelize);
const CryptoTransaction = require('./models/CryptoTransaction.js')(sequelize); // 新增

const models = { User, Account, Transaction, CryptoAsset, ExchangeRate, CryptoAssetPrice, CryptoTransaction }; // 新增
Object.values(models).filter(model => typeof model.associate === 'function').forEach(model => model.associate(models));

let defaultUser = null;

// --- Core Functions (不變) ---
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

// --- API ENDPOINTS ---

// (既有的 API 端點不變，省略)

// --- *** 新增的 API 端點：接收手動交易日誌 *** ---
app.post('/api/crypto-transactions', async (req, res) => {
    if (!defaultUser) {
        return res.status(503).json({ error: 'User not initialized.' });
    }

    try {
        const newLog = await CryptoTransaction.create({
            ...req.body,
            userId: defaultUser.id // 自動將交易關聯到當前用戶
        });
        res.status(201).json(newLog);
    } catch (error) {
        console.error('Error creating crypto transaction log:', error);
        // Sequelize 驗證錯誤會提供更詳細的訊息
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
    });
});