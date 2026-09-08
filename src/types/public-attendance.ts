export type PublicAttendanceEvent = "check_in" | "break_out" | "break_in" | "check_out";

export type PresenceChallengeCode = "turn_left" | "turn_right" | "hand_open" | "two_fingers";

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
    latitude: number | null;
    longitude: number | null;
  };
  schedule: {
    startTime: string;
    endTime: string;
    breakMinutes: number;
  };
  nextEvent: PublicAttendanceEvent;
  nextEventLabel: string;
  challenge: {
    code: PresenceChallengeCode;
    label: string;
  };
};

export type PublicAttendanceRegisterResult = {
  ok: boolean;
  message: string;
  event?: PublicAttendanceEvent;
  eventLabel?: string;
  occurredAt?: string;
  attendanceStatus?: string | null;
};
