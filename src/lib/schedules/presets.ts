import type { ScheduleDraftCell, ScheduleMode } from "@/types/schedules";

export const SHIFT_PRESETS = {
  A: { label: "Apertura", startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
  C: { label: "Cierre", startTime: "15:00", endTime: "22:00", breakMinutes: 0 },
  AC: { label: "Apertura / cierre", startTime: "09:00", endTime: "22:00", breakMinutes: 120 },
} as const;

export function createCellForMode(mode: ScheduleMode, current?: ScheduleDraftCell): ScheduleDraftCell {
  if (mode === "OFF") {
    return { mode, startTime: "", endTime: "", breakMinutes: 0, toleranceMinutes: current?.toleranceMinutes ?? 0 };
  }

  if (mode === "CUSTOM") {
    return {
      mode,
      startTime: current?.startTime || "09:00",
      endTime: current?.endTime || "17:00",
      breakMinutes: current?.breakMinutes ?? 60,
      toleranceMinutes: current?.toleranceMinutes ?? 0,
    };
  }

  const preset = SHIFT_PRESETS[mode];
  return {
    mode,
    startTime: preset.startTime,
    endTime: preset.endTime,
    breakMinutes: preset.breakMinutes,
    toleranceMinutes: current?.toleranceMinutes ?? 0,
  };
}
