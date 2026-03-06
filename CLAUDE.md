# folio-2019

Bruno Simon's 2019 portfolio — a 3D interactive world built with Three.js where a car drives around a WebGL scene.

## Stack

- **Three.js** — 3D rendering, custom shaders (GLSL)
- **Cannon.js** — physics engine (car chassis + world)
- **GSAP** — animations
- **Howler / Tone.js** — audio
- **dat.GUI** — debug UI (enabled via `#debug` hash)
- **Vite** — dev server and build tool

## Project Structure

```
src/
  index.html / index.js    # Entry point
  javascript/
    Application.js         # Root class: wires everything together
    Camera.js
    Resources.js           # Asset loader
    Passes/                # Post-processing (blur, glows)
    Utils/                 # EventEmitter, Sizes, Time, Loader
    World/                 # Scene objects
      index.js             # World orchestrator
      Car.js               # Player car
      Physics.js           # Cannon.js integration
      Controls.js          # Keyboard/touch input
      Sounds.js            # Audio engine
      Areas.js / Area.js   # Interactive zones
      Sections/            # Portfolio sections
  shaders/                 # GLSL vertex/fragment shaders
static/                    # Static assets served as-is
```

## Dev Commands

```bash
npm run dev     # Start Vite dev server (opens browser)
npm run build   # Build to dist/
```

## Debug Mode

Add `#debug` to the URL to enable dat.GUI panels for post-processing, camera, and world objects.

## Architecture Notes

- `Application` is a singleton instantiated in `index.js` with a canvas element.
- All major systems (Camera, World, Physics, Sounds) receive deps via constructor options — no global state.
- `EventEmitter` (Utils) is the base class for `Time` and `Sizes`; systems communicate via `.on('tick')` and `.on('resize')`.
- Post-processing chain: RenderPass → HorizontalBlur → VerticalBlur → Glows (EffectComposer).
- Touch devices disable blur passes for performance.
- The page `<title>` animates a 🚗 scrolling based on car speed.
