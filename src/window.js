/* SPDX-License-Identifier: GPL-3.0-or-later */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

const ACCOUNT_ICONS = [
    { name: 'cashbook-bank-symbolic', label: 'Bank' },
    { name: 'cashbook-money-symbolic', label: 'Cash' },
    { name: 'cashbook-coin-symbolic', label: 'Coins' },
    { name: 'cashbook-credit-card-symbolic', label: 'Card' },
    { name: 'cashbook-money-clip-symbolic', label: 'Money clip' },
    { name: 'cashbook-wallet-symbolic', label: 'Wallet' },
    { name: 'cashbook-wallet2-symbolic', label: 'Wallet 2' },
    { name: 'cashbook-wallet3-symbolic', label: 'Wallet 3' },
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

    updateAccount(accountId, name, icon) {
        this.run('update-account', accountId, name, icon);
    }

    listTransactions(accountId) {
        return JSON.parse(this.run('list-transactions', accountId));
    }

    addTransaction(accountId, type, amount, date, description) {
        this.run('add-transaction', accountId, type, amount, date, description);
    }

    updateTransaction(transactionId, type, amount, date, description) {
        this.run('update-transaction', transactionId, type, amount, date, description);
    }
}

export const CashbookWindow = GObject.registerClass({
    GTypeName: 'CashbookWindow',
    Template: 'resource:///io/subho/Cashbook/window.ui',
    InternalChildren: [
        'toast_overlay', 'root_stack', 'choose_folder_button', 'split_view',
        'account_list', 'search_entry',
        'add_transaction_button', 'transaction_stack', 'empty_page',
        'empty_action_button', 'transaction_list',
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
        this._add_transaction_button.connect('clicked', () => this.showTransactionDialog());
        this._empty_action_button.connect('clicked', () => {
            if (this.currentAccount)
                this.showTransactionDialog();
            else
                this.showAccountDialog();
        });
        this._account_list.connect('row-selected', (_list, row) => {
            let child = this._account_list.get_first_child();
            while (child) {
                if (child.editButton)
                    child.editButton.visible = child === row;
                child = child.get_next_sibling();
            }
            if (row?.account)
                this.selectAccount(row.account);
        });
        this._search_entry.connect('search-changed', () => this.renderTransactions());
        this._transaction_list.connect('row-activated', (_list, row) => {
            if (row.transaction)
                this.showTransactionDialog(row.transaction);
        });

        const addAccountAction = new Gio.SimpleAction({ name: 'add-account' });
        addAccountAction.connect('activate', () => this.showAccountDialog());
        this.add_action(addAccountAction);

        const changeFolderAction = new Gio.SimpleAction({ name: 'change-data-folder' });
        changeFolderAction.connect('activate', () => this.showFolderChooser());
        this.add_action(changeFolderAction);

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

    showFolderChooser() {
        this.settings.set_string('data-directory', '');
        this.database = null;
        this.accounts = [];
        this.transactions = [];
        this.currentAccount = null;
        this._search_entry.text = '';
        clearChildren(this._account_list);
        clearChildren(this._transaction_list);
        this._root_stack.visible_child_name = 'welcome';
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
        const text = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });
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
        const editButton = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            tooltip_text: 'Edit Account',
            valign: Gtk.Align.CENTER,
            visible: false,
            css_classes: ['flat', 'circular'],
        });
        editButton.connect('clicked', () => this.showAccountDialog(account));
        row.editButton = editButton;
        box.append(editButton);
        row.child = box;
        return row;
    }

    showNoAccount() {
        this._search_entry.visible = false;
        this._add_transaction_button.sensitive = false;
        this._transaction_stack.visible_child_name = 'empty';
        this._empty_page.icon_name = 'cashbook-bank-symbolic';
        this._empty_page.title = 'Add an account to begin';
        this._empty_page.description = 'Accounts keep their own transactions and balance.';
        this._empty_action_button.label = 'Add Account';
        this._empty_action_button.visible = true;
    }

    selectAccount(account) {
        this.currentAccount = account;
        this._search_entry.visible = true;
        this._add_transaction_button.sensitive = true;
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
        const row = new Gtk.ListBoxRow({
            activatable: true,
            selectable: false,
            tooltip_text: 'Double-click to edit',
        });
        row.transaction = transaction;
        const [year, month] = transaction.date.split('-').map(Number);
        const monthColor = (year * 12 + month - 1) % 5;
        const box = new Gtk.Box({
            spacing: 18,
            css_classes: ['transaction-row', `month-color-${monthColor}`],
        });
        const date = new Gtk.Label({
            label: transaction.date,
            xalign: 0,
            width_request: 120,
            css_classes: ['monospace'],
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
            width_request: 140,
            css_classes: [transaction.type === 'credit' ? 'amount-credit' : 'amount-debit'],
        });

        box.append(date);
        box.append(description);
        box.append(amount);
        row.child = box;
        return row;
    }

    showAccountDialog(account = null) {
        const editing = account !== null;
        const nameEntry = new Gtk.Entry({
            placeholder_text: _('Account name'),
            text: account?.name ?? '',
            activates_default: true,
        });
        const iconPicker = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
            homogeneous: true,
            min_children_per_line: 4,
            max_children_per_line: 4,
            row_spacing: 6,
            column_spacing: 6,
        });
        const iconNames = new Map();

        for (const icon of ACCOUNT_ICONS) {
            const child = new Gtk.FlowBoxChild({
                tooltip_text: _(icon.label),
                child: new Gtk.Image({
                    icon_name: icon.name,
                    pixel_size: 24,
                    margin_top: 8,
                    margin_bottom: 8,
                    margin_start: 8,
                    margin_end: 8,
                }),
            });
            iconNames.set(child, icon.name);
            iconPicker.append(child);
        }
        const selectedIndex = editing
            ? Math.max(0, ACCOUNT_ICONS.findIndex(icon => icon.name === account.icon))
            : 0;
        iconPicker.select_child(iconPicker.get_child_at_index(selectedIndex));

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
        });
        form.append(nameEntry);
        form.append(new Gtk.Label({ label: _('Icon'), xalign: 0 }));
        form.append(iconPicker);

        const dialog = new Adw.AlertDialog({
            heading: editing ? _('Edit Account') : _('Add Account'),
            body: editing
                ? _('Change the name or icon for this account.')
                : _('Choose a name and icon for the account.'),
            extra_child: form,
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('save', editing ? _('Save') : _('Add'));
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_response_enabled('save', editing);
        dialog.default_response = 'save';
        dialog.close_response = 'cancel';

        nameEntry.connect('changed', () => {
            dialog.set_response_enabled('save', nameEntry.text.trim().length > 0);
        });
        dialog.connect('response', (_dialog, response) => {
            if (response !== 'save')
                return;

            const [selectedIcon] = iconPicker.get_selected_children();
            try {
                const name = nameEntry.text.trim();
                const icon = iconNames.get(selectedIcon);
                const id = editing
                    ? account.id
                    : this.database.addAccount(name, icon);
                if (editing)
                    this.database.updateAccount(id, name, icon);
                this.loadAccounts(id);
            } catch (error) {
                this.showToast(error.message.includes('UNIQUE')
                    ? 'An account with this name already exists.'
                    : error.message);
            }
        });
        dialog.present(this);
        nameEntry.grab_focus();
    }

    showTransactionDialog(transaction = null) {
        if (!this.currentAccount)
            return;
        const editing = transaction !== null;

        const typeGroup = new Adw.ToggleGroup({
            homogeneous: true,
            valign: Gtk.Align.CENTER,
        });
        typeGroup.add(new Adw.Toggle({ name: 'credit', label: _('Credit') }));
        typeGroup.add(new Adw.Toggle({ name: 'debit', label: _('Debit') }));
        typeGroup.active_name = transaction?.type ?? 'credit';

        const typeRow = new Adw.ActionRow({ title: _('Type') });
        typeRow.add_suffix(typeGroup);

        const amountEntry = new Adw.EntryRow({
            title: _('Amount'),
            text: editing ? (transaction.amount / 100).toFixed(2) : '',
            input_purpose: Gtk.InputPurpose.NUMBER,
            activates_default: true,
        });

        const details = new Adw.PreferencesGroup();
        details.add(typeRow);
        details.add(amountEntry);

        const calendar = new Gtk.Calendar({
            halign: Gtk.Align.FILL,
            hexpand: true,
            css_classes: ['transaction-calendar'],
        });
        const dateEntry = new Adw.EntryRow({
            title: _('Date (YYYY-MM-DD)'),
            text: transaction?.date ?? GLib.DateTime.new_now_local().format('%F'),
            activates_default: true,
        });
        const calendarPopover = new Gtk.Popover({
            child: calendar,
            css_classes: ['transaction-calendar-popover'],
        });
        dateEntry.add_suffix(new Gtk.MenuButton({
            icon_name: 'x-office-calendar-symbolic',
            tooltip_text: _('Choose a date'),
            valign: Gtk.Align.CENTER,
            popover: calendarPopover,
            css_classes: ['flat'],
        }));
        details.add(dateEntry);
        const descriptionEntry = new Adw.EntryRow({
            title: _('Description (optional)'),
            text: transaction?.description ?? '',
            activates_default: true,
        });
        const descriptionGroup = new Adw.PreferencesGroup();
        descriptionGroup.add(descriptionEntry);

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
        });
        form.append(details);
        form.append(descriptionGroup);

        const dialog = new Adw.AlertDialog({
            heading: editing ? _('Edit Transaction') : _('Add Transaction'),
            content_width: 440,
            follows_content_size: false,
            body: editing
                ? `Update this transaction in ${this.currentAccount.name}.`
                : `Record a credit or debit for ${this.currentAccount.name}.`,
            extra_child: form,
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('save', editing ? _('Save') : _('Add'));
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        dialog.default_response = 'save';
        dialog.close_response = 'cancel';

        const getAmount = () => {
            const value = amountEntry.text.trim();
            if (!/^\d+(?:\.\d{1,2})?$/.test(value))
                return 0;
            return Math.round(Number(value) * 100);
        };
        const getDate = () => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEntry.text))
                return null;
            const [year, month, day] = dateEntry.text.split('-').map(Number);
            if (month < 1 || month > 12 || !GLib.Date.valid_dmy(day, month, year))
                return null;
            return GLib.DateTime.new_local(year, month, day, 12, 0, 0);
        };
        const updateValidation = () => {
            dialog.set_response_enabled('save', getAmount() > 0 && getDate() !== null);
        };
        let syncingDate = false;
        const syncCalendar = () => {
            const date = getDate();
            if (date && !syncingDate) {
                syncingDate = true;
                calendar.set_date(date);
                syncingDate = false;
            }
            updateValidation();
        };
        amountEntry.connect('changed', updateValidation);
        dateEntry.connect('changed', syncCalendar);
        calendar.connect('day-selected', () => {
            if (syncingDate)
                return;
            syncingDate = true;
            dateEntry.text = calendar.get_date().format('%F');
            syncingDate = false;
            calendarPopover.popdown();
        });
        syncCalendar();

        dialog.connect('response', (_dialog, response) => {
            if (response !== 'save')
                return;

            const accountId = this.currentAccount.id;
            const date = dateEntry.text;
            try {
                if (editing) {
                    this.database.updateTransaction(
                        transaction.id,
                        typeGroup.active_name,
                        getAmount(),
                        date,
                        descriptionEntry.text.trim()
                    );
                } else {
                    this.database.addTransaction(
                        accountId,
                        typeGroup.active_name,
                        getAmount(),
                        date,
                        descriptionEntry.text.trim()
                    );
                    this._search_entry.text = '';
                }
                this.loadAccounts(accountId);
            } catch (error) {
                this.showToast(error.message);
            }
        });
        dialog.present(this);
        amountEntry.grab_focus();
    }
});
