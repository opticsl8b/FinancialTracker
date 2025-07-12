const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const CryptoAsset = sequelize.define('CryptoAsset', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        // *** 修正部分：暫時改回 allowNull: true ***
        userId: {
            type: DataTypes.UUID,
            allowNull: true, // 暫時允許為空，以便我們先進行數據遷移
            references: {
                model: 'users',
                key: 'id'
            }
        },
        exchange: {
            type: DataTypes.STRING,
            allowNull: false
        },
        coinSymbol: {
            type: DataTypes.STRING,
            allowNull: false
        },
        quantity: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: false
        },
        averageCost: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: false,
            defaultValue: 0.00
        },
        lastKnownPrice: {
            type: DataTypes.DECIMAL(18, 8),
            allowNull: false,
            defaultValue: 0.00
        }
    }, {
        tableName: 'crypto_assets',
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['userId', 'exchange', 'coinSymbol']
            }
        ]
    });

    CryptoAsset.associate = (models) => {
        CryptoAsset.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'user'
        });
    };

    return CryptoAsset;
};