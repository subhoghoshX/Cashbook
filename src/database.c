/* SPDX-License-Identifier: GPL-3.0-or-later */

#include <sqlite3.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void
print_json_string(const char *value)
{
    const unsigned char *cursor = (const unsigned char *)(value ? value : "");

    putchar('"');
    while (*cursor) {
        switch (*cursor) {
        case '"': fputs("\\\"", stdout); break;
        case '\\': fputs("\\\\", stdout); break;
        case '\b': fputs("\\b", stdout); break;
        case '\f': fputs("\\f", stdout); break;
        case '\n': fputs("\\n", stdout); break;
        case '\r': fputs("\\r", stdout); break;
        case '\t': fputs("\\t", stdout); break;
        default:
            if (*cursor < 0x20)
                printf("\\u%04x", *cursor);
            else
                putchar(*cursor);
        }
        cursor++;
    }
    putchar('"');
}

static int
fail(sqlite3 *db, const char *message)
{
    fprintf(stderr, "%s: %s\n", message, db ? sqlite3_errmsg(db) : "unknown error");
    return EXIT_FAILURE;
}

static int
prepare(sqlite3 *db, sqlite3_stmt **statement, const char *sql)
{
    if (sqlite3_prepare_v2(db, sql, -1, statement, NULL) != SQLITE_OK)
        return fail(db, "Could not prepare database query");
    return EXIT_SUCCESS;
}

static int
initialize(sqlite3 *db)
{
    const char *sql =
        "PRAGMA foreign_keys = ON;"
        "PRAGMA journal_mode = DELETE;"
        "CREATE TABLE IF NOT EXISTS accounts ("
        " id INTEGER PRIMARY KEY,"
        " name TEXT NOT NULL COLLATE NOCASE UNIQUE,"
        " icon TEXT NOT NULL,"
        " created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        ");"
        "CREATE TABLE IF NOT EXISTS transactions ("
        " id INTEGER PRIMARY KEY,"
        " account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,"
        " type TEXT NOT NULL CHECK(type IN ('credit', 'debit')),"
        " amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),"
        " transaction_date TEXT NOT NULL,"
        " description TEXT NOT NULL DEFAULT '',"
        " created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        ");"
        "CREATE INDEX IF NOT EXISTS transactions_account_date "
        "ON transactions(account_id, transaction_date DESC, id DESC);";
    char *error = NULL;

    if (sqlite3_exec(db, sql, NULL, NULL, &error) != SQLITE_OK) {
        fprintf(stderr, "Could not initialize database: %s\n", error);
        sqlite3_free(error);
        return EXIT_FAILURE;
    }
    return EXIT_SUCCESS;
}

static int
list_accounts(sqlite3 *db)
{
    sqlite3_stmt *statement = NULL;
    const char *sql =
        "SELECT a.id, a.name, a.icon, "
        "COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount_paise ELSE -t.amount_paise END), 0) "
        "FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id "
        "GROUP BY a.id ORDER BY a.created_at, a.id";
    int first = 1;

    if (prepare(db, &statement, sql) != EXIT_SUCCESS)
        return EXIT_FAILURE;

    putchar('[');
    while (sqlite3_step(statement) == SQLITE_ROW) {
        if (!first)
            putchar(',');
        fputs("{\"id\":", stdout);
        printf("%lld", sqlite3_column_int64(statement, 0));
        fputs(",\"name\":", stdout);
        print_json_string((const char *)sqlite3_column_text(statement, 1));
        fputs(",\"icon\":", stdout);
        print_json_string((const char *)sqlite3_column_text(statement, 2));
        fputs(",\"balance\":", stdout);
        printf("%lld}", sqlite3_column_int64(statement, 3));
        first = 0;
    }
    puts("]");
    sqlite3_finalize(statement);
    return EXIT_SUCCESS;
}

static int
add_account(sqlite3 *db, const char *name, const char *icon)
{
    sqlite3_stmt *statement = NULL;

    if (prepare(db, &statement, "INSERT INTO accounts(name, icon) VALUES(?, ?)") != EXIT_SUCCESS)
        return EXIT_FAILURE;
    sqlite3_bind_text(statement, 1, name, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 2, icon, -1, SQLITE_TRANSIENT);
    if (sqlite3_step(statement) != SQLITE_DONE) {
        sqlite3_finalize(statement);
        return fail(db, "Could not add account");
    }
    sqlite3_finalize(statement);
    printf("%lld\n", sqlite3_last_insert_rowid(db));
    return EXIT_SUCCESS;
}

static int
update_account(sqlite3 *db, const char *account_id, const char *name, const char *icon)
{
    sqlite3_stmt *statement = NULL;

    if (prepare(db, &statement, "UPDATE accounts SET name = ?, icon = ? WHERE id = ?") != EXIT_SUCCESS)
        return EXIT_FAILURE;
    sqlite3_bind_text(statement, 1, name, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 2, icon, -1, SQLITE_TRANSIENT);
    sqlite3_bind_int64(statement, 3, strtoll(account_id, NULL, 10));
    if (sqlite3_step(statement) != SQLITE_DONE) {
        sqlite3_finalize(statement);
        return fail(db, "Could not update account");
    }
    sqlite3_finalize(statement);
    return EXIT_SUCCESS;
}

static int
list_transactions(sqlite3 *db, const char *account_id)
{
    sqlite3_stmt *statement = NULL;
    const char *sql =
        "SELECT id, type, amount_paise, transaction_date, description "
        "FROM transactions WHERE account_id = ? "
        "ORDER BY transaction_date DESC, id DESC";
    int first = 1;

    if (prepare(db, &statement, sql) != EXIT_SUCCESS)
        return EXIT_FAILURE;
    sqlite3_bind_int64(statement, 1, strtoll(account_id, NULL, 10));

    putchar('[');
    while (sqlite3_step(statement) == SQLITE_ROW) {
        if (!first)
            putchar(',');
        fputs("{\"id\":", stdout);
        printf("%lld", sqlite3_column_int64(statement, 0));
        fputs(",\"type\":", stdout);
        print_json_string((const char *)sqlite3_column_text(statement, 1));
        fputs(",\"amount\":", stdout);
        printf("%lld", sqlite3_column_int64(statement, 2));
        fputs(",\"date\":", stdout);
        print_json_string((const char *)sqlite3_column_text(statement, 3));
        fputs(",\"description\":", stdout);
        print_json_string((const char *)sqlite3_column_text(statement, 4));
        putchar('}');
        first = 0;
    }
    puts("]");
    sqlite3_finalize(statement);
    return EXIT_SUCCESS;
}

static int
add_transaction(sqlite3 *db, char **values)
{
    sqlite3_stmt *statement = NULL;
    const char *sql =
        "INSERT INTO transactions(account_id, type, amount_paise, transaction_date, description) "
        "VALUES(?, ?, ?, ?, ?)";

    if (prepare(db, &statement, sql) != EXIT_SUCCESS)
        return EXIT_FAILURE;
    sqlite3_bind_int64(statement, 1, strtoll(values[0], NULL, 10));
    sqlite3_bind_text(statement, 2, values[1], -1, SQLITE_TRANSIENT);
    sqlite3_bind_int64(statement, 3, strtoll(values[2], NULL, 10));
    sqlite3_bind_text(statement, 4, values[3], -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 5, values[4], -1, SQLITE_TRANSIENT);
    if (sqlite3_step(statement) != SQLITE_DONE) {
        sqlite3_finalize(statement);
        return fail(db, "Could not add transaction");
    }
    sqlite3_finalize(statement);
    return EXIT_SUCCESS;
}

static int
update_transaction(sqlite3 *db, char **values)
{
    sqlite3_stmt *statement = NULL;
    const char *sql =
        "UPDATE transactions "
        "SET type = ?, amount_paise = ?, transaction_date = ?, description = ? "
        "WHERE id = ?";

    if (prepare(db, &statement, sql) != EXIT_SUCCESS)
        return EXIT_FAILURE;
    sqlite3_bind_text(statement, 1, values[1], -1, SQLITE_TRANSIENT);
    sqlite3_bind_int64(statement, 2, strtoll(values[2], NULL, 10));
    sqlite3_bind_text(statement, 3, values[3], -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 4, values[4], -1, SQLITE_TRANSIENT);
    sqlite3_bind_int64(statement, 5, strtoll(values[0], NULL, 10));
    if (sqlite3_step(statement) != SQLITE_DONE) {
        sqlite3_finalize(statement);
        return fail(db, "Could not update transaction");
    }
    sqlite3_finalize(statement);
    return EXIT_SUCCESS;
}

int
main(int argc, char **argv)
{
    sqlite3 *db = NULL;
    int result = EXIT_FAILURE;

    if (argc < 3) {
        fputs("Usage: cashbook-db DATABASE COMMAND [VALUES...]\n", stderr);
        return EXIT_FAILURE;
    }
    if (sqlite3_open(argv[1], &db) != SQLITE_OK) {
        result = fail(db, "Could not open database");
        sqlite3_close(db);
        return result;
    }
    sqlite3_busy_timeout(db, 3000);
    if (initialize(db) != EXIT_SUCCESS)
        goto out;

    if (strcmp(argv[2], "init") == 0 && argc == 3)
        result = EXIT_SUCCESS;
    else if (strcmp(argv[2], "list-accounts") == 0 && argc == 3)
        result = list_accounts(db);
    else if (strcmp(argv[2], "add-account") == 0 && argc == 5)
        result = add_account(db, argv[3], argv[4]);
    else if (strcmp(argv[2], "update-account") == 0 && argc == 6)
        result = update_account(db, argv[3], argv[4], argv[5]);
    else if (strcmp(argv[2], "list-transactions") == 0 && argc == 4)
        result = list_transactions(db, argv[3]);
    else if (strcmp(argv[2], "add-transaction") == 0 && argc == 8)
        result = add_transaction(db, &argv[3]);
    else if (strcmp(argv[2], "update-transaction") == 0 && argc == 8)
        result = update_transaction(db, &argv[3]);
    else
        fputs("Unknown command or wrong number of values\n", stderr);

out:
    sqlite3_close(db);
    return result;
}
