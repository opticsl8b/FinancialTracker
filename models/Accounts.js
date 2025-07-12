// models/Account.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Account = sequelize.define('Account', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        accountName: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'User-defined name for the account (e.g., 玉山銀行主帳戶, NAB 薪資帳戶)'
        },
        bankName: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Name of the bank (e.g., 玉山銀行, NAB, 中國信託)'
        },
        currency: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Currency of the account (e.g., TWD, AUD)'
        },
        accountType: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Type of account (e.g., physical, digital, salary, joint, savings, loan)'
        },
        balance: {
            type: DataTypes.DECIMAL(18, 2),
            allowNull: false,
            defaultValue: 0.00,
            comment: 'Current balance of the account'
        },
        // *** 修正部分 開始 ***
        userId: {
            type: DataTypes.UUID,
            allowNull: true, // 改為 true，允許現有數據暫時沒有 userId
            references: {
                model: 'users', // 指向 'users' 資料表
                key: 'id'
            }
        }
        // *** 修正部分 結束 ***
    }, {
        tableName: 'fiat_accounts',
        timestamps: true,
        createdAt: true,
        updatedAt: true
    });

    // *** 新增關聯定義 ***
    Account.associate = (models) => {
        Account.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
        Account.hasMany(models.Transaction, { foreignKey: 'accountId', as: 'transactions', onDelete: 'CASCADE' });
    };

    return Account;
};