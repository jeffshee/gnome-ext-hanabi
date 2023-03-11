#!/bin/bash

UUID="hanabi-extension@jeffshee.github.io"

if [ "$1" == "install" ]; then
    rm -rf ~/.local/share/gnome-shell/extensions/"$UUID"/*
    rm -rf .build
    mkdir .build
    meson --prefix=$HOME/.local/ .build
    ninja -C .build install
    rm -rf .build
elif [ "$1" == "enable" ]; then
    gnome-extensions enable "$UUID"
elif [ "$1" == "disable" ]; then
    gnome-extensions disable "$UUID"
elif [ "$1" == "prefs" ]; then
    gnome-extensions prefs "$UUID"
elif [ "$1" == "reset" ]; then
    gnome-extensions reset "$UUID"
elif [ "$1" == "uninstall" ]; then
    gnome-extensions uninstall "$UUID"
elif [ "$1" == "renderer" ]; then
    shift
    ./renderer.js "$@"
elif [ "$1" == "log" ]; then
    journalctl -f -o cat /usr/bin/gnome-shell
elif [ "$1" == "help" ]; then
    echo "Valid actions are:"
    echo "  - install: Installs the extension."
    echo "  - enable: Enables the extension."
    echo "  - disable: Disables the extension."
    echo "  - prefs: Opens the extension preferences."
    echo "  - reset: Resets the extension settings."
    echo "  - uninstall: Uninstalls the extension."
    echo "  - renderer: Runs the renderer with the given arguments."
    echo "  - log: Displays the GNOME Shell log."
    echo "Usage: $0 [action]"
    echo "Run '$0 help' to see this message."
    exit 0
else
    echo "Invalid action. Run '$0 help' to see valid actions."
    exit 1
fi
