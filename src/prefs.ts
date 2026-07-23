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

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

interface PrefsWindow extends Adw.PreferencesWindow {
    settings: Gio.Settings;
}

export default class HanabiExtensionPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const win = window as PrefsWindow;
        win.settings = this.getSettings();

        const page = new Adw.PreferencesPage();

        const generalGroup = new Adw.PreferencesGroup({title: _('General')});
        page.add(generalGroup);
        prefsRowVideoPath(win, generalGroup);
        prefsRowFitMode(win, generalGroup);
        prefsRowBoolean(win, generalGroup, _('Mute Audio'), 'mute', '');
        prefsRowInt(win, generalGroup, _('Volume Level'), 'volume', '', 0, 100, 1, 10);
        prefsRowBoolean(win, generalGroup, _('Random Start Position'), 'random-start-position',
            _('Start playback from a random position each time a video starts'));
        prefsRowBoolean(win, generalGroup, _('Show Panel Menu'), 'show-panel-menu', '');
        prefsRowBoolean(win, generalGroup, _('Show on Lock Screen'), 'show-on-lock-screen',
            _('Show the live wallpaper on the lock screen'));

        const autoPauseGroup = new Adw.PreferencesGroup({title: _('Auto Pause')});
        page.add(autoPauseGroup);
        prefsRowPauseOnMaximizeOrFullscreen(win, autoPauseGroup);
        prefsRowBoolean(win, autoPauseGroup, _('Pause on Window Focus'), 'pause-on-focus',
            _('Pause playback when any window is focused'));
        prefsRowPauseOnBattery(win, autoPauseGroup);
        prefsRowInt(win, autoPauseGroup, _('Low Battery Threshold'), 'low-battery-threshold',
            _('Set the threshold percentage for low battery level'), 0, 100, 5, 10);
        prefsRowBoolean(win, autoPauseGroup, _('Pause on Media Player Playing'), 'pause-on-mpris-playing',
            _('Pause playback when an MPRIS media player is playing media'));

        const wallpaperChangerGroup = new Adw.PreferencesGroup({title: _('Wallpaper Changer')});
        page.add(wallpaperChangerGroup);
        prefsRowBoolean(win, wallpaperChangerGroup, _('Change Wallpaper Automatically'), 'change-wallpaper', '');
        prefsRowDirectoryPath(win, wallpaperChangerGroup);
        prefsRowChangeWallpaperMode(win, wallpaperChangerGroup);
        prefsRowInt(win, wallpaperChangerGroup, _('Change Wallpaper Interval (minutes)'),
            'change-wallpaper-interval', '', 1, 1440, 5, 0);

        const overviewGroup = new Adw.PreferencesGroup({title: _('Overview')});
        page.add(overviewGroup);
        prefsRowInt(win, overviewGroup, _('Corner Radius'), 'corner-radius',
            _('Rounded corner radius in pixels for workspace background in the overview'), 0, 100, 1, 5);

        const experimentalGroup = new Adw.PreferencesGroup({title: _('Experimental')});
        page.add(experimentalGroup);
        prefsRowBoolean(win, experimentalGroup, _('Experimental VA Plugin'), 'enable-va',
            _('Enable VA decoders which improve performance for Intel/AMD Wayland users'));
        prefsRowBoolean(win, experimentalGroup, _('NVIDIA Stateless Decoders'), 'enable-nvsl',
            _('Use new stateless NVIDIA decoders'));

        const developerGroup = new Adw.PreferencesGroup({title: _('Developer')});
        page.add(developerGroup);
        prefsRowBoolean(win, developerGroup, _('Debug Mode'), 'debug-mode',
            _('Print debug messages to log'));
        prefsRowBoolean(win, developerGroup, _('Prefer clappersink'), 'prefer-clappersink',
            _('Prefer clappersink over gtk4paintablesink for video playback'));
        prefsRowBoolean(win, developerGroup, _('Force GtkMediaFile'), 'force-mediafile',
            _('Force use of GtkMediaFile for video playback'));
        prefsRowBoolean(win, developerGroup, _('Enable Graphics Offload'), 'enable-graphics-offload',
            _('Enable graphics offload for improved performance'));
        prefsRowInt(win, developerGroup, _('Startup Delay'), 'startup-delay',
            _('Add a startup delay (in milliseconds) to mitigate compatibility issues with other extensions'),
            0, 10000, 100, 500);
        prefsRowInt(win, developerGroup, _('Border Stroke'), 'border-stroke',
            _('Border width in pixels drawn inside the rounded-rect bounds (0 = disabled)'), 0, 20, 1, 1);
        prefsRowBoundsInset(win, developerGroup);

        window.add(page);
        return Promise.resolve();
    }
}

function prefsRowBoolean(
    window: PrefsWindow,
    prefsGroup: Adw.PreferencesGroup,
    title: string,
    key: string,
    subtitle: string
): void {
    const settings = window.settings;
    const row = new Adw.ActionRow({title, subtitle});
    prefsGroup.add(row);

    const toggle = new Gtk.Switch({
        active: settings.get_boolean(key),
        valign: Gtk.Align.CENTER,
    });
    settings.bind(key, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);

    row.add_suffix(toggle);
    row.activatable_widget = toggle;
}

function prefsRowInt(
    window: PrefsWindow,
    prefsGroup: Adw.PreferencesGroup,
    title: string,
    key: string,
    subtitle: string,
    lower: number,
    upper: number,
    stepIncrement: number,
    pageIncrement: number
): void {
    const settings = window.settings;
    const row = new Adw.ActionRow({title, subtitle});
    prefsGroup.add(row);

    const adjustment = new Gtk.Adjustment({
        lower,
        upper,
        step_increment: stepIncrement,
        page_increment: pageIncrement,
        value: settings.get_int(key),
    });

    adjustment.connect('value-changed', () => {
        settings.set_int(key, adjustment.value);
    });

    const spin = new Gtk.SpinButton({
        adjustment,
        valign: Gtk.Align.CENTER,
    });

    row.add_suffix(spin);
}

function prefsRowVideoPath(window: PrefsWindow, prefsGroup: Adw.PreferencesGroup): void {
    const settings = window.settings;
    const title = _('Video Path');
    const key = 'video-path';

    const path = settings.get_string(key);
    const row = new Adw.ActionRow({
        title,
        subtitle: path !== '' ? path : _('None'),
    });
    prefsGroup.add(row);

    const button = new Adw.ButtonContent({
        icon_name: 'document-open-symbolic',
        label: _('Open'),
    });

    row.activatable_widget = button;
    row.add_suffix(button);

    row.connect('activated', () => {
        const fileFilter = new Gtk.FileFilter();
        fileFilter.add_mime_type('video/*');

        const dialog = new Gtk.FileDialog({title: _('Open File'), modal: true});
        dialog.set_default_filter(fileFilter);
        const currentPath = settings.get_string(key);
        if (currentPath !== '')
            dialog.set_initial_file(Gio.File.new_for_path(currentPath));
        dialog.open(window, null, (_dialog, result) => {
            try {
                const selectedPath = dialog.open_finish(result)?.get_path() ?? '';
                settings.set_string(key, selectedPath);
                row.subtitle = selectedPath !== '' ? selectedPath : _('None');
            } catch {
                // Dialog dismissed.
            }
        });
    });
}

function prefsRowDirectoryPath(window: PrefsWindow, prefsGroup: Adw.PreferencesGroup): void {
    const settings = window.settings;
    const title = _('Change Wallpaper Directory Path');
    const key = 'change-wallpaper-directory-path';

    const path = settings.get_string(key);
    const row = new Adw.ActionRow({
        title,
        subtitle: path !== '' ? path : _('None'),
    });
    prefsGroup.add(row);

    const button = new Adw.ButtonContent({
        icon_name: 'document-open-symbolic',
        label: _('Open'),
    });

    row.activatable_widget = button;
    row.add_suffix(button);

    row.connect('activated', () => {
        const dialog = new Gtk.FileDialog({title: _('Select Directory'), modal: true});
        const currentPath = settings.get_string(key);
        if (currentPath !== '')
            dialog.set_initial_folder(Gio.File.new_for_path(currentPath));
        dialog.select_folder(window, null, (_dialog, result) => {
            try {
                const selectedPath = dialog.select_folder_finish(result)?.get_path() ?? '';
                settings.set_string(key, selectedPath);
                row.subtitle = selectedPath !== '' ? selectedPath : _('None');
            } catch {
                // Dialog dismissed.
            }
        });
    });
}

function prefsRowFitMode(window: PrefsWindow, prefsGroup: Adw.PreferencesGroup): void {
    const settings = window.settings;
    const title = _('Fit Mode');
    const subtitle = _('Control how wallpaper fits within the monitor');
    const tooltip = _(`
    <b>Fill</b>: Stretch the wallpaper to fill the monitor.
    <b>Contain</b>: Scale the wallpaper to fit the monitor (keep aspect ratio).
    <b>Cover</b>: Scale the wallpaper to cover the monitor (keep aspect ratio).
    <b>Scale-down</b>: Scale down the wallpaper to fit the monitor if needed, otherwise keep its original size.
    `);

    const items = Gtk.StringList.new([
        _('Fill'),
        _('Contain'),
        _('Cover'),
        _('Scale-down'),
    ]);

    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: items,
        selected: settings.get_int('content-fit'),
    });

    row.set_tooltip_markup(tooltip);
    prefsGroup.add(row);

    row.connect('notify::selected', () => {
        settings.set_int('content-fit', row.selected);
    });
}

function prefsRowPauseOnMaximizeOrFullscreen(
    window: PrefsWindow,
    prefsGroup: Adw.PreferencesGroup
): void {
    const settings = window.settings;
    const title = _('Pause on Maximize or Fullscreen');
    const subtitle = _('Pause playback when there is maximized or fullscreen window');
    const tooltip = _(`
    <b>Never</b>: Disable this feature.
    <b>Any Monitor</b>: Pause playback when there is maximized or fullscreen window on any monitor.
    <b>All Monitors</b>: Pause playback when there are maximized or fullscreen windows on all monitors.
    `);

    const items = Gtk.StringList.new([_('Never'), _('Any Monitor'), _('All Monitors')]);

    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: items,
        selected: settings.get_int('pause-on-maximize-or-fullscreen'),
    });

    row.set_tooltip_markup(tooltip);
    prefsGroup.add(row);

    row.connect('notify::selected', () => {
        settings.set_int('pause-on-maximize-or-fullscreen', row.selected);
    });
}

function prefsRowPauseOnBattery(window: PrefsWindow, prefsGroup: Adw.PreferencesGroup): void {
    const settings = window.settings;
    const title = _('Pause on Battery');
    const subtitle = _('Pause playback when the device is on battery or the battery is low');
    const tooltip = _(`
    <b>Never</b>: Disable this feature.
    <b>Low Battery</b>: Pause playback when the device is on low battery (below the threshold).
    <b>Always</b>: Pause playback when the device is on battery.
    `);

    const items = Gtk.StringList.new([_('Never'), _('Low Battery'), _('Always')]);

    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: items,
        selected: settings.get_int('pause-on-battery'),
    });

    row.set_tooltip_markup(tooltip);
    prefsGroup.add(row);

    row.connect('notify::selected', () => {
        settings.set_int('pause-on-battery', row.selected);
    });
}

function prefsRowChangeWallpaperMode(
    window: PrefsWindow,
    prefsGroup: Adw.PreferencesGroup
): void {
    const settings = window.settings;
    const title = _('Change Wallpaper Mode');
    const subtitle = _('Control how to change wallpapers automatically');
    const tooltip = _(`
    <b>Sequential:</b> Preserve the directory sequence (descending order).
    <b>Inverse Sequential:</b> Retrieve wallpapers in the opposite sequence (ascending order).
    <b>Random:</b> Randomly select wallpapers from the directory.
    `);

    const items = Gtk.StringList.new([_('Sequential'), _('Inverse Sequential'), _('Random')]);

    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: items,
        selected: settings.get_int('change-wallpaper-mode'),
    });
    row.set_tooltip_markup(tooltip);
    prefsGroup.add(row);

    row.connect('notify::selected', () => {
        settings.set_int('change-wallpaper-mode', row.selected);
    });
}

function prefsRowBoundsInset(window: PrefsWindow, prefsGroup: Adw.PreferencesGroup): void {
    const settings = window.settings;
    const expander = new Adw.ExpanderRow({
        title: _('Bounds Inset'),
        subtitle: _('Adjust edges of the overview rounded-rect bounds (positive = shrink inward)'),
    });
    prefsGroup.add(expander);

    for (const [title, key] of [
        [_('Left'), 'bounds-inset-x1'],
        [_('Top'), 'bounds-inset-y1'],
        [_('Right'), 'bounds-inset-x2'],
        [_('Bottom'), 'bounds-inset-y2'],
    ] as [string, string][]) {
        const child = new Adw.ActionRow({title});
        const adjustment = new Gtk.Adjustment({
            lower: -200,
            upper: 200,
            step_increment: 1,
            page_increment: 10,
            value: settings.get_int(key),
        });
        adjustment.connect('value-changed', () => settings.set_int(key, adjustment.value));
        child.add_suffix(new Gtk.SpinButton({adjustment, valign: Gtk.Align.CENTER}));
        expander.add_row(child);
    }
}
