<p align="center"><img src="res/sparkler.svg" width="256"></p>

<p align="center">Live Wallpaper for GNOME</p>  
<p align="center">Hanabi 花火【はなび】(n) fireworks</p>
<p align="center">( ・ω・)o─━・*:'・:・゜'・:※</p>

# GNOME Shell Extension - Hanabi

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

Please click on the image to view _(redirect to YouTube)_

[![](https://i3.ytimg.com/vi/BWjXl4h9_BA/maxresdefault.jpg)](https://www.youtube.com/watch?v=BWjXl4h9_BA)
[Wallpaper used in demo](https://www.youtube.com/watch?v=2pBj0RKN3Y8)

## Hanabi is migrating to TypeScript!

> [!IMPORTANT]
> Moving to TypeScript for better type safety and maintainability~ ✨
>
> Active development now happens on the `typescript` branch
> — **GNOME 50+, Wayland only** — merging into the main branch on **July 15, 2026**.
>
> Until then, the main branch stays on JavaScript so existing community packages
> and their CI builds keep working through the transition.
> The `javascript` branch enters **maintenance mode** — bugs still get fixed,
> but no new fireworks there. (・ω・)ノ

## GNOME Shell Support

| Version |  42–44   |    45–50     |     50+      |
| :-----: | :------: | :----------: | :----------: |
| Status  |    ⚠️    |      ✅      |      ✅      |
| Branch  | `legacy` | `javascript` | `typescript` |

> [!TIP]
> On GNOME 50? You're encouraged to give the TypeScript version a try!

## Installation

1. Clone the branch for your GNOME Shell version

- **GNOME 50 and later** (TypeScript, Wayland only) 🔥

    ```bash
    git clone https://github.com/jeffshee/gnome-ext-hanabi.git -b typescript
    ```

- **GNOME 45–50** (JavaScript, X11 and Wayland)

    ```bash
    git clone https://github.com/jeffshee/gnome-ext-hanabi.git -b javascript
    ```

2. Run the installation script

    ```bash
    cd gnome-ext-hanabi
    make install
    ```

    **Build dependencies**
    - `typescript` branch: `meson`, `node`, and `npm`
    - `javascript` branch: `meson`

3. Restart GNOME Shell

4. Enable the Hanabi extension

5. Choose your video wallpaper in the extension preference window

### Distro-specific Guides

See the [distro-specific guides](docs/distro/) for installation instructions.

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

3. Blur My Shell — wallpaper becomes semi-transparent  
   If you use the [Blur My Shell](https://github.com/aunetx/blur-my-shell) extension with **Applications → Applications blur → Enable all by default** turned on, add an exception for the Hanabi renderer.

    In Blur My Shell settings, go to **Applications → Applications blur → Blacklist** and add:  
     `io.github.jeffshee.HanabiRenderer`

## Advanced Usage

<details>
<summary>Video backend selection &amp; scripting</summary>

Hanabi uses `gtk4paintablesink` (from GStreamer) as the default video sink, which offers good performance and broad compatibility.

Optionally, `clappersink` from [Clapper](https://github.com/Rafostar/clapper) can be used instead via **Preferences → Developer → Prefer clappersink**. Clapper must be installed **from the package manager and not from Flatpak/Snap** for this to work.

> There is a known [compatibility issue](https://github.com/Rafostar/clapper/issues/560) with `clappersink` on native installs with GStreamer 1.26+. If you encounter crashes after enabling this option, please disable it.

For more advanced customization, learn how to write scripts for Hanabi extension!  
Check out the [scripting guide](docs/scripting.md) for detailed instructions and examples.

</details>

## Get Involved 🚀

Contributors are welcome! Let's make Hanabi extension better together~

### Development

See the [development guide](docs/dev.md) for instructions.

### Translation

If you're interested in translating, you can help on [Hosted Weblate](https://hosted.weblate.org/projects/gnome-ext-hanabi/gnome-ext-hanabi/).

[![Translation status](https://hosted.weblate.org/widget/gnome-ext-hanabi/gnome-ext-hanabi/multi-auto.svg)](https://hosted.weblate.org/engage/gnome-ext-hanabi/)

### Contributors ✨

<a href="https://github.com/jeffshee/gnome-ext-hanabi/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jeffshee/gnome-ext-hanabi" />
</a>

Made with [contributors-img](https://contrib.rocks).  
Icons made by [Freepik](http://www.freepik.com/) from [Flaticon](https://www.flaticon.com)
