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

export {}; // makes this a module file so declare module augments rather than replaces

declare module 'resource:///org/gnome/shell/ui/workspace.js' {
    // WorkspaceBackground is a private class not exported in @girs types.
    export class WorkspaceBackground {
        _stateAdjustment: { value: number };
        _bgManager: {
            wallpaperActor?: { setRoundedClipRadius(r: number): void };
            backgroundActor?: { content?: { rounded_clip_radius: number } };
        };

        style: string | null;
        _updateBorderRadius(): void;
    }

    // _isOverviewWindow is missing from the @girs Workspace class declaration.
    interface Workspace {
        _isOverviewWindow(window: import('gi://Meta').Window): boolean;
    }
}
