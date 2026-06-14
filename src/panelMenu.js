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
import GLib from 'gi://GLib';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as DBus from './dbus.js';

export class HanabiPanelMenu {
    constructor(extension) {
        this.isEnabled = false;

        this._extension = extension;
        this._settings = extension.getSettings();
        this._playbackState = extension.getPlaybackState();
        this._isPlaying = false;
        this._renderer = new DBus.RendererWrapper();

        // Signal/subscription IDs tracked for cleanup in disable()
        this._isPlayingChangedSubId = null;
        this._muteChangedId = null;
        this._changeWallpaperChangedId = null;
    }

    enable() {
        if (this.isEnabled)
            return;

        this._signals = [];
        this._dbusSignals = [];

        // Indicator
        const indicatorName = `${this._extension.metadata.name} Indicator`;
        this.indicator = new PanelMenu.Button(0.0, indicatorName, false);
        const icon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                GLib.build_filenamev([
                    this._extension.path,
                    'hanabi-symbolic.svg',
                ])
            ),
            style_class: 'system-status-icon',
        });
        this.indicator.add_child(icon);

        // Menu
        const menu = new PopupMenu.PopupMenu(
            this.indicator, // sourceActor
            0.5, // arrowAlignment
            St.Side.BOTTOM // arrowSide
        );
        this.indicator.setMenu(menu);

        Main.panel.addToStatusArea(indicatorName, this.indicator);

        // Current Wallpaper Name
        const currentWallpaperItem = new PopupMenu.PopupMenuItem(
            this._getCurrentWallpaperName(),
            {reactive: false, style_class: 'popup-inactive-menu-item'}
        );
        menu.addMenuItem(currentWallpaperItem);

        let id1 = this._settings.connect('changed::video-path', () => {
            currentWallpaperItem.label.set_text(this._getCurrentWallpaperName());
        });
        this._signals.push({ obj: this._settings, id: id1 });

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Play Pause
        const playPause = new PopupMenu.PopupMenuItem(
            this._isPlaying ? _('Pause') : _('Play')
        );

        playPause.connect('activate', () => {
            if (this._isPlaying)
                this._playbackState.userPause();
            else
                this._playbackState.userPlay();
        });

        let id2 = this._renderer.proxy.connectSignal(
            'isPlayingChanged',
            (_proxy, _sender, [isPlaying]) => {
                this._isPlaying = isPlaying;
                playPause.label.set_text(
                    this._isPlaying ? _('Pause') : _('Play')
                );
            }
        );
        this._dbusSignals.push({ proxy: this._renderer.proxy, id: id2 });

        menu.addMenuItem(playPause);

        // Mute Unmute
        const muteAudio = new PopupMenu.PopupMenuItem(
            this._getMute() ? _('Unmute Audio') : _('Mute Audio')
        );

        muteAudio.connect('activate', () => {
            this._setMute(!this._getMute());
        });

        let id3 = this._settings.connect('changed::mute', () => {
            muteAudio.label.set_text(
                this._getMute() ? _('Unmute Audio') : _('Mute Audio')
            );
        });
        this._signals.push({ obj: this._settings, id: id3 });

        menu.addMenuItem(muteAudio);

        // Next wallpaper
        const nextWallpaperMenuItem = menu.addAction(
            _('Next Wallpaper'),
            () => {
                this._setNextWallpaper();
            }
        );

        // Previous wallpaper
        const prevWallpaperMenuItem = menu.addAction(_('Previous Wallpaper'), () => {
            this._setPreviousWallpaper();
        });

        if (!this._getChangeWallpaper()) {
            nextWallpaperMenuItem.hide();
            prevWallpaperMenuItem.hide();
        }

        let id4 = this._settings.connect('changed::change-wallpaper', () => {
            if (this._getChangeWallpaper()) {
                nextWallpaperMenuItem.show();
                prevWallpaperMenuItem.show();
            } else {
                nextWallpaperMenuItem.hide();
                prevWallpaperMenuItem.hide();
            }
        });
        this._signals.push({ obj: this._settings, id: id4 });

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Preferences
        menu.addAction(_('Preferences'), () => {
            this._extension.openPreferences();
        });

        this.isEnabled = true;
    }

    _getMute() {
        return this._settings.get_boolean('mute');
    }

    _setMute(mute) {
        return this._settings.set_boolean('mute', mute);
    }

    _getChangeWallpaper = () => {
        return this._settings.get_boolean('change-wallpaper');
    };

    _getCurrentWallpaperName() {
        let path = this._settings.get_string('video-path');
        if (!path) return _('No wallpaper');
        return GLib.path_get_basename(path);
    }

    /**
     *
     * Set next wallpaper based in directory.
     */
    _setNextWallpaper = () => {
        const changeWallpaperDirectoryPath = this._settings.get_string(
            'change-wallpaper-directory-path'
        );
        let videoPaths = [];
        const dir = Gio.File.new_for_path(changeWallpaperDirectoryPath);
        // Check if dir exists and is a directory
        if (
            dir.query_file_type(Gio.FileQueryInfoFlags.NONE, null) !==
            Gio.FileType.DIRECTORY
        )
            return;

        const enumerator = dir.enumerate_children(
            'standard::*',
            Gio.FileQueryInfoFlags.NONE,
            null
        );

        // Get files to push into array
        let fileInfo;
        while ((fileInfo = enumerator.next_file(null))) {
            if (fileInfo.get_content_type().startsWith('video/')) {
                const file = dir.get_child(fileInfo.get_name());
                videoPaths.push(file.get_path());
            }
        }

        videoPaths = videoPaths.sort();
        const currentVideoPath = this._settings.get_string('video-path');
        const currentIndex = videoPaths.findIndex(
            videoPath => videoPath === currentVideoPath
        );
        let nextIndex = 0;
        if (currentIndex !== -1)
            nextIndex = (currentIndex + 1) % videoPaths.length;
        this._settings.set_string('video-path', videoPaths[nextIndex]);
    };

    /**
     *
     * Set previous wallpaper based in directory.
     */
    _setPreviousWallpaper = () => {
        let changeWallpaperDirectoryPath = this._settings.get_string('change-wallpaper-directory-path');
        let videoPaths = [];
        let dir = Gio.File.new_for_path(changeWallpaperDirectoryPath);
        // Check if dir exists and is a directory
        if (dir.query_file_type(Gio.FileQueryInfoFlags.NONE, null) !== Gio.FileType.DIRECTORY)
            return;

        let enumerator = dir.enumerate_children(
            'standard::*',
            Gio.FileQueryInfoFlags.NONE,
            null
        );

        // Get files to push into array
        let fileInfo;
        while ((fileInfo = enumerator.next_file(null))) {
            if (fileInfo.get_content_type().startsWith('video/')) {
                let file = dir.get_child(fileInfo.get_name());
                videoPaths.push(file.get_path());
            }
        }

        videoPaths = videoPaths.sort();
        let currentVideoPath = this._settings.get_string('video-path');
        let currentIndex = videoPaths.findIndex(videoPath => videoPath === currentVideoPath);
        let prevIndex = 0;
        if (currentIndex !== -1)
            prevIndex = (currentIndex - 1 + videoPaths.length) % videoPaths.length;
        this._settings.set_string('video-path', videoPaths[prevIndex]);
    };

    disable() {
        if (!this.isEnabled)
            return;

        if (this._signals) {
            this._signals.forEach(({ obj, id }) => {
                if (obj && id)
                    obj.disconnect(id);
            });
            this._signals = [];
        }

        if (this._dbusSignals) {
            this._dbusSignals.forEach(({ proxy, id }) => {
                if (proxy && id)
                    proxy.disconnectSignal(id);
            });
            this._dbusSignals = [];
        }
        

        this.indicator.destroy();
        this.isEnabled = false;
    }
}
