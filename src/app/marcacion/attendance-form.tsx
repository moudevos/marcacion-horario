"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  CheckCircle2,
  Clock3,
  Fingerprint,
  KeyRound,
  Loader2,
  MapPin,
  RefreshCcw,
  ScanLine,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import Swal from "sweetalert2";
import { z } from "zod";
import { FaceLivenessChallenge } from "@/components/attendance/face-liveness-challenge";
import type {
  FaceLivenessEvidence,
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
};

const POSITION_LABELS: Record<string, string> = {
  zonal: "Zonal",
  supervisor: "Supervisor",
  visualizador: "Visualizador",
  promotor: "Promotor",
  rh: "RH",
};

function getCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este dispositivo no permite obtener ubicación"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => reject(new Error("Debes permitir la ubicación para registrar asistencia")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  });
}

export function AttendanceForm() {
  const [session, setSession] = useState<PublicAttendanceSessionResponse | null>(null);
  const [dni, setDni] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [passkeyVerified, setPasskeyVerified] = useState(false);
  const [livenessEvidence, setLivenessEvidence] = useState<FaceLivenessEvidence | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [result, setResult] = useState<PublicAttendanceRegisterResult | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AttendanceInput>({ resolver: zodResolver(attendanceSchema) });

  const handleLivenessVerified = useCallback((evidence: FaceLivenessEvidence) => {
    setLivenessEvidence(evidence);
  }, []);

  async function onSubmit(values: AttendanceInput) {
    setResult(null);
    setPasskeyVerified(false);
    setLivenessEvidence(null);
    setDni(values.dni);

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

  async function enrollPasskey() {
    if (!session || !/^\d{8}$/.test(enrollmentCode) || isWorking) return;
    setIsWorking(true);

    try {
      const optionsResponse = await fetch("/api/marcacion/passkey/registro-opciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dni, enrollmentCode }),
      });
      const optionsPayload = await optionsResponse.json() as { ok: boolean; message?: string; options?: Parameters<typeof startRegistration>[0]["optionsJSON"] };
      if (!optionsResponse.ok || !optionsPayload.ok || !optionsPayload.options) {
        throw new Error(optionsPayload.message ?? "No se pudo iniciar el enrolamiento");
      }

      const credential = await startRegistration({ optionsJSON: optionsPayload.options });
      const verifyResponse = await fetch("/api/marcacion/passkey/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dni, enrollmentCode, response: credential }),
      });
      const verifyPayload = await verifyResponse.json() as { ok: boolean; message?: string };
      if (!verifyResponse.ok || !verifyPayload.ok) {
        throw new Error(verifyPayload.message ?? "No se pudo guardar la Passkey");
      }

      await Swal.fire({
        icon: "success",
        title: "Dispositivo activado",
        text: "La credencial quedó asociada sin crear una contraseña del sistema. Inicia nuevamente la marcación para validarla.",
      });
      startAgain();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo activar",
        text: error instanceof Error ? error.message : "Error al registrar la Passkey",
      });
    } finally {
      setIsWorking(false);
    }
  }

  async function validatePasskey() {
    if (!session || isWorking) return;
    setIsWorking(true);

    try {
      const optionsResponse = await fetch("/api/marcacion/passkey/autenticacion-opciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: session.token }),
      });
      const optionsPayload = await optionsResponse.json() as { ok: boolean; message?: string; options?: Parameters<typeof startAuthentication>[0]["optionsJSON"] };
      if (!optionsResponse.ok || !optionsPayload.ok || !optionsPayload.options) {
        throw new Error(optionsPayload.message ?? "No se pudo iniciar la validación del dispositivo");
      }

      const credential = await startAuthentication({ optionsJSON: optionsPayload.options });
      const verifyResponse = await fetch("/api/marcacion/passkey/autenticar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: session.token, response: credential }),
      });
      const verifyPayload = await verifyResponse.json() as { ok: boolean; message?: string };
      if (!verifyResponse.ok || !verifyPayload.ok) {
        throw new Error(verifyPayload.message ?? "No se pudo validar la Passkey");
      }

      setPasskeyVerified(true);
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Validación fallida",
        text: error instanceof Error ? error.message : "No se pudo validar el dispositivo",
      });
    } finally {
      setIsWorking(false);
    }
  }

  async function registerMark() {
    if (!session || !passkeyVerified || !livenessEvidence || isWorking) return;
    setIsWorking(true);

    try {
      const coordinates = await getCoordinates();
      const response = await fetch("/api/marcacion/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: session.token,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          liveness: livenessEvidence,
        }),
      });
      const payload = await response.json() as PublicAttendanceRegisterResult;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "No se pudo registrar la asistencia");
      }

      setResult(payload);
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo registrar",
        text: error instanceof Error ? error.message : "Inicia nuevamente el proceso de marcación.",
      });
    } finally {
      setIsWorking(false);
    }
  }

  function startAgain() {
    setSession(null);
    setResult(null);
    setEnrollmentCode("");
    setPasskeyVerified(false);
    setLivenessEvidence(null);
    setDni("");
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
          {typeof result.distanceMeters === "number" && (
            <p className="mt-1 text-xs text-emerald-700">Ubicación validada a {Math.round(result.distanceMeters)} m de la tienda</p>
          )}
        </div>

        <button type="button" onClick={startAgain} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white hover:bg-slate-800">
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
              <p className="mt-0.5 text-xs text-slate-600">{session.employee.position ? POSITION_LABELS[session.employee.position] ?? session.employee.position : "Trabajador"}</p>
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

        {!session.passkeyConfigured ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-amber-900">
              <KeyRound className="h-5 w-5" />
              <h2 className="font-bold">Activar marcación en este dispositivo</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              Solicita al Supervisor/Admin un código temporal desde Marcaciones. No crearás una contraseña del sistema; el dispositivo registrará una Passkey protegida por su autenticador local.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                value={enrollmentCode}
                onChange={(event) => setEnrollmentCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric"
                placeholder="Código de 8 dígitos"
                className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm tracking-widest outline-none focus:border-amber-500"
              />
              <button type="button" onClick={enrollPasskey} disabled={!/^\d{8}$/.test(enrollmentCode) || isWorking} className="rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                Activar
              </button>
            </div>
          </section>
        ) : (
          <section className={`rounded-2xl border p-4 ${passkeyVerified ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center gap-2">
              <Fingerprint className={`h-5 w-5 ${passkeyVerified ? "text-emerald-700" : "text-blue-700"}`} />
              <h2 className="font-bold text-slate-950">Validación de identidad</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {passkeyVerified ? "Identidad del dispositivo validada correctamente." : "Usa la credencial registrada. El dispositivo puede solicitar huella, Face ID, Windows Hello o PIN local; no es una contraseña del sistema."}
            </p>
            {!passkeyVerified && (
              <button type="button" onClick={validatePasskey} disabled={isWorking} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                Verificar identidad
              </button>
            )}
          </section>
        )}

        {session.passkeyConfigured && passkeyVerified && (
          <FaceLivenessChallenge
            challenge={session.challenge.code}
            label={session.challenge.label}
            onVerified={handleLivenessVerified}
          />
        )}

        {session.passkeyConfigured && passkeyVerified && livenessEvidence && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div>
                <p className="font-bold text-slate-950">Validación de ubicación</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Al confirmar se solicitará GPS preciso. La marcación debe estar dentro de {session.store.attendanceRadiusMeters} m del punto configurado para la tienda.
                </p>
              </div>
            </div>
            <button type="button" onClick={registerMark} disabled={isWorking} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              {isWorking ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
              Confirmar {session.nextEventLabel}
            </button>
          </section>
        )}

        <button type="button" onClick={startAgain} disabled={isWorking} className="w-full text-sm font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50">
          Cancelar y volver al DNI
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="dni">DNI</label>
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

      <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
        Continuar
      </button>

      <div className="flex gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <p>DNI, horario, fecha, identidad, prueba de vida facial y geocerca se validan antes de escribir la asistencia.</p>
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
