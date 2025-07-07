// models/CryptoAssetPrice.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const CryptoAssetPrice = sequelize.define('CryptoAssetPrice', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        coinSymbol: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Cryptocurrency symbol (e.g., BTC, ETH, SOL, DOGE)'
        },
        usdPrice: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: true, // Can be null if price fetching fails for USD
            comment: 'Price in USD'
        },
        twdPrice: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: true, // Can be null if price fetching fails for TWD
            comment: 'Price in TWD'
        },
        usdtPrice: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: true, // Can be null if price fetching fails for USDT
            comment: 'Price in USDT'
        },
        timestamp: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            comment: 'Timestamp of when the price was fetched'
        }
    }, {
        tableName: 'crypto_asset_prices',
        timestamps: true,
        createdAt: true,
        updatedAt: true,
        indexes: [
            {
                unique: true,
                fields: ['coinSymbol', 'timestamp'] // Ensure unique entry for a given coin and time
            }
        ]
    });

    return CryptoAssetPrice;
};