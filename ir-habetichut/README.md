# עיר הבטיחות – Road-Safety City (3D environment)

Explorable low-poly 3D road-safety city for a kids' educational game (elementary school, Israel,
right-hand traffic). **Environment only:** no questions, score or certificate yet. Hazards are a separate
data layer loaded per user later (see `data/hazards/README.md`).

## Run
ES modules need a web server (opening `index.html` directly from disk will not work):
```
cd road-safety-city
python3 -m http.server 8080        # or: npx serve .
# open http://localhost:8080
```
Everything is local (three.js r169 vendored, Rubik font bundled). No CDN or internet needed.

## What's inside
* **City (Blender-built GLB, `assets/city_env.glb`)**: 4-way signalised junction, 2 T-junctions (STOP sign 302 / YIELD sign 301),
  zebra crossings, stop lines, lane arrows, Israeli curb painting (red-white no-stopping, red-yellow bus stop),
  red bike lane, school with crossing-guard spot and gate, bus stop, fenced playground away from the road,
  Jerusalem-stone buildings with balconies and solar water heaters, red-roof suburbs, palms, street lamps,
  black-and-white bollards, kiosk, red post box, Hebrew shop/street/school signs.
* **Live simulation**
  * Traffic lights with the Israeli sequence: green → flashing green → yellow → red → red+yellow.
    Pedestrian lights are in phase with traffic, and the HUD shows the main-road signal.
  * Cars and taxis on 8 routes, all right-hand traffic. Cars stop at red lights, stop fully at the STOP sign,
    slow down at the YIELD sign, keep the junction and crosswalks clear, and give way to pedestrians.
  * The bus stops at the bus stop with a brake sound.
  * Children and adults walk the sidewalks and cross only at crossings (on green or when the road is clear).
  * Cyclists ride the bike lane. The crossing guard steps into the road with her STOP paddle when children want to cross.
  * Ambient life: swings, seesaw, children playing, waving flag, swaying trees, birds, drifting clouds.
* **Camera**: cinematic fly-over intro (skippable), orbit/zoom/pan with mouse or touch (1 finger rotate, pinch zoom,
  2-finger pan), double-tap to fly to a spot, quick-view buttons, slow auto-orbit after 45 s idle (smart boards).
* **Settings**: quality low/medium/high (pixel ratio, shadows, number of agents; saved), mute (procedural audio, no files),
  fullscreen, replay intro.

## URL options
`?quality=low|medium|high` · `?intro=0` (skip intro) · `?view=overview|intersection|school|busstop|park` ·
`?autostart=1` (no start button) · `?dev=1` (show hazard anchors + list) · `?introAt=0.3` (freeze intro frame) · `?paused=1`

## Code map
```
js/main.js                app bootstrap, quality, loop, public API (window.RoadSafetyCity, event 'city-ready')
js/config.js              quality presets, camera viewpoints, intro path, sim constants
js/world/World.js         GLB loading (PROTO_/ANCHOR_/SIGN_/ANIM_ node conventions), static merge, sky/sun/fog
js/world/HebrewSigns.js   Hebrew sign textures (canvas)
js/sim/TrafficLights.js   signal controller + light heads
js/sim/Network.js         vehicle routes, pedestrian / bike graphs (map coords)
js/sim/Vehicles.js        car / bus agents (path-sensing, stop lines, keep-clear, merges)
js/sim/Pedestrians.js     walkers, cyclists, school crossing guard
js/sim/Ambient.js         birds, clouds, trees, playground, flag
js/camera/CameraRig.js    orbit controls, intro, fly-to
js/audio/AudioManager.js  procedural ambience
js/hazards/HazardLayer.js EMPTY per-user hazard layer (anchors API)
data/anchors.json         hazard anchor list (three.js coordinates)
blender/                  Blender 4.2 source script for the GLB (re-export: blender -b -P blender/city_env.py)
```
Map coordinates (used in sim code) are Blender X/Y in metres; three.js = (x, height, -y).

## Licenses
* three.js r169 – MIT (`vendor/three/LICENSE`)
* Rubik font – SIL Open Font License 1.1 (Google Fonts)
* City models – generated procedurally by `blender/city_env.py` (no third-party assets)
