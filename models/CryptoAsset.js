const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const CryptoAsset = sequelize.define('CryptoAsset', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        exchange: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Exchange name (e.g., Binance, OKX, Bybit)'
        },
        coinSymbol: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Cryptocurrency symbol (e.g., BTC, ETH, SOL, DOGE)'
        },
        quantity: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: false,
            comment: 'Quantity of cryptocurrency held (allows for very small amounts)'
        },
        averageCost: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: false,
            defaultValue: 0.00,
            comment: 'Average cost per unit in USDT'
        },
        lastKnownPrice: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: false,
            defaultValue: 0.00,
            comment: 'Current market price in USDT for profit/loss calculation'
        }
        // TODO: Add userId foreign key association later
        // userId: {
        //     type: DataTypes.INTEGER,
        //     allowNull: false,
        //     references: {
        //         model: 'users',
        //         key: 'id'
        //     }
        // }
    }, {
        tableName: 'crypto_assets',
        timestamps: true,
        createdAt: true,
        updatedAt: true
    });

    return CryptoAsset;
}; 