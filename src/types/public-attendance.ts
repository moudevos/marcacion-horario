export type PublicAttendanceEvent = "check_in" | "break_out" | "break_in" | "check_out";

export type PresenceChallengeCode = "hold_2s" | "tap_3" | "type_code";

export type PublicAttendanceSessionResponse = {
  token: string;
  expiresAt: string;
  employee: {
    fullName: string;
    position: string | null;
  };
  store: {
    code: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
    attendanceRadiusMeters: number;
  };
  schedule: {
    startTime: string;
    endTime: string;
    breakMinutes: number;
  };
  passkeyConfigured: boolean;
  nextEvent: PublicAttendanceEvent;
  nextEventLabel: string;
  challenge: {
    code: PresenceChallengeCode;
    label: string;
    publicValue?: string;
  };
};

export type PublicAttendanceRegisterResult = {
  ok: boolean;
  message: string;
  event?: PublicAttendanceEvent;
  eventLabel?: string;
  occurredAt?: string;
  attendanceStatus?: string | null;
  distanceMeters?: number | null;
};
