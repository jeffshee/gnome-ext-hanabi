metaconf = configuration_data()
metaconf.set('settings_schema', schema)
metaconf.set('uuid', uuid)
metaconf.set('version', meson.project_version())

configure_file(
  input: 'metadata.json.in',
  output: 'metadata.json',
  configuration: metaconf,
  install_dir: install_dir
)

sources = [
  'autoPause.js',
  'dbus.js',
  'extension.js',
  'gnomeShellOverride.js',
  'launcher.js',
  'logger.js',
  'panelMenu.js',
  'playbackState.js',
  'prefs.js',
  'roundedCornersEffect.js',
  'wallpaper.js',
  'windowManager.js',
]

extra_sources = [
  '../LICENSE',
  'assets/hanabi-symbolic.svg',
]

renderer = [
  'renderer/renderer.js',
  'renderer/stylesheet.css',
]

install_data(sources + extra_sources, install_dir: install_dir)

install_data(renderer, install_dir: join_paths(install_dir, 'renderer'))

install_data('schemas/@0@.gschema.xml'.format(schema),
  install_dir: schema_dir
)

subdir('po')

meson.add_install_script(meson.project_source_root() / 'build-aux' / 'meson-postinstall.sh')
