# Solmar Bay — Open-World Crime Game

Entry for the make.fun competition `gta6-01`: build the most complete
open-world crime game in the spirit of GTA 6 — 100% original. No Rockstar
names, logos, characters, maps, or music: a city of our own, a story of our
own, built from scratch in three.js.

![make.fun](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/silver-finch-59/gta6-01/rank.svg)
![reward](https://make.fun/badge/gta6-01/silver-finch-59/gta6-01/reward.svg)

[make.fun](https://make.fun) — bounty page:
[make.fun/bounty/gta6-01](https://make.fun/bounty/gta6-01)

## The game

You are **Nova Reyes**, getaway driver, back in **Solmar Bay** — a sun-soaked
coastal city with a downtown skyline, a marina, old-town streets, a beachfront
and a harbor. Explore it on foot or behind the wheel, steal cars, outrun the
Solmar Bay police, run jobs for fixer Dom Ferreira, and take the city back
from the Viper crew.

- **Open world**: a drivable city grid with nine districts, a beach and an
  ocean, traffic, pedestrians, traffic lights, and a full day/night cycle —
  the sun sets, street lamps come on, and headlights light up.
- **Cars**: eight kinds to steal and drive (sedan, sports, taxi, motorbike,
  van, bus, pickup, police) with arcade handling, handbrake turns, and
  traffic that follows the roads and stops at red lights.
- **Wanted system**: crimes raise your heat; police cars chase and PIT you,
  foot cops move in, roadblocks appear at 3 stars, and a helicopter with a
  searchlight joins at 4. Getting busted or wasted costs you cash.
- **Missions & story**: eight story missions with dialogue, beacons and
  rewards — including a timed midnight delivery and a tailing job — plus
  taxi fares and 12 hidden packages as side activities.
- **Respect**: completing jobs earns respect and climbs the ranks from
  Nobody to King of Solmar.
- **Combat**: pistol shootouts against Viper crew members (grunts, rushers
  and shooters who take cover), plus a melee punch, with health pickups
  and loot drops.
- **HUD & minimap**: health and stamina bars, cash, wanted stars and a heat
  bar, clock with a day/night icon, district name, respect meter, radio
  station, mission objective with live distance, speedometer, and a live
  minimap with blips for traffic, enemies and the objective.
- **Start screen & save**: title screen, pause menu, and progress saved to
  localStorage (money, respect, missions, stats, radio station).
- **Sound**: fully synthesized WebAudio — engine hum, sirens that fade with
  distance, gunshots, jingles, beach ambience, and three radio stations
  you can flip with R. No audio files, no network requests.

## Controls

| Key | Action |
| --- | ------ |
| WASD | Move / drive |
| Mouse | Look (drag to orbit the camera) |
| E | Enter / exit car |
| F or click | Shoot |
| Q | Punch |
| Shift | Sprint (uses stamina) |
| Space | Handbrake |
| C | Camera view |
| R | Change radio station |
| M | Mute |
| Esc | Pause |

## Play it

Static files only — no build step, no network requests. Serve `game/` with
any static server and open `game/index.html` in desktop Chrome:

```
node serve.ts
# then open http://localhost:8080
```

## How it works

The entry program `main.ts` (Node 22, standard library only, deterministic)
copies `game/` and `screenshots/` into `/output` and writes `dossier.json`
via `vendor/makefun-game.ts`.

The game itself is plain ES modules under `game/src/`, one file per system:

- `config.js` — tuning constants, car kinds, day/night phases, respect tiers
- `rng.js` — seeded deterministic randomness (sfc32)
- `state.js` — shared game state, crimes, wanted-level and respect rules
- `collide.js` — circle/box collision, line of sight, swept movement
- `textures.js` — procedural canvas textures (building facades, roads, neon)
- `city.js` — the city: roads, buildings, beach, ocean, pier, park, props,
  road graph, day/night lighting
- `vehicles.js` — car models and arcade driving physics
- `traffic.js` — traffic cars, buses and pedestrians on the road graph
- `police.js` — police chases, PIT maneuvers, roadblocks and the helicopter
- `player.js` — on-foot movement, sprint stamina, punching, camera
- `combat.js` — shooting, enemy AI, loot drops
- `missions.js` — eight story missions, taxi fares and packages
- `hud.js` — HUD, minimap, dialogue and damage vignette
- `audio.js` — synthesized WebAudio sound, music and three radio stations
- `save.js` — localStorage save and load (v2 format, migrates v1)
- `shots.js` — deterministic screenshot scenes (`?shot=...`)
- `main.js` — boot, game loop and screen flow

three.js r170 is vendored as `game/vendor/three.module.min.js`.

## Screenshots

Four deterministic renders, retaken from the live game with headless Chrome
(`?shot=chase|marina|shootout|title&seed=7` — see `shots.json` for the scene
list; the first by name is the cover):

1. `1-chase.jpg` — three-star police chase through Downtown
2. `2-marina.jpg` — Nova on foot on the Marina promenade
3. `3-shootout.jpg` — pistol shootout with the Viper crew at the Beachfront
4. `4-title.jpg` — title screen over the live city

## License

MIT — see `LICENSE`.
