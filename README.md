# Spherecraft

Minecraft, but every block is a sphere.

Spherecraft is a browser voxel sandbox built with [Three.js](https://threejs.org/). It has an
infinite procedural world of rolling hills, stone cliffs, rivers, waterfalls, beaches, deserts,
snowy peaks and caves. You can mine it, build in it, swim, fly and survive the night. Every
block, whether grass, dirt, stone, water, leaves or ore, is a glossy shaded sphere.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Production build in `dist/` (static files, works from any path) |
| `npm run build:single` | Same build inlined into one self-contained `dist-single/index.html` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests (noise, world gen, meshing, sealing, ray casting) |

You need a browser with WebGL 2: any recent Chrome, Edge, Firefox or Safari.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrows | Move |
| Mouse | Look (click the game to capture the mouse) |
| `Space` | Jump / swim up. Double-tap to toggle flying |
| `Shift` | Sneak (won't walk off edges) / fly down |
| `Ctrl` or double-tap `W` | Sprint |
| Left mouse (hold) | Break the targeted sphere |
| Right mouse | Place the selected sphere |
| Middle mouse | Pick the targeted block into the hotbar |
| `1`–`9`, mouse wheel | Select hotbar slot |
| `E` | Block inventory (all placeable spheres) |
| `F` | Toggle flying |
| `F3` | Debug overlay (FPS, position, sphere and draw counts) |
| `Esc` | Pause menu (settings, controls, save & quit) |

On touch screens, use the left thumb to move and drag on the right side to look. Tap to place,
hold to break, press ▲ to jump (double-tap to fly) and ▼ to sneak or descend. If the page can't
capture the mouse (for example inside an embedded frame), you can drag with the mouse to look
around instead.

Your world is saved automatically in the browser (`localStorage`): only the blocks you changed
are stored, and everything else is regenerated from the seed. Enter any seed on the title screen
to visit another world.

## Features

- Infinite terrain streamed in 16×16×96 chunks, built within a time budget each frame
- Biomes: plains, forests (oak, birch and big oak), spruce taiga, snowy mountains, deserts with
  cacti, beaches, rivers carving canyons, lakes, waterfalls, and caves with coal, iron, gold
  and diamond ore
- Mining with hardness per block, a crack-and-wobble effect and sphere particles; blocks that
  need support (plants, torches, cacti) pop off, and water flows into holes dug next to it
- Health with fall damage and regeneration, swimming, flying and sneaking
- Day/night cycle with a square sun and moon, stars and blocky drifting clouds
- Soft sun shadows, contact occlusion between spheres, sky light in caves and warm torch
  and glowstone light
- Settings for render distance, FOV, sensitivity, resolution, shadows, day cycle and auto-jump;
  resolution drops automatically when the frame rate stays low

## How the spheres are rendered

Rendering one sphere per block naively leaves two problems, and Spherecraft solves both.

1. **Perfect spheres, cheaply.** Each visible block is one GPU instance of a low-poly
   icosphere that *circumscribes* the unit sphere. The fragment shader intersects the view ray
   with the exact sphere (or ellipsoid, for grass blades, flowers and torches), discards the
   pixels that miss it and shades the rest with the analytic normal. Silhouettes stay perfectly
   round even on the 20-triangle far LOD. The shadow pass does the same intersection along the
   light direction and writes the corrected depth.
2. **Gaps between spheres.** Neighbouring spheres touch at a single point, so without help you
   could see between them into the hollow, unrendered inside of the terrain. For every exposed
   face, the mesher also emits a quad through the block's centre plane. Where edges are convex
   the quads stop at the centre line, where the surface is flat they meet their neighbours, and
   where it is concave they extend to meet the perpendicular quad. Together the quads form a
   closed surface that sits just inside the spheres. It is only visible through the gaps, where
   it is shaded as a dark crevice. It also casts shadows, so light doesn't leak between the
   spheres, and it is drawn first as a cheap depth pre-pass.

Per-instance data is 12 bytes: position, block type, contact occlusion toward each of the six
neighbours (which darkens the spheres where they touch), and packed sky and block light. Pitch-
dark cave spheres are kept in a separate bucket that is only drawn near the player.

## Project layout

```
src/
  main.js              game loop, state machine, interaction
  config.js, blocks.js world constants and the block registry
  world/               noise, terrain generation, chunk storage, mesher
  render/              renderer, sphere shaders, sky, hand, particles
  game/                player physics, input, chunk streaming, ray casting, saves
  ui/                  HUD, menus, sphere icons and the sphere-pixel logo
test/                  vitest unit tests
```
