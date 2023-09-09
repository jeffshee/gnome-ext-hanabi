<p align="center"><img src="https://raw.githubusercontent.com/jeffshee/gnome-ext-hanabi/master/res/sparkler.svg" width="256"></p>

<p align="center">Live Wallpaper for GNOME</p>  
<p align="center">Hanabi 花火【はなび】(n) fireworks</p>
<p align="center">( ・ω・)o─━・*:'・:・゜'・:※</p>

# Gnome Shell Extension - Hanabi

If you like my project, please consider buying me a coffee!! (⁎˃ ꇴ ˂⁎)ｯ

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/jeffshee)

Also please don't forget to hit that star button! 🌟  
Feel free to open an issue for problems or suggestions 🤗  
Your support is truly appreciated!

## Join our Discord!

[![](https://dcbadge.vercel.app/api/server/mP7yg4gX7g?compact=true)](https://discord.gg/mP7yg4gX7g)

## Demo 📽️

Please click on the image to view <i>(redirect to YouTube)</i>

[![](https://i3.ytimg.com/vi/BWjXl4h9_BA/maxresdefault.jpg)](https://www.youtube.com/watch?v=BWjXl4h9_BA)
[Wallpaper used in demo](https://www.youtube.com/watch?v=2pBj0RKN3Y8)

## GNOME Shell Support

| Version | Status |
| :-----: | :----: |
|   ≤41   |   ⛔   |
|   42    |   ✅   |
|   43    |   ✅   |
|   44    |   ✅   |

See also the section [Troubleshooting](#troubleshooting), for version-specific known issues.

## Installation

1. Clone the repo

```
git clone https://github.com/jeffshee/gnome-ext-hanabi.git
```

2. Run the installation script (Require `meson`)

```
cd gnome-ext-hanabi
./run.sh install
```

3. Restart GNOME Shell
4. Enable the Hanabi extension
5. Choose your video wallpaper in the extension preference window

### Distro-specific guide

- [Guide for Pop!\_OS 22.04](docs/popos-22-04.md)
- [Guide for Ubuntu 23.04](docs/ubuntu-23-04.md)

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

Hanabi extension can utilize `clappersink` from [Clapper](https://github.com/Rafostar/clapper) for the best performance if installed.

For this to work, Clapper must be installed **from the package manager and not from Flatpak/Snap**.

<details>
  <summary>Performance comparison</summary>

- With `clappersink`
  ![](https://user-images.githubusercontent.com/25530920/190872365-f1cefa30-6e11-40e4-bf99-1b79c3790d6b.png)

- Without `clappersink` (Using `Gtk.MediaFile` as default fallback)
  ![](https://user-images.githubusercontent.com/25530920/190872366-7fce5703-2310-4c68-81c7-f17a8a15019f.png)

</details>

## Get involved 🚀

Contributors are welcome! Let's make Hanabi extension better together~  
If you're interested in translating, you can help on [Hosted Weblate](https://hosted.weblate.org/projects/gnome-ext-hanabi/gnome-ext-hanabi/).

### Translation status

[![Translation status](https://hosted.weblate.org/widget/gnome-ext-hanabi/gnome-ext-hanabi/svg-badge.svg)](https://hosted.weblate.org/engage/gnome-ext-hanabi/)

[![Translation status](https://hosted.weblate.org/widget/gnome-ext-hanabi/gnome-ext-hanabi/multi-auto.svg)](https://hosted.weblate.org/engage/gnome-ext-hanabi/)

### Contributors ✨

<a href="https://github.com/jeffshee/gnome-ext-hanabi/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jeffshee/gnome-ext-hanabi" />
</a>

Made with [contributors-img](https://contrib.rocks).  
Icons made by [Freepik](http://www.freepik.com/) from [Flaticon](https://www.flaticon.com)
