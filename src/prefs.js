/**
 * Copyright (C) 2022 Jeff Shee (jeffshee8969@gmail.com)
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

const { Adw, Gio, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function init() {

}


function fillPreferencesWindow(window) {
    // Create a preferences page and group
    const page = new Adw.PreferencesPage();
    const generalGroup = new Adw.PreferencesGroup({ title: "General" });
    page.add(generalGroup);
    prefsRowVideoPath(window, generalGroup)
    prefsRowBoolean(generalGroup, "Mute audio", "mute");
    prefsVolume(generalGroup);

    const pauseGroup = new Adw.PreferencesGroup({ title: "Auto pause" });
    page.add(pauseGroup);
    prefsRowBoolean(pauseGroup, "Pause on fullscreen", "pause-on-fullscreen", "Pause playback when there is a fullscreen window");
    prefsRowBoolean(pauseGroup, "Pause on maximize", "pause-on-maximize", "Pause playback when there is a maximized window");
    prefsRowBoolean(pauseGroup, "Pause on battery", "pause-on-battery", "Pause playback when device is on battery");

    // Add our page to the window
    window.add(page);
}

function prefsRowVideoPath(window, prefsGroup) {
    const title = "Video path";
    const key = "video-path";

    const settings = ExtensionUtils.getSettings(
        'io.github.jeffshee.hanabi-extension');

    const row = new Adw.ActionRow({ title: title, subtitle: `Current: ${settings.get_string(key)}` });
    prefsGroup.add(row);

    function createDialog() {
        let fileFilter = new Gtk.FileFilter();
        fileFilter.add_mime_type("video/*");

        let fileChooser = new Gtk.FileChooserDialog({
            title: "Open File",
            action: Gtk.FileChooserAction.OPEN
        });
        fileChooser.set_modal(true);
        fileChooser.set_transient_for(window);
        fileChooser.add_button('Cancel', Gtk.ResponseType.CANCEL);
        fileChooser.add_button('Open', Gtk.ResponseType.ACCEPT);
        fileChooser.add_filter(fileFilter);

        fileChooser.connect("response", (dialog, response_id) => {
            if (response_id === Gtk.ResponseType.ACCEPT) {
                let path = dialog.get_file().get_path();
                settings.set_string(key, path);
                row.subtitle = `Current: ${path}`;
            }
            dialog.destroy();

        });
        return fileChooser;
    }

    let button = new Adw.ButtonContent({
        icon_name: "document-open-symbolic",
        label: "Open",
    });

    row.activatable_widget = button;
    row.add_suffix(button);

    row.connect("activated", () => {
        dialog = createDialog();
        dialog.show();
    });

}

function prefsVolume(prefsGroup) {
    const title = "Audio volume"
    const key = "volume"

    const settings = ExtensionUtils.getSettings(
        'io.github.jeffshee.hanabi-extension');

    const row = new Adw.ActionRow({ title: title });
    prefsGroup.add(row);

    const adjustment = new Gtk.Adjustment({
        lower: 0,
        upper: 100,
        step_increment: 1,
        page_increment: 10,
        value: settings.get_int(key)
    });
    adjustment.connect("value-changed", () => {
        settings.set_int(key, adjustment.value);
    });
    const spin = new Gtk.SpinButton({
        adjustment: adjustment
    });

    row.add_suffix(spin);
}

function prefsRowBoolean(prefsGroup, title, key, subtitle = "") {
    // Use the same GSettings schema as in `extension.js`
    const settings = ExtensionUtils.getSettings(
        'io.github.jeffshee.hanabi-extension');

    // Create a new preferences row
    const row = new Adw.ActionRow({ title: title, subtitle: subtitle });
    prefsGroup.add(row);

    // Create the switch and bind its value to the key
    const toggle = new Gtk.Switch({
        active: settings.get_boolean(key),
        valign: Gtk.Align.CENTER,
    });
    settings.bind(
        key,
        toggle,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Add the switch to the row
    row.add_suffix(toggle);
    row.activatable_widget = toggle;
}