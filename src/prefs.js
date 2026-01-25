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

/* exported init fillPreferencesWindow */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const haveContentFit = Gtk.get_minor_version() >= 8;

export default class HanabiExtensionPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();
        // Create a preferences page and group
        const page = new Adw.PreferencesPage();

        /**
         * General
         */
        const generalGroup = new Adw.PreferencesGroup({
            title: _('General'),
        });
        page.add(generalGroup);
        prefsRowVideoPath(window, generalGroup);
        prefsRowFitMode(window, generalGroup);
        prefsRowBoolean(window, generalGroup, _('Mute Audio'), 'mute', '');
        prefsRowInt(window, generalGroup, _('Volume Level'), 'volume', '', 0, 100, 1, 10);
        prefsRowBoolean(window, generalGroup, _('Show Panel Menu'), 'show-panel-menu', '');

        /**
         * Auto Pause
         */
        const autoPauseGroup = new Adw.PreferencesGroup({
            title: _('Auto Pause'),
        });
        page.add(autoPauseGroup);
        prefsRowPauseOnMaximizeOrFullscreen(window, autoPauseGroup);
        prefsRowPauseOnBattery(window, autoPauseGroup);
        prefsRowInt(window, autoPauseGroup, _('Low Battery Threshold'), 'low-battery-threshold', _('Set the threshold percentage for low battery level'), 0, 100, 5, 10);
        prefsRowBoolean(
            window,
            autoPauseGroup,
            _('Pause on Media Player Playing'),
            'pause-on-mpris-playing',
            _('Pause playback when an MPRIS media player is playing media')
        );

        /**
         * Wallpaper Changer
         */
        const wallpaperChangerGroup = new Adw.PreferencesGroup({
            title: _('Wallpaper Changer'),
        });
        page.add(wallpaperChangerGroup);
        prefsRowBoolean(window, wallpaperChangerGroup, _('Change Wallpaper Automatically'), 'change-wallpaper', '');
        prefsRowDirectoryPath(window, wallpaperChangerGroup);
        prefsRowChangeWallpaperMode(window, wallpaperChangerGroup);
        prefsRowInt(window, wallpaperChangerGroup, _('Change Wallpaper Interval (minutes)'), 'change-wallpaper-interval', '', 1, 1440, 5, 0);

        /**
         * Experimental
         */
        const experimentalGroup = new Adw.PreferencesGroup({
            title: _('Experimental'),
        });
        page.add(experimentalGroup);
        prefsRowBoolean(
            window,
            experimentalGroup,
            _('Experimental VA Plugin'),
            'enable-va',
            _('Enable VA decoders which improve performance for Intel/AMD Wayland users')
        );
        prefsRowBoolean(
            window,
            experimentalGroup,
            _('NVIDIA Stateless Decoders'),
            'enable-nvsl',
            _('Use new stateless NVIDIA decoders')
        );

        /**
         * Developer
         */
        const developerGroup = new Adw.PreferencesGroup({
            title: _('Developer'),
        });
        page.add(developerGroup);
        prefsRowBoolean(
            window,
            developerGroup,
            _('Debug Mode'),
            'debug-mode',
            _('Print debug messages to log')
        );
        prefsRowBoolean(
            window,
            developerGroup,
            _('Force gtk4paintablesink'),
            'force-gtk4paintablesink',
            _('Force use of gtk4paintablesink for video playback')
        );
        prefsRowBoolean(
            window,
            developerGroup,
            _('Force GtkMediaFile'),
            'force-mediafile',
            _('Force use of GtkMediaFile for video playback')
        );
        prefsRowBoolean(
            window,
            developerGroup,
            _('Enable Graphics Offload'),
            'enable-graphics-offload',
            _('Enable graphics offload for improved performance (requires GTK 4.14+)')
        );
        prefsRowInt(window, developerGroup, _('Startup Delay'), 'startup-delay', _('Add a startup delay (in milliseconds) to mitigate compatibility issues with other extensions'), 0, 10000, 100, 500);

        // Add our page to the window
        window.add(page);
    }
}

/**
 *
 * @param {Adw.PreferencesWindow} window AdwPreferencesWindow
 * @param {Adw.PreferencesGroup} prefsGroup AdwPreferencesGroup
 * @param {string} title Setting title
 * @param {string} key Setting key
 * @param {string} subtitle Setting subtitle
 */
function prefsRowBoolean(window, prefsGroup, title, key, subtitle) {
    const settings = window._settings;
    // Create a new preferences row
    const row = new Adw.ActionRow({title, subtitle});
    prefsGroup.add(row);

    // Create the switch and bind its value to the key
    const toggle = new Gtk.Switch({
        active: settings.get_boolean(key),
        valign: Gtk.Align.CENTER,
    });
    settings.bind(key, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);

    // Add the switch to the row
    row.add_suffix(toggle);
    row.activatable_widget = toggle;
}

/**
 *
 * @param {Adw.PreferencesWindow} window AdwPreferencesWindow
 * @param {Adw.PreferencesGroup} prefsGroup AdwPreferencesGroup
 * @param {string} title Setting title
 * @param {string} key Setting key
 * @param {string} subtitle Setting subtitle
 * @param {number} lower GtkAdjustment lower
 * @param {number} upper GtkAdjustment upper
 * @param {number} stepIncrement GtkAdjustment step_increment
 * @param {number} pageIncrement GtkAdjustment page_increment
 */
function prefsRowInt(
    window,
    prefsGroup,
    title,
    key,
    subtitle,
    lower,
    upper,
    stepIncrement,
    pageIncrement
) {
    const settings = window._settings;
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

/**
 *
 * @param {Adw.PreferencesWindow} window AdwPreferencesWindow
 * @param {Adw.PreferencesGroup} prefsGroup AdwPreferencesGroup
 */
function prefsRowVideoPath(window, prefsGroup) {
    const settings = window._settings;
    const title = _('Video Path');
    const key = 'video-path';

    let path = settings.get_string(key);
    const row = new Adw.ActionRow({
        title,
        subtitle: `${path !== '' ? path : _('None')}`,
    });
    prefsGroup.add(row);

    /**
     * Video file chooser
     */
    function createDialog() {
        let fileFilter = new Gtk.FileFilter();
        fileFilter.add_mime_type('video/*');

        let fileChooser = new Gtk.FileChooserDialog({
            title: _('Open File'),
            action: Gtk.FileChooserAction.OPEN,
        });
        fileChooser.set_modal(true);
        fileChooser.set_transient_for(window);
        fileChooser.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
        fileChooser.add_button(_('Open'), Gtk.ResponseType.ACCEPT);
        fileChooser.add_filter(fileFilter);

        fileChooser.connect('response', (dialog, responseId) => {
            if (responseId === Gtk.ResponseType.ACCEPT) {
                let _path = dialog.get_file().get_path();
                settings.set_string(key, _path);
                row.subtitle = `${_path !== '' ? _path : _('None')}`;
            }
            dialog.destroy();
        });
        return fileChooser;
    }

    let button = new Adw.ButtonContent({
        icon_name: 'document-open-symbolic',
        label: _('Open'),
    });

    row.activatable_widget = button;
    row.add_suffix(button);

    row.connect('activated', () => {
        let dialog = createDialog();
        dialog.show();
    });
}

/**
 *
 * @param {Adw.PreferencesWindow} window AdwPreferencesWindow
 * @param {Adw.PreferencesGroup} prefsGroup AdwPreferencesGroup
 */
function prefsRowDirectoryPath(window, prefsGroup) {
    const settings = window._settings;
    const title = _('Change Wallpaper Directory Path');
    const key = 'change-wallpaper-directory-path';

    let path = settings.get_string(key);
    const row = new Adw.ActionRow({
        title,
        subtitle: `${path !== '' ? path : _('None')}`,
    });
    prefsGroup.add(row);

    /**
     *
     */
    function createDialog() {
        let fileChooser = new Gtk.FileChooserDialog({
            title: _('Select Directory'),
            action: Gtk.FileChooserAction.SELECT_FOLDER,
        });
        fileChooser.set_modal(true);
        fileChooser.set_transient_for(window);
        fileChooser.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
        fileChooser.add_button(_('Open'), Gtk.ResponseType.ACCEPT);

        fileChooser.connect('response', (dialog, responseId) => {
            if (responseId === Gtk.ResponseType.ACCEPT) {
                let _path = dialog.get_file().get_path();
                settings.set_string(key, _path);
                row.subtitle = `${_path !== '' ? _path : _('None')}`;
            }
            dialog.destroy();
        });
        return fileChooser;
    }

    let button = new Adw.ButtonContent({
        icon_name: 'document-open-symbolic',
        label: _('Open'),
    });

    row.activatable_widget = button;
    row.add_suffix(button);

    row.connect('activated', () => {
        let dialog = createDialog();
        dialog.show();
    });
}

/**
 *
 * @param {Adw.PreferencesWindow} window AdwPreferencesWindow
 * @param {Adw.PreferencesGroup} prefsGroup AdwPreferencesGroup
 */
function prefsRowFitMode(window, prefsGroup) {
    const settings = window._settings;
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

    if (haveContentFit) {
        row.set_tooltip_markup(tooltip);
    } else {
        row.set_tooltip_markup(_('This feature requires Gtk 4.8 or above'));
        row.set_sensitive(false);
    }
    prefsGroup.add(row);

    row.connect('notify::selected', () => {
        settings.set_int('content-fit', row.selected);
    });
}

/**
 *
 * @param window
 * @param prefsGroup
 */
function prefsRowPauseOnMaximizeOrFullscreen(window, prefsGroup) {
    const settings = window._settings;
    const title = _('Pause on Maximize or Fullscreen');
    const subtitle = _('Pause playback when there is maximized or fullscreen window');
    const tooltip = _(`
    <b>Never</b>: Disable this feature.
    <b>Any Monitor</b>: Pause playback when there is maximized or fullscreen window on any monitor.
    <b>All Monitors</b>: Pause playback when there are maximized or fullscreen windows on all monitors.
    `);

    const items = Gtk.StringList.new([
        _('Never'),
        _('Any Monitor'),
        _('All Monitors'),
    ]);

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

/**
 *
 * @param window
 * @param prefsGroup
 */
function prefsRowPauseOnBattery(window, prefsGroup) {
    const settings = window._settings;
    const title = _('Pause on Battery');
    const subtitle = _('Pause playback when the device is on battery or the battery is low');
    const tooltip = _(`
    <b>Never</b>: Disable this feature.
    <b>Low Battery</b>: Pause playback when the device is on low battery (below the threshold).
    <b>Always</b>: Pause playback when the device is on battery.
    `);

    const items = Gtk.StringList.new([
        _('Never'),
        _('Low Battery'),
        _('Always'),
    ]);

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

/**
 *
 * @param {Adw.PreferencesWindow} window AdwPreferencesWindow
 * @param {Adw.PreferencesGroup} prefsGroup AdwPreferencesGroup
 */
function prefsRowChangeWallpaperMode(window, prefsGroup) {
    const settings = window._settings;
    const title = _('Change Wallpaper Mode');
    const subtitle = _('Control how to change wallpapers automatically');
    const tooltip = _(`
    <b>Sequential:</b> Preserve the directory sequence (descending order).
    <b>Inverse Sequential:</b> Retrieve wallpapers in the opposite sequence (ascending order).
    <b>Random:</b> Randomly select wallpapers from the directory.
    `);

    const items = Gtk.StringList.new([
        _('Sequential'),
        _('Inverse Sequential'),
        _('Random'),
    ]);

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
