# Minecraft Skin Layerer

A static web app for composing Minecraft skins by overlaying multiple PNG layers, reordering, previewing (flat and 3D), and exporting the result. No server required—works entirely in your browser.

## Features
- **Layer system:** Add, remove, reorder, toggle, and import PNG layers. Drag-and-drop reorder (SortableJS).
- **Library:** Built-in skins (Steve, Tinkerer) available from a modal overlay.
- **Image normalization:** Auto-fits imported images to 64x64 (with warning if aspect ratio is off). Supports legacy 64x32 and modern 64x64 skins.
- **Previews:**
  - Flat 2D preview (composited PNG)
  - Folded 3D preview (skinview3d)
- **Export:** Download the final skin as a PNG (suitable for Minecraft). Optionally export as legacy 64x32.
- **No build step:** All code is static and references are relative. Ready for GitHub Pages.

## How to deploy to GitHub Pages
- Push the project to a GitHub repository.
- Go to repository Settings → Pages.
- Set the source branch to `main` (or `gh-pages`) and root folder (`/`).
- Visit the provided GitHub Pages URL.

## Credits & Attribution
- **skinview3d:** [skinview3d on GitHub](https://github.com/bs-community/skinview3d)
- **SortableJS:** [SortableJS on GitHub](https://github.com/SortableJS/Sortable)
- **FileSaver.js:** [FileSaver.js on GitHub](https://github.com/eligrey/FileSaver.js)

## Browser Support
- Tested in latest Chrome, Firefox, and Safari (desktop).
- Should work on most modern browsers with ES6 support.
- Responsive for desktop and tablets.

---

MIT License. Not affiliated with Mojang or Microsoft.
# skinforge
