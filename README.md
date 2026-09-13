# Cashbook

Cashbook is a local GNOME app for recording bank and cash transactions. It stores accounts and transactions in a SQLite database inside a folder chosen by the user.

Money is stored as integer paise. The app currently supports Indian rupees, credit and debit transactions, dates, descriptions, full-table search, and per-account balances.

Use **Back Up** in the sidebar menu to save a timestamped SQLite snapshot of all accounts and transactions in a folder you choose. Backups do not change the active data folder and are not encrypted. There is no restore action yet.

Use **Export as CSV** in the sidebar hamburger menu to save all transactions for the selected account, even when search is active. The CSV includes date, description, credit/debit type, amount in rupees, and a transfer flag. Amounts use two decimal places without currency symbols or grouping separators. An account with no transactions exports just the column headers.

Open **Preferences** in the hamburger menu to choose the default date for new transactions: today's date or the date of the last transaction added to the selected account, even if it was backdated. Empty accounts use today's date. The choice is saved across restarts; editing a transaction still shows its existing date.

## Install

Cashbook is available for **Linux x86_64** as a Flatpak bundle on [GitHub Releases](https://github.com/subhoghoshX/Cashbook/releases/latest). Windows, macOS, and ARM installers are not currently provided.

Install [Flatpak](https://flatpak.org/setup/) and `curl` using your distribution's package manager first. Then paste this block into a terminal:

```sh
(
  set -eu
  test "$(uname -m)" = x86_64 || { printf '%s\n' 'This installer requires Linux x86_64.' >&2; exit 1; }
  download_dir="$(mktemp -d)"
  trap 'rm -rf "$download_dir"' EXIT
  curl -fL https://github.com/subhoghoshX/Cashbook/releases/latest/download/Cashbook-x86_64.flatpak -o "$download_dir/Cashbook.flatpak"
  flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
  flatpak install --user "$download_dir/Cashbook.flatpak"
)
```

Cashbook downloads from GitHub, not Flathub. Flathub supplies its shared GNOME runtime, which Flatpak downloads if needed. Installation is for your user account and does not require `sudo`. Flatpak asks for confirmation before installing.

Open Cashbook from your app launcher, or run:

```sh
flatpak run io.subho.Cashbook
```

You can also download `Cashbook-x86_64.flatpak` from a release and install it with `flatpak install --user ./Cashbook-x86_64.flatpak`. Each release includes `SHA256SUMS`; download it beside the installer and run `sha256sum --check SHA256SUMS` to verify the download.

## Update and uninstall

To update Cashbook, run the installation block again and accept the update. Standalone bundles do not provide an app update feed, so `flatpak update` updates the runtime but does not fetch new Cashbook releases. Back up your data before updating.

To uninstall:

```sh
flatpak uninstall --user io.subho.Cashbook
```

Uninstalling does not delete the database or backups in folders you selected.

## Build

Cashbook targets the GNOME 50 Flatpak SDK. Clone this repository and open `io.subho.Cashbook.json` in GNOME Builder, or install `flatpak-builder` and run these commands from the checkout:

```sh
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install --user flathub org.gnome.Platform//50 org.gnome.Sdk//50
flatpak-builder --user --force-clean --install build-dir io.subho.Cashbook.json
flatpak run io.subho.Cashbook
```

The build tests database backups, CSV export, and the default transaction date. It also validates the desktop entry, AppStream metadata, and settings schema.

## Publish a release

Update the version in `meson.build` and `src/main.js`, and add a matching release with its date to `data/io.subho.Cashbook.metainfo.xml.in`. Commit and push those changes, then push a matching tag:

```sh
git tag v0.1.0
git push origin v0.1.0
```

Use a new version tag for each subsequent release. The GitHub Actions `Release` workflow builds and tests the tagged checkout, then publishes `Cashbook-x86_64.flatpak` and `SHA256SUMS`. It uses GitHub's built-in token; no personal access token or signing key is required. The bundle is not GPG-signed and has no update repository. Download it only from this repository's releases.

If a tag push does not start a build, you can publish that existing tag through GitHub CLI without moving it:

```sh
gh workflow run release.yml --ref master -f tag=v0.1.0
```
