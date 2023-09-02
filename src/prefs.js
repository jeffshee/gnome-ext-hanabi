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

const {Adw, Gio, Gtk} = imports.gi;
const Gettext = imports.gettext;

const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const haveContentFit = Gtk.get_minor_version() >= 8;
const settings = ExtensionUtils.getSettings(
    'io.github.jeffshee.hanabi-extension'
);

const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

/**
 *
 */
function init() {
    ExtensionUtils.initTranslations(Me.metadata.uuid);
}

/**
 *
 * @param window
 */
function fillPreferencesWindow(window) {
    // Create a preferences page and group
    const page = new Adw.PreferencesPage();
    const generalGroup = new Adw.PreferencesGroup({title: _('General')});
    page.add(generalGroup);
    prefsRowVideoPath(window, generalGroup);
    prefsRowFitMode(generalGroup);
    prefsRowBoolean(generalGroup, _('Mute Audio'), 'mute', '');
    prefsRowInt(generalGroup, _('Volume Level'), 'volume', '', 0, 100, 1, 10);
    prefsRowBoolean(generalGroup, _('Show Panel Menu'), 'show-panel-menu', '');

    const experimentalGroup = new Adw.PreferencesGroup({
        title: _('Experimental'),
    });
    page.add(experimentalGroup);
    prefsRowBoolean(
        experimentalGroup,
        _('Experimental VA Plugin'),
        'enable-va',
        _('Enable VA decoders which improve performance for Intel/AMD Wayland users')
    );
    prefsRowBoolean(
        experimentalGroup,
        _('NVIDIA Stateless Decoders'),
        'enable-nvsl',
        _('Use new stateless NVIDIA decoders')
    );

    const developerGroup = new Adw.PreferencesGroup({title: _('Developer')});
    page.add(developerGroup);
    prefsRowBoolean(
        developerGroup,
        _('Debug Mode'),
        'debug-mode',
        _('Print debug messages to log')
    );
    prefsRowBoolean(
        developerGroup,
        _('Force gtk4paintablesink'),
        'force-gtk4paintablesink',
        _('Force use of gtk4paintablesink for video playback')
    );
    prefsRowBoolean(
        developerGroup,
        _('Force GtkMediaFile'),
        'force-mediafile',
        _('Force use of GtkMediaFile for video playback')
    );
    prefsRowInt(developerGroup, _('Startup Delay'), 'startup-delay', _('Add a startup delay (in milliseconds) to mitigate compatibility issues with other extensions'), 0, 10000, 100, 500);

    // Add our page to the window
    window.add(page);
}

/**
 *
 * @param prefsGroup
 * @param title
 * @param key
 * @param subtitle
 */
function prefsRowBoolean(prefsGroup, title, key, subtitle) {
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
 * @param prefsGroup
 * @param title
 * @param key
 * @param subtitle
 * @param lower
 * @param upper
 * @param stepIncrement
 * @param pageIncrement
 */
function prefsRowInt(
    prefsGroup,
    title,
    key,
    subtitle,
    lower,
    upper,
    stepIncrement,
    pageIncrement
) {
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
 * @param window
 * @param prefsGroup
 */
function prefsRowVideoPath(window, prefsGroup) {
    const title = _('Video Path');
    const key = 'video-path';

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
 * @param prefsGroup
 */
function prefsRowFitMode(prefsGroup) {
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
