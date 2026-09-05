# Cashbook

Cashbook is a local GNOME app for recording bank and cash transactions. It stores accounts and transactions in a SQLite database inside a folder chosen by the user.

Money is stored as integer paise. The app currently supports Indian rupees, credit and debit transactions, dates, descriptions, full-table search, and per-account balances.

Use **Back Up...** in the sidebar menu to save a timestamped SQLite snapshot of all accounts and transactions in a folder you choose. Backups do not change the active data folder and are not encrypted. There is no restore action yet.

## Build

Cashbook targets the GNOME 50 Flatpak SDK. Open `io.subho.Cashbook.json` in GNOME Builder or build it with Flatpak Builder.
