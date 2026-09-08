export type PublicAttendanceEvent = "check_in" | "break_out" | "break_in" | "check_out";

export type PresenceChallengeCode =
  | "blink_twice"
  | "mouth_open"
  | "brow_raise"
  | "nose_sneer";

export type FaceLivenessEvidence = {
  engine: "mediapipe_face_landmarker";
  engineVersion: "1.0.1";
  challenge: PresenceChallengeCode;
  durationMs: number;
  processedFrames: number;
  singleFaceFrames: number;
  validFrames: number;
  transitions: number;
  peakScore: number;
  completedAt: string;
};

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
