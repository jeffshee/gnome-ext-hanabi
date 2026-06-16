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

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as WorkspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';

import {LiveWallpaper} from './wallpaper.js';
import {APPLICATION_ID} from './constants.js';
import {Logger} from './logger.js';

const logger = new Logger('override');

// Delay before forcing a workarea/monitor refresh after reloading backgrounds (ms).
const BACKGROUND_RELOAD_REFRESH_DELAY_MS = 500;

export class GnomeShellOverride {
    // Method patching, plus the original get_window_actors captured from our override of it
    // (the override hides renderer windows, so LiveWallpaper uses this to still find them).
    private injectionManager = new InjectionManager();
    private getAllWindowActors: () => Meta.WindowActor[] = () => global.get_window_actors();

    // Live wallpaper actors we've injected.
    private wallpaperActors = new Set<LiveWallpaper>();

    // Settings and its tracked signal connections.
    private settings: Gio.Settings;
    private settingsChangedIds: number[] = [];

    constructor(settings: Gio.Settings) {
        this.settings = settings;
    }

    private reloadBackgrounds(): void {
        logger.debug('Reloading backgrounds');
        this.wallpaperActors.forEach(actor => actor.destroy());
        this.wallpaperActors.clear();

        global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            Main.layoutManager._updateBackgrounds();
            if (Main.screenShield?._dialog?._updateBackgrounds != null)
                Main.screenShield._dialog._updateBackgrounds();

            try {
                Main.overview._overview._controls._workspacesDisplay._updateWorkspacesViews();
            } catch {
                // Suppress errors from extension conflicts (e.g. DING) during background reload
            }
            return GLib.SOURCE_REMOVE;
        });

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, BACKGROUND_RELOAD_REFRESH_DELAY_MS, () => {
            // _enabledExtensions (uuid list) is a private field not in the typed API.
            const {_enabledExtensions} = Main.extensionManager as {_enabledExtensions?: string[]};
            if (_enabledExtensions?.includes('blur-my-shell@aunetx'))
                Main.layoutManager.emit('monitors-changed');

            global.display.emit('workareas-changed');
            return GLib.SOURCE_REMOVE;
        });
    }

    private reloadLockScreenBackgrounds(): void {
        logger.debug('Reloading lock screen backgrounds');
        for (const actor of [...this.wallpaperActors]) {
            if (actor.isLockScreen())
                actor.destroy();
        }

        global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            if (Main.screenShield?._dialog?._updateBackgrounds != null)
                Main.screenShield._dialog._updateBackgrounds();
            return GLib.SOURCE_REMOVE;
        });
    }

    enable(): void {
        logger.debug('Installing overrides');

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const thisRef = this;

        // -----------------------------------------------------------------
        // Live wallpaper: inject a video actor behind each background actor.
        // -----------------------------------------------------------------

        this.injectionManager.overrideMethod(
            Background.BackgroundManager.prototype,
            '_createBackgroundActor',
            originalMethod => {
                return function (this: Background.BackgroundManager) {
                    const backgroundActor = originalMethod.call(this);

                    const isLockScreen = (this._container as (Clutter.Actor & { style_class?: string }) | null)?.style_class?.includes('screen-shield-background') ?? false;
                    if (isLockScreen && !thisRef.settings.get_boolean('show-on-lock-screen')) {
                        logger.debug('Skipping live wallpaper on lock screen');
                        return backgroundActor;
                    }

                    logger.debug(`Injecting live wallpaper (monitor ${backgroundActor.monitor})`);
                    this.wallpaperActor = new LiveWallpaper(
                        backgroundActor as Meta.BackgroundActor,
                        thisRef.settings,
                        thisRef.getAllWindowActors
                    );
                    thisRef.wallpaperActors.add(this.wallpaperActor);

                    this.wallpaperActor.connect('destroy', (actor: LiveWallpaper) => {
                        thisRef.wallpaperActors.delete(actor);
                        if (this.wallpaperActor === actor)
                            this.wallpaperActor = undefined;
                    });

                    return backgroundActor;
                };
            }
        );

        // -----------------------------------------------------------------
        // Rounded corner: apply our radius to the workspace background actor.
        // -----------------------------------------------------------------

        this.injectionManager.overrideMethod(
            Workspace.WorkspaceBackground.prototype,
            '_updateBorderRadius',
            (originalMethod: () => void) => {
                return function (this: Workspace.WorkspaceBackground) {
                    originalMethod.call(this);

                    const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
                    const cornerRadius = scaleFactor * thisRef.settings.get_int('corner-radius');

                    const radius = cornerRadius * this._stateAdjustment.value;
                    this._bgManager.wallpaperActor?.setRoundedClipRadius(radius);
                    const backgroundContent = this._bgManager.backgroundActor?.content;
                    if (backgroundContent)
                        backgroundContent.rounded_clip_radius = radius;

                    this.style = `border-radius: ${thisRef.settings.get_int('corner-radius')}px`;
                };
            }
        );

        // -----------------------------------------------------------------
        // Window hiding: exclude the renderer from window actor lists and tab lists.
        // -----------------------------------------------------------------

        this.injectionManager.overrideMethod(
            Shell.Global.prototype,
            'get_window_actors',
            originalMethod => {
                thisRef.getAllWindowActors = () => originalMethod.call(global);
                return function (this: Shell.Global) {
                    return originalMethod.call(this).filter(
                        actor => !actor.meta_window?.title?.includes(APPLICATION_ID)
                    );
                };
            }
        );

        this.injectionManager.overrideMethod(
            Workspace.Workspace.prototype,
            '_isOverviewWindow',
            (originalMethod: (window: Meta.Window) => boolean) => {
                return function (this: Workspace.Workspace, window: Meta.Window) {
                    const isRenderer = window.title?.includes(APPLICATION_ID);
                    return isRenderer ? false : originalMethod.apply(this, [window]);
                };
            }
        );

        this.injectionManager.overrideMethod(
            WorkspaceThumbnail.WorkspaceThumbnail.prototype,
            '_isOverviewWindow',
            (originalMethod: (window: Meta.Window) => boolean) => {
                return function (this: WorkspaceThumbnail.WorkspaceThumbnail, window: Meta.Window) {
                    const isRenderer = window.title?.includes(APPLICATION_ID);
                    return isRenderer ? false : originalMethod.apply(this, [window]);
                };
            }
        );

        this.injectionManager.overrideMethod(
            Meta.Display.prototype,
            'get_tab_list',
            originalMethod => {
                return function (this: Meta.Display, type: Meta.TabList, workspace: Meta.Workspace | null) {
                    return originalMethod
                        .call(this, type, workspace)
                        .filter(metaWindow => !metaWindow.title?.includes(APPLICATION_ID));
                };
            }
        );

        // -----------------------------------------------------------------
        // Nautilus/app tracker workaround: the renderer window shares gnome-shell's
        // PID on Wayland, causing it to be associated with nautilus. These overrides
        // exclude the renderer from the app tracker.
        // -----------------------------------------------------------------

        this.injectionManager.overrideMethod(
            Shell.WindowTracker.prototype,
            'get_window_app',
            originalMethod => {
                return function (this: Shell.WindowTracker, window: Meta.Window) {
                    const isRenderer = window.title?.includes(APPLICATION_ID);
                    // null! is a type lie: InjectionManager's strict return type requires
                    // App, but we intentionally return null for renderer windows.
                    return isRenderer ? null! : originalMethod.apply(this, [window]);
                };
            }
        );

        this.injectionManager.overrideMethod(
            Shell.App.prototype,
            'get_windows',
            originalMethod => {
                return function (this: Shell.App) {
                    return originalMethod
                        .call(this)
                        .filter(metaWindow => !metaWindow.title?.includes(APPLICATION_ID));
                };
            }
        );

        this.injectionManager.overrideMethod(
            Shell.App.prototype,
            'get_n_windows',
            _ => {
                return function (this: Shell.App) {
                    return this.get_windows().length;
                };
            }
        );

        this.injectionManager.overrideMethod(
            Shell.AppSystem.prototype,
            'get_running',
            originalMethod => {
                return function (this: Shell.AppSystem) {
                    return originalMethod
                        .call(this)
                        .filter(app => app.get_n_windows() > 0);
                };
            }
        );

        this.settingsChangedIds.push(
            this.settings.connect('changed::show-on-lock-screen', () => {
                this.reloadLockScreenBackgrounds();
            })
        );

        this.reloadBackgrounds();
    }

    disable(): void {
        logger.debug('Removing overrides');

        for (const id of this.settingsChangedIds)
            this.settings.disconnect(id);
        this.settingsChangedIds = [];

        this.injectionManager.clear();
        this.reloadBackgrounds();
    }
}
