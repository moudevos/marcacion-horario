"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Camera,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  RefreshCcw,
  ScanLine,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import Swal from "sweetalert2";
import { z } from "zod";
import type {
  PublicAttendanceRegisterResult,
  PublicAttendanceSessionResponse,
} from "@/types/public-attendance";

const attendanceSchema = z.object({
  dni: z.string().regex(/^\d{8}$/, "El DNI debe contener exactamente 8 dígitos"),
});

type AttendanceInput = z.infer<typeof attendanceSchema>;

type Coordinates = {
  latitude: number;
  longitude: number;
} | null;

const POSITION_LABELS: Record<string, string> = {
  zonal: "Zonal",
  supervisor: "Supervisor",
  visualizador: "Visualizador",
  promotor: "Promotor",
  rh: "RH",
};

function getCoordinates(): Promise<Coordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

export function AttendanceForm() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [session, setSession] = useState<PublicAttendanceSessionResponse | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [result, setResult] = useState<PublicAttendanceRegisterResult | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AttendanceInput>({ resolver: zodResolver(attendanceSchema) });

  useEffect(() => {
    if (!session || result) return;
    let cancelled = false;

    async function startCamera() {
      try {
        setCameraError(null);
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Este dispositivo o navegador no permite usar la cámara");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : "No se pudo iniciar la cámara");
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [session, result]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function onSubmit(values: AttendanceInput) {
    setResult(null);
    setCapturedPhoto(null);
    setPreviewUrl(null);

    const response = await fetch("/api/marcacion/iniciar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dni: values.dni }),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      message?: string;
      session?: PublicAttendanceSessionResponse;
    };

    if (!response.ok || !payload.ok || !payload.session) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo iniciar",
        text: payload.message ?? "Verifica tus datos e intenta nuevamente.",
      });
      return;
    }

    setSession(payload.session);
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      void Swal.fire({ icon: "warning", title: "Cámara no disponible", text: "Espera a que la cámara termine de iniciar." });
      return;
    }

    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    const targetWidth = Math.min(720, sourceWidth);
    const targetHeight = Math.round((sourceHeight / sourceWidth) * targetWidth);
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, targetWidth, targetHeight);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setCapturedPhoto(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.86,
    );
  }

  async function registerMark() {
    if (!session || !capturedPhoto || isRegistering) return;
    setIsRegistering(true);

    try {
      const coordinates = await getCoordinates();
      const formData = new FormData();
      formData.append("token", session.token);
      formData.append("photo", capturedPhoto, "evidencia.jpg");
      if (coordinates) {
        formData.append("latitude", String(coordinates.latitude));
        formData.append("longitude", String(coordinates.longitude));
      }

      const response = await fetch("/api/marcacion/registrar", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as PublicAttendanceRegisterResult;

      if (!response.ok || !payload.ok) {
        await Swal.fire({
          icon: "error",
          title: "No se pudo registrar",
          text: payload.message ?? "Inicia nuevamente el proceso de marcación.",
        });
        return;
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setResult(payload);
    } finally {
      setIsRegistering(false);
    }
  }

  function startAgain() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedPhoto(null);
    setSession(null);
    setResult(null);
    setCameraError(null);
    reset();
  }

  if (result && session) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-emerald-700">Marcación registrada</p>
          <h2 className="mt-1 text-2xl font-bold text-emerald-950">{result.eventLabel}</h2>
          <p className="mt-2 text-sm text-emerald-800">{session.employee.fullName}</p>
          {result.occurredAt && (
            <p className="mt-1 text-sm text-emerald-700">
              {new Intl.DateTimeFormat("es-PE", {
                timeZone: "America/Lima",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }).format(new Date(result.occurredAt))}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={startAgain}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
        >
          <RefreshCcw className="h-4 w-4" />
          Nueva marcación
        </button>
      </div>
    );
  }

  if (session) {
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white p-2 text-blue-700"><UserRound className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="font-bold text-slate-950">{session.employee.fullName}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {session.employee.position ? POSITION_LABELS[session.employee.position] ?? session.employee.position : "Trabajador"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <Info icon={Store} label="Tienda" value={`${session.store.code} · ${session.store.name}`} />
            <Info icon={Clock3} label="Horario" value={`${session.schedule.startTime} – ${session.schedule.endTime}`} />
          </div>

          <div className="mt-4 rounded-xl bg-blue-700 p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">Próxima acción</p>
            <p className="mt-1 text-xl font-bold">{session.nextEventLabel}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Reto de presencia</p>
          <p className="mt-2 font-semibold leading-6 text-amber-950">{session.challenge.label}</p>
          <p className="mt-2 text-xs leading-5 text-amber-800">
            Realiza la acción y luego captura la evidencia. El sistema no compara rostros ni crea una plantilla biométrica automática.
          </p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
          <div className="relative aspect-[4/3] w-full bg-black">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Evidencia capturada" className="h-full w-full object-cover" />
            ) : (
              <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
            )}
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950 p-6 text-center text-sm text-white">
                {cameraError}. Habilita el permiso de cámara y vuelve a iniciar.
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <div className="grid gap-2 bg-white p-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={previewUrl ? () => { setCapturedPhoto(null); URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } : capturePhoto}
              disabled={Boolean(cameraError) || isRegistering}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {previewUrl ? <RefreshCcw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {previewUrl ? "Repetir foto" : "Capturar evidencia"}
            </button>
            <button
              type="button"
              onClick={registerMark}
              disabled={!capturedPhoto || isRegistering}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRegistering ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              Registrar {session.nextEventLabel}
            </button>
          </div>
        </section>

        <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          Al confirmar se intentará adjuntar la ubicación del dispositivo como evidencia adicional. La foto se almacena en un bucket privado.
        </div>

        <button type="button" onClick={startAgain} disabled={isRegistering} className="w-full text-sm font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50">
          Cancelar y volver al DNI
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="dni">
          DNI
        </label>
        <input
          id="dni"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          placeholder="00000000"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg tracking-widest text-slate-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          {...register("dni")}
        />
        {errors.dni && <p className="mt-1 text-xs text-red-600">{errors.dni.message}</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
        Continuar
      </button>

      <div className="flex gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <p>El DNI se valida únicamente en servidor. Los intentos se limitan para reducir enumeración y abuso de esta página pública.</p>
      </div>
    </form>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Store; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
