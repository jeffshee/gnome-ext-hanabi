UUID    := hanabi-extension@jeffshee.github.io
POT_DIR := src/po
POT_FILE := $(POT_DIR)/$(UUID).pot

.PHONY: install enable disable prefs reset uninstall renderer log lint pot merge-po help

help:
	@echo "Targets:"
	@echo "  install    Install the extension"
	@echo "  enable     Enable the extension"
	@echo "  disable    Disable the extension"
	@echo "  prefs      Open the extension preferences"
	@echo "  reset      Reset the extension settings"
	@echo "  uninstall  Uninstall the extension"
	@echo "  renderer   Run the renderer (pass args via ARGS=...)"
	@echo "  log        Follow the GNOME Shell log"
	@echo "  lint       Run ESLint"
	@echo "  pot        Generate the translation template (.pot)"
	@echo "  merge-po   Merge updated .pot into all .po files"

install:
	rm -rf .build
	meson setup .build --prefix=$(HOME)/.local/ && ninja -C .build install

enable:
	gnome-extensions enable "$(UUID)"

disable:
	gnome-extensions disable "$(UUID)"

prefs:
	gnome-extensions prefs "$(UUID)"

reset:
	gnome-extensions reset "$(UUID)"

uninstall:
	gnome-extensions uninstall "$(UUID)"

renderer:
	./src/renderer/renderer.js $(ARGS)

log:
	journalctl -f -o cat /usr/bin/gnome-shell

lint:
	npm run lint

pot:
	find src/ -iname "*.js" -print0 | xargs -0 xgettext \
		--from-code=UTF-8 \
		--package-name="gnome-ext-hanabi" \
		--package-version="1" \
		--copyright-holder="2023 Jeff Shee (jeffshee8969@gmail.com)" \
		--output="$(POT_FILE)"
	sed -i \
		-e "s/SOME DESCRIPTIVE TITLE\./Gnome Shell Extension - Hanabi/" \
		-e "s/Copyright (C) YEAR /Copyright (C) /" \
		-e "s/charset=CHARSET/charset=UTF-8/" \
		"$(POT_FILE)"

merge-po: pot
	@while read -r lang; do \
		[ -z "$$lang" ] && continue; \
		echo "Merging $$lang.po..."; \
		msgmerge --update --backup=none "$(POT_DIR)/$$lang.po" "$(POT_FILE)"; \
	done < "$(POT_DIR)/LINGUAS"
