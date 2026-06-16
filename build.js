// Copyright (C) 2026 Jeff Shee <jeffshee8969@gmail.com> and contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Build script: compiles TypeScript extension sources to JavaScript using esbuild.
// The gi:// and resource:// specifiers are kept as external bare imports so GJS
// resolves them at runtime.  @girs/gnome-shell/* imports resolve through the
// package's dist/ shims which re-export from resource://, so after bundling the
// output only contains gi:// and resource:// references — no Node.js paths.

import * as esbuild from 'esbuild';

const spdxBanner = '// SPDX-License-Identifier: GPL-3.0-or-later';

// Extension and prefs (loaded by GNOME Shell as ESM modules)
await esbuild.build({
    entryPoints: ['src/extension.ts', 'src/prefs.ts'],
    outdir: 'src/_build',
    bundle: true,
    treeShaking: false,
    format: 'esm',
    external: [
        'gi://*',
        'resource://*',
        'gettext',
        'system',
        'cairo',
    ],
    banner: {js: spdxBanner},
    logLevel: 'info',
});

// Renderer (standalone GJS ESM script launched as a subprocess)
await esbuild.build({
    entryPoints: ['src/renderer/renderer.ts'],
    outdir: 'src/_build',
    bundle: true,
    treeShaking: false,
    format: 'esm',
    external: ['gi://*'],
    banner: {js: spdxBanner},
    logLevel: 'info',
});
