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

const { Adw, Gio, Gtk, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function init() {}

function fillPreferencesWindow(window) {
    // Create a preferences page and group
    const page = new Adw.PreferencesPage();
    const generalGroup = new Adw.PreferencesGroup({ title: "General" });
    page.add(generalGroup);
    prefsRowVideoPath(window, generalGroup);
    prefsRowBoolean(generalGroup, "Mute audio", "mute", "");
    prefsRowInt(generalGroup, "Audio volume", "volume", "", 0, 100, 1, 10);
    prefsRowWallpaperFitMode(generalGroup);

    const pauseGroup = new Adw.PreferencesGroup({ title: "Auto pause" });
    // page.add(pauseGroup);
    prefsRowBoolean(
        pauseGroup,
        "Pause on fullscreen",
        "pause-on-fullscreen",
        "Pause playback when there is a fullscreen window"
    );
    prefsRowBoolean(
        pauseGroup,
        "Pause on maximize",
        "pause-on-maximize",
        "Pause playback when there is a maximized window"
    );
    prefsRowBoolean(
        pauseGroup,
        "Pause on battery",
        "pause-on-battery",
        "Pause playback when device is on battery"
    );

    const experimentalGroup = new Adw.PreferencesGroup({
        title: "Experimental",
    });
    page.add(experimentalGroup);
    prefsRowBoolean(
        experimentalGroup,
        "Experimental VA plugin",
        "enable-va",
        "Enable VA decoders which improve performance for Intel/AMD Wayland users"
    );
    prefsRowBoolean(
        experimentalGroup,
        "Nvidia stateless decoders",
        "enable-nvsl",
        "Use new stateless Nvidia decoders"
    );

    const developerGroup = new Adw.PreferencesGroup({ title: "Developer" });
    page.add(developerGroup);
    prefsRowBoolean(
        developerGroup,
        "Debug mode",
        "debug-mode",
        "Print debug messages to log"
    );
    prefsRowBoolean(
        developerGroup,
        "Force gtk4paintablesink",
        "force-gtk4paintablesink",
        "Force use of gtk4paintablesink for video playback"
    );
    prefsRowBoolean(
        developerGroup,
        "Force GtkMediaFile",
        "force-mediafile",
        "Force use of GtkMediaFile for video playback"
    );

    // Add our page to the window
    window.add(page);
}

function prefsRowVideoPath(window, prefsGroup) {
    const title = "Video path";
    const key = "video-path";

    const settings = ExtensionUtils.getSettings(
        "io.github.jeffshee.hanabi-extension"
    );

    let path = settings.get_string(key);
    const row = new Adw.ActionRow({
        title: title,
        subtitle: `Current: ${path !== "" ? path : "None"}`,
    });
    prefsGroup.add(row);

    function createDialog() {
        let fileFilter = new Gtk.FileFilter();
        fileFilter.add_mime_type("video/*");

        let fileChooser = new Gtk.FileChooserDialog({
            title: "Open File",
            action: Gtk.FileChooserAction.OPEN,
        });
        fileChooser.set_modal(true);
        fileChooser.set_transient_for(window);
        fileChooser.add_button("Cancel", Gtk.ResponseType.CANCEL);
        fileChooser.add_button("Open", Gtk.ResponseType.ACCEPT);
        fileChooser.add_filter(fileFilter);

        fileChooser.connect("response", (dialog, response_id) => {
            if (response_id === Gtk.ResponseType.ACCEPT) {
                let path = dialog.get_file().get_path();
                settings.set_string(key, path);
                row.subtitle = `Current: ${path !== "" ? path : "None"}`;
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

function prefsRowWallpaperFitMode(prefsGroup) {
    const title = "Wallpaper fit mode";
    const tooltip = `
    <b>Fill</b>: Stretch the wallpaper to fill the monitor.
    <b>Contain</b>: Scale the wallpaper to fit the monitor (keep aspect ratio).
    <b>Cover</b>: Scale the wallpaper to cover the monitor (keep aspect ratio).
    <b>Scale-down</b>: Scale down the wallpaper to fit the monitor if needed, otherwise keep its original size.
    `;
    const settings = ExtensionUtils.getSettings(
        "io.github.jeffshee.hanabi-extension"
    );

    const row = new Adw.ActionRow({ title });
    prefsGroup.add(row);

    const items = ["Fill", "Contain", "Cover", "Scale-down"];
    const store = new Gtk.ListStore();
    store.set_column_types([GObject.TYPE_STRING]);
    items.forEach(function (item) {
        store.set(store.append(), [0], [item]);
    });

    let combo_box = new Gtk.ComboBox({
        model: store,
        active: settings.get_int("content-fit"),
    });
    let cell_renderer_text = new Gtk.CellRendererText();
    combo_box.pack_start(cell_renderer_text, true);
    combo_box.add_attribute(cell_renderer_text, "text", 0);
    combo_box.set_tooltip_markup(tooltip);

    combo_box.connect("changed", function () {
        let active = combo_box.get_active();
        settings.set_int("content-fit", active);
    });

    row.add_suffix(combo_box);
}

function prefsRowInt(
    prefsGroup,
    title,
    key,
    subtitle,
    lower,
    upper,
    step_increment,
    page_increment
) {
    const settings = ExtensionUtils.getSettings(
        "io.github.jeffshee.hanabi-extension"
    );

    const row = new Adw.ActionRow({ title, subtitle });
    prefsGroup.add(row);

    const adjustment = new Gtk.Adjustment({
        lower,
        upper,
        step_increment,
        page_increment,
        value: settings.get_int(key),
    });
    adjustment.connect("value-changed", () => {
        settings.set_int(key, adjustment.value);
    });
    const spin = new Gtk.SpinButton({
        adjustment: adjustment,
    });

    row.add_suffix(spin);
}

function prefsRowBoolean(prefsGroup, title, key, subtitle) {
    // Use the same GSettings schema as in `extension.js`
    const settings = ExtensionUtils.getSettings(
        "io.github.jeffshee.hanabi-extension"
    );

    // Create a new preferences row
    const row = new Adw.ActionRow({ title, subtitle });
    prefsGroup.add(row);

    // Create the switch and bind its value to the key
    const toggle = new Gtk.Switch({
        active: settings.get_boolean(key),
        valign: Gtk.Align.CENTER,
    });
    settings.bind(key, toggle, "active", Gio.SettingsBindFlags.DEFAULT);

    // Add the switch to the row
    row.add_suffix(toggle);
    row.activatable_widget = toggle;
}
