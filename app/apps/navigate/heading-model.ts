/**
 * Which way the guidance map points. On foot it follows the wearer's head
 * (glasses compass) while the compass reports a trustworthy fix; in a car or
 * on a motorcycle it follows the GPS course and holds the last frame when
 * stopped, so glancing at a mirror doesn't spin the map. Rationale and
 * thresholds: research/navigate/heading.md.
 */
import type { CompassDiagnostics } from "../../native/compass-types";

export type HeadingMode = "walking" | "vehicle";
export type CompassQuality = "good" | "degraded" | "bad" | "unknown";
export type HeadingSource = "head" | "course" | "hold" | "north";
export type HeadingOutput = {
  bearingDeg: number;
  source: HeadingSource;
  /** False when the bearing is not the wearer's current direction (held frame or north-up). */
  showChevron: boolean;
  /** The compass has been unusable long enough to suggest moving the head. */
  compassPoor: boolean;
};
export type CourseFix = {
  bearing: number;
  speed: number;
  accuracyM: number | null;
  bearingAccuracyDeg: number | null;
};

const HEAD_BAD_GRACE_MS = 500;
const HEAD_RECOVER_MS = 1_500;
const COMPASS_POOR_MS = 5_000;
const COURSE_MAX_AGE_MS = 3_000;
const COURSE_ENTER_MS = 2_000;
const COURSE_ENTER_FIXES = 3;
const COURSE_EXIT_MS = 2_000;
/** Walking keeps the last good direction this long before falling back to north-up. */
const WALK_HOLD_MS = 2_000;
const HEAD_TAU_MS = 250;
const COURSE_TAU_MS = 500;
const SOURCE_BLEND_MS = 700;

/** CFW diagnostics (g2flash patches/compass.c): bit7 = matching capture, bit1 GMRV / bit2 RV heading valid. */
export function compassQuality(diagnostics: CompassDiagnostics | undefined): CompassQuality {
  if (!diagnostics || !(diagnostics.flags & 0x80)) return "unknown";
  const absolute = (diagnostics.orientationSource === 2 && (diagnostics.flags & 0x02) !== 0)
    || (diagnostics.orientationSource === 3 && (diagnostics.flags & 0x04) !== 0);
  if (!absolute) return "bad";
  if (diagnostics.magneticAccuracy === 0 || diagnostics.magneticAnomalies === 2) return "bad";
  if (diagnostics.magneticAccuracy === 1 || diagnostics.magneticAnomalies === 1) return "degraded";
  if (diagnostics.magneticAccuracy < 0) return "unknown";
  return "good";
}

export function wrap360(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Signed shortest turn from `from` to `to`, in (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  const delta = wrap360(to - from);
  return delta > 180 ? delta - 360 : delta;
}

export class HeadingModel {
  private mode: HeadingMode = "walking";
  private head: number | null = null;
  private headUsable = false;
  private goodSinceMs: number | null = null;
  private degradedSinceMs: number | null = null;
  private unusableSinceMs: number | null = null;

  private course: number | null = null;
  private courseAtMs = 0;
  private courseValid = false;
  private candidateSinceMs: number | null = null;
  private candidateFixes = 0;
  private outOfLimitsSinceMs: number | null = null;
  private lastGoodMs = 0;
  private lastGood: number | null = null;

  private smoothed: number | null = null;
  private smoothedAtMs = 0;
  private lastSource: HeadingSource = "north";
  private sourceChangedAtMs = 0;

  reset(mode: HeadingMode): void {
    Object.assign(this, new HeadingModel());
    this.mode = mode;
  }

  /** A true-north head heading (offset and declination applied) with the compass's own quality. */
  headSample(trueHeading: number, quality: CompassQuality, nowMs: number): void {
    if (quality === "bad") {
      this.markHeadUnusable(nowMs);
      this.goodSinceMs = null;
      this.degradedSinceMs = null;
      return;
    }
    if (quality === "degraded") {
      this.goodSinceMs = null;
      this.degradedSinceMs ??= nowMs;
      if (nowMs - this.degradedSinceMs >= HEAD_BAD_GRACE_MS) this.markHeadUnusable(nowMs);
      return;
    }
    this.degradedSinceMs = null;
    this.goodSinceMs ??= nowMs;
    this.head = wrap360(trueHeading);
    if (!this.headUsable && (this.unusableSinceMs === null || nowMs - this.goodSinceMs >= HEAD_RECOVER_MS)) {
      this.headUsable = true;
      this.unusableSinceMs = null;
    }
  }

  /** The compass stopped (calibration started, disconnect): nothing it said before still holds. */
  headLost(nowMs: number): void {
    this.markHeadUnusable(nowMs);
    this.goodSinceMs = null;
    this.degradedSinceMs = null;
  }

  courseFix(fix: CourseFix, nowMs: number): void {
    const known = fix.bearing >= 0 && Number.isFinite(fix.bearing) && fix.speed >= 0;
    const enter = known && this.meetsEntry(fix);
    const hold = known && this.meetsHold(fix);
    if (this.courseValid) {
      if (!known) {
        this.courseValid = false;
      } else if (hold) {
        this.outOfLimitsSinceMs = null;
      } else {
        this.outOfLimitsSinceMs ??= nowMs;
        if (nowMs - this.outOfLimitsSinceMs >= COURSE_EXIT_MS) this.courseValid = false;
      }
    } else if (enter) {
      this.candidateSinceMs ??= nowMs;
      this.candidateFixes++;
      const needMs = fix.bearingAccuracyDeg === null ? 2 * COURSE_ENTER_MS : COURSE_ENTER_MS;
      const needFixes = fix.bearingAccuracyDeg === null ? 5 : COURSE_ENTER_FIXES;
      if (nowMs - this.candidateSinceMs >= needMs && this.candidateFixes >= needFixes) {
        this.courseValid = true;
        this.outOfLimitsSinceMs = null;
        this.candidateSinceMs = null;
        this.candidateFixes = 0;
      }
    } else {
      this.candidateSinceMs = null;
      this.candidateFixes = 0;
    }
    if (!this.courseValid) {
      this.outOfLimitsSinceMs = null;
    } else if (hold) {
      this.course = wrap360(fix.bearing);
      this.courseAtMs = nowMs;
    }
  }

  output(nowMs: number): HeadingOutput {
    const courseFresh = this.courseValid && this.course !== null && nowMs - this.courseAtMs <= COURSE_MAX_AGE_MS;
    let source: HeadingSource;
    let target: number;
    if (this.mode === "walking" && this.headUsable && this.head !== null) {
      source = "head";
      target = this.head;
    } else if (courseFresh) {
      source = "course";
      target = this.course!;
    } else if (this.lastGood !== null && (this.mode === "vehicle" || nowMs - this.lastGoodMs <= WALK_HOLD_MS)) {
      source = "hold";
      target = this.lastGood;
    } else {
      source = "north";
      target = 0;
    }
    if (source === "head" || source === "course") {
      this.lastGood = target;
      this.lastGoodMs = nowMs;
    }
    if (source !== this.lastSource) {
      this.lastSource = source;
      this.sourceChangedAtMs = nowMs;
    }
    const tau = nowMs - this.sourceChangedAtMs < SOURCE_BLEND_MS ? SOURCE_BLEND_MS : source === "head" ? HEAD_TAU_MS : COURSE_TAU_MS;
    if (this.smoothed === null) {
      this.smoothed = target;
    } else {
      const dt = Math.max(0, nowMs - this.smoothedAtMs);
      this.smoothed = wrap360(this.smoothed + angleDelta(this.smoothed, target) * (1 - Math.exp(-dt / tau)));
    }
    this.smoothedAtMs = nowMs;
    return {
      bearingDeg: this.smoothed,
      source,
      showChevron: source === "head" || source === "course",
      compassPoor: this.mode === "walking" && this.unusableSinceMs !== null && nowMs - this.unusableSinceMs >= COMPASS_POOR_MS,
    };
  }

  private markHeadUnusable(nowMs: number): void {
    if (this.headUsable || this.unusableSinceMs === null) this.unusableSinceMs = nowMs;
    this.headUsable = false;
  }

  private meetsEntry(fix: CourseFix): boolean {
    if (this.mode === "walking") {
      return fix.speed >= 1.2 && (fix.accuracyM === null || fix.accuracyM <= 10) && (fix.bearingAccuracyDeg === null || fix.bearingAccuracyDeg <= 20);
    }
    if (fix.bearingAccuracyDeg === null) return fix.speed >= 4 && (fix.accuracyM === null || fix.accuracyM <= 15);
    return fix.speed >= 3 && (fix.accuracyM === null || fix.accuracyM <= 20) && fix.bearingAccuracyDeg <= 20;
  }

  private meetsHold(fix: CourseFix): boolean {
    if (this.mode === "walking") return fix.speed >= 0.8 && (fix.bearingAccuracyDeg === null || fix.bearingAccuracyDeg <= 30);
    return fix.speed >= 1.5 && (fix.bearingAccuracyDeg === null || fix.bearingAccuracyDeg <= 30);
  }
}
