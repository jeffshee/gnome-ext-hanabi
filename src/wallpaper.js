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
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Graphene from 'gi://Graphene';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as Logger from './logger.js';
import * as RoundedCornersEffect from './roundedCornersEffect.js';
import System from 'system';

const applicationId = 'io.github.jeffshee.HanabiRenderer';
const logger = new Logger.Logger();
// Ref: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/layout.js
const BACKGROUND_FADE_ANIMATION_TIME = 1000;


/**
 * The widget that holds the window preview of the renderer.
 */
export const LiveWallpaper = GObject.registerClass(
    class LiveWallpaper extends St.Widget {
        constructor(backgroundActor, settings = null) {
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
            this._settings = settings;

            this._isDisposed = false;
            this._timeoutId = null;
            this._settingsChangedIds = [];
            this.connect('destroy', () => {
                this._isDisposed = true;
                if (this._timeoutId) {
                    GLib.Source.remove(this._timeoutId);
                    this._timeoutId = null;
                }
                for (const id of this._settingsChangedIds)
                    this._settings?.disconnect(id);
                this._settingsChangedIds = [];
                if (this._wallpaper) {
                    if (this._sourceDestroyId) {
                        this._wallpaper.source?.disconnect(
                            this._sourceDestroyId
                        );
                        this._sourceDestroyId = null;
                    }
                    this._wallpaper.source = null;
                    this._wallpaper.destroy();
                    this._wallpaper = null;
                }
                System.gc();
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
            const {width, height} =
                Main.layoutManager.monitors[this._monitorIndex];
            this._monitorWidth = width;
            this._monitorHeight = height;

            backgroundActor.layout_manager = new Clutter.BinLayout();
            backgroundActor.add_child(this);

            this._wallpaper = null;
            this._applyWallpaper();

            this._roundedCornersEffect =
                new RoundedCornersEffect.RoundedCornersEffect();
            this._backgroundActor.add_effect(this._roundedCornersEffect);

            this.setPixelStep(this._monitorWidth, this._monitorHeight);
            this.setRoundedClipRadius(0.0);
            this.setBorderStroke(0);
            this.setBorderColor([1.0, 0.0, 0.0, 1.0]);

            if (this._settings) {
                this._settingsChangedIds.push(
                    this._settings.connect('changed::border-stroke', () => {
                        this.setBorderStroke(this._settings.get_int('border-stroke'));
                        this._backgroundActor?.queue_redraw();
                    })
                );
                for (const key of ['bounds-inset-x1', 'bounds-inset-y1', 'bounds-inset-x2', 'bounds-inset-y2']) {
                    this._settingsChangedIds.push(
                        this._settings.connect(`changed::${key}`, () => {
                            this._applyBounds();
                            this._backgroundActor?.queue_redraw();
                        })
                    );
                }
            }
            this.setRoundedClipBounds(
                0,
                0,
                this._monitorWidth,
                this._monitorHeight
            );

            this.connect('notify::allocation', () => {
                if (!this._wallpaper)
                    return;
                try {
                    this._applyBounds();
                    const s = this._settings;
                    const stroke = s ? s.get_int('border-stroke') : 0;
                    this._roundedCornersEffect.setBorderStroke(stroke * this._monitorScale);
                } catch (e) {
                    logError(e, 'LiveWallpaper notify::allocation');
                }
            });
        }

        _applyBounds() {
            const workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitorIndex);
            const monitor = Main.layoutManager.monitors[this._monitorIndex];
            const panelOffset = (workArea.y - monitor.y) / monitor.height * this._backgroundActor.height;
            const s = this._settings;
            const ix1 = s ? s.get_int('bounds-inset-x1') : 0;
            const iy1 = s ? s.get_int('bounds-inset-y1') : 0;
            const ix2 = s ? s.get_int('bounds-inset-x2') : 0;
            const iy2 = s ? s.get_int('bounds-inset-y2') : 0;
            this._roundedCornersEffect.setBounds(
                [ix1, panelOffset + iy1, this.width - ix2, this.height - iy2]
                    .map(e => e * this._monitorScale)
            );
        }

        setPixelStep(width, height) {
            if (this._isDisposed)
                return;
            this._roundedCornersEffect.setPixelStep([
                1.0 / (width * this._monitorScale),
                1.0 / (height * this._monitorScale),
            ]);
        }

        setRoundedClipRadius(radius) {
            if (this._isDisposed)
                return;
            this._roundedCornersEffect.setClipRadius(
                radius * this._monitorScale
            );
        }

        setRoundedClipBounds(x1, y1, x2, y2) {
            if (this._isDisposed)
                return;
            this._roundedCornersEffect.setBounds(
                [x1, y1, x2, y2].map(e => e * this._monitorScale)
            );
        }

        setBorderStroke(stroke) {
            if (this._isDisposed)
                return;
            this._roundedCornersEffect.setBorderStroke(stroke);
        }

        setBorderColor(color) {
            if (this._isDisposed)
                return;
            this._roundedCornersEffect.setBorderColor(color);
        }

        _applyWallpaper() {
            if (this._isDisposed)
                return;
            logger.debug('Applying wallpaper...');
            const operation = () => {
                if (this._isDisposed) {
                    logger.debug(
                        'LiveWallpaper disposed, stopping wallpaper operation'
                    );
                    return false;
                }

                const renderer = this._getRenderer();
                if (renderer) {
                    this._wallpaper = new Clutter.Clone({
                        source: renderer,
                        // The point around which the scaling and rotation transformations occur.
                        pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
                    });
                    this._wallpaper.connect('destroy', () => {
                        this._wallpaper = null;
                    });
                    this._sourceDestroyId = this._wallpaper.source.connect(
                        'destroy',
                        () => {
                            if (this._wallpaper)
                                this._wallpaper.destroy();
                            if (!this._isDisposed)
                                this._applyWallpaper();
                        }
                    );
                    this.add_child(this._wallpaper);
                    this._fade();
                    logger.debug('Wallpaper applied');
                    // Stop this specific timeout instance, but we've queued a restart on source destruction.
                    return false;
                } else {
                    // Keep waiting.
                    return true;
                }
            };

            // Perform intial operation without timeout
            if (operation()) {
                this._timeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    1000,
                    operation
                );
            }
        }

        _getRenderer() {
            const windowActors = global.get_window_actors(false);

            const hanabiWindowActors = windowActors.filter(window =>
                window.meta_window.title?.includes(applicationId)
            );

            // Reject if number of hanabi windows is less than the number of monitors
            const numMonitors = global.display.get_n_monitors();
            if (hanabiWindowActors.length < numMonitors) {
                logger.debug(
                    `Hanabi windows (${hanabiWindowActors.length}) < monitors (${numMonitors}), rejecting`
                );
                return null;
            }

            // Reject if monitor indices are not unique (duplicate monitor assignments)
            const monitorIndices = hanabiWindowActors.map(w =>
                w.meta_window.get_monitor()
            );
            const uniqueMonitorIndices = new Set(monitorIndices);
            if (uniqueMonitorIndices.size !== monitorIndices.length) {
                logger.debug('Non-unique monitor indices detected, rejecting');
                return null;
            }

            // Find renderer by `applicationId` and monitor index.
            // We use the monitor index from the backgroundActor dynamically to handle re-indexing.
            const renderer = hanabiWindowActors.find(
                window =>
                    window.meta_window.get_monitor() ===
                    this._backgroundActor.monitor
            );

            if (!renderer) {
                logger.debug(
                    `No renderer found for monitor ${this._backgroundActor.monitor}. Found actors for monitors: ${hanabiWindowActors.map(w => w.meta_window.get_monitor())}`
                );
            }

            return renderer ?? null;
        }

        _fade(visible = true) {
            if (this._isDisposed)
                return;
            this.ease({
                opacity: visible ? 255 : 0,
                duration: BACKGROUND_FADE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }
);
