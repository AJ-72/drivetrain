// Checks every station of the Last Stop campaign against the drivetrain physics
// and prints the numbers that godot/scripts/stations.gd hard-codes.
//
//   node tools/campaign-check.mjs
//
// For each station it sweeps every brake point (full power, then full brake)
// and reports the winning band, the fastest winning time, and the par time.
// It exits 1 if a station is unwinnable or its band is narrower than MIN_BAND_M.
//
// The physics below is a copy of stepTrain() and step() in index.html, with the
// per-station values passed in instead of drawn at random. The GDScript port in
// godot/scripts/race_sim.gd is checked against the same reference values by
// godot/tests/test_sim.gd.

const K = {
  TRACK_LENGTH_M: 2000,
  PLAYER_FMAX: 2.5, PLAYER_POWER: 95, BRAKE_DECEL: 2.5,
  RES_R0: 0.06, RES_R2: 0.00028,
  RIVAL_FMAX: 4.0, RIVAL_POWER: 120, RIVAL_BRAKE: 4.0,
  RIVAL_BOOST_RANGE_M: 300, RIVAL_HARD_CAP: 36,
  ARM_AFTER_M: 50, STOP_EPSILON: 0.05, FIXED_DT: 1 / 60
};
const GRIP = { DRY: 1.0, DAMP: 0.8, WET: 0.65 };

// Keep in step with godot/scripts/stations.gd.
export const STATIONS = [
  { name: "ASHFORD HALT",   rail: "DRY",  start: 1300, width: 300, rival: 26, boost: 2, window: 20 },
  { name: "BRINDLE ROAD",   rail: "DRY",  start: 1400, width: 260, rival: 28, boost: 3, window: 18 },
  { name: "COLE HARBOUR",   rail: "DAMP", start: 1350, width: 250, rival: 29, boost: 3, window: 16 },
  { name: "DUNMORE",        rail: "DRY",  start: 1500, width: 220, rival: 31, boost: 3, window: 14 },
  { name: "ELM CROSS",      rail: "WET",  start: 1320, width: 240, rival: 29, boost: 3, window: 14 },
  { name: "FENWICK",        rail: "DAMP", start: 1480, width: 210, rival: 32, boost: 3, window: 12 },
  { name: "GREYSTONE",      rail: "WET",  start: 1450, width: 210, rival: 32, boost: 3, window: 12 },
  { name: "HARROW TERMINUS", rail: "WET", start: 1520, width: 200, rival: 33, boost: 3, window: 10 }
];
const MIN_BAND_M = 60;
const PAR_SLACK = 1.06;

function stopDistance(v, decel) {
  const b = decel + K.RES_R0;
  if (v <= 0) return 0;
  return Math.log(1 + (K.RES_R2 * v * v) / b) / (2 * K.RES_R2);
}

function stepTrain(t, throttle, brake, spec, cap, grip) {
  const v = t.speed;
  const res = K.RES_R0 + K.RES_R2 * v * v;
  let a;
  if (brake) a = -(spec.brake * grip) - res;
  else if (throttle) a = Math.min(spec.fmax, spec.power / Math.max(v, 1)) - res;
  else a = -res;
  t.pos += t.speed * K.FIXED_DT;
  t.speed += a * K.FIXED_DT;
  if (t.speed > cap) t.speed = cap;
  if (a < 0 && t.speed < K.STOP_EPSILON) t.speed = 0;
  if (t.speed < 0) t.speed = 0;
}

// Runs one race: full power until the nose passes brakeAt, then full brake.
export function race(st, brakeAt) {
  const grip = GRIP[st.rail];
  const pStart = st.start, pEnd = st.start + st.width, target = st.start + st.width / 2;
  const p = { pos: 0, speed: 0 }, r = { pos: 0, speed: 0 };
  let pArmed = false, rArmed = false, rDone = false, steps = 0;
  const pSpec = { fmax: K.PLAYER_FMAX, power: K.PLAYER_POWER, brake: K.BRAKE_DECEL };
  const rSpec = { fmax: K.RIVAL_FMAX, power: K.RIVAL_POWER, brake: K.RIVAL_BRAKE };
  while (steps < 60 * 600) {
    steps += 1;
    const brake = p.pos >= brakeAt;
    stepTrain(p, !brake, brake, pSpec, Infinity, grip);
    if (p.pos > K.ARM_AFTER_M) pArmed = true;
    if (!rDone) {
      const lead = p.pos - r.pos;
      const push = Math.max(0, Math.min(1, lead / K.RIVAL_BOOST_RANGE_M)) * st.boost;
      const cap = Math.min(st.rival + push, K.RIVAL_HARD_CAP) * (0.68 + 0.32 * grip);
      const rb = (target - r.pos) <= stopDistance(r.speed, K.RIVAL_BRAKE * grip);
      stepTrain(r, !rb, rb, rSpec, cap, grip);
      if (r.speed > 0) rArmed = true;
      if (rArmed && r.speed === 0) rDone = true;
    }
    if (p.pos >= K.TRACK_LENGTH_M) return { result: "OVERSHOT", steps, pos: K.TRACK_LENGTH_M };
    if (pArmed && p.speed === 0) {
      const result = p.pos < pStart ? "UNDERSHOT" : p.pos > pEnd ? "OVERSHOT" : "WIN";
      return { result, steps, pos: p.pos };
    }
    if (rDone) return { result: "RIVAL WINS", steps, pos: p.pos };
  }
  return { result: "TIMEOUT", steps, pos: p.pos };
}

function check() {
  let failed = false;
  STATIONS.forEach((st, i) => {
    const wins = [];
    for (let b = 200; b <= 1900; b += 1) {
      const r = race(st, b);
      if (r.result === "WIN") wins.push({ b, ...r });
    }
    const band = wins.length ? wins[wins.length - 1].b - wins[0].b + 1 : 0;
    const fastest = wins.reduce((m, w) => Math.min(m, w.steps), Infinity);
    const bestMs = Math.round(fastest * 1000 / 60);
    const parMs = Math.ceil(bestMs * PAR_SLACK / 100) * 100;
    const ok = band >= MIN_BAND_M;
    if (!ok) failed = true;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${i + 1} ${st.name.padEnd(16)} ${st.rail.padEnd(4)} ` +
      `band ${String(band).padStart(4)} m  ` +
      `brake ${wins.length ? wins[0].b + "-" + wins[wins.length - 1].b : "none"}  ` +
      `fastest ${(bestMs / 1000).toFixed(2)}s  par ${parMs} ms`
    );
  });
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) check();
