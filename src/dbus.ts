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

import * as DBusUtil from 'resource:///org/gnome/shell/misc/dbusUtils.js';

import {Logger} from './logger.js';
import {APPLICATION_ID, RENDERER_OBJECT_PATH} from './constants.js';

// makeProxyWrapper proxies expose connectSignal(name, callback)/disconnectSignal(id);
// the base Gio.DBusProxy types connectSignal differently, so add the correct overload.
type DBusSignalProxy = Gio.DBusProxy & {
    connectSignal(name: string, callback: (...args: any[]) => void): number;
    disconnectSignal(id: number): void;
};

interface RendererProxy extends DBusSignalProxy {
    setPlayAsync(): Promise<void>;
    setPauseAsync(): Promise<void>;
}

// Ref: https://gjs.guide/guides/gio/dbus.html#high-level-proxies
export class RendererWrapper {
    private logger: Logger;
    proxy: RendererProxy;

    constructor() {
        this.logger = new Logger('dbus::renderer');
        this.proxy = this.createProxy();
    }

    createProxy(): RendererProxy {
        const interfaceXml = `
        <node>
            <interface name="${APPLICATION_ID}">
                <method name="setPlay"/>
                <method name="setPause"/>
                <property name="isPlaying" type="b" access="read"/>
                <signal name="isPlayingChanged">
                    <arg name="isPlaying" type="b"/>
                </signal>
            </interface>
        </node>`;
        const DBusProxy = Gio.DBusProxy.makeProxyWrapper<RendererProxy>(interfaceXml);
        return DBusProxy(Gio.DBus.session, APPLICATION_ID, RENDERER_OBJECT_PATH);
    }

    async setPlay(): Promise<void> {
        try {
            await this.proxy.setPlayAsync();
        } catch (e) {
            this.logger.warn(e);
        }
    }

    async setPause(): Promise<void> {
        try {
            await this.proxy.setPauseAsync();
        } catch (e) {
            this.logger.warn(e);
        }
    }
}

interface UPowerProxy extends DBusSignalProxy {
    State: number;
    Percentage: number;
}

export class UPowerWrapper {
    proxy: UPowerProxy;

    constructor() {
        this.proxy = this.createProxy();
    }

    createProxy(): UPowerProxy {
        const DBUS_INTERFACE = 'org.freedesktop.UPower.Device';
        const DBUS_BUS_NAME = 'org.freedesktop.UPower';
        const DBUS_OBJECT_PATH =
            '/org/freedesktop/UPower/devices/DisplayDevice';
        const interfaceXml = DBusUtil.loadInterfaceXML(DBUS_INTERFACE);
        const DBusProxy = Gio.DBusProxy.makeProxyWrapper<UPowerProxy>(interfaceXml);
        return DBusProxy(Gio.DBus.system, DBUS_BUS_NAME, DBUS_OBJECT_PATH);
    }

    getState(): number {
        return this.proxy.State ?? 0;
    }

    getPercentage(): number {
        return this.proxy.Percentage ?? 100;
    }
}

interface DBusSessionProxy extends DBusSignalProxy {
    ListNamesSync(): string[][];
}

export class DBusWrapper {
    private logger: Logger;
    proxy: DBusSessionProxy;

    constructor() {
        this.logger = new Logger('dbus::dbus');
        this.proxy = this.createProxy();
    }

    createProxy(): DBusSessionProxy {
        const DBUS_INTERFACE = 'org.freedesktop.DBus';
        const DBUS_BUS_NAME = 'org.freedesktop.DBus';
        const DBUS_OBJECT_PATH = '/org/freedesktop/DBus';
        const interfaceXml = DBusUtil.loadInterfaceXML(DBUS_INTERFACE);
        const DBusProxy = Gio.DBusProxy.makeProxyWrapper<DBusSessionProxy>(interfaceXml);
        return DBusProxy(Gio.DBus.session, DBUS_BUS_NAME, DBUS_OBJECT_PATH);
    }

    listNames(): string[][] {
        try {
            return this.proxy.ListNamesSync();
        } catch (e) {
            this.logger.warn(e);
        }
        return [];
    }
}

interface MprisProxy extends DBusSignalProxy {
    PlaybackStatus: string;
}

export class MprisWrapper {
    proxy: MprisProxy;

    constructor(mediaPlayerName: string) {
        this.proxy = this.createProxy(mediaPlayerName);
    }

    createProxy(mediaPlayerName: string): MprisProxy {
        const DBUS_INTERFACE = 'org.mpris.MediaPlayer2.Player';
        const DBUS_BUS_NAME = mediaPlayerName;
        const DBUS_OBJECT_PATH = '/org/mpris/MediaPlayer2';
        const interfaceXml = DBusUtil.loadInterfaceXML(DBUS_INTERFACE);
        const DBusProxy = Gio.DBusProxy.makeProxyWrapper<MprisProxy>(interfaceXml);
        return DBusProxy(Gio.DBus.session, DBUS_BUS_NAME, DBUS_OBJECT_PATH);
    }

    getPlaybackStatus(): string {
        return this.proxy.PlaybackStatus ?? 'Stopped';
    }
}
