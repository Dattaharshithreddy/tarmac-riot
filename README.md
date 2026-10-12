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
Left: steer. Right: punch left, KICK, punch right, NITRO, BRAKE. Keyboard on desktop: arrows/A-D steer, Z/X punch, C kick, Space nitro, S brake.

## Get the APK
Push to GitHub. The workflow in `.github/workflows` builds an APK and publishes it under Releases.

## Change the game
The game lives in `game/src` (plain JavaScript, canvas). After editing:
```
npm run game        # rebuild and copy into the app
npm run test:game   # simulate full races on every track
```
`node game/balance.js` shows how an AI rider places on each track with each bike (`--peaceful` for a rider who never fights; B = busted).
