/* main.js
 *
 * Copyright 2026 Subho
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { CashbookWindow } from './window.js';

pkg.initGettext();
pkg.initFormat();

export const CashbookApplication = GObject.registerClass(
    class CashbookApplication extends Adw.Application {
        constructor() {
            super({
                application_id: 'io.subho.Cashbook',
                flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
                resource_base_path: '/io/subho/Cashbook'
            });

            const quit_action = new Gio.SimpleAction({name: 'quit'});
                quit_action.connect('activate', action => {
                this.quit();
            });
            this.add_action(quit_action);
            this.set_accels_for_action('app.quit', ['<control>q']);

            const show_about_action = new Gio.SimpleAction({name: 'about'});
            show_about_action.connect('activate', action => {
                const aboutParams = {
                    application_name: 'Cashbook',
                    application_icon: 'io.subho.Cashbook',
                    developer_name: 'Subho',
                    version: '0.1.1',
                    developers: [
                        'Subho'
                    ],
                    // Translators: Replace "translator-credits" with your name/username, and optionally an email or URL.
                    translator_credits: _("translator-credits"),
                    copyright: '© 2026 Subho'
                };
                const aboutDialog = new Adw.AboutDialog(aboutParams);
                aboutDialog.present(this.active_window);
            });
            this.add_action(show_about_action);

            const show_shortcuts_action = new Gio.SimpleAction({name: 'shortcuts'});
            show_shortcuts_action.connect('activate', () => {
                const builder = Gtk.Builder.new_from_resource(
                    '/io/subho/Cashbook/shortcuts-dialog.ui'
                );
                const dialog = builder.get_object('shortcuts_dialog');
                dialog.present(this.active_window);
            });
            this.add_action(show_shortcuts_action);
            this.set_accels_for_action('app.shortcuts', ['<control>question']);
        }

        vfunc_activate() {
            let {active_window} = this;

            if (!active_window) {
                const provider = new Gtk.CssProvider();
                provider.load_from_resource('/io/subho/Cashbook/js/style.css');
                Gtk.StyleContext.add_provider_for_display(
                    Gdk.Display.get_default(),
                    provider,
                    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
                );
                active_window = new CashbookWindow(this);
            }

            active_window.present();
        }
    }
);

export function main(argv) {
    const application = new CashbookApplication();
    return application.runAsync(argv);
}
