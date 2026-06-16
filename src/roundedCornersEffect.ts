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

import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import {Logger} from './logger.js';

const logger = new Logger('roundedCorners');
// Uniform setters fire on every redraw/animation frame; wait for this quiet
// period (ms) so only the final value is logged instead of every change.
const LOG_DEBOUNCE_MS = 250;

// Adapted from the Mutter project.
// See <https://gitlab.gnome.org/GNOME/mutter/-/blob/main/src/compositor/meta-background-content.c>.
const fragmentShaderDeclarations = [
    'uniform vec4 bounds;           // x, y: top left; z, w: bottom right     \n',
    'uniform float clip_radius;                                               \n',
    'uniform vec2 pixel_step;                                                 \n',
    'uniform float border_stroke;                                             \n',
    'uniform vec4 border_color;                                               \n',
    '                                                                         \n',
    'float                                                                    \n',
    'rounded_rect_coverage (vec2 p)                                           \n',
    '{                                                                        \n',
    '  float center_left  = bounds.x + clip_radius;                           \n',
    '  float center_right = bounds.z - clip_radius;                           \n',
    '  float center_x;                                                        \n',
    '                                                                         \n',
    '  if (p.x < center_left)                                                 \n',
    '    center_x = center_left;                                              \n',
    '  else if (p.x > center_right)                                           \n',
    '    center_x = center_right;                                             \n',
    '  else                                                                   \n',
    '    return 1.0; // The vast majority of pixels exit early here           \n',
    '                                                                         \n',
    '  float center_top    = bounds.y + clip_radius;                          \n',
    '  float center_bottom = bounds.w - clip_radius;                          \n',
    '  float center_y;                                                        \n',
    '                                                                         \n',
    '  if (p.y < center_top)                                                  \n',
    '    center_y = center_top;                                               \n',
    '  else if (p.y > center_bottom)                                          \n',
    '    center_y = center_bottom;                                            \n',
    '  else                                                                   \n',
    '    return 1.0;                                                          \n',
    '                                                                         \n',
    '  vec2 delta = p - vec2 (center_x, center_y);                            \n',
    '  float dist_squared = dot (delta, delta);                               \n',
    '                                                                         \n',
    '  // Fully outside the circle                                            \n',
    '  float outer_radius = clip_radius + 0.5;                                \n',
    '  if (dist_squared >= (outer_radius * outer_radius))                     \n',
    '    return 0.0;                                                          \n',
    '                                                                         \n',
    '  // Fully inside the circle                                             \n',
    '  float inner_radius = clip_radius - 0.5;                                \n',
    '  if (dist_squared <= (inner_radius * inner_radius))                     \n',
    '    return 1.0;                                                          \n',
    '                                                                         \n',
    '  // Only pixels on the edge of the curve need expensive antialiasing    \n',
    '  return outer_radius - sqrt (dist_squared);                             \n',
    '}                                                                        \n',
].join('');

const fragmentShaderCode = [
    'vec2 texture_coord;                                                      \n',
    '                                                                         \n',
    'texture_coord = cogl_tex_coord0_in.xy / pixel_step;                      \n',
    '                                                                         \n',
    'bool inside = texture_coord.x >= bounds.x && texture_coord.x <= bounds.z \n',
    '           && texture_coord.y >= bounds.y && texture_coord.y <= bounds.w;\n',
    '                                                                         \n',
    '// border stroke for debug purposes                                      \n',
    'bool on_border = border_stroke > 0.0 && inside && (                      \n',
    '    texture_coord.x < bounds.x + border_stroke ||                        \n',
    '    texture_coord.x > bounds.z - border_stroke ||                        \n',
    '    texture_coord.y < bounds.y + border_stroke ||                        \n',
    '    texture_coord.y > bounds.w - border_stroke);                         \n',
    '                                                                         \n',
    'if (on_border)                                                           \n',
    '    cogl_color_out = border_color;                                       \n',
    'else if (clip_radius > 0.0 && !inside)                                   \n',
    '    cogl_color_out = vec4 (0.0);                                         \n',
    'else if (clip_radius > 0.0)                                              \n',
    '    cogl_color_out *= rounded_rect_coverage (texture_coord);             \n',
].join('');

export const RoundedCornersEffect = GObject.registerClass(
    class RoundedCornersEffect extends Shell.GLSLEffect {
        // Pending debounced log timers, keyed by label.
        private logTimeouts = new Map<string, number>();

        // Logs `label: ...args` only once the value stops changing for LOG_DEBOUNCE_MS.
        private debugDebounced(label: string, ...args: unknown[]): void {
            const pending = this.logTimeouts.get(label);
            if (pending)
                GLib.source_remove(pending);
            this.logTimeouts.set(
                label,
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, LOG_DEBOUNCE_MS, () => {
                    this.logTimeouts.delete(label);
                    logger.debug(`${label}:`, ...args);
                    return GLib.SOURCE_REMOVE;
                })
            );
        }

        vfunc_build_pipeline(): void {
            this.add_glsl_snippet(
                Cogl.SnippetHook.FRAGMENT,
                fragmentShaderDeclarations,
                fragmentShaderCode,
                false
            );
        }

        setBounds(bounds: number[]): void {
            this.debugDebounced('bounds', ...bounds);
            this.set_uniform_float(
                this.get_uniform_location('bounds'),
                4,
                bounds
            );
        }

        setClipRadius(clipRadius: number): void {
            this.debugDebounced('clipRadius', clipRadius);
            this.set_uniform_float(
                this.get_uniform_location('clip_radius'),
                1,
                [clipRadius]
            );
        }

        setPixelStep(pixelStep: number[]): void {
            this.debugDebounced('pixelStep', ...pixelStep);
            this.set_uniform_float(
                this.get_uniform_location('pixel_step'),
                2,
                pixelStep
            );
        }

        setBorderStroke(stroke: number): void {
            this.debugDebounced('borderStroke', stroke);
            this.set_uniform_float(
                this.get_uniform_location('border_stroke'),
                1,
                [stroke]
            );
        }

        setBorderColor(color: number[]): void {
            this.debugDebounced('borderColor', ...color);
            this.set_uniform_float(
                this.get_uniform_location('border_color'),
                4,
                color
            );
        }
    }
);

export type RoundedCornersEffect = InstanceType<typeof RoundedCornersEffect>;
