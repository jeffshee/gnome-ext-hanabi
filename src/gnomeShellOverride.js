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


/* exported GnomeShellOverride */

const {Clutter, GLib, GObject, Meta, St, Shell, Graphene} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Background = imports.ui.background;
const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const Util = imports.misc.util;

const Me = ExtensionUtils.getCurrentExtension();
const RoundedCornersEffect = Me.imports.roundedCornersEffect;

const applicationId = 'io.github.jeffshee.HanabiRenderer';
const extSettings = ExtensionUtils.getSettings(
    'io.github.jeffshee.hanabi-extension'
);

const getDebugMode = () => {
    return extSettings.get_boolean('debug-mode');
};

const debug = (...args) => {
    if (getDebugMode())
        log('[Hanabi]', ...args);
};

/**
 * A quick check to see if the override is actually doing something.
 */
const effectiveOverrides = new Set();
const markAsEffective = overrideName => {
    if (!effectiveOverrides.has(overrideName)) {
        effectiveOverrides.add(overrideName);
        debug(
            `Effective overrides: ${Array.from(effectiveOverrides).join(', ')}`
        );
    }
};

const compareArrays = (arr1, arr2) =>
    arr1.length === arr2.length &&
    arr1.every((element, index) => element === arr2[index]);

var replaceData = {};
const runningWallpaperActors = new Set();

/**
 * This class overrides methods in the Gnome Shell. The new methods
 * need to be defined below the class as seperate functions.
 * The old methods that are overriden can be accesed by relpacedata.old_'name-of-replaced-method'
 * in the new functions.
 */
var GnomeShellOverride = class {
    constructor() {
        this._isX11 = !Meta.is_wayland_compositor();
    }

    _reloadBackgrounds() {
        runningWallpaperActors.forEach(actor => actor.destroy());
        runningWallpaperActors.clear();

        Main.layoutManager._updateBackgrounds();

        /**
         * Fix black lock screen background.
         * Screen shield has its own bgManagers.
         * We hacked background manager to add our actor before the image,
         * but gnome-shell will disable all extensions before locking,
         * then our player is closed, but the bgManager still holds our actor, so it gets black.
         * Just simply re-create normal bgManagers fixed this.
         *
         * Also, `Main.screenShield` will be `null` when the user doesn't use gnome shell locking.
         */
        if (Main.screenShield?._dialog?._updateBackgrounds != null)
            Main.screenShield._dialog._updateBackgrounds();


        /**
         * WorkspaceBackground has its own bgManager,
         * we have to recreate it to use our actors, so it can set radius to our actor.
         */
        Main.overview._overview._controls._workspacesDisplay._updateWorkspacesViews();
    }

    enable() {
        // Live wallpaper
        this.replaceMethod(
            Background.BackgroundManager,
            '_createBackgroundActor',
            new_createBackgroundActor
        );

        // Rounded corner
        this.replaceMethod(
            Workspace.WorkspaceBackground,
            '_updateBorderRadius',
            new_updateBorderRadius
        );

        this.replaceMethod(
            Workspace.WorkspaceBackground,
            '_updateRoundedClipBounds',
            new_updateRoundedClipBounds
        );

        // Hiding mechanism
        this.replaceMethod(
            Shell.Global,
            'get_window_actors',
            new_get_window_actors
        );

        this.replaceMethod(
            Workspace.Workspace,
            '_isOverviewWindow',
            new_Workspace__isOverviewWindow,
            'Workspace'
        );

        this.replaceMethod(
            WorkspaceThumbnail.WorkspaceThumbnail,
            '_isOverviewWindow',
            new_WorkspaceThumbnail__isOverviewWindow,
            'WorkspaceThumbnail'
        );

        this.replaceMethod(Meta.Display, 'get_tab_list', new_get_tab_list);

        this.replaceMethod(Shell.AppSystem, 'get_running', new_get_running);

        this._reloadBackgrounds();
    }

    disable() {
        for (let value of Object.values(replaceData)) {
            if (value[0])
                value[1].prototype[value[2]] = value[0];
        }

        replaceData = {};

        this._reloadBackgrounds();
    }

    /**
     * Replaces a method in a class with our own method, and stores the original
     * one in 'replaceData' using 'old_XXXX' (being XXXX the name of the original method),
     * or 'old_classId_XXXX' if 'classId' is defined. This is done this way for the
     * case that two methods with the same name must be replaced in two different
     * classes
     *
     * @param {class} className The class where to replace the method
     * @param {string} methodName The method to replace
     * @param {Function} functionToCall The function to call as the replaced method
     * @param {string} [classId] an extra ID to identify the stored method when two
     *                           methods with the same name are replaced in
     *                           two different classes
     */
    replaceMethod(className, methodName, functionToCall, classId) {
        if (classId) {
            replaceData[`old_${classId}_${methodName}`] = [
                className.prototype[methodName],
                className,
                methodName,
                classId,
            ];
        } else {
            replaceData[`old_${methodName}`] = [
                className.prototype[methodName],
                className,
                methodName,
            ];
        }
        className.prototype[methodName] = functionToCall;
    }
};

/**
 * The widget that holds the window preview of the renderer.
 */
var LiveWallpaper = GObject.registerClass(
    class LiveWallpaper extends St.Widget {
        _init(backgroundActor) {
            super._init({
                layout_manager: new Clutter.BinLayout(),
                //
                x: backgroundActor.x,
                y: backgroundActor.y,
                width: backgroundActor.width,
                height: backgroundActor.height,
                // Layout manager will allocate extra space for the actor, if possible.
                x_expand: true,
                y_expand: true,
                // backgroundActor's z_position is 0. Positive values = nearer to the user.
                z_position: backgroundActor.z_position + 1,
                opacity: 0,
            });
            this._backgroundActor = backgroundActor;
            this._monitorIndex = backgroundActor.monitor;
            this._display = backgroundActor.meta_display;
            let {height, width} =
                Main.layoutManager.monitors[this._monitorIndex];
            this._monitorHeight = height;
            this._monitorWidth = width;
            this._metaBackgroundGroup = backgroundActor.get_parent();
            this._metaBackgroundGroup.add_child(this);
            this._wallpaper = null;

            this.connect('destroy', this._onDestroy.bind(this));
            this._applyWallpaper();

            this._roundedCornersEffect =
                new RoundedCornersEffect.RoundedCornersEffect();
            this.add_effect(this._roundedCornersEffect);

            this._monitorScale = this._display.get_monitor_scale(
                this._monitorIndex
            );

            this.setRoundedClipRadius(0.0);
            const rect = new Graphene.Rect();
            rect.origin.x = 0;
            rect.origin.y = 0;
            rect.size.width = this._monitorWidth;
            rect.size.height = this._monitorHeight;
            this.setRoundedClipBounds(rect);
            // TODO: Not sure if monitorScale is needed.
            // What is this? Well, OpenGL texture coordinates are [0.0, 1.0],
            // but we do bound and radius calculation with pixels, so we need a
            // way to convert coordinates into pixels.
            // NOTE: I currently don't know why, but I need monitor width and
            // height here, not actor width and height, one reason maybe that
            // our actor actually takes the whole screen and we use monitor
            // width and height in the bound rect.
            this._roundedCornersEffect.setPixelStep([
                1.0 / this._monitorWidth,
                1.0 / this._monitorHeight,
            ]);

            runningWallpaperActors.add(this);
            debug('LiveWallpaper created');
        }

        setRoundedClipRadius(radius) {
            this._roundedCornersEffect.setClipRadius(
                radius * this._monitorScale
            );
        }

        setRoundedClipBounds(rect) {
            this._roundedCornersEffect.setBounds(
                [
                    rect.origin.x,
                    rect.origin.y,
                    rect.origin.x + rect.size.width,
                    rect.origin.y + rect.size.height,
                ].map(e => {
                    return e * this._monitorScale;
                })
            );
        }

        _applyWallpaper() {
            let renderer = this._getRenderer();
            if (renderer) {
                this._wallpaper = new Clutter.Clone({
                    source: renderer,
                    // The point around which the scaling and rotation transformations occur.
                    pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
                });
            } else {
                debug(
                    'Hanabi renderer isn\'t ready yet. Retry after 100ms.'
                );
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    this._applyWallpaper();
                    return false;
                });
                return;
            }

            this.add_child(this._wallpaper);
            this._fade();
        }

        _getRenderer() {
            let windowActors = [];
            if (replaceData['old_get_window_actors'])
                windowActors = global.get_window_actors(false);
            else
                windowActors = global.get_window_actors();

            // Find renderer by `applicationId` and monitor index.
            const findRenderer = monitor => {
                return windowActors.find(
                    window =>
                        window.meta_window.title?.includes(applicationId) &&
                        window.meta_window.title?.endsWith(
                            `|${monitor}`
                        )
                );
            };

            let renderer = findRenderer(this._monitorIndex);

            return renderer ? renderer : null;
        }

        _resize() {
            if (!this._wallpaper || this._wallpaper.width === 0)
                return;

            /**
             * Only `allocation.get_height()` works fine so far. The `allocation.get_width()` gives weird result for some reasons.
             * As a workaround, we calculate the scale based on the height, then use it to calculate width.
             * It is safe to assume that the ratio of wallpaper is a constant (e.g. 16:9) in our case.
             */
            let scale = this.allocation.get_height() / this._monitorHeight;
            this._wallpaper.height = this._monitorHeight * scale;
            this._wallpaper.width = this._monitorWidth * scale;
        }

        _fade(visible = true) {
            this.ease({
                opacity: visible ? 255 : 0,
                duration: Background.FADE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._backgroundActor.ease({
                opacity: visible ? 0 : 255,
                duration: Background.FADE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        vfunc_allocate(box) {
            super.vfunc_allocate(box);

            if (this._laterId)
                return;

            const laterType = Meta.LaterType.BEFORE_REDRAW;
            const sourceFunction = () => {
                this._resize();

                this._laterId = 0;
                return GLib.SOURCE_REMOVE;
            };
            const laters = global.compositor?.get_laters();
            if (laters)
                laters.add(laterType, sourceFunction);
            else
                Meta.later_add(laterType, sourceFunction);
        }

        _onDestroy() {
            const laters = global.compositor?.get_laters();
            if (laters)
                laters.remove(this._laterId);
            else
                Meta.later_remove(this._laterId);

            this._laterId = 0;

            runningWallpaperActors.delete(this);
            debug('LiveWallpaper destroyed');
        }
    }
);

/**
 * New functions used to replace the gnome shell functions are defined below.
 */

/**
 * This creates the LiveWallpaper widget.
 */
function new_createBackgroundActor() {
    const backgroundActor =
        replaceData.old__createBackgroundActor[0].call(this);
    // We need to pass radius to actors, so save a ref in bgManager.
    this.videoActor = new LiveWallpaper(backgroundActor);
    if (getDebugMode())
        markAsEffective('new_createBackgroundActor');
    return backgroundActor;
}

/**
 * This removes the renderer from the window actor list.
 * Use `false` as the argument to bypass this behavior.
 *
 * @param hideRenderer
 */
function new_get_window_actors(hideRenderer = true) {
    let windowActors = replaceData.old_get_window_actors[0].call(this);
    let result = hideRenderer
        ? windowActors.filter(
            window => !window.meta_window.title?.includes(applicationId)
        )
        : windowActors;
    if (getDebugMode() && !compareArrays(result, windowActors))
        markAsEffective('new_get_window_actors');
    return result;
}

/**
 * These remove the renderer's window preview in overview.
 *
 * @param window
 */
function new_Workspace__isOverviewWindow(window) {
    let isRenderer = window.title?.includes(applicationId);
    if (getDebugMode() && isRenderer)
        markAsEffective('new_Workspace__isOverviewWindow');
    return isRenderer
        ? false
        : replaceData.old_Workspace__isOverviewWindow[0].apply(this, [window]);
}

/**
 *
 * @param window
 */
function new_WorkspaceThumbnail__isOverviewWindow(window) {
    let isRenderer = window.title?.includes(applicationId);
    if (getDebugMode() && isRenderer)
        markAsEffective('new_WorkspaceThumbnail__isOverviewWindow');
    return isRenderer
        ? false
        : replaceData.old_WorkspaceThumbnail__isOverviewWindow[0].apply(this, [
            window,
        ]);
}

/**
 * This remove the renderer icon from altTab and ctrlAltTab(?).
 *
 * @param type
 * @param workspace
 */
function new_get_tab_list(type, workspace) {
    let metaWindows = replaceData.old_get_tab_list[0].apply(this, [
        type,
        workspace,
    ]);
    let result = metaWindows.filter(
        metaWindow => !metaWindow.title?.includes(applicationId)
    );
    if (getDebugMode() && !compareArrays(result, metaWindows))
        markAsEffective('new_get_tab_list');
    return result;
}

/**
 * This remove the renderer icon from altTab and dash.
 */
function new_get_running() {
    let runningApps = replaceData.old_get_running[0].call(this);
    let result = runningApps.filter(
        app =>
            !app
                .get_windows()
                .some(window => window.title?.includes(applicationId))
    );
    if (getDebugMode() && !compareArrays(result, runningApps))
        markAsEffective('new_get_running');
    return result;
}

/**
 * WorkspaceBackground has its own bgManager, the rounded corner is made by
 * passing value to MetaBackgroundContent, we don't have content, but could do
 * the same to actor.
 */
function new_updateBorderRadius() {
    replaceData.old__updateBorderRadius[0].call(this);

    // Basically a copy of the original function.
    const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
    const cornerRadius =
        scaleFactor * Workspace.BACKGROUND_CORNER_RADIUS_PIXELS;

    const radius = Util.lerp(0, cornerRadius, this._stateAdjustment.value);
    this._bgManager.videoActor.setRoundedClipRadius(radius);
}

/**
 *
 */
function new_updateRoundedClipBounds() {
    replaceData.old__updateRoundedClipBounds[0].call(this);

    // Basically a copy of the original function.
    const monitor = Main.layoutManager.monitors[this._monitorIndex];

    const rect = new Graphene.Rect();
    rect.origin.x = this._workarea.x - monitor.x;
    rect.origin.y = this._workarea.y - monitor.y;
    rect.size.width = this._workarea.width;
    rect.size.height = this._workarea.height;

    this._bgManager.videoActor.setRoundedClipBounds(rect);
}
