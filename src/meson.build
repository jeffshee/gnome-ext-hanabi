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
  'extension.js',
  'gnomeShellOverride.js',
  'launcher.js',
  'hanabi-symbolic.svg',
  'prefs.js',
  'roundedCornersEffect.js',
  'windowManager.js'
]

extra_sources = [
  '../LICENSE',
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

meson.add_install_script('meson-postinstall.sh')

extension_tool = find_program('gnome-extensions', required: false)
if extension_tool.found()
  builddir = meson.current_build_dir()
  srcdir = meson.current_source_dir()

  command = [
    extension_tool,
    'pack',
    '--force',
    '--out-dir=@0@'.format(builddir),
    '--extra-source=@0@/metadata.json'.format(builddir)
  ]

  foreach s : extra_sources
    command += '--extra-source=@0@'.format(s)
  endforeach

  command += srcdir

  run_target('zip-file', command: command)
endif
