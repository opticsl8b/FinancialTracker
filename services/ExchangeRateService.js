const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const ExchangeRate = sequelize.define('ExchangeRate', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        currencyPair: {
            type: DataTypes.STRING,
            allowNull: false
        },
        source: {
            type: DataTypes.STRING,
            allowNull: false
        },
        rate: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: true
        },
        buyRate: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: true
        },
        sellRate: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: true
        },
        timestamp: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'exchange_rates',
        timestamps: true,
        // *** 修正部分：新增唯一索引 ***
        // 確保同一來源的同一貨幣對每天只記錄一次最新價格
        indexes: [
            {
                unique: true,
                fields: ['currencyPair', 'source', sequelize.fn('date_trunc', 'day', sequelize.col('timestamp'))]
            }
        ]
    });

    return ExchangeRate;
};