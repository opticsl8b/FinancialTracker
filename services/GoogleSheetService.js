// services/GoogleSheetService.js
const { google } = require('googleapis');
const path = require('path');

// 注意：請確保你的 `credentials.json` 檔案路徑正確。
// 它應該位於專案的根目錄，與 server.js 同級，且不應被提交到 Git。
const KEYFILEPATH = path.join(__dirname, '../credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']; // 讀寫 Google Sheet 的權限

const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: SCOPES,
});

const sheets = google.sheets({ version: 'v4', auth });

/**
 * 將數據更新到指定的 Google Sheet。
 * @param {string} spreadsheetId - Google Sheet 的 ID。
 * @param {string} range - 要更新的範圍 (例如：'Sheet1!A1')。
 * @param {Array<Array<any>>} data - 要寫入的數據，一個二維陣列。
 */
async function updateExchangeRatesToSheet(spreadsheetId, range, data) {
    if (!spreadsheetId || !range || !data) {
        console.error('Missing required parameters for Google Sheet update.');
        return;
    }
    try {
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'RAW', // 將輸入視為原始字串
            resource: {
                values: data,
            },
        });
        console.log(`Google Sheet "${spreadsheetId}" updated successfully in range "${range}".`);
    } catch (error) {
        console.error('Error updating Google Sheet:', error.message);
        throw error; // 重新拋出錯誤以便上層函數捕獲
    }
}

module.exports = {
    updateExchangeRatesToSheet,
};