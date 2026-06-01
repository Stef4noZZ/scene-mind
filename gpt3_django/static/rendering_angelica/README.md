# rendering_angelica

## Overview

`rendering_angelica` is a lightweight, self-contained Three.js viewer for local GLTF models. The app now uses the local `three.js-master` copy instead of CDN imports, includes responsive resizing, camera controls, scene lighting, and a simple overlay UI.

## What changed

- Switched from CDN imports to the repository's local `three.js-master` modules
- Replaced the experimental orthographic camera with a practical perspective camera
- Added hemisphere and directional lighting for more realistic shading
- Added a subtle grid and axis helper for orientation
- Added responsive resize handling
- Added double-click fullscreen support
- Added a small overlay UI that shows the active model name
- Added a `package.json` for optional project scripts

## Files

- `index.html` - updated HTML with UI overlay and canvas styling
- `index.js` - improved Three.js setup, loader progress, camera, lights, and resize handling
- `README.md` - documentation updated for the improved viewer
- `package.json` - optional npm startup script for local development
- `package-lock.json` - existing lock file from the repository
- `assets/` - local GLTF model data and textures
- `three.js-master/` - local Three.js source modules used by the app

## Assets

The project supports loading these built-in GLTF models:

- `assets/fem_head/scene.gltf` (default)
- `assets/fem_face/scene.gltf`
- `assets/wraith/gltf/wraith.gltf`

## Running locally

This project must be served from a local web server to load GLTF assets correctly.

From the project root:

```bash
python -m http.server 8000
```

Then open:

```bash
http://localhost:8000
```

If you prefer npm, install dependencies and start the server:

```bash
npm install
npm start
```

## How to change the default model

Open `index.js` and modify the `defaultModelKey` variable.

```js
const defaultModelKey = 'fem_head';
```

Available values:

- `fem_head`
- `fem_face`
- `wraith`

## Notes

- The scene is now centered and scaled automatically to fit the viewport.
- The overlay shows the current model name and basic interaction hints.
- The project is ready for further improvements like a UI model selector, animation playback, or post-processing effects.
