// models/User.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true
            }
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        tableName: 'users',
        timestamps: true,
        // *** 核心設定：預設排除密碼欄位 ***
        defaultScope: {
            attributes: { exclude: ['password'] },
        },
        // *** 輔助設定：在需要時可以明確要求包含密碼 ***
        scopes: {
            withPassword: {
                attributes: { include: ['password'] },
            },
        },
    });

    User.associate = (models) => {
        User.hasMany(models.Account, { foreignKey: 'userId', as: 'fiatAccounts' });
        User.hasMany(models.CryptoAsset, { foreignKey: 'userId', as: 'cryptoAssets' });
    };

    return User;
};