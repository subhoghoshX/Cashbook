/* SPDX-License-Identifier: GPL-3.0-or-later */

function escapeCell(value) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function accountCsv(database, accountId) {
    const rows = [['Date', 'Description', 'Type', 'Amount (INR)', 'Transfer']];
    for (const transaction of database.listTransactions(accountId)) {
        rows.push([
            transaction.date,
            transaction.description,
            transaction.type,
            (transaction.amount / 100).toFixed(2),
            transaction.is_transfer ? 'Yes' : 'No',
        ]);
    }
    return rows.map(row => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}
