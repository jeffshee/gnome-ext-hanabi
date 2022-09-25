<p align="center"><img src="https://raw.githubusercontent.com/jeffshee/gnome-ext-hanabi/master/res/sparkler.png" width="256"></p>

<p align="center">Live Wallpaper for GNOME</p>  
<p align="center">Hanabi 花火【はなび】(n) fireworks</p>
<p align="center">( ・ω・)o─━・*:'・:・゜'・:※</p>

# Gnome Shell Extension - Hanabi
If you like my project, please consider buying me a coffee!! (⁎˃ ꇴ ˂⁎)ｯ

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/jeffshee)

Also please don't forget to click that star button! 🌟  
Your support is truly appreciated!

Work in Progress 🌱

## Demo 📽️
Please click on the image to view <i>(redirect to YouTube)</i>

[![](https://i3.ytimg.com/vi/BWjXl4h9_BA/maxresdefault.jpg)](https://www.youtube.com/watch?v=BWjXl4h9_BA)
[Wallpaper used in demo](https://www.youtube.com/watch?v=2pBj0RKN3Y8)

## Experimenting 🧪
Note that the Hanabi extension is not even close to alpha quality.  
Nevertheless, the procedure is here for anyone who wants to experiment with Hanabi extension.

1. Clone the repo
```
git clone https://github.com/jeffshee/gnome-ext-hanabi.git
```
2. Copy your video wallpaper to the `gnome-ext-hanabi/src/` directory, name it as `video.mp4`
3. Run the installation script (Require `meson` and `ninja-build`)
```
cd gnome-ext-hanabi/src
./install.sh
```
4. Restart GNOME Shell
5. Enable the Hanabi extension

If the GNOME shell keep crashing, you can try to disable the extension using tty (Ctrl+Alt+F3):
```
gnome-extensions disable hanabi-extension@jeffshee.github.io
```

### Known issues
1. Video doesn't play / Extension enabled but nothing happen  
The GTK4 media backend is not pre-installed on some distributions (such as PopOS).
The solution is to install the backend:  
`sudo apt install libgtk-4-media-gstreamer`

### Optimization
Hanabi extension can ultilize `clappersink` from [Clapper](https://github.com/Rafostar/clapper) for the best performance, if installed.

For this to work, Clapper must be installed **from the package manager and not from Flatpak**.

<details>
  <summary>Perfromance comparison</summary>

- With `clappersink`
![](https://user-images.githubusercontent.com/25530920/190872365-f1cefa30-6e11-40e4-bf99-1b79c3790d6b.png)

- Without `clappersink` (Use `Gtk.MediaFile` as fallback)
![](https://user-images.githubusercontent.com/25530920/190872366-7fce5703-2310-4c68-81c7-f17a8a15019f.png)

</details>

## Please!! 🙏

Collaboration is welcome! Let's make it better together~  
Feel free to open an issue if you have any problem or suggestion 🤗  

## Contributors ✨

<a href="https://github.com/jeffshee/gnome-ext-hanabi/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jeffshee/gnome-ext-hanabi" />
</a>

Made with [contributors-img](https://contrib.rocks).  
Icons made by [Freepik](http://www.freepik.com/) from [Flaticon](https://www.flaticon.com)
