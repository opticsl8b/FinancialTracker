// models/ExchangeRate.js
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
            allowNull: false,
            comment: 'Currency pair (e.g., TWD/AUD, TWD/USDT)'
        },
        source: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Source of the rate (e.g., BankOfTaiwan, Bitopro, MAX)'
        },
        rate: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: true, // Can be null if rate fetching fails for this source
            comment: 'Exchange rate value (e.g., last price for TWD/USDT, buy/sell for fiat)'
        },
        buyRate: { // For fiat, e.g., TWD/AUD cash buy rate
            type: DataTypes.DECIMAL(18, 8),
            allowNull: true,
            comment: 'Buy rate for fiat currency (if applicable)'
        },
        sellRate: { // For fiat, e.g., TWD/AUD cash sell rate
            type: DataTypes.DECIMAL(18, 8),
            allowNull: true,
            comment: 'Sell rate for fiat currency (if applicable)'
        },
        timestamp: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            comment: 'Timestamp of when the rate was fetched'
        }
    }, {
        tableName: 'exchange_rates',
        timestamps: true,
        createdAt: true, // Auto-managed by Sequelize
        updatedAt: true, // Auto-managed by Sequelize
        indexes: [
            {
                unique: true,
                fields: ['currencyPair', 'source', 'timestamp'] // Ensure unique entry for a given pair, source, and time
            }
        ]
    });

    return ExchangeRate;
};