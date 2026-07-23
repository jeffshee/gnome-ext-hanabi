UUID    := hanabi-extension@jeffshee.github.io
POT_DIR := src/po
POT_FILE := $(POT_DIR)/$(UUID).pot

.PHONY: build typecheck install clean enable disable prefs reset uninstall renderer log lint lint-fix pot merge-po help

help:
	@echo "Targets:"
	@echo "  build      Build the TypeScript sources"
	@echo "  typecheck  Type-check without emitting"
	@echo "  install    Build and install the extension"
	@echo "  clean      Remove build artifacts (.build, src/_build)"
	@echo "  enable     Enable the extension"
	@echo "  disable    Disable the extension"
	@echo "  prefs      Open the extension preferences"
	@echo "  reset      Reset the extension settings"
	@echo "  uninstall  Uninstall the extension"
	@echo "  renderer   Run the renderer (pass args via ARGS=...)"
	@echo "  log        Follow the GNOME Shell log"
	@echo "  lint       Run ESLint"
	@echo "  lint-fix   Run ESLint with --fix"
	@echo "  pot        Generate the translation template (.pot)"
	@echo "  merge-po   Merge updated .pot into all .po files"

node_modules: package-lock.json
	npm install
	@touch node_modules

build: node_modules
	npm run build

typecheck: node_modules
	npm run typecheck

install: build
	rm -rf .build
	rm -rf $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
	meson setup .build --prefix=$(HOME)/.local/ && ninja -C .build install

clean:
	rm -rf .build src/_build

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

renderer: build
	gjs -m ./src/_build/renderer.js $(ARGS)

log:
	journalctl -f -o cat /usr/bin/gnome-shell

lint:
	npm run lint -- src/

lint-fix:
	npm run lint -- src/ --fix

pot:
	find src/ -iname "*.ts" -not -path "src/_build/*" -print0 | xargs -0 xgettext \
		--from-code=UTF-8 \
		--package-name="gnome-ext-hanabi" \
		--package-version="1" \
		--copyright-holder="Jeff Shee (jeffshee8969@gmail.com)" \
		--output="$(POT_FILE)"
	sed -i \
		-e "s/SOME DESCRIPTIVE TITLE\./Gnome Shell Extension - Hanabi/" \
		-e "s/Copyright (C) YEAR/Copyright (C) 2023/" \
		-e "s/charset=CHARSET/charset=UTF-8/" \
		"$(POT_FILE)"

merge-po: pot
	@while read -r lang; do \
		[ -z "$$lang" ] && continue; \
		echo "Merging $$lang.po..."; \
		msgmerge --update --backup=none "$(POT_DIR)/$$lang.po" "$(POT_FILE)"; \
	done < "$(POT_DIR)/LINGUAS"
