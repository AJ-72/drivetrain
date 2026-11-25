// proto/sim.js — the race physics, copied from index.html.
//
// This is a COPY, not a shared import. The signed game in index.html and its
// contract (factory/CONTRACT.md, test/contract.mjs) are not touched by this
// prototype. If the real physics in index.html changes, this file drifts and
// must be updated by hand.
//
// Source of truth: index.html, the block from `const K = {` through
// `function setInput`. Every constant and every line of arithmetic below is
// unchanged. Only the packaging is different: index.html keeps one module-level
// state object; this file wraps the same logic in createSim() so the 3D
// prototype can create, reset, and read a race without touching globals.

export function createSim(overrides) {
  const K = Object.assign({
    TRACK_LENGTH_M: 2000,

    PLATFORM_WIDTH_M: 240,
    PLATFORM_MIN_START_M: 1300,
    PLATFORM_MAX_START_M: 1520,

    PLAYER_FMAX: 2.5,
    PLAYER_POWER: 95,
    BRAKE_DECEL: 2.5,
    RES_R0: 0.06,
    RES_R2: 0.00028,

    GRIPS: [
      { name: "DRY", g: 1.00 },
      { name: "DAMP", g: 0.80 },
      { name: "WET", g: 0.65 }
    ],

    RIVAL_FMAX: 4.0,
    RIVAL_POWER: 120,
    RIVAL_BRAKE: 4.0,
    RIVAL_MIN_SPEED: 28,
    RIVAL_MAX_SPEED: 33,
    RIVAL_BOOST: 3,
    RIVAL_BOOST_RANGE_M: 300,
    RIVAL_HARD_CAP: 36,

    WARN_BEFORE_M: 400,
    ARM_AFTER_M: 50,
    STOP_EPSILON: 0.05,
    FIXED_DT: 1 / 60,
    MAX_FRAME_DELTA_MS: 50,
    STEP_MS: 1000 / 60
  }, overrides || {});

  const S = {
    state: "IDLE",
    result: null,
    playerPos: 0, playerSpeed: 0, playerArmed: false,
    rivalPos: 0, rivalSpeed: 0, rivalArmed: false, rivalDone: false,
    rivalMax: 0, rivalBase: 0, rivalTargetM: 0, rivalBraking: false,
    endSpeed: 0,
    platformStart: 0, platformEnd: 0, warnAtM: 0, passedWarn: false,
    gripName: "DRY", grip: 1,
    forcedRivalMax: null, forcedPlatformStart: null, forcedGrip: null,
    steps: 0, elapsedMs: 0,
    input: { throttle: false, brake: false }
  };

  function resistance(v) { return K.RES_R0 + K.RES_R2 * v * v; }

  // The exact distance to a standstill under a constant brake plus a
  // resistance that grows with the square of the speed.
  function stopDistance(v, decel) {
    const b = decel + K.RES_R0;
    if (v <= 0) return 0;
    return Math.log(1 + (K.RES_R2 * v * v) / b) / (2 * K.RES_R2);
  }

  function stepTrain(train, throttle, brake, spec, cap) {
    const v = train.speed;
    const res = resistance(v);
    let a;
    if (brake) a = -(spec.brake * S.grip) - res;
    else if (throttle) a = Math.min(spec.fmax, spec.power / Math.max(v, 1)) - res;
    else a = -res;

    train.pos += train.speed * K.FIXED_DT;
    train.speed += a * K.FIXED_DT;
    if (train.speed > cap) train.speed = cap;
    if (a < 0 && train.speed < K.STOP_EPSILON) train.speed = 0;
    if (train.speed < 0) train.speed = 0;
  }

  function brakeDistance(speed, decel) {
    return stopDistance(speed, decel * S.grip);
  }

  function finish(result) {
    S.endSpeed = S.playerSpeed;
    S.result = result;
    S.state = "RESULT";
  }

  function judge() {
    if (S.playerPos >= K.TRACK_LENGTH_M) {
      S.playerPos = K.TRACK_LENGTH_M;
      S.playerSpeed = 0;
      finish("OVERSHOT");
      return true;
    }
    if (S.playerArmed && S.playerSpeed === 0) {
      if (S.playerPos < S.platformStart) finish("UNDERSHOT");
      else if (S.playerPos > S.platformEnd) finish("OVERSHOT");
      else finish("WIN");
      return true;
    }
    return false;
  }

  function step() {
    if (S.state !== "RACING") return;

    S.steps += 1;
    S.elapsedMs = Math.round(S.steps * K.STEP_MS);

    const p = { pos: S.playerPos, speed: S.playerSpeed };
    stepTrain(p, S.input.throttle && !S.input.brake, S.input.brake,
      { fmax: K.PLAYER_FMAX, power: K.PLAYER_POWER, brake: K.BRAKE_DECEL },
      Infinity);
    S.playerPos = p.pos; S.playerSpeed = p.speed;
    if (S.playerPos > K.ARM_AFTER_M) S.playerArmed = true;
    if (S.playerPos >= S.warnAtM) S.passedWarn = true;

    if (!S.rivalDone) {
      const r = { pos: S.rivalPos, speed: S.rivalSpeed };
      const lead = S.playerPos - S.rivalPos;
      const push = Math.max(0, Math.min(1, lead / K.RIVAL_BOOST_RANGE_M)) * K.RIVAL_BOOST;
      const railFactor = 0.68 + 0.32 * S.grip;
      S.rivalMax = Math.min(S.rivalBase + push, K.RIVAL_HARD_CAP) * railFactor;
      const braking = (S.rivalTargetM - r.pos) <= brakeDistance(r.speed, K.RIVAL_BRAKE);
      if (braking) S.rivalBraking = true;
      stepTrain(r, !braking, braking,
        { fmax: K.RIVAL_FMAX, power: K.RIVAL_POWER, brake: K.RIVAL_BRAKE },
        S.rivalMax);
      S.rivalPos = r.pos; S.rivalSpeed = r.speed;
      if (S.rivalSpeed > 0) S.rivalArmed = true;
      if (S.rivalArmed && S.rivalSpeed === 0) S.rivalDone = true;
    }

    if (judge()) return;
    if (S.rivalDone) finish("RIVAL WINS");
  }

  function startRace() {
    S.state = "RACING";
    S.result = null;
    S.playerPos = 0; S.playerSpeed = 0; S.playerArmed = false;
    S.rivalPos = 0; S.rivalSpeed = 0; S.rivalArmed = false; S.rivalDone = false;

    S.platformStart = S.forcedPlatformStart !== null
      ? S.forcedPlatformStart
      : Math.round(K.PLATFORM_MIN_START_M
        + Math.random() * (K.PLATFORM_MAX_START_M - K.PLATFORM_MIN_START_M));
    S.platformEnd = S.platformStart + K.PLATFORM_WIDTH_M;
    S.rivalTargetM = S.platformStart + K.PLATFORM_WIDTH_M / 2;
    S.warnAtM = S.platformStart - K.WARN_BEFORE_M;
    S.passedWarn = false;
    S.rivalBraking = false;
    S.endSpeed = 0;

    const grip = S.forcedGrip !== null
      ? (K.GRIPS.find((x) => x.name === S.forcedGrip) || K.GRIPS[0])
      : K.GRIPS[Math.floor(Math.random() * K.GRIPS.length)];
    S.gripName = grip.name;
    S.grip = grip.g;

    S.rivalBase = S.forcedRivalMax !== null
      ? S.forcedRivalMax
      : K.RIVAL_MIN_SPEED + Math.random() * (K.RIVAL_MAX_SPEED - K.RIVAL_MIN_SPEED);
    S.rivalMax = S.rivalBase;

    S.steps = 0; S.elapsedMs = 0;
  }

  function resetRace() {
    startRace();
    S.state = "IDLE";
  }

  function setInput(next) {
    if (!next || typeof next !== "object") return;
    if (typeof next.throttle === "boolean") S.input.throttle = next.throttle;
    if (typeof next.brake === "boolean") S.input.brake = next.brake;
  }

  resetRace();

  return { K, S, step, startRace, resetRace, setInput, brakeDistance };
}
