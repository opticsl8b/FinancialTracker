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
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '持有中',
            comment: '交易狀態',
            validate: {
                isIn: {
                    args: [['持有中', '已售出']],
                    msg: "Status must be either '持有中' or '已售出'"
                }
            }
        },
        investmentType: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '現貨',
            comment: '投資類別 (e.g., 現貨, 交易所活動, 空投, 流動性挖礦)'
        },
        sector: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: '資產賽道 (e.g., L1, MEME, 平台幣, RWA)'
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
        investmentCoinSymbol: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: '投入的幣種 (e.g., USDT, TWD)'
        },
        investmentAmount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            comment: '初始投入的數量 (以 an investmentCoinSymbol 計價)'
        },
        entryPrice: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            comment: '投入時，目標幣種的單價 (以 an investmentCoinSymbol 計價)'
        },
        // *** 將 rewardAmount 替換為 currentQuantity ***
        currentQuantity: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: true, // 允許為空，以兼容簡單的現貨交易
            comment: '當前總持有數量 (若填寫，將以此為準計算市值)'
        },
        fee: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: true,
            defaultValue: 0,
            comment: '交易手續費 (以 an investmentCoinSymbol 計價)'
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