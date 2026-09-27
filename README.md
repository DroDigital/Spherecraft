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

## Game modes

- **Survival**: start with nothing. Mined spheres drop the actual material (stone gives
  cobblestone, ores give coal, raw iron, raw gold or diamonds, leaves sometimes give saplings or
  apples) and you pick it up by walking over it. You have health, hunger and breath. Tools
  mine faster, and harder blocks need the right tool tier to drop anything. Animals roam by day.
  Monsters come out at night and in dark caves.
- **Creative**: every item is available, blocks break instantly and aren't used up, you can fly,
  and nothing can hurt you.

Choose the mode for new worlds on the title screen, or switch the current world from the pause
menu. Settings has a *Peaceful* option that turns monsters off.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrows | Move |
| Mouse | Look (click the game to capture the mouse) |
| `Space` | Jump / swim up. In creative, double-tap to fly |
| `Shift` | Sneak (won't walk off edges) / fly down |
| `Ctrl` or double-tap `W` | Sprint |
| Left mouse (hold) | Mine the targeted sphere, or attack a creature |
| Right mouse | Place, eat (hold), draw a bow (hold and release), open chests and crafting tables, sleep in a bed, use tools |
| Middle mouse | Pick the targeted block (creative) |
| `1`–`9`, mouse wheel | Select hotbar slot |
| `E` | Inventory and crafting |
| `Q` | Drop one of the held item (`Ctrl+Q` drops the stack) |
| `F3` | Debug overlay |
| `Esc` | Pause menu |

On touch screens, use the left thumb to move and drag on the right side to look. Tap to place
or use, hold to mine or attack, and press ▲ to jump.

Worlds are saved automatically in the browser (`localStorage`): changed blocks, your inventory,
chests, bed and stats.

## What's in the world

- **Terrain**: infinite and streamed in 16×16×96 chunks, generated and meshed on background
  worker threads. It has plains, forests (oak, birch and big oak), spruce taiga, snowy
  mountains, deserts with cacti, beaches, rivers carving canyons, lakes, pumpkins and caves with
  ores.
- **Water**: translucent, glassy spheres that ripple, reflect the sky and flow. Water spreads
  and falls down ledges with falling levels, fills holes you dig, dries up when you cut off its
  source, and makes new sources between two others. Waterfalls pour off cliffs, and splashes
  send rings across the surface.
- **Survival**:
  - **Items**: drops and pickup, a 36-slot inventory with stacking and a cursor for moving
    stacks, and chests.
  - **Crafting**: about 50 recipes, some needing a crafting table, plus furnace smelting that
    burns fuel.
  - **Tools**: wood, stone, iron and diamond pickaxes, axes, shovels, swords and hoes, which wear
    out with use.
  - **Food**: food, hunger and saturation, breath underwater, fall damage and drowning.
  - **Other**: beds that skip the night and set your respawn point, farming (hoe, seeds, wheat,
    bone meal, bread), saplings that grow into trees, buckets, bows and arrows, and powder kegs
    that explode.
- **Creatures**: all built from spheres.
  - **Animals**: pigs, cows, sheep and chickens that wander in herds and flee when hit.
  - **Monsters**: Shamblers that chase you, Rattlers that shoot arrows, Fuses that sneak up and
    blow up terrain, and fast leaping Skitters. Shamblers and Rattlers burn in sunlight.
- **Sky**: day/night cycle with a square sun and moon, stars and puffy clouds made of spheres.
- **Materials**: procedural per-material shading with bump relief. Examples include bark grooves,
  cobble lumps, plank seams, mortar, ore glints, snow and sand sparkle, fuzzy wool, see-through
  leaves, and glass and ice.
- **Graphics**: soft sun shadows, contact occlusion between spheres, and warm torch light.
- **Sound**: small procedural sound effects.

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

Creatures, dropped items, arrows, the first-person arm and the clouds use the same
ray-traced ellipsoids, each with its own rotation, so everything in the game is a sphere.
Water, glass and ice are drawn in a separate blended pass that reflects the sky with a
Fresnel term. Far-away spheres skip the material noise and the bump relief, which is only
computed within about 30 blocks of the camera.

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
