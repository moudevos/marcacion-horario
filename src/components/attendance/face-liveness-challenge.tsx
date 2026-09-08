"use client";

import { Camera, CheckCircle2, Loader2, RefreshCcw, ScanFace } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FaceLivenessEvidence, PresenceChallengeCode } from "@/types/public-attendance";

const MEDIAPIPE_VERSION = "1.0.1" as const;
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const FRAME_INTERVAL_MS = 65;
const MAX_CHALLENGE_MS = 20_000;
const BENIGN_MEDIAPIPE_LOGS = ["INFO: Created TensorFlow Lite XNNPACK delegate for CPU."] as const;

type Props = {
  challenge: PresenceChallengeCode;
  label: string;
  onVerified: (evidence: FaceLivenessEvidence) => void;
};

type BlendshapeCategory = {
  categoryName?: string;
  score?: number;
};

type FaceLandmarkerResultLike = {
  faceLandmarks?: unknown[][];
  faceBlendshapes?: Array<{ categories?: BlendshapeCategory[] }>;
};

type FaceLandmarkerLike = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => FaceLandmarkerResultLike;
  close: () => void;
};

type Metrics = {
  startedAt: number;
  processedFrames: number;
  singleFaceFrames: number;
  validFrames: number;
  transitions: number;
  peakScore: number;
  neutralFrames: number;
  activeFrames: number;
  armed: boolean;
  actionActive: boolean;
};

type DetectorState = "loading" | "camera" | "ready" | "no_face" | "multiple_faces" | "verified" | "error";

function isBenignMediapipeLog(args: unknown[]) {
  const text = args
    .map((value) => (typeof value === "string" ? value : ""))
    .filter(Boolean)
    .join(" ");

  return BENIGN_MEDIAPIPE_LOGS.some((message) => text.includes(message));
}

function installMediapipeConsoleFilter() {
  const originalError = console.error;
  const originalWarn = console.warn;

  const filteredError = (...args: unknown[]) => {
    if (isBenignMediapipeLog(args)) return;
    originalError(...args);
  };

  const filteredWarn = (...args: unknown[]) => {
    if (isBenignMediapipeLog(args)) return;
    originalWarn(...args);
  };

  console.error = filteredError;
  console.warn = filteredWarn;

  return () => {
    if (console.error === filteredError) console.error = originalError;
    if (console.warn === filteredWarn) console.warn = originalWarn;
  };
}

function freshMetrics(now = performance.now()): Metrics {
  return {
    startedAt: now,
    processedFrames: 0,
    singleFaceFrames: 0,
    validFrames: 0,
    transitions: 0,
    peakScore: 0,
    neutralFrames: 0,
    activeFrames: 0,
    armed: false,
    actionActive: false,
  };
}

function score(categories: BlendshapeCategory[], name: string) {
  return categories.find((category) => category.categoryName === name)?.score ?? 0;
}

function signalForChallenge(challenge: PresenceChallengeCode, categories: BlendshapeCategory[]) {
  if (challenge === "blink_twice") {
    const value = Math.min(score(categories, "eyeBlinkLeft"), score(categories, "eyeBlinkRight"));
    return { value, neutral: value < 0.18, active: value > 0.5, requiredTransitions: 2, requiredActiveFrames: 1 };
  }

  if (challenge === "mouth_open") {
    const value = score(categories, "jawOpen");
    return { value, neutral: value < 0.12, active: value > 0.5, requiredTransitions: 1, requiredActiveFrames: 4 };
  }

  if (challenge === "brow_raise") {
    const value = (
      score(categories, "browInnerUp") +
      score(categories, "browOuterUpLeft") +
      score(categories, "browOuterUpRight")
    ) / 3;
    return { value, neutral: value < 0.14, active: value > 0.34, requiredTransitions: 1, requiredActiveFrames: 4 };
  }

  const value = Math.max(score(categories, "noseSneerLeft"), score(categories, "noseSneerRight"));
  return { value, neutral: value < 0.1, active: value > 0.32, requiredTransitions: 1, requiredActiveFrames: 4 };
}

export function FaceLivenessChallenge({ challenge, label, onVerified }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onVerifiedRef = useRef(onVerified);
  const [attempt, setAttempt] = useState(0);
  const [detectorState, setDetectorState] = useState<DetectorState>("loading");
  const [message, setMessage] = useState("Cargando detector facial...");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let faceLandmarker: FaceLandmarkerLike | null = null;
    let animationFrame = 0;
    let lastProcessedAt = 0;
    let metrics = freshMetrics();
    let completed = false;
    const restoreMediapipeConsole = installMediapipeConsoleFilter();

    function stopResources() {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      stream?.getTracks().forEach((track) => track.stop());
      faceLandmarker?.close();
    }

    function failDetector(error: unknown) {
      if (completed || cancelled) return;
      completed = true;
      stopResources();
      restoreMediapipeConsole();
      setDetectorState("error");
      setMessage(error instanceof Error ? error.message : "El detector facial no pudo procesar el video. Intenta nuevamente.");
    }

    function resetSequence(reason: DetectorState, text: string) {
      metrics = freshMetrics();
      setProgress(0);
      setDetectorState(reason);
      setMessage(text);
    }

    function completeChallenge(now: number) {
      if (completed) return;
      completed = true;
      setDetectorState("verified");
      setMessage("Prueba de vida facial completada.");
      setProgress(100);

      const evidence: FaceLivenessEvidence = {
        engine: "mediapipe_face_landmarker",
        engineVersion: MEDIAPIPE_VERSION,
        challenge,
        durationMs: Math.round(now - metrics.startedAt),
        processedFrames: metrics.processedFrames,
        singleFaceFrames: metrics.singleFaceFrames,
        validFrames: metrics.validFrames,
        transitions: metrics.transitions,
        peakScore: Number(metrics.peakScore.toFixed(4)),
        completedAt: new Date().toISOString(),
      };

      onVerifiedRef.current(evidence);
      stopResources();
      restoreMediapipeConsole();
    }

    function processResult(result: FaceLandmarkerResultLike, now: number) {
      const faceCount = result.faceLandmarks?.length ?? 0;
      if (faceCount === 0) {
        resetSequence("no_face", "Coloca un solo rostro frente a la cámara.");
        return;
      }
      if (faceCount !== 1) {
        resetSequence("multiple_faces", "Debe aparecer exactamente una persona frente a la cámara.");
        return;
      }

      const categories = result.faceBlendshapes?.[0]?.categories ?? [];
      if (categories.length === 0) {
        resetSequence("ready", "Mantén el rostro centrado y bien iluminado.");
        return;
      }

      metrics.processedFrames += 1;
      metrics.singleFaceFrames += 1;
      const signal = signalForChallenge(challenge, categories);
      metrics.peakScore = Math.max(metrics.peakScore, signal.value);

      if (now - metrics.startedAt > MAX_CHALLENGE_MS) {
        resetSequence("ready", "El reto se reinició. Mira al frente y vuelve a intentarlo.");
        return;
      }

      if (signal.neutral) {
        metrics.neutralFrames += 1;
        metrics.activeFrames = 0;
        metrics.actionActive = false;
        if (metrics.neutralFrames >= 3) metrics.armed = true;
        setDetectorState("ready");
        setMessage(metrics.transitions > 0 && challenge === "blink_twice" ? "Primer parpadeo detectado. Hazlo una vez más." : label);
        return;
      }

      if (!signal.active || !metrics.armed) {
        metrics.activeFrames = 0;
        setDetectorState("ready");
        setMessage("Primero mira al frente de forma natural y luego realiza el gesto solicitado.");
        return;
      }

      metrics.activeFrames += 1;
      metrics.validFrames += 1;

      if (challenge === "blink_twice") {
        if (!metrics.actionActive) {
          metrics.transitions += 1;
          metrics.actionActive = true;
          metrics.armed = false;
          metrics.neutralFrames = 0;
        }
        setProgress(Math.min(100, metrics.transitions * 50));
        if (metrics.transitions >= signal.requiredTransitions) completeChallenge(now);
        return;
      }

      const ratio = Math.min(1, metrics.activeFrames / signal.requiredActiveFrames);
      setProgress(Math.round(ratio * 100));
      if (metrics.activeFrames >= signal.requiredActiveFrames) {
        metrics.transitions = 1;
        completeChallenge(now);
      }
    }

    async function initialize() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Este dispositivo no ofrece acceso compatible a la cámara.");
        }

        setDetectorState("loading");
        setMessage("Cargando detector facial...");

        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        if (cancelled) return;

        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
        if (cancelled) return;

        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL },
          runningMode: "VIDEO",
          numFaces: 2,
          minFaceDetectionConfidence: 0.65,
          minFacePresenceConfidence: 0.65,
          minTrackingConfidence: 0.65,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        }) as FaceLandmarkerLike;

        if (cancelled) {
          faceLandmarker.close();
          return;
        }

        setDetectorState("camera");
        setMessage("Solicitando acceso a la cámara...");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) throw new Error("No se pudo inicializar la vista de cámara.");
        video.srcObject = stream;
        await video.play();

        setDetectorState("ready");
        setMessage(label);
        metrics = freshMetrics();

        const tick = () => {
          if (cancelled || completed || !faceLandmarker || !videoRef.current) return;
          const now = performance.now();

          if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastProcessedAt >= FRAME_INTERVAL_MS) {
            lastProcessedAt = now;

            try {
              const result = faceLandmarker.detectForVideo(videoRef.current, now);
              processResult(result, now);
            } catch (error) {
              failDetector(error);
              return;
            }
          }

          animationFrame = requestAnimationFrame(tick);
        };

        animationFrame = requestAnimationFrame(tick);
      } catch (error) {
        if (cancelled) return;
        failDetector(error);
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      stopResources();
      restoreMediapipeConsole();
    };
  }, [attempt, challenge, label]);

  const verified = detectorState === "verified";

  return (
    <section className={`rounded-2xl border p-4 ${verified ? "border-emerald-200 bg-emerald-50" : "border-violet-200 bg-violet-50"}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-xl p-2 ${verified ? "bg-emerald-100 text-emerald-700" : "bg-white text-violet-700"}`}>
          {verified ? <CheckCircle2 className="h-5 w-5" /> : <ScanFace className="h-5 w-5" />}
        </div>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${verified ? "text-emerald-700" : "text-violet-700"}`}>Prueba de vida facial</p>
          <p className={`mt-1 text-sm font-semibold leading-6 ${verified ? "text-emerald-950" : "text-violet-950"}`}>{message}</p>
        </div>
      </div>

      <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-2xl bg-slate-950">
        <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        {(detectorState === "loading" || detectorState === "camera") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-white">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="mt-3 text-sm">Preparando cámara y modelo facial...</p>
          </div>
        )}
        {detectorState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 p-5 text-center text-white">
            <Camera className="h-7 w-7" />
            <p className="mt-3 text-sm leading-6">{message}</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950">
              <RefreshCcw className="h-4 w-4" /> Reintentar
            </button>
          </div>
        )}
        {!verified && detectorState !== "error" && (
          <div className="pointer-events-none absolute inset-x-6 top-6 bottom-6 rounded-[45%] border-2 border-dashed border-white/60" />
        )}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-violet-100">
        <div className={`h-full transition-all ${verified ? "bg-emerald-500" : "bg-violet-600"}`} style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        El análisis se realiza en el navegador con MediaPipe Face Landmarker. No se guarda ni se envía una fotografía o video del rostro.
      </p>
    </section>
  );
}
