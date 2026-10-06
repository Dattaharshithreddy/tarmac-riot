# Tarmac Riot

3D street-racing brawler for phones (three.js inside a WebView): race seven rivals on Indian roads, punch them off their bikes, dodge traffic and outrun the police.

## Tracks
Mumbai Sea Link (sunset), Ladakh High Pass (snow, hairpins), Thar Desert Highway (heat, trucks), Kerala Monsoon (rain, wet roads). Finish top 3 to unlock the next.

## Controls
Left: steer. Right: punch left, punch right, NITRO, BRAKE. Keyboard on desktop: arrows/A-D steer, Z/X punch, Space nitro, S brake.

## Get the APK
Push to GitHub. The workflow in `.github/workflows` builds an APK and publishes it under Releases.

## Change the game
The game lives in `game/src` (plain JavaScript, canvas). After editing:
```
npm run game        # rebuild and copy into the app
npm run test:game   # simulate full races on every track
```
`node game/balance.js` shows how an AI rider places on each track with each bike.
