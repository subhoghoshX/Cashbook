pkgdatadir = get_option('datadir') / meson.project_name()
gnome = import('gnome')

database_helper = executable(
  'cashbook-db',
  'database.c',
  dependencies: dependency('sqlite3'),
  install: true,
)

test('database-backup', find_program('python3'),
  args: [files('test-backup.py'), database_helper],
)

src_res = gnome.compile_resources('io.subho.Cashbook.src',
  'io.subho.Cashbook.src.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

data_res = gnome.compile_resources('io.subho.Cashbook.data',
  'io.subho.Cashbook.data.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

bin_conf = configuration_data()
bin_conf.set('GJS', find_program('gjs').full_path())
bin_conf.set('PACKAGE_VERSION', meson.project_version())
bin_conf.set('PACKAGE_NAME', meson.project_name())
bin_conf.set('prefix', get_option('prefix'))
bin_conf.set('libdir', get_option('prefix') / get_option('libdir'))
bin_conf.set('datadir', get_option('prefix') / get_option('datadir'))
bin_conf.set('resource_path', '/io/subho/Cashbook')

configure_file(
  input: 'io.subho.Cashbook.in',
  output: 'io.subho.Cashbook',
  configuration: bin_conf,
  install: true,
  install_dir: get_option('bindir')
)
