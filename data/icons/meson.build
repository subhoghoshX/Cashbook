application_id = 'io.subho.Cashbook'

scalable_dir = 'hicolor' / 'scalable' / 'apps'
install_data(
  scalable_dir / ('@0@.svg').format(application_id),
  install_dir: get_option('datadir') / 'icons' / scalable_dir
)

symbolic_dir = 'hicolor' / 'symbolic' / 'apps'
install_data(
  symbolic_dir / ('@0@-symbolic.svg').format(application_id),
  install_dir: get_option('datadir') / 'icons' / symbolic_dir
)

account_icons = [
  'cashbook-bank-symbolic.svg',
  'cashbook-coin-symbolic.svg',
  'cashbook-credit-card-symbolic.svg',
  'cashbook-money-symbolic.svg',
  'cashbook-money-clip-symbolic.svg',
  'cashbook-wallet-symbolic.svg',
  'cashbook-wallet2-symbolic.svg',
  'cashbook-wallet3-symbolic.svg',
]

account_icon_files = []
foreach icon : account_icons
  account_icon_files += files('hicolor' / 'scalable' / 'actions' / icon)
endforeach

install_data(
  account_icon_files,
  install_dir: get_option('datadir') / 'icons' / 'hicolor' / 'scalable' / 'actions'
)
