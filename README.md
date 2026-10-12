# Tarmac Riot

3D street-racing brawler for phones (three.js inside a WebView): race seven rivals on Indian roads, punch and kick them off their bikes, dodge two-way highway traffic and outrun the police.

## How it plays
- **Pace:** stock bike tops out around 125 km/h (nitro and upgrades take you past 150), with eased-in steering so a tap nudges and a hold changes lanes.
- **Two-way roads:** India drives on the left. On Ladakh, Thar and Kerala the right-hand lanes carry oncoming traffic with headlights on; the Sea Link is a divided bridge. Bends and drops have crash barriers (stone parapets in Ladakh).
- **Fighting:** punch left/right, KICK the closest rider sideways into traffic or the barrier, and swing chains, bats and iron rods. Knock a rider down to steal his weapon; knock a cop down to grab his lathi.
- **Police:** they only come after you cause an accident (crashing into traffic, kicking a rival into it) or attack them. One star: a bike cop tries to pull you over. Two: lathis come out. Three and up: patrol jeeps ram you, and checkpoint jeeps parked by the road join the chase. Crash or stop beside a cop and you are busted. Lose them for a while to drop stars.

## Tracks
Mumbai Sea Link (sunset), Ladakh High Pass (snow, hairpins), Thar Desert Highway (heat, trucks), Kerala Monsoon (rain, wet roads). Finish top 3 to unlock the next.

## Controls
Left: steer. Right: punch left, KICK, punch right, NITRO, BRAKE. Top right: camera button cycles Medium, Close, Far, Cinematic and First person; pinch with two fingers to zoom in or out. Keyboard on desktop: arrows/A-D steer, Z/X punch, C kick, Space nitro, S brake, V camera, mouse wheel zoom.

## Get the APK
Push to GitHub. The workflow in `.github/workflows` builds an APK and publishes it under Releases.

## Change the game
The game lives in `game/src` (plain JavaScript, canvas). After editing:
```
npm run game        # rebuild and copy into the app
npm run test:game   # simulate full races on every track
```
`node game/balance.js` shows how an AI rider places on each track with each bike (`--peaceful` for a rider who never fights; B = busted).

## Change the art (Blender)
Models and the road texture are built by scripts in `tools/blender` and run headless (Blender 5.x, or the `bpy` Python module).
```
python runb.py vehicles2.py OUT policejeep        # police SUV (FAR=0.35 for the far LOD)
python runb.py props.py OUT cone,drum,barricade   # road-work props
python runb.py asphalt.py game/assets/tex/asphalt_dry.png dry   # baked road surface (save as .jpg)
python runb.py preview.py preview.png OUT/policejeep.glb@0,0,30 OUT/cone.glb@3,0,0   # Cycles preview
node tools/gltf/compress2.mjs OUT game/assets      # weld, WebP textures, meshopt
```
`runb.py` just forwards arguments after `--` the way `blender -b -P script.py -- ...` does.
