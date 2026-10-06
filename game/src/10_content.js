/* ---------- constants & content ---------- */
const SEG = 200;            // length of one road segment
const ROAD_W = 2000;        // half width of the road in world units
const LANES = 4;
const CAM_H = 1000;
const FOV = 100;
const RUMBLE = 3;
const STEP = 1 / 60;
const MAXSPEED = SEG / STEP; // 12000 units/s
const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const PLAYER_Z = CAM_H * CAM_DEPTH;
const KMH = 0.0183;          // MAXSPEED * KMH is about 220 km/h
const LANE_X = [-0.75, -0.25, 0.25, 0.75];

const BIKES = [
  { id: 'scrapper', name: 'Scrapper 150', price: 0,     top: 0.86, acc: 0.90, handling: 0.95, armor: 0.90, color: '#e5483b', blurb: 'Rusty, loud and loyal.' },
  { id: 'wasp',     name: 'Wasp 250',     price: 2500,  top: 0.94, acc: 1.00, handling: 1.05, armor: 1.00, color: '#f2c230', blurb: 'Quick and nimble in traffic.' },
  { id: 'viper',    name: 'Viper 600',    price: 7000,  top: 1.02, acc: 1.10, handling: 1.10, armor: 1.10, color: '#2fbf71', blurb: 'Serious speed for serious riders.' },
  { id: 'reaper',   name: 'Reaper 1000',  price: 16000, top: 1.10, acc: 1.20, handling: 1.15, armor: 1.20, color: '#8b5cf6', blurb: 'The fastest thing on the tarmac.' },
];
const UPGRADES = [
  { id: 'e', name: 'Engine', desc: 'More top speed and pickup', costs: [1000, 2500, 5000] },
  { id: 't', name: 'Tyres',  desc: 'Sharper steering',          costs: [800, 2000, 4000] },
  { id: 'a', name: 'Armour', desc: 'Take less damage',          costs: [900, 2200, 4500] },
];
const WEAPONS = {
  fist:  { dmg: 17, uses: Infinity, label: 'Fists' },
  chain: { dmg: 30, uses: 8, label: 'Chain' },
  bat:   { dmg: 38, uses: 6, label: 'Bat' },
};
const RIVAL_NAMES = ['Raja', 'Vikki', 'Shera', 'Bunty', 'Jinx', 'Tiger', 'Goldy', 'Rocky', 'Kaali', 'Don'];
const RIVAL_STYLES = [
  { jacket: '#2d6cdf', helmet: '#f5f5f5', bike: '#2d6cdf' },
  { jacket: '#1fa97a', helmet: '#222222', bike: '#1fa97a' },
  { jacket: '#d9a400', helmet: '#222222', bike: '#d9a400' },
  { jacket: '#8e44ad', helmet: '#f1c40f', bike: '#8e44ad' },
  { jacket: '#e67e22', helmet: '#222222', bike: '#e67e22' },
  { jacket: '#16a0b8', helmet: '#f5f5f5', bike: '#16a0b8' },
  { jacket: '#c0392b', helmet: '#f5f5f5', bike: '#c0392b' },
  { jacket: '#7f8c8d', helmet: '#e74c3c', bike: '#7f8c8d' },
];
const PLAYER_STYLE = { jacket: '#ff6a00', helmet: '#ffd400', bike: '#e5483b' };
const COP_STYLE = { jacket: '#1c3d8c', helmet: '#f2f2f2', bike: '#f2f2f2', cop: true };

const TRACKS = [
  { id: 'sealink', name: 'Mumbai Sea Link', sub: 'Sunset run along the bay', segs: 3900, difficulty: 0.90, traffic: 0.8, cops: 1, weather: 'none', wet: 0,
    mix: { curve: [2, 3, 4], hill: [0, 15, 25], maxUp: 40, maxDown: 25 }, bg: 'city',
    pal: { skyTop: '#2b1d52', skyMid: '#d9534f', skyBot: '#ffb25c', sun: '#fff0b8', sunX: 0.62, sunY: 0.44, far: '#3a2a5a', mid: '#271b43', ground: '#2c6e49', fog: '#ffc47a',
      grass: ['#2c6e49', '#255f3e'], road: ['#5d5d66', '#56565f'], rumble: ['#e63946', '#f1f1f1'], lane: '#e8e8e8', laneC: '#ffd23f',
      scenery: ['palm', 'lamp', 'billboard', 'building', 'marker'], weights: [3, 3, 1.2, 1.4, 0.6], dry: false } },
  { id: 'ladakh', name: 'Ladakh High Pass', sub: 'Thin air. Sharp hairpins.', segs: 4300, difficulty: 0.98, traffic: 0.45, cops: 1, weather: 'snow', wet: 0,
    mix: { curve: [3, 4, 5], hill: [25, 40, 55], maxUp: 80, maxDown: 40 }, bg: 'mountains',
    pal: { skyTop: '#2f6fb5', skyMid: '#7db9e8', skyBot: '#d7ecfa', sun: '#ffffff', sunX: 0.25, sunY: 0.3, far: '#6b7f99', mid: '#4a5c73', ground: '#8a8f7a', fog: '#e6f3fb',
      grass: ['#8a8f7a', '#7f846f'], road: ['#4c4f57', '#464951'], rumble: ['#e63946', '#f1f1f1'], lane: '#f5f5f5', laneC: '#ffd23f',
      scenery: ['rock', 'flags', 'pole', 'chorten', 'marker'], weights: [3, 1.2, 1.6, 0.6, 0.6], dry: true } },
  { id: 'thar', name: 'Thar Desert Highway', sub: 'Endless heat. Heavy trucks.', segs: 4700, difficulty: 1.04, traffic: 1.0, cops: 2, weather: 'dust', wet: 0,
    mix: { curve: [1, 2, 3], hill: [10, 20, 30], maxUp: 45, maxDown: 30 }, bg: 'dunes',
    pal: { skyTop: '#e39a3b', skyMid: '#f3c36b', skyBot: '#fde9b8', sun: '#fffbe8', sunX: 0.7, sunY: 0.25, far: '#c98a4b', mid: '#b97a3e', ground: '#d9a45b', fog: '#f7dca2',
      grass: ['#d9a45b', '#cf9a52'], road: ['#6a6560', '#625d58'], rumble: ['#d62828', '#f7f7f7'], lane: '#eeeeee', laneC: '#ffd23f',
      scenery: ['cactus', 'rock', 'fort', 'bush', 'marker', 'pole'], weights: [2.2, 1.6, 0.7, 2, 0.6, 1], dry: true } },
  { id: 'kerala', name: 'Kerala Monsoon', sub: 'Rain, wet roads, no mercy.', segs: 4500, difficulty: 1.10, traffic: 1.15, cops: 2, weather: 'rain', wet: 1,
    mix: { curve: [3, 4, 5], hill: [10, 20, 40], maxUp: 50, maxDown: 30 }, bg: 'hills',
    pal: { skyTop: '#27323f', skyMid: '#4a5a68', skyBot: '#8aa0ad', sun: '#c9d6dc', sunX: 0.5, sunY: 0.3, far: '#33493f', mid: '#26382f', ground: '#1f7a3d', fog: '#9bb0ba',
      grass: ['#1f7a3d', '#1a6d36'], road: ['#3b3f46', '#363a41'], rumble: ['#e63946', '#e8e8e8'], lane: '#d8dde0', laneC: '#ffd23f',
      scenery: ['coconut', 'house', 'bush', 'palm', 'pole', 'billboard'], weights: [3, 1, 2.2, 1.5, 1.2, 0.8], dry: false } },
];

const DEFAULT_SAVE = () => ({
  v: 1, cash: 300, bike: 0, owned: [0], up: { 0: { e: 0, t: 0, a: 0 } },
  unlocked: 1, best: {}, mute: false, quality: 1, stats: { races: 0, wins: 0, takedowns: 0 },
});
function bikeStats(save, bikeIndex) {
  const b = BIKES[bikeIndex];
  const u = (save.up && save.up[bikeIndex]) || { e: 0, t: 0, a: 0 };
  return {
    top: b.top * (1 + 0.04 * u.e), acc: b.acc * (1 + 0.05 * u.e),
    handling: b.handling * (1 + 0.05 * u.t), armor: b.armor * (1 + 0.10 * u.a), color: b.color, name: b.name,
  };
}
