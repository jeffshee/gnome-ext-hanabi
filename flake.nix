{
  description = "Live Wallpaper for GNOME";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [
        "x86_64-linux"
        "aarch64-linux"
      ];
      uuid = "hanabi-extension@jeffshee.github.io";
      pname = "gnome-ext-hanabi";
      version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = self.packages.${system}.${pname};

          ${pname} = pkgs.stdenv.mkDerivation {
            inherit pname version;

            src = self;

            nativeBuildInputs = with pkgs; [
              meson
              ninja
              glib
              wrapGAppsHook4
              gobject-introspection
            ];

            buildInputs = with pkgs; [
              gst_all_1.gstreamer
              gst_all_1.gst-plugins-base
              gst_all_1.gst-plugins-good
              gst_all_1.gst-plugins-bad
              gst_all_1.gst-plugins-ugly
              gst_all_1.gst-libav
              gst_all_1.gst-vaapi
              gtk4
              gjs
              clapper
            ];

            dontUseMesonConfigure = true;
            dontWrapGApps = true;

            buildPhase = ''
              runHook preBuild
              meson setup build --prefix=$out
              ninja -C build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              ninja -C build install
              runHook postInstall
            '';

            postPatch = ''
              patchShebangs build-aux/meson-postinstall.sh
            '';

            postFixup = ''
              wrapGApp "$out/share/gnome-shell/extensions/${uuid}/renderer/renderer.js"
              ln -s "$out/share/gsettings-schemas/${pname}-${version}/glib-2.0/schemas" \
                "$out/share/gnome-shell/extensions/${uuid}/schemas"
            '';

            passthru = {
              extensionUuid = uuid;
              extensionPortalSlug = "hanabi";
            };

            meta = with pkgs.lib; {
              description = "Live Wallpaper for GNOME";
              homepage = "https://github.com/jeffshee/gnome-ext-hanabi";
              license = licenses.gpl3Only;
              platforms = platforms.linux;
              maintainers = [ ];
            };
          };
        }
      );
    };
}
