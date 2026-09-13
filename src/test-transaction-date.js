/* SPDX-License-Identifier: GPL-3.0-or-later */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio.resources_register(Gio.Resource.load(ARGV[0]));
Gio.resources_register(Gio.Resource.load(ARGV[1]));
const { CashbookWindow } = await import('resource:///io/subho/Cashbook/js/window.js');

let useLastDate = false;
const accounts = new Map([
    [1, [{ id: 3, date: '2025-01-01' }, { id: 1, date: '2026-09-13' }]],
    [2, [{ id: 2, date: '2026-08-01' }]],
    [3, []],
]);
const context = {
    settings: {
        get_boolean(key) {
            if (key !== 'use-last-transaction-date')
                throw new Error(`Unexpected setting: ${key}`);
            return useLastDate;
        },
    },
    currentAccount: { id: 1 },
    database: {
        listTransactions(id) {
            if (!useLastDate)
                throw new Error('Today should not require reading transactions');
            return accounts.get(id);
        },
    },
    showToast(message) {
        throw new Error(message);
    },
};

function expectDate(expected) {
    const actual = CashbookWindow.prototype.getDefaultTransactionDate.call(context);
    if (actual !== expected)
        throw new Error(`Expected ${expected}, got ${actual}`);
}

const today = GLib.DateTime.new_now_local().format('%F');
expectDate(today);
useLastDate = true;
expectDate('2025-01-01');
context.currentAccount = { id: 2 };
expectDate('2026-08-01');
context.currentAccount = { id: 3 };
expectDate(today);
context.currentAccount = null;
expectDate(today);
context.currentAccount = { id: 1 };
useLastDate = false;
expectDate(today);
print('Default transaction date tests passed');
