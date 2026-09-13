/* SPDX-License-Identifier: GPL-3.0-or-later */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { accountCsv } from './csv.js';

const directory = GLib.dir_make_tmp('cashbook-csv-test-XXXXXX');
const path = GLib.build_filenamev([directory, 'cashbook.sqlite3']);
const csvPath = GLib.build_filenamev([directory, 'export.csv']);

function run(command, ...values) {
    const process = Gio.Subprocess.new(
        [ARGV[0], path, command, ...values.map(String)],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    const [, stdout, stderr] = process.communicate_utf8(null, null);
    if (!process.get_successful())
        throw new Error(stderr);
    return stdout.trim();
}

function assertEqual(actual, expected) {
    if (actual !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

try {
    run('init');
    const first = run('add-account', 'Bank', 'cashbook-bank-symbolic');
    const second = run('add-account', 'Cash', 'cashbook-money-symbolic');
    const database = {
        listTransactions: id => JSON.parse(run('list-transactions', id)),
    };
    const header = 'Date,Description,Type,Amount (INR),Transfer\r\n';
    assertEqual(accountCsv(database, first), header);

    run('add-transaction', second, 'credit', 99999, '2026-09-01', 'Other account only', 0);
    run('add-transaction', first, 'debit', 101, '2026-09-02', 'Tea, "special"\r\nবাংলা', 1);
    run('add-transaction', first, 'credit', 12345678, '2026-09-01', '', 0);
    const csv = accountCsv(database, first);
    assertEqual(csv, header +
        '2026-09-01,,credit,123456.78,No\r\n' +
        '2026-09-02,"Tea, ""special""\r\nবাংলা",debit,1.01,Yes\r\n');
    assertEqual(accountCsv(database, second), header +
        '2026-09-01,Other account only,credit,999.99,No\r\n');

    const file = Gio.File.new_for_path(csvPath);
    await new Promise((resolve, reject) => {
        file.replace_contents_bytes_async(
            new GLib.Bytes(new TextEncoder().encode(csv)), null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null, (source, result) => {
                try {
                    source.replace_contents_finish(result);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
    const [, bytes] = file.load_contents(null);
    assertEqual(new TextDecoder().decode(bytes), csv);
    print('CSV export tests passed');
} finally {
    for (const filename of [csvPath, path, `${path}-wal`, `${path}-shm`])
        GLib.unlink(filename);
    GLib.rmdir(directory);
}
