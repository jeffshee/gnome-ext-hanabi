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

const UPOWER_BUS_NAME = 'org.freedesktop.UPower';
const UPOWER_OBJECT_PATH = '/org/freedesktop/UPower/devices/DisplayDevice';
const DBUS_BUS_NAME = 'org.freedesktop.DBus';
const DBUS_OBJECT_PATH = '/org/freedesktop/DBus';

export class RendererDBus {
    constructor() {
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

    getProxy() {
        return this.proxy;
    }

    connect(signal, callback) {
        return this.proxy.connectSignal(signal, callback);
    }

    setPlay() {
        this.proxy.call(
            'setPlay', // method_name
            null, // parameters
            Gio.DBusCallFlags.NO_AUTO_START, // flags
            -1, // timeout_msec
            null, // cancellable
            null // callback
        );
    }

    setPause() {
        this.proxy.call(
            'setPause',
            null,
            Gio.DBusCallFlags.NO_AUTO_START,
            -1,
            null,
            null
        );
    }
}

export class UPowerDBus {
    constructor() {
        const dbusXml = DBusUtil.loadInterfaceXML('org.freedesktop.UPower.Device');
        const proxy = Gio.DBusProxy.makeProxyWrapper(dbusXml);
        this.proxy = proxy(Gio.DBus.system, UPOWER_BUS_NAME, UPOWER_OBJECT_PATH);
    }

    getProxy() {
        return this.proxy;
    }

    connect(signal, callback) {
        return this.proxy.connectSignal(signal, callback);
    }

    getState() {
        return this.proxy.State;
    }

    getPercentage() {
        return this.proxy.Percentage;
    }
}


export class DbusDBus {
    constructor() {
        const dbusXml = DBusUtil.loadInterfaceXML('org.freedesktop.DBus');
        const proxy = Gio.DBusProxy.makeProxyWrapper(dbusXml);
        this.proxy = proxy(Gio.DBus.session, DBUS_BUS_NAME, DBUS_OBJECT_PATH);
    }

    getProxy() {
        return this.proxy;
    }

    connect(signal, callback) {
        return this.proxy.connectSignal(signal, callback);
    }
}

export class MprisDbus {
    constructor(mediaPlayerName) {
        const dbusXml = DBusUtil.loadInterfaceXML('org.freedesktop.DBus.Properties');
        const proxy = Gio.DBusProxy.makeProxyWrapper(dbusXml);
        this.proxy = proxy(Gio.DBus.session, mediaPlayerName, '/org/mpris/MediaPlayer2');
        const dbusXml2 = DBusUtil.loadInterfaceXML('org.mpris.MediaPlayer2.Player');
        const proxy2 = Gio.DBusProxy.makeProxyWrapper(dbusXml2);
        this.proxy2 = proxy2(Gio.DBus.session, mediaPlayerName, '/org/mpris/MediaPlayer2');
    }

    getProxy() {
        return this.proxy;
    }

    connect(signal, callback) {
        return this.proxy.connectSignal(signal, callback);
    }

    getPlaybackState() {
        return this.proxy2.PlaybackStatus;
    }

    getMetadata() {
        return this.proxy2.Metadata;
    }
}

