/* ---------- public API ---------- */
const API = {
  TRACKS, BIKES, UPGRADES, WEAPONS, MAXSPEED, SEG, LANES, LANE_X, PLAYER_Z, CAM_DEPTH, ROAD_W, CAM_H, KMH,
  DEFAULT_SAVE, bikeStats, createRace, stepRace, autopilot, applyResults, segAt, buildTrack, rupees, fmtTime, ordinal,
  createRenderer, createRenderer3D, buildPath3, loadAssets, ASSETS, configureGL,
  PLAYER_STYLE, COP_STYLE, RIVAL_STYLES, TRAFFIC_TYPES, PACE, playerAttack,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.TarmacRiot = Object.assign(root.TarmacRiot || {}, API);
API.boot = boot;
if (typeof module === 'undefined') root.TarmacRiot.boot = boot;
