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


/* exported Logger */

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var Logger = class Logger {
    constructor(opt = undefined) {
        const extSchemaId = 'io.github.jeffshee.hanabi-extension';
        const debugModeKey = 'debug-mode';
        const extSettings = ExtensionUtils.getSettings(extSchemaId);
        const logPrefix = 'Hanabi:';

        this.logPrefix = logPrefix;
        this.logOpt = opt;
        this.isDebugMode = extSettings ? extSettings.get_boolean(debugModeKey) : false;

        extSettings?.connect('changed', (settings, key) => {
            if (key === debugModeKey)
                this.isDebugMode = settings.get_boolean(debugModeKey);
        });
    }

    _processArgs(args) {
        args.unshift(this.logOpt ? `${this.logPrefix} (${this.logOpt})` : this.logPrefix);
        return args;
    }

    log(...args) {
        console.log(...this._processArgs(args));
    }

    debug(...args) {
        /**
         * If `debug-mode` is true, use `console.log`.
         * Otherwise, use `console.debug` for internal logging.
         * (Visible when `GLib.log_set_debug_enabled(true)` is called in Looking Glass)
         */
        args = this._processArgs(args);
        if (this.isDebugMode)
            console.log(...args);
        else
            console.debug(...args);
    }

    warn(...args) {
        console.warn(...this._processArgs(args));
    }

    error(...args) {
        console.error(...this._processArgs(args));
    }

    trace(...args) {
        console.trace(...this._processArgs(args));
    }
};