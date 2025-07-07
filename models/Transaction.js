// models/Transaction.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Transaction = sequelize.define('Transaction', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        accountId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'fiat_accounts', // 參考 Account 模型對應的資料表名稱
                key: 'id'
            },
            comment: 'Foreign key to the associated fiat account'
        },
        transactionDate: {
            type: DataTypes.DATE,
            allowNull: false,
            comment: 'Date and time when the transaction occurred'
        },
        description: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Description of the transaction (e.g., 薪資收入, 晚餐支出, 轉帳)'
        },
        amount: {
            type: DataTypes.DECIMAL(18, 2),
            allowNull: false,
            comment: 'Amount of the transaction (positive for income, negative for expense/transfer out)'
        },
        transactionType: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Type of transaction (e.g., income, expense, transfer, loan_payment, deposit, withdrawal)'
        },
        status: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'completed',
            comment: 'Status of the transaction (e.g., completed, pending)'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Optional notes for the transaction'
        }
    }, {
        tableName: 'fiat_transactions', // 更改為 fiat_transactions
        timestamps: true,
        createdAt: true,
        updatedAt: true
    });

    // Define association
    Transaction.associate = (models) => {
        Transaction.belongsTo(models.Account, { foreignKey: 'accountId' });
    };

    return Transaction;
};
