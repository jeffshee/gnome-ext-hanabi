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


/* exported GnomeShellOverride */

const {Clutter, GLib, GObject, Meta, St, Shell, Graphene} = imports.gi;

const Background = imports.ui.background;
const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;

const ExtensionUtils = imports.misc.extensionUtils;
const Util = imports.misc.util;

const Me = ExtensionUtils.getCurrentExtension();
const Wallpaper = Me.imports.wallpaper;

const applicationId = 'io.github.jeffshee.HanabiRenderer';
const extSettings = ExtensionUtils.getSettings(
    'io.github.jeffshee.hanabi-extension'
);

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
 * New functions used to replace the gnome shell functions are defined below.
 */

/**
 * This creates the LiveWallpaper widget.
 */
function new_createBackgroundActor() {
    const backgroundActor =
        replaceData.old__createBackgroundActor[0].call(this);
    // We need to pass radius to actors, so save a ref in bgManager.
    this.videoActor = new Wallpaper.LiveWallpaper(backgroundActor);
    runningWallpaperActors.add(this.videoActor);
    this.videoActor.connect('destroy', actor => {
        runningWallpaperActors.delete(actor);
    });
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
    return result;
}

/**
 * These remove the renderer's window preview in overview.
 *
 * @param window
 */
function new_Workspace__isOverviewWindow(window) {
    let isRenderer = window.title?.includes(applicationId);
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
    return result;
}

/**
 * WorkspaceBackground has its own bgManager, the rounded corner is made by
 * passing value to MetaBackgroundContent, we don't have content, but could do
 * the same to actor.
 */
function new_updateBorderRadius() {
    replaceData.old__updateBorderRadius[0].call(this);

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

    const monitor = Main.layoutManager.monitors[this._monitorIndex];

    const rect = new Graphene.Rect();
    rect.origin.x = this._workarea.x - monitor.x;
    rect.origin.y = this._workarea.y - monitor.y;
    rect.size.width = this._workarea.width;
    rect.size.height = this._workarea.height;

    this._bgManager.videoActor.setRoundedClipBounds(rect);
}
