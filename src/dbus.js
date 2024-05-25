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

import * as DBusUtil from 'resource://org/gnome/shell/misc/dbusUtils.js';
import * as Logger from './logger.js';


// Ref: https://gjs.guide/guides/gio/dbus.html#high-level-proxies
export class RendererWrapper {
    constructor() {
        this._logger = new Logger.Logger('dbus::renderer');
        this.proxy = this.createProxy();
    }

    createProxy() {
        const interfaceXml = `
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
        const DBUS_BUS_NAME = 'io.github.jeffshee.HanabiRenderer';
        const DBUS_OBJECT_PATH = '/io/github/jeffshee/HanabiRenderer';
        const DBusProxy = Gio.DBusProxy.makeProxyWrapper(interfaceXml);
        return DBusProxy(Gio.DBus.session, DBUS_BUS_NAME, DBUS_OBJECT_PATH);
    }

    async setPlay() {
        try {
            await this.proxy.setPlayAsync();
        } catch (e) {
            this._logger.warn(e);
        }
    }

    async setPause() {
        try {
            await this.proxy.setPauseAsync();
        } catch (e) {
            this._logger.warn(e);
        }
    }
}

export class UPowerWrapper {
    constructor() {
        this.proxy = this.createProxy();
    }

    createProxy() {
        const DBUS_INTERFACE = 'org.freedesktop.UPower.Device';
        const DBUS_BUS_NAME = 'org.freedesktop.UPower';
        const DBUS_OBJECT_PATH = '/org/freedesktop/UPower/devices/DisplayDevice';
        const interfaceXml = DBusUtil.loadInterfaceXML(DBUS_INTERFACE);
        const DBusProxy = Gio.DBusProxy.makeProxyWrapper(interfaceXml);
        return DBusProxy(Gio.DBus.system, DBUS_BUS_NAME, DBUS_OBJECT_PATH);
    }

    getState() {
        return this.proxy.State;
    }

    getPercentage() {
        return this.proxy.Percentage;
    }
}


export class DBusWrapper {
    constructor() {
        this._logger = new Logger.Logger('dbus::dbus');
        this.proxy = this.createProxy();
    }

    createProxy() {
        const DBUS_INTERFACE = 'org.freedesktop.DBus';
        const DBUS_BUS_NAME = 'org.freedesktop.DBus';
        const DBUS_OBJECT_PATH = '/org/freedesktop/DBus';
        const interfaceXml = DBusUtil.loadInterfaceXML(DBUS_INTERFACE);
        const DBusProxy = Gio.DBusProxy.makeProxyWrapper(interfaceXml);
        return DBusProxy(Gio.DBus.session, DBUS_BUS_NAME, DBUS_OBJECT_PATH);
    }

    listNames() {
        try {
            return this.proxy.ListNamesSync();
        } catch (e) {
            this._logger.warn(e);
        }
        return [];
    }
}

export class MprisWrapper {
    constructor(mediaPlayerName) {
        this._logger = new Logger.Logger(`dbus::mpris::${mediaPlayerName}`);
        this.proxy = this.createProxy(mediaPlayerName);
    }

    createProxy(mediaPlayerName) {
        const DBUS_INTERFACE = 'org.mpris.MediaPlayer2.Player';
        const DBUS_BUS_NAME = mediaPlayerName;
        const DBUS_OBJECT_PATH = '/org/mpris/MediaPlayer2';
        const interfaceXml = DBusUtil.loadInterfaceXML(DBUS_INTERFACE);
        const DBusProxy = Gio.DBusProxy.makeProxyWrapper(interfaceXml);
        return DBusProxy(Gio.DBus.session, DBUS_BUS_NAME, DBUS_OBJECT_PATH);
    }

    getPlaybackStatus() {
        return this.proxy.PlaybackStatus;
    }
}
