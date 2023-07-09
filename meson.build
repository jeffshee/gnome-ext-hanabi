project(
  'hanabi-extension',
  version: '1',
  license: 'GPL-3.0-or-later',
  meson_version: '>= 0.56.0'
)

uuid = 'hanabi-extension@jeffshee.github.io'

prefix = get_option('prefix')
datadir = join_paths(prefix, get_option('datadir'))
extensions_dir = join_paths(datadir, 'gnome-shell', 'extensions')
install_dir = join_paths(extensions_dir, uuid)

schema = 'io.github.jeffshee.hanabi-extension'
schema_dir = join_paths(datadir, 'glib-2.0', 'schemas')

gnome = import('gnome')
i18n = import('i18n')

npm_exe = find_program('npm', required: false)
if npm_exe.found()
  run_target('dev', command: [ npm_exe, 'install', '--save-dev' ])
endif

subdir('src')
