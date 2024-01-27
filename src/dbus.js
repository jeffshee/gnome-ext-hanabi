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
