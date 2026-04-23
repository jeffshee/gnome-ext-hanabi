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
                x_align: Clutter.ActorAlign.FILL,
                y_align: Clutter.ActorAlign.FILL,
                opacity: 0,
            });
            this._backgroundActor = backgroundActor;
            this._metaBackgroundGroup = backgroundActor.get_parent();
            this._monitorIndex = backgroundActor.monitor;

            this._isDisposed = false;
            this._timeoutId = null;
            this.connect('destroy', () => {
                this._isDisposed = true;
                if (this._timeoutId) {
                    GLib.Source.remove(this._timeoutId);
                    this._timeoutId = null;
                }
                if (this._sizeChangedId) {
                    backgroundActor.disconnect(this._sizeChangedId);
                    this._sizeChangedId = null;
                }
                if (this._wallpaper) {
                    this._wallpaper.source = null;
                    this._wallpaper.destroy();
                    this._wallpaper = null;
                }
            });

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

            backgroundActor.add_child(this);
            const updateSize = () => {
                if (this._isDisposed) return;
                this.set_size(backgroundActor.width, backgroundActor.height);
                if (this._wallpaper)
                    this._wallpaper.set_size(this.width, this.height);
            };
            this._sizeChangedId = backgroundActor.connect('notify::size', updateSize);
            updateSize();

            this._wallpaper = null;
            this._applyWallpaper();

            this._roundedCornersEffect =
                new RoundedCornersEffect.RoundedCornersEffect();
            // this._backgroundActor.add_effect(this._roundedCornersEffect);

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
        }

        setPixelStep(width, height) {
            if (this._isDisposed) return;
            try {
                this._roundedCornersEffect.setPixelStep([
                    1.0 / (width * this._monitorScale),
                    1.0 / (height * this._monitorScale),
                ]);
            } catch (e) {
                // Ignore if disposed
            }
        }

        setRoundedClipRadius(radius) {
            if (this._isDisposed) return;
            try {
                this._roundedCornersEffect.setClipRadius(
                    radius * this._monitorScale
                );
            } catch (e) {
                // Ignore if disposed
            }
        }

        setRoundedClipBounds(x1, y1, x2, y2) {
            if (this._isDisposed) return;
            try {
                this._roundedCornersEffect.setBounds(
                    [x1, y1, x2, y2].map(e => e * this._monitorScale)
                );
            } catch (e) {
                // Ignore if disposed
            }
        }

        _applyWallpaper() {
            logger.debug('Applying wallpaper...');
            const operation = () => {
                if (this._isDisposed) {
                    logger.debug('LiveWallpaper disposed, stopping wallpaper operation');
                    return false;
                }

                try {
                    const renderer = this._getRenderer();
                    if (renderer) {
                        this._wallpaper = new Clutter.Clone({
                            source: renderer,
                            // The point around which the scaling and rotation transformations occur.
                            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
                            x_expand: true,
                            y_expand: true,
                            x_align: Clutter.ActorAlign.FILL,
                            y_align: Clutter.ActorAlign.FILL,
                        });
                        this._wallpaper.connect('destroy', () => {
                            this._wallpaper = null;
                        });
                        this._wallpaper.source.connect('destroy', () => {
                            if (this._wallpaper) {
                                this._wallpaper.destroy();
                            }
                            // Restart the loop if our source is destroyed
                            this._applyWallpaper();
                        });
                        this.add_child(this._wallpaper);
                        this._fade();
                        logger.debug('Wallpaper applied');
                        // Stop this specific timeout instance, but we've queued a restart on source destruction.
                        return false;
                    } else {
                        // Keep waiting.
                        return true;
                    }
                } catch (e) {
                    logger.debug(`Could not apply wallpaper (possibly disposed): ${e}`);
                    return false;
                }
            };

            // Perform intial operation without timeout
            if (operation()) {
                this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, operation);
            }
        }

        _getRenderer() {
            let windowActors = global.get_window_actors(false);

            const hanabiWindowActors = windowActors.filter(window =>
                window.meta_window.title?.includes(applicationId)
            );

            // Find renderer by `applicationId` and monitor index.
            // We use the monitor index from the backgroundActor dynamically to handle re-indexing.
            const renderer = hanabiWindowActors.find(
                window => window.meta_window.get_monitor() === this._backgroundActor.monitor
            );

            if (!renderer) {
                logger.debug(`No renderer found for monitor ${this._backgroundActor.monitor}. Found actors for monitors: ${hanabiWindowActors.map(w => w.meta_window.get_monitor())}`);
            }

            return renderer ?? null;
        }

        _fade(visible = true) {
            if (this._isDisposed) return;
            try {
                this.ease({
                    opacity: visible ? 255 : 0,
                    duration: BACKGROUND_FADE_ANIMATION_TIME,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } catch (e) {
                logger.debug(`Could not fade wallpaper (possibly disposed): ${e}`);
            }
        }
    }
);
