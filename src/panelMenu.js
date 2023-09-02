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

/* exported PanelMenu */

const {Gio, GLib, St} = imports.gi;
const Gettext = imports.gettext;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const extSettings = ExtensionUtils.getSettings(
    'io.github.jeffshee.hanabi-extension'
);

const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

const getMute = () => {
    return extSettings.get_boolean('mute');
};

const setMute = mute => {
    return extSettings.set_boolean('mute', mute);
};

var HanabiPanelMenu = class HanabiPanelMenu {
    constructor() {
        this._isPlaying = false;

        // DBus
        const dbusXml = `
        <node>
            <interface name="io.github.jeffshee.HanabiRenderer">
                <method name="setPlay"/>
                <method name="setPause"/>
                <property name="isPlaying" type="b" access="read"/>
                <signal name="isPlayingChanged">
                    <arg name="isPlaying" type="b"/>
                </signal>
            </interface>
        </node>`;
        const proxy = Gio.DBusProxy.makeProxyWrapper(dbusXml);
        this.proxy = proxy(Gio.DBus.session,
            'io.github.jeffshee.HanabiRenderer', '/io/github/jeffshee/HanabiRenderer');
    }

    enable() {
        // Indicator
        const indicatorName = `${Me.metadata.name} Indicator`;
        this.indicator = new PanelMenu.Button(0.0, indicatorName, false);
        const icon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                GLib.build_filenamev([
                    ExtensionUtils.getCurrentExtension().path,
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

        // PlayPause
        const playPause = new PopupMenu.PopupMenuItem(
            this._isPlaying ? _('Pause') : _('Play')
        );

        playPause.connect('activate', () => {
            this.proxy.call(
                this._isPlaying ? 'setPause' : 'setPlay', // method_name
                null, // parameters
                Gio.DBusCallFlags.NO_AUTO_START, // flags
                -1, // timeout_msec
                null, // cancellable
                null // callback
            );
        }
        );

        this.proxy.connectSignal(
            'isPlayingChanged',
            (_proxy, _sender, [isPlaying]) => {
                this._isPlaying = isPlaying;
                playPause.label.set_text(
                    this._isPlaying ? _('Pause') : _('Play')
                );
            }
        );

        menu.addMenuItem(playPause);

        // MuteUnmute
        const muteAudio = new PopupMenu.PopupMenuItem(
            getMute() ? _('Unmute Audio') : _('Mute Audio')
        );

        muteAudio.connect('activate', () => {
            setMute(!getMute());
        });

        extSettings?.connect('changed', (settings, key) => {
            if (key === 'mute') {
                muteAudio.label.set_text(
                    getMute() ? _('Unmute Audio') : _('Mute Audio')
                );
            }
        });

        menu.addMenuItem(muteAudio);

        // Preferences
        menu.addAction(_('Preferences'), () => {
            ExtensionUtils.openPrefs();
        });
    }

    disable() {
        this.indicator.destroy();
    }
};
