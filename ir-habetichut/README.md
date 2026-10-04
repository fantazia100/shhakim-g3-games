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
  * Children and adults walk the sidewalks and cross only at crossings. At the curb they stop and look left-right-left,
    wait for green or a clear road (with a second quick look after a long wait), then walk across.
    Some children walk hand-in-hand with a parent.
  * Cyclists with helmets ride the bike lane and pedal in time with their speed.
  * The crossing guard (vest and STOP paddle) raises the paddle, steps into the road and holds it up while the children cross.
  * Ambient life: kids on the swings (in time with the swing), on the seesaw and the slide (climb, sit, slide, cheer), running games;
    grandparents chatting on a park bench, parents chatting at the kiosk, a goodbye wave at the school gate,
    a child waving at the bus stop; waving flag, swaying trees, birds, drifting clouds.
* **Characters (`assets/characters.glb`, built by `blender/characters.py`)**: soft, rounded cartoon children and adults.
  They have real skeletons (18 bones), faces (eyes with highlights, eyebrows, smile, cheeks), hair and modest clothing
  (long sleeves, long skirts, kippot, head-scarves), plus backpacks, helmets, and the guard's vest and paddle.
  The 8 body variants are recoloured per person with a 16-colour palette texture.
  There are 12 baked clips: Idle, Walk, Run, Look, Wave, Sit, Swing, Slide, Pedal, Talk, WalkHand and Paddle.
  They play through `THREE.AnimationMixer` with cross-fades and right/left-arm layering (paddle and hand-holding).
  Walk and run speeds come from stride lengths measured in Blender (`data/characters.json`), so feet don't slide.
  Each character is one skinned draw call. Far or off-screen characters animate at a lower rate,
  and the low quality setting caps it further. There are about 30 to 40 characters in total.
* **Camera**: cinematic fly-over intro (skippable), orbit/zoom/pan with mouse or touch (1 finger rotate, pinch zoom,
  2-finger pan), double-tap to fly to a spot, quick-view buttons, slow auto-orbit after 45 s idle (smart boards).
* **Settings**: quality low/medium/high (pixel ratio, shadows, number of agents; saved), mute (procedural audio, no files),
  fullscreen, replay intro.

## URL options
`?quality=low|medium|high` · `?intro=0` (skip intro) · `?view=overview|intersection|school|busstop|park` ·
`?autostart=1` (no start button) · `?dev=1` (show hazard anchors + list) · `?introAt=0.3` (freeze intro frame) · `?paused=1`

Screenshot/dev helpers:
* `?cam=px,py,h,tx,ty,th`: camera position and target in map coordinates.
* `?lineup=1`: all character variants in a row.
* `?warmUntil=guard|look|pair`: simulate until that moment.
* `?focus=look|pair|bike`: frame that character.

## Code map
```
js/main.js                app bootstrap, quality, loop, public API (window.RoadSafetyCity, event 'city-ready')
js/config.js              quality presets, camera viewpoints, intro path, sim constants
js/world/World.js         GLB loading (PROTO_/ANCHOR_/SIGN_/ANIM_ node conventions), static merge, sky/sun/fog
js/world/HebrewSigns.js   Hebrew sign textures (canvas)
js/sim/TrafficLights.js   signal controller + light heads
js/sim/Network.js         vehicle routes, pedestrian / bike graphs (map coords)
js/sim/Vehicles.js        car / bus agents (path-sensing, stop lines, keep-clear, merges)
js/characters/Characters.js  rigged character library (palette recolour, mixer, cross-fades, arm layers, LOD update rate)
js/sim/Pedestrians.js     walkers (curb look, hand-holding pairs), cyclists, school crossing guard
js/sim/Bike.js            low-poly bicycle with spinning wheels / crank
js/sim/People.js          playground kids (swings, slide, seesaw, running) and idle townspeople
js/sim/Ambient.js         birds, clouds, trees, flag (+ People)
js/camera/CameraRig.js    orbit controls, intro, fly-to
js/audio/AudioManager.js  procedural ambience
js/hazards/HazardLayer.js EMPTY per-user hazard layer (anchors API)
data/anchors.json         hazard anchor list (three.js coordinates)
blender/                  Blender 4.2 source scripts (city: blender/city_env.py, characters: blender -b -P blender/characters.py)
```
Map coordinates (used in sim code) are Blender X/Y in metres; three.js = (x, height, -y).

## Licenses
* three.js r169 – MIT (`vendor/three/LICENSE`)
* Rubik font – SIL Open Font License 1.1 (Google Fonts)
* three.js addons used (OrbitControls, GLTFLoader, BufferGeometryUtils, SkeletonUtils) – MIT, part of three.js
* City models – generated procedurally by `blender/city_env.py` (no third-party assets)
* Characters, rigs and animations – original, generated procedurally by `blender/characters.py`
  (no third-party character packs, so there are no CC0/attribution obligations)
