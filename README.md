<p align="center"><img src="https://raw.githubusercontent.com/jeffshee/gnome-ext-hanabi/master/res/sparkler.svg" width="256"></p>

<p align="center">Live Wallpaper for GNOME</p>  
<p align="center">Hanabi 花火【はなび】(n) fireworks</p>
<p align="center">( ・ω・)o─━・*:'・:・゜'・:※</p>

# Gnome Shell Extension - Hanabi

If you like my project, please consider buying me a coffee!! (⁎˃ ꇴ ˂⁎)ｯ

[![Github-sponsors](https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=#EA4AAA)](https://github.com/sponsors/jeffshee)
[![Ko-Fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/jeffshee)
[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/jeffshee)

Also please don't forget to hit that star button! 🌟  
Feel free to open an issue for problems or suggestions 🤗  
Your support is truly appreciated!

## Join our Discord!

[![Discord](https://img.shields.io/badge/Discord-%235865F2.svg?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/mP7yg4gX7g)

## Demo 📽️

Please click on the image to view <i>(redirect to YouTube)</i>

[![](https://i3.ytimg.com/vi/BWjXl4h9_BA/maxresdefault.jpg)](https://www.youtube.com/watch?v=BWjXl4h9_BA)
[Wallpaper used in demo](https://www.youtube.com/watch?v=2pBj0RKN3Y8)

## GNOME Shell Support

| Version | ≤41 | 42  | 43  | 44  | 45  | 46  | 47  | 48  | 49  | 50  |
| :-----: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Status  | ⛔  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |

See also the section [Troubleshooting](#troubleshooting), for version-specific known issues.

## Installation

1. Clone the repo

- **For GNOME 45 and later**
    ```bash
    git clone https://github.com/jeffshee/gnome-ext-hanabi.git
    ```
- **For GNOME 44 and earlier**
    ```bash
    git clone https://github.com/jeffshee/gnome-ext-hanabi.git -b legacy
    ```

2. Run the installation script (Require `meson`)

    ```bash
    cd gnome-ext-hanabi
    make install
    ```

3. Restart GNOME Shell
4. Enable the Hanabi extension
5. Choose your video wallpaper in the extension preference window

### Distro-specific Guides

See [docs/distro/](docs/distro/) for distro-specific installation guides.

### Troubleshooting

1. The video doesn't play / The extension is enabled but nothing happens  
   The GTK4 media backend is not pre-installed on some distributions (such as PopOS).

    To install the backend:  
     `sudo apt install libgtk-4-media-gstreamer`

2. High CPU usage during video playback (proprietary NVIDIA)  
   Your hardware acceleration may not work properly, see this [issue](https://gitlab.freedesktop.org/gstreamer/gst-plugins-bad/-/issues/1478).

    To delete the GStreamer cache:  
     `rm -rf ~/.cache/gstreamer-1.0/`  
     After that, check if `gst-inspect-1.0 nvcodec` reports all its features.

3. The GNOME Shell keeps crashing after enabling Hanabi, help!  
   You can try to disable the extension from tty ( <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>F3</kbd> ):
    ```
    gnome-extensions disable hanabi-extension@jeffshee.github.io
    ```

### Optimization

Hanabi uses `gtk4paintablesink` (from GStreamer) as the default video sink, which offers good performance and broad compatibility.

Optionally, `clappersink` from [Clapper](https://github.com/Rafostar/clapper) can be used instead via **Preferences → Developer → Prefer clappersink**. Clapper must be installed **from the package manager and not from Flatpak/Snap** for this to work.

> **Note:** There is a known compatibility issue with `clappersink` on native installs with GStreamer 1.26+ ([Rafostar/clapper#560](https://github.com/Rafostar/clapper/issues/560)). If you encounter crashes after enabling this option, please disable it.

## Advanced Customization

For more advanced customization, learn how to write scripts for Hanabi extension!  
Check out the [scripting guide](docs/scripting.md) for detailed instructions and examples.

## Get Involved 🚀

Contributors are welcome! Let's make Hanabi extension better together~

### Development

See [docs/dev.md](docs/dev.md) for development instructions.

### Translation

If you're interested in translating, you can help on [Hosted Weblate](https://hosted.weblate.org/projects/gnome-ext-hanabi/gnome-ext-hanabi/).

[![Translation status](https://hosted.weblate.org/widget/gnome-ext-hanabi/gnome-ext-hanabi/multi-auto.svg)](https://hosted.weblate.org/engage/gnome-ext-hanabi/)

### Contributors ✨

<a href="https://github.com/jeffshee/gnome-ext-hanabi/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jeffshee/gnome-ext-hanabi" />
</a>

Made with [contributors-img](https://contrib.rocks).  
Icons made by [Freepik](http://www.freepik.com/) from [Flaticon](https://www.flaticon.com)
