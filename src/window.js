/* SPDX-License-Identifier: GPL-3.0-or-later */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

const RESPONSE_ADD = Gtk.ResponseType.ACCEPT;
const ICON_WORDS = [
    'bank', 'briefcase', 'business', 'card', 'cash', 'coin', 'credit',
    'currency', 'finance', 'money', 'office', 'payment', 'safe', 'wallet',
];

const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
});

function clearChildren(widget) {
    let child = widget.get_first_child();
    while (child) {
        const next = child.get_next_sibling();
        widget.remove(child);
        child = next;
    }
}

function formatMoney(paise) {
    return currencyFormatter.format(paise / 100);
}

class Database {
    constructor(path) {
        this.path = path;
        this.run('init');
    }

    run(command, ...values) {
        const process = Gio.Subprocess.new(
            ['cashbook-db', this.path, command, ...values.map(String)],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );
        const [, stdout, stderr] = process.communicate_utf8(null, null);

        if (!process.get_successful())
            throw new Error(stderr.trim() || 'The database command failed.');
        return stdout.trim();
    }

    listAccounts() {
        return JSON.parse(this.run('list-accounts'));
    }

    addAccount(name, icon) {
        return Number(this.run('add-account', name, icon));
    }

    listTransactions(accountId) {
        return JSON.parse(this.run('list-transactions', accountId));
    }

    addTransaction(accountId, type, amount, date, description) {
        this.run('add-transaction', accountId, type, amount, date, description);
    }
}

export const CashbookWindow = GObject.registerClass({
    GTypeName: 'CashbookWindow',
    Template: 'resource:///io/subho/Cashbook/window.ui',
    InternalChildren: [
        'toast_overlay', 'root_stack', 'choose_folder_button', 'split_view',
        'add_account_button', 'account_list', 'account_title', 'search_entry',
        'add_transaction_button', 'transaction_stack', 'empty_page',
        'empty_action_button', 'transaction_list', 'balance_bar', 'balance_label',
    ],
}, class CashbookWindow extends Adw.ApplicationWindow {
    constructor(application) {
        super({ application });

        this.settings = new Gio.Settings({ schema_id: 'io.subho.Cashbook' });
        this.database = null;
        this.accounts = [];
        this.transactions = [];
        this.currentAccount = null;

        this._choose_folder_button.connect('clicked', () => this.chooseFolder());
        this._add_account_button.connect('clicked', () => this.showAccountDialog());
        this._add_transaction_button.connect('clicked', () => this.showTransactionDialog());
        this._empty_action_button.connect('clicked', () => {
            if (this.currentAccount)
                this.showTransactionDialog();
            else
                this.showAccountDialog();
        });
        this._account_list.connect('row-selected', (_list, row) => {
            if (row?.account)
                this.selectAccount(row.account);
        });
        this._search_entry.connect('search-changed', () => this.renderTransactions());

        this.openSavedDirectory();
    }

    showToast(message) {
        this._toast_overlay.add_toast(new Adw.Toast({ title: message, timeout: 4 }));
    }

    openSavedDirectory() {
        const directory = this.settings.get_string('data-directory');
        if (!directory)
            return;

        try {
            const folder = Gio.File.new_for_path(directory);
            if (folder.query_file_type(Gio.FileQueryInfoFlags.NONE, null) === Gio.FileType.DIRECTORY) {
                this.loadDirectory(directory);
                return;
            }
        } catch (error) {
            console.debug(`Saved data folder is unavailable: ${error.message}`);
        }
        if (directory) {
            this.settings.set_string('data-directory', '');
            this.showToast('The previous data folder is no longer available.');
        }
    }

    chooseFolder() {
        const dialog = new Gtk.FileDialog({ title: 'Choose Cashbook Folder', modal: true });
        dialog.select_folder(this, null, (source, result) => {
            try {
                const folder = source.select_folder_finish(result);
                const path = folder.get_path();
                if (!path) {
                    this.showToast('Choose a folder on this device.');
                    return;
                }
                if (this.loadDirectory(path))
                    this.settings.set_string('data-directory', path);
            } catch (error) {
                console.debug(`Folder selection closed: ${error.message}`);
            }
        });
    }

    loadDirectory(directory) {
        try {
            const path = GLib.build_filenamev([directory, 'cashbook.sqlite3']);
            this.database = new Database(path);
            this._root_stack.visible_child_name = 'cashbook';
            this.loadAccounts();
            return true;
        } catch (error) {
            this.database = null;
            this._root_stack.visible_child_name = 'welcome';
            this.showToast(`Could not open this folder: ${error.message}`);
            return false;
        }
    }

    loadAccounts(preferredId = this.currentAccount?.id ?? null) {
        try {
            this.accounts = this.database.listAccounts();
        } catch (error) {
            this.showToast(error.message);
            return;
        }

        clearChildren(this._account_list);
        let selectedRow = null;
        for (const account of this.accounts) {
            const row = this.createAccountRow(account);
            this._account_list.append(row);
            if (account.id === preferredId)
                selectedRow = row;
        }

        if (this.accounts.length === 0) {
            this.currentAccount = null;
            this.transactions = [];
            this.showNoAccount();
            return;
        }

        selectedRow ??= this._account_list.get_row_at_index(0);
        this._account_list.select_row(selectedRow);
    }

    createAccountRow(account) {
        const row = new Gtk.ListBoxRow();
        row.account = account;

        const box = new Gtk.Box({ spacing: 12, css_classes: ['account-row'] });
        const image = new Gtk.Image({ icon_name: account.icon, pixel_size: 22 });
        image.add_css_class('account-icon');
        const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER });
        const name = new Gtk.Label({ label: account.name, xalign: 0, ellipsize: 3 });
        const balance = new Gtk.Label({
            label: formatMoney(account.balance),
            xalign: 0,
            css_classes: ['caption', 'dim-label'],
        });
        text.append(name);
        text.append(balance);
        box.append(image);
        box.append(text);
        row.child = box;
        return row;
    }

    showNoAccount() {
        this._account_title.label = 'Cashbook';
        this._search_entry.visible = false;
        this._add_transaction_button.sensitive = false;
        this._balance_bar.visible = false;
        this._transaction_stack.visible_child_name = 'empty';
        this._empty_page.icon_name = 'wallet-symbolic';
        this._empty_page.title = 'Add an account to begin';
        this._empty_page.description = 'Accounts keep their own transactions and balance.';
        this._empty_action_button.label = 'Add Account';
        this._empty_action_button.visible = true;
    }

    selectAccount(account) {
        this.currentAccount = account;
        this._account_title.label = account.name;
        this._search_entry.visible = true;
        this._add_transaction_button.sensitive = true;
        this._balance_bar.visible = true;
        this._balance_label.label = formatMoney(account.balance);
        try {
            this.transactions = this.database.listTransactions(account.id);
            this.renderTransactions();
        } catch (error) {
            this.showToast(error.message);
        }
        if (this._split_view.collapsed)
            this._split_view.show_content = true;
    }

    renderTransactions() {
        if (!this.currentAccount)
            return;

        const query = this._search_entry.text.trim().toLocaleLowerCase();
        const visible = this.transactions.filter(transaction => {
            if (!query)
                return true;
            const searchable = [
                transaction.type,
                transaction.date,
                transaction.description,
                (transaction.amount / 100).toFixed(2),
                formatMoney(transaction.amount),
            ].join(' ').toLocaleLowerCase();
            return searchable.includes(query);
        });

        clearChildren(this._transaction_list);
        for (const transaction of visible)
            this._transaction_list.append(this.createTransactionRow(transaction));

        if (visible.length > 0) {
            this._transaction_stack.visible_child_name = 'transactions';
            return;
        }

        this._transaction_stack.visible_child_name = 'empty';
        this._empty_page.icon_name = query ? 'edit-find-symbolic' : 'document-new-symbolic';
        this._empty_page.title = query ? 'No matching transactions' : 'No transactions yet';
        this._empty_page.description = query
            ? 'Try a different amount, date, type, or description.'
            : `Add the first transaction for ${this.currentAccount.name}.`;
        this._empty_action_button.label = 'Add Transaction';
        this._empty_action_button.visible = !query;
    }

    createTransactionRow(transaction) {
        const typeTitle = transaction.type === 'credit' ? 'Credit' : 'Debit';
        const box = new Gtk.Box({
            spacing: 18,
            css_classes: ['transaction-row', transaction.type],
        });
        const date = new Gtk.Label({
            label: transaction.date,
            xalign: 0,
            width_chars: 13,
        });
        const typeBox = new Gtk.Box({ width_request: 86, halign: Gtk.Align.START });
        const type = new Gtk.Label({
            label: typeTitle,
            css_classes: ['transaction-type', transaction.type],
        });
        const description = new Gtk.Label({
            label: transaction.description || 'No description',
            xalign: 0,
            hexpand: true,
            ellipsize: 3,
        });
        if (!transaction.description)
            description.add_css_class('dim-label');
        const sign = transaction.type === 'credit' ? '+' : '-';
        const amount = new Gtk.Label({
            label: `${sign}${formatMoney(transaction.amount)}`,
            xalign: 1,
            width_chars: 16,
            css_classes: [transaction.type === 'credit' ? 'amount-credit' : 'amount-debit'],
        });

        typeBox.append(type);
        box.append(date);
        box.append(typeBox);
        box.append(description);
        box.append(amount);
        return box;
    }

    showAccountDialog() {
        const dialog = new Gtk.Dialog({
            title: 'New Account',
            transient_for: this,
            modal: true,
            default_width: 520,
            default_height: 500,
        });
        dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
        dialog.add_button('Add Account', RESPONSE_ADD);
        dialog.set_default_response(RESPONSE_ADD);

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 14,
            css_classes: ['dialog-form'],
        });
        const name = new Gtk.Entry({
            placeholder_text: 'Account name',
            activates_default: true,
        });
        const heading = new Gtk.Label({ label: 'Choose an icon', xalign: 0, css_classes: ['heading'] });
        const flow = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.NONE,
            homogeneous: true,
            row_spacing: 6,
            column_spacing: 6,
            max_children_per_line: 9,
            css_classes: ['icon-grid'],
        });
        const scroll = new Gtk.ScrolledWindow({ vexpand: true, child: flow });
        let selectedIcon = 'wallet-symbolic';
        let selectedButton = null;

        const theme = Gtk.IconTheme.get_for_display(this.get_display());
        let icons = theme.get_icon_names()
            .filter(icon => ICON_WORDS.some(word => icon.toLocaleLowerCase().includes(word)))
            .sort();
        if (!icons.includes(selectedIcon) && theme.has_icon(selectedIcon))
            icons.unshift(selectedIcon);

        for (const icon of icons) {
            const button = new Gtk.Button({
                child: new Gtk.Image({ icon_name: icon, pixel_size: 24 }),
                tooltip_text: icon,
                css_classes: ['flat', 'icon-choice'],
            });
            button.connect('clicked', () => {
                selectedButton?.remove_css_class('selected-icon');
                selectedButton = button;
                selectedIcon = icon;
                button.add_css_class('selected-icon');
            });
            flow.insert(button, -1);
            if (icon === selectedIcon) {
                selectedButton = button;
                button.add_css_class('selected-icon');
            }
        }

        form.append(name);
        form.append(heading);
        form.append(scroll);
        dialog.get_content_area().append(form);
        dialog.connect('response', (_dialog, response) => {
            if (response !== RESPONSE_ADD) {
                dialog.destroy();
                return;
            }
            const accountName = name.text.trim();
            if (!accountName) {
                name.add_css_class('error');
                name.grab_focus();
                return;
            }
            try {
                const id = this.database.addAccount(accountName, selectedIcon);
                dialog.destroy();
                this.loadAccounts(id);
            } catch (error) {
                this.showToast(error.message.includes('UNIQUE')
                    ? 'An account with this name already exists.'
                    : error.message);
            }
        });
        dialog.present();
        name.grab_focus();
    }

    showTransactionDialog() {
        if (!this.currentAccount)
            return;

        const dialog = new Gtk.Dialog({
            title: `New Transaction - ${this.currentAccount.name}`,
            transient_for: this,
            modal: true,
            default_width: 440,
        });
        dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
        dialog.add_button('Add Transaction', RESPONSE_ADD);
        dialog.set_default_response(RESPONSE_ADD);

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 14,
            css_classes: ['dialog-form'],
        });
        const type = Gtk.DropDown.new_from_strings(['Credit', 'Debit']);
        const amount = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0.01,
                upper: 1000000000,
                step_increment: 1,
                page_increment: 100,
            }),
            digits: 2,
            numeric: true,
            activates_default: true,
        });
        const calendar = new Gtk.Calendar({ halign: Gtk.Align.CENTER });
        const description = new Gtk.Entry({
            placeholder_text: 'Description (optional)',
            activates_default: true,
        });

        const typeRow = new Adw.ActionRow({ title: 'Type' });
        typeRow.add_suffix(type);
        const amountRow = new Adw.ActionRow({ title: 'Amount', subtitle: 'Indian rupees' });
        amountRow.add_prefix(new Gtk.Label({ label: '₹', css_classes: ['title-3'] }));
        amountRow.add_suffix(amount);
        const details = new Adw.PreferencesGroup();
        details.add(typeRow);
        details.add(amountRow);
        form.append(details);
        form.append(new Gtk.Label({ label: 'Date', xalign: 0, css_classes: ['heading'] }));
        form.append(calendar);
        form.append(description);
        dialog.get_content_area().append(form);

        dialog.connect('response', (_dialog, response) => {
            if (response !== RESPONSE_ADD) {
                dialog.destroy();
                return;
            }
            const paise = Math.round(amount.value * 100);
            if (paise <= 0) {
                amount.add_css_class('error');
                amount.grab_focus();
                return;
            }
            const accountId = this.currentAccount.id;
            const transactionType = type.selected === 0 ? 'credit' : 'debit';
            const date = calendar.get_date().format('%F');
            try {
                this.database.addTransaction(
                    accountId,
                    transactionType,
                    paise,
                    date,
                    description.text.trim()
                );
                dialog.destroy();
                this._search_entry.text = '';
                this.loadAccounts(accountId);
            } catch (error) {
                this.showToast(error.message);
            }
        });
        dialog.present();
        amount.grab_focus();
    }
});
