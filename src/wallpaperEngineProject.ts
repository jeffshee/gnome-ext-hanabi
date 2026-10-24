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

// Pure helpers for Wallpaper Engine workshop items. A workshop item lives in
// steamapps/workshop/content/431960/<id>/ and describes itself in project.json.
// Only "video" items are supported; scene and web items need a different renderer.
// This file must not import gi:// modules so it can be unit-tested with Node.

export const WALLPAPER_ENGINE_APP_ID = '431960';
export const WALLPAPER_ENGINE_PROJECT_FILE = 'project.json';

/**
 * Parse the text of a project.json and return the video file name it points
 * to, relative to the item directory. Returns null for non-video items,
 * malformed JSON, or a file name that would escape the item directory.
 *
 * @param {string} text contents of project.json
 */
export function parseWorkshopVideoFile(text: string): string | null {
    let project: unknown;
    try {
        // Strip a UTF-8 BOM, which JSON.parse rejects.
        project = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch {
        return null;
    }
    if (typeof project !== 'object' || project === null)
        return null;

    const {type, file} = project as {type?: unknown; file?: unknown};
    if (typeof type !== 'string' || type.toLowerCase() !== 'video')
        return null;
    if (typeof file !== 'string' || file === '')
        return null;
    // Keep the path inside the item directory.
    if (file.startsWith('/') || file.split(/[\\/]/).includes('..'))
        return null;
    return file;
}
