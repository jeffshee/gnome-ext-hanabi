/**
 * Copyright (C) 2023 Jeff Shee (jeffshee8969@gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
    }

    enable() {
        if (this.isEnabled)
            return;

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

        this._renderer.proxy.connectSignal(
            'isPlayingChanged',
            (_proxy, _sender, [isPlaying]) => {
                this._isPlaying = isPlaying;
                playPause.label.set_text(
                    this._isPlaying ? _('Pause') : _('Play')
                );
            }
        );

        menu.addMenuItem(playPause);

        // Mute Unmute
        const muteAudio = new PopupMenu.PopupMenuItem(
            this._getMute() ? _('Unmute Audio') : _('Mute Audio')
        );

        muteAudio.connect('activate', () => {
            this._setMute(!this._getMute());
        });

        this._settings.connect('changed::mute', () => {
            muteAudio.label.set_text(
                this._getMute() ? _('Unmute Audio') : _('Mute Audio')
            );
        });

        menu.addMenuItem(muteAudio);

        // Next wallpaper
        const nextWallpaperMenuItem = menu.addAction(_('Next Wallpaper'), () => {
            this._setNextWallpaper();
        });

        if (!this._getChangeWallpaper())
            nextWallpaperMenuItem.hide();

        this._settings.connect('changed::change-wallpaper', () => {
            if (this._getChangeWallpaper())
                nextWallpaperMenuItem.show();
            else
                nextWallpaperMenuItem.hide();
        });

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

    /**
     *
     * Set next wallpaper based in directory.
     */
    _setNextWallpaper = () => {
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
        let nextIndex = 0;
        if (currentIndex !== -1)
            nextIndex = (currentIndex + 1) % videoPaths.length;
        this._settings.set_string('video-path', videoPaths[nextIndex]);
    };

    disable() {
        if (!this.isEnabled)
            return;

        this.indicator.destroy();
        this.isEnabled = false;
    }
}
