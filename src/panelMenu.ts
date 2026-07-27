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

import {RendererWrapper} from './dbus.js';
import type {PlaybackState} from './playbackState.js';
import type HanabiExtension from './extension.js';

export class HanabiPanelMenu {
    isEnabled = false;
    private extension: HanabiExtension;
    private settings: Gio.Settings;
    private playbackState: PlaybackState;
    private isPlaying = false;
    private renderer = new RendererWrapper();
    private isPlayingChangedSubId: number | null = null;
    private muteChangedId: number | null = null;
    private changeWallpaperChangedId: number | null = null;
    indicator!: PanelMenu.Button;

    constructor(extension: HanabiExtension) {
        this.extension = extension;
        this.settings = extension.getSettings();
        this.playbackState = extension.getPlaybackState();
    }

    enable(): void {
        if (this.isEnabled)
            return;

        const indicatorName = `${this.extension.metadata.name} Indicator`;
        this.indicator = new PanelMenu.Button(0.0, indicatorName, false);
        const icon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                GLib.build_filenamev([this.extension.path, 'hanabi-symbolic.svg'])
            ),
            style_class: 'system-status-icon',
        });
        this.indicator.add_child(icon);

        const menu = new PopupMenu.PopupMenu(
            this.indicator,
            0.5,
            St.Side.BOTTOM
        );
        this.indicator.setMenu(menu);

        Main.panel.addToStatusArea(indicatorName, this.indicator);

        const playPause = new PopupMenu.PopupMenuItem(
            this.isPlaying ? _('Pause') : _('Play')
        );
        playPause.connect('activate', () => {
            if (this.isPlaying)
                this.playbackState.userPause();
            else
                this.playbackState.userPlay();
        });


        this.isPlayingChangedSubId = this.renderer.proxy.connectSignal(
            'isPlayingChanged',
            (_proxy: Gio.DBusProxy, _sender: string, [isPlaying]: [boolean]) => {
                this.isPlaying = isPlaying;
                playPause.label.set_text(this.isPlaying ? _('Pause') : _('Play'));
            }
        );

        menu.addMenuItem(playPause);

        const muteAudio = new PopupMenu.PopupMenuItem(
            this.getMute() ? _('Unmute Audio') : _('Mute Audio')
        );
        muteAudio.connect('activate', () => {
            this.setMute(!this.getMute());
        });

        this.muteChangedId = this.settings.connect('changed::mute', () => {
            muteAudio.label.set_text(
                this.getMute() ? _('Unmute Audio') : _('Mute Audio')
            );
        });

        menu.addMenuItem(muteAudio);

        const nextWallpaperMenuItem = menu.addAction(
            _('Next Wallpaper'),
            () => this.setNextWallpaper()
        );

        if (!this.getChangeWallpaper())
            nextWallpaperMenuItem.hide();

        this.changeWallpaperChangedId = this.settings.connect(
            'changed::change-wallpaper',
            () => {
                if (this.getChangeWallpaper())
                    nextWallpaperMenuItem.show();
                else
                    nextWallpaperMenuItem.hide();
            }
        );

        menu.addAction(_('Preferences'), () => {
            this.extension.openPreferences();
        });

        this.isEnabled = true;
    }

    private getMute(): boolean {
        return this.settings.get_boolean('mute');
    }

    private setMute(mute: boolean): boolean {
        return this.settings.set_boolean('mute', mute);
    }

    private getChangeWallpaper(): boolean {
        return this.settings.get_boolean('change-wallpaper');
    }

    private setNextWallpaper(): void {
        const changeWallpaperDirectoryPath = this.settings.get_string(
            'change-wallpaper-directory-path'
        );
        let videoPaths: string[] = [];
        const dir = Gio.File.new_for_path(changeWallpaperDirectoryPath);
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

        let fileInfo: Gio.FileInfo | null;
        while ((fileInfo = enumerator.next_file(null))) {
            if (fileInfo.get_content_type()?.startsWith('video/')) {
                const file = dir.get_child(fileInfo.get_name());
                const filePath = file.get_path();
                if (filePath)
                    videoPaths.push(filePath);
            }
        }

        videoPaths = videoPaths.sort();
        const currentVideoPath = this.settings.get_string('video-path');
        const currentIndex = videoPaths.findIndex(p => p === currentVideoPath);
        const nextIndex = currentIndex !== -1
            ? (currentIndex + 1) % videoPaths.length
            : 0;
        this.settings.set_string('video-path', videoPaths[nextIndex]);
    }

    disable(): void {
        if (!this.isEnabled)
            return;

        if (this.isPlayingChangedSubId !== null) {
            this.renderer.proxy.disconnectSignal(this.isPlayingChangedSubId);
            this.isPlayingChangedSubId = null;
        }

        if (this.muteChangedId !== null) {
            this.settings.disconnect(this.muteChangedId);
            this.muteChangedId = null;
        }
        if (this.changeWallpaperChangedId !== null) {
            this.settings.disconnect(this.changeWallpaperChangedId);
            this.changeWallpaperChangedId = null;
        }

        this.indicator.destroy();
        this.isEnabled = false;
    }
}
