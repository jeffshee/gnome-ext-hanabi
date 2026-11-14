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

import Gio from 'gi://Gio';

import {
    parseWorkshopVideoFile,
    WALLPAPER_ENGINE_PROJECT_FILE,
} from './wallpaperEngineProject.js';

/**
 * If dir is a Wallpaper Engine workshop item of type "video", return the
 * absolute path of its video file; otherwise null.
 *
 * @param {Gio.File} dir candidate workshop item directory
 */
export function resolveWorkshopVideo(dir: Gio.File): string | null {
    const projectFile = dir.get_child(WALLPAPER_ENGINE_PROJECT_FILE);
    let contents: Uint8Array;
    try {
        [, contents] = projectFile.load_contents(null);
    } catch {
        return null;
    }
    const name = parseWorkshopVideoFile(new TextDecoder().decode(contents));
    if (name === null)
        return null;
    const video = dir.resolve_relative_path(name);
    if (video.query_file_type(Gio.FileQueryInfoFlags.NONE, null) !== Gio.FileType.REGULAR)
        return null;
    return video.get_path();
}

/**
 * List the video files in dir for the change-wallpaper rotation: plain video
 * files, plus Wallpaper Engine video items found in subdirectories (so dir can
 * be steamapps/workshop/content/431960).
 *
 * @param {Gio.File} dir directory to scan
 */
export function listWallpaperVideos(dir: Gio.File): string[] {
    const videoPaths: string[] = [];
    const enumerator = dir.enumerate_children(
        'standard::*',
        Gio.FileQueryInfoFlags.NONE,
        null
    );
    let fileInfo: Gio.FileInfo | null;
    while ((fileInfo = enumerator.next_file(null))) {
        const child = dir.get_child(fileInfo.get_name());
        let path: string | null = null;
        if (fileInfo.get_file_type() === Gio.FileType.DIRECTORY)
            path = resolveWorkshopVideo(child);
        else if (fileInfo.get_content_type()?.startsWith('video/'))
            path = child.get_path();
        if (path)
            videoPaths.push(path);
    }
    return videoPaths;
}
