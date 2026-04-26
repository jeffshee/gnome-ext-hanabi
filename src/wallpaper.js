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

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Graphene from 'gi://Graphene';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as Logger from './logger.js';
import * as RoundedCornersEffect from './roundedCornersEffect.js';

const applicationId = 'io.github.jeffshee.HanabiRenderer';
const logger = new Logger.Logger();
// Ref: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/layout.js
const BACKGROUND_FADE_ANIMATION_TIME = 1000;

// const CUSTOM_BACKGROUND_BOUNDS_PADDING = 2;

/**
 * The widget that holds the window preview of the renderer.
 */
export const LiveWallpaper = GObject.registerClass(
    class LiveWallpaper extends St.Widget {
        constructor(backgroundActor) {
            super({
                layout_manager: new Clutter.BinLayout(),
                width: backgroundActor.width,
                height: backgroundActor.height,
                // Layout manager will allocate extra space for the actor, if possible.
                x_expand: true,
                y_expand: true,
                opacity: 0,
            });
            this._backgroundActor = backgroundActor;
            this._metaBackgroundGroup = backgroundActor.get_parent();
            this._monitorIndex = backgroundActor.monitor;

            /**
             * _monitorScale is fractional scale factor
             * _monitorWidth and _monitorHeight are scaled resolution
             * e.g. if the physical reolution = (2240, 1400) and fractional scale factor = 1.25,
             * then the scaled resolution would be (2240/1.25, 1400/1.25) = (1792, 1120).
             */
            this._display = backgroundActor.meta_display;
            this._monitorScale = this._display.get_monitor_scale(
                this._monitorIndex
            );
            let {width, height} =
                Main.layoutManager.monitors[this._monitorIndex];
            this._monitorWidth = width;
            this._monitorHeight = height;

            backgroundActor.layout_manager = new Clutter.BinLayout();
            backgroundActor.add_child(this);

            this._wallpaper = null;
            this._applyWallpaperTimeoutId = 0;
            this._isDestroyed = false;
            this._applyWallpaper();

            try {
                this._roundedCornersEffect =
                    new RoundedCornersEffect.RoundedCornersEffect();
                // this._backgroundActor.add_effect(this._roundedCornersEffect);
            } catch (e) {
                logger.warn(`Failed to create rounded corners effect: ${e}`);
                this._roundedCornersEffect = null;
            }

            this.setPixelStep(this._monitorWidth, this._monitorHeight);
            this.setRoundedClipRadius(0.0);
            this.setRoundedClipBounds(0, 0, this._monitorWidth, this._monitorHeight);

            // FIXME: Bounds calculation is wrong if the layout isn't vanilla (with custom dock, panel, etc.), disabled for now.
            // this.connect('notify::allocation', () => {
            //     let heightOffset = this.height - this._metaBackgroundGroup.get_parent().height;
            //     this._roundedCornersEffect.setBounds(
            //         [
            //             CUSTOM_BACKGROUND_BOUNDS_PADDING,
            //             CUSTOM_BACKGROUND_BOUNDS_PADDING + heightOffset,
            //             this.width,
            //             this.height,
            //         ].map(e => e * this._monitorScale)
            //     );
            // });

            this._rendererActor = null;
            this._rendererDestroyId = null;

            this.connect('destroy', () => {
                this._isDestroyed = true;
                if (this._applyWallpaperTimeoutId) {
                    GLib.source_remove(this._applyWallpaperTimeoutId);
                    this._applyWallpaperTimeoutId = 0;
                }
                if (this._rendererActor && this._rendererDestroyId) {
                    this._rendererActor.disconnect(this._rendererDestroyId);
                    this._rendererActor = null;
                    this._rendererDestroyId = null;
                }
            });
        }

        setPixelStep(width, height) {
            this._roundedCornersEffect?.setPixelStep([
                1.0 / (width * this._monitorScale),
                1.0 / (height * this._monitorScale),
            ]);
        }

        setRoundedClipRadius(radius) {
            this._roundedCornersEffect?.setClipRadius(
                radius * this._monitorScale
            );
        }

        setRoundedClipBounds(x1, y1, x2, y2) {
            this._roundedCornersEffect?.setBounds(
                [x1, y1, x2, y2].map(e => e * this._monitorScale)
            );
        }

        _applyWallpaper() {
            logger.debug('Applying wallpaper...');

            // Cancel any existing poll
            if (this._applyWallpaperTimeoutId) {
                GLib.source_remove(this._applyWallpaperTimeoutId);
                this._applyWallpaperTimeoutId = 0;
            }

            // Disconnect any previous renderer destroy watch
            if (this._rendererActor && this._rendererDestroyId) {
                this._rendererActor.disconnect(this._rendererDestroyId);
                this._rendererActor = null;
                this._rendererDestroyId = null;
            }

            const operation = () => {
                if (this._isDestroyed) {
                    this._applyWallpaperTimeoutId = 0;
                    return false;
                }
                const renderer = this._getRenderer();
                if (renderer) {
                    if (this._isDestroyed)
                        return false;
                    this._wallpaper = new Clutter.Clone({
                        source: renderer,
                        // The point around which the scaling and rotation transformations occur.
                        pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
                    });
                    this._wallpaper.connect('destroy', () => {
                        this._wallpaper = null;
                    });
                    this.add_child(this._wallpaper);
                    this._fade();
                    logger.debug('Wallpaper applied');

                    // Watch for renderer destruction (process kill, sleep/wake)
                    // to automatically re-poll for the new renderer.
                    this._rendererActor = renderer;
                    this._rendererDestroyId = renderer.connect('destroy', () => {
                        this._rendererActor = null;
                        this._rendererDestroyId = null;
                        if (!this._isDestroyed) {
                            logger.debug('Renderer destroyed, re-polling for new renderer...');
                            this._fade(false);
                            if (this._wallpaper) {
                                this._wallpaper.destroy();
                                this._wallpaper = null;
                            }
                            this._applyWallpaper();
                        }
                    });

                    this._applyWallpaperTimeoutId = 0;
                    // Stop the timeout.
                    return false;
                } else {
                    // Keep waiting.
                    return true;
                }
            };

            // Perform initial operation without timeout
            if (operation()) {
                this._applyWallpaperTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    1000,
                    operation
                );
            }
        }

        _getRenderer() {
            let windowActors;
            try {
                windowActors = global.get_window_actors(false);
            } catch (e) {
                logger.warn(`Failed to query window actors: ${e}`);
                return null;
            }

            const hanabiWindowActors = windowActors.filter(window =>
                window.meta_window.title?.includes(applicationId)
            );
            logger.debug(`Found ${hanabiWindowActors.length} Hanabi window actors`);
            logger.debug(`Hanabi window actors monitor: ${hanabiWindowActors.map(w => w.meta_window.get_monitor())}, target monitor: ${this._monitorIndex}`);

            // Reject if number of hanabi windows is less than the number of monitors
            const numMonitors = global.display.get_n_monitors();
            if (hanabiWindowActors.length < numMonitors) {
                logger.debug(`Hanabi windows (${hanabiWindowActors.length}) < monitors (${numMonitors}), rejecting`);
                return null;
            }

            // Reject if monitor indices are not unique (duplicate monitor assignments)
            const monitorIndices = hanabiWindowActors.map(w => w.meta_window.get_monitor());
            const uniqueMonitorIndices = new Set(monitorIndices);
            if (uniqueMonitorIndices.size !== monitorIndices.length) {
                logger.debug('Non-unique monitor indices detected, rejecting');
                return null;
            }

            // Find renderer by `applicationId` and monitor index.
            const renderer = hanabiWindowActors.find(
                window => window.meta_window.get_monitor() === this._monitorIndex
            );

            return renderer ?? null;
        }

        _fade(visible = true) {
            this.ease({
                opacity: visible ? 255 : 0,
                duration: BACKGROUND_FADE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }
);
