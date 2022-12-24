#!/bin/bash

env MUTTER_DEBUG_DUMMY_MODE_SPECS=1360x765 dbus-run-session -- gnome-shell --nested --wayland
