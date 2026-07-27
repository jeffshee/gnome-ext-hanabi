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

const schemaId = 'io.github.jeffshee.hanabi-extension';
const logPrefix = 'Hanabi:';

export class Logger {
    private settings?: Gio.Settings;
    private readonly logOpt?: string;
    isDebugMode: boolean;

    constructor(opt?: string) {
        const settingsSchemaSource = Gio.SettingsSchemaSource.get_default();
        if (settingsSchemaSource?.lookup(schemaId, false))
            this.settings = Gio.Settings.new(schemaId);

        this.logOpt = opt;
        this.isDebugMode = this.settings
            ? this.settings.get_boolean('debug-mode')
            : false;

        this.settings?.connect('changed::debug-mode', () => {
            this.isDebugMode = this.settings!.get_boolean('debug-mode');
        });
    }

    private processArgs(args: any[]): any[] {
        args.unshift(
            this.logOpt ? `${logPrefix} (${this.logOpt})` : logPrefix
        );
        return args;
    }

    log(...args: any[]): void {
        console.log(...this.processArgs(args));
    }

    debug(...args: any[]): void {
        args = this.processArgs(args);
        if (this.isDebugMode)
            console.log(...args);
        else
            console.debug(...args);
    }

    warn(...args: any[]): void {
        console.warn(...this.processArgs(args));
    }

    error(...args: any[]): void {
        console.error(...this.processArgs(args));
    }

    trace(...args: any[]): void {
        console.trace(...this.processArgs(args));
    }
}

export function getMethods(obj: object): string[] {
    const properties = new Set<string>();
    let currentObj: object | null = obj;
    do {
        Object.getOwnPropertyNames(currentObj).forEach(item =>
            properties.add(item)
        );
    }
    while ((currentObj = Object.getPrototypeOf(currentObj) as object | null));
    return [...properties.keys()].filter(item => typeof (obj as Record<string, unknown>)[item] === 'function');
}
