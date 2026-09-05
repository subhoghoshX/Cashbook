#!/usr/bin/env python3

import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import unittest


HELPER = str(pathlib.Path(sys.argv.pop(1)).resolve())


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='cashbook backup ')
        self.addCleanup(self.directory.cleanup)
        self.source = pathlib.Path(self.directory.name) / 'cashbook.sqlite3'
        self.destination = self.source.with_name('backup.sqlite3')
        self.run_helper('init')
        self.run_helper('add-account', 'Cash', 'cashbook-money-symbolic')
        self.run_helper('add-account', 'Bank', 'cashbook-bank-symbolic')
        self.run_helper('add-transaction', '1', 'credit', '123456', '2026-09-05',
                        'Opening balance', '0')
        self.run_helper('add-transaction', '2', 'debit', '123', '2026-09-05',
                        'Transfer', '1')

    def run_helper(self, *args, success=True):
        result = subprocess.run([HELPER, str(self.source), *map(str, args)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, success, result.stderr)
        return result

    def test_complete_independent_snapshot(self):
        original = self.source.read_bytes()
        self.run_helper('backup', self.destination)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(self.destination.stat().st_mode & 0o777, 0o600)
        with sqlite3.connect(self.source) as source, sqlite3.connect(self.destination) as backup:
            self.assertEqual(list(source.iterdump()), list(backup.iterdump()))
            self.assertEqual(backup.execute('PRAGMA integrity_check').fetchone(), ('ok',))
            self.assertEqual(backup.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.run_helper('add-account', 'Later account', 'cashbook-bank-symbolic')
        with sqlite3.connect(self.destination) as backup:
            self.assertEqual(backup.execute('SELECT count(*) FROM accounts').fetchone(), (2,))

    def test_existing_destination_and_source_are_not_overwritten(self):
        self.destination.write_bytes(b'existing backup')
        self.run_helper('backup', self.destination, success=False)
        self.assertEqual(self.destination.read_bytes(), b'existing backup')
        original = self.source.read_bytes()
        self.run_helper('backup', self.source, success=False)
        self.assertEqual(self.source.read_bytes(), original)

    def test_missing_source_is_not_created(self):
        self.source.unlink()
        self.run_helper('backup', self.destination, success=False)
        self.assertFalse(self.source.exists())
        self.assertFalse(self.destination.exists())

    def test_invalid_destination(self):
        self.run_helper('backup', self.destination / 'missing.sqlite3', success=False)
        self.assertFalse(self.destination.exists())

    def test_failed_backup_is_removed(self):
        self.source.write_bytes(b'not a SQLite database')
        self.run_helper('backup', self.destination, success=False)
        self.assertFalse(self.destination.exists())

    def test_locked_source_leaves_no_backup(self):
        with sqlite3.connect(self.source) as source:
            source.execute('BEGIN EXCLUSIVE')
            result = self.run_helper('backup', self.destination, success=False)
            self.assertIn('locked', result.stderr)
        self.assertFalse(self.destination.exists())

    def test_backup_includes_committed_wal_data(self):
        with sqlite3.connect(self.source) as source:
            source.execute('PRAGMA journal_mode = WAL')
            source.execute("INSERT INTO accounts(name, icon) VALUES('WAL account', 'bank')")
            source.commit()
            self.run_helper('backup', self.destination)
            with sqlite3.connect(self.destination) as backup:
                self.assertEqual(list(source.iterdump()), list(backup.iterdump()))


if __name__ == '__main__':
    unittest.main()
