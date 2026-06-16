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

// The renderer's application id, D-Bus bus name, and D-Bus interface name.
// The extension matches renderer windows by checking the window title against
// this value, so the renderer and extension sides must use the exact same id.
export const APPLICATION_ID = 'io.github.jeffshee.HanabiRenderer';

// The renderer's D-Bus object path, derived from APPLICATION_ID.
export const RENDERER_OBJECT_PATH = `/${APPLICATION_ID.replaceAll('.', '/')}`;
