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

# TypeScript sources are compiled by esbuild into src/_build/ via `npm run build`.
# Run `npm install && npm run build` from the project root before `meson install`.
ts_built_sources = [
  meson.current_source_dir() / '_build' / 'extension.js',
  meson.current_source_dir() / '_build' / 'prefs.js',
]

extra_sources = [
  '../LICENSE',
  'assets/hanabi-symbolic.svg',
]

install_data(ts_built_sources + extra_sources, install_dir: install_dir)

install_data(
  meson.current_source_dir() / '_build' / 'renderer.js',
  install_dir: join_paths(install_dir, 'renderer'),
)

install_data(
  'renderer/stylesheet.css',
  install_dir: join_paths(install_dir, 'renderer'),
)

install_data('schemas/@0@.gschema.xml'.format(schema),
  install_dir: schema_dir
)

subdir('po')

meson.add_install_script(meson.project_source_root() / 'build-aux' / 'meson-postinstall.sh')
