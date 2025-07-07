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
            type: DataTypes.DECIMAL(18, 2), // 通常法幣餘額保留兩位小數
            allowNull: false,
            defaultValue: 0.00,
            comment: 'Current balance of the account'
        },
        // TODO: Add userId foreign key association later
        // userId: {
        //     type: DataTypes.UUID, // Assuming UUID for userId
        //     allowNull: false,
        //     references: {
        //         model: 'Users', // Reference to the Users table
        //         key: 'id'
        //     }
        // }
    }, {
        tableName: 'fiat_accounts', // 更改為 fiat_accounts 以區分
        timestamps: true,
        createdAt: true,
        updatedAt: true
    });

    // Define association later if User model is implemented
    // Account.associate = (models) => {
    //     Account.belongsTo(models.User, { foreignKey: 'userId' });
    // };

    return Account;
};
