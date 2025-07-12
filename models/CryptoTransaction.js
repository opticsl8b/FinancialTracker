// models/CryptoTransaction.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const CryptoTransaction = sequelize.define('CryptoTransaction', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        targetCoinSymbol: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: '目標幣種 (e.g., BTC, ETH)'
        },
        venue: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: '交易場所 (e.g., Binance, Uniswap)'
        },
        status: {
            type: DataTypes.ENUM('持有中', '已售出'),
            allowNull: false,
            defaultValue: '持有中',
            comment: '交易狀態'
        },
        transactionDate: {
            type: DataTypes.DATE,
            allowNull: false,
            comment: '初始交易日期'
        },
        exitDate: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: '出場或當前紀錄日期'
        },
        strategy: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: '策略類型 (e.g., 網格, 空投, 長期持有)'
        },
        investmentCoinSymbol: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: '投入的幣種 (e.g., USDT, TWD)'
        },
        investmentAmount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            comment: '初始投入的數量'
        },
        entryPrice: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            comment: '投入時，目標幣種的單價 (以投入幣種計價)'
        },
        rewardAmount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: true,
            defaultValue: 0,
            comment: '額外獎勵的數量 (e.g., Airdrop, Staking rewards)'
        },
        fee: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: true,
            defaultValue: 0,
            comment: '交易手續費 (以投入幣種計價)'
        },
        valueUsdt: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            comment: '這筆交易的約當價值 (USDT)'
        }
    }, {
        tableName: 'crypto_transactions',
        timestamps: true
    });

    CryptoTransaction.associate = (models) => {
        CryptoTransaction.belongsTo(models.User, { foreignKey: 'userId' });
    };

    return CryptoTransaction;
};