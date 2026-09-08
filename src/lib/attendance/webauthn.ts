import "server-only";

import { createHash, randomInt } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPublicValue } from "@/lib/attendance/public-engine";

const RP_NAME = "Sistema de Marcación";

function configFromRequest(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || "localhost:3000";
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return {
    rpID: host.split(":")[0]!,
    origin: `${protocol}://${host}`,
  };
}

function hashEnrollmentCode(code: string) {
  const pepper = process.env.SUPABASE_SECRET_KEY ?? "passkey-enrollment";
  return createHash("sha256").update(`${pepper}|${code}`).digest("hex");
}

export function generateEnrollmentCode() {
  return String(randomInt(0, 100_000_000)).padStart(8, "0");
}

export async function createPasskeyEnrollment(input: {
  employeeId: string;
  actorId: string;
}) {
  const admin = createAdminClient();
  const code = generateEnrollmentCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await admin
    .from("passkey_enrollment_tokens")
    .delete()
    .eq("employee_id", input.employeeId)
    .is("used_at", null);

  const { error } = await admin.from("passkey_enrollment_tokens").insert({
    employee_id: input.employeeId,
    code_hash: hashEnrollmentCode(code),
    created_by: input.actorId,
    expires_at: expiresAt,
  });

  if (error) throw new Error(error.message);
  return { code, expiresAt };
}

async function resolveEmployeeByDni(dni: string) {
  const admin = createAdminClient();
  const { data: identifier, error } = await admin
    .from("employee_identifiers")
    .select("profile_id")
    .eq("dni", dni)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!identifier?.profile_id) throw new Error("No se pudo validar el enrolamiento");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, active")
    .eq("id", identifier.profile_id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.active) throw new Error("No se pudo validar el enrolamiento");
  return profile;
}

async function getValidEnrollment(employeeId: string, code: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("passkey_enrollment_tokens")
    .select("id, employee_id, registration_challenge, expires_at, used_at")
    .eq("employee_id", employeeId)
    .eq("code_hash", hashEnrollmentCode(code))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("El código de enrolamiento es inválido o expiró");
  return data;
}

export async function generatePasskeyRegistrationOptions(input: {
  request: Request;
  dni: string;
  enrollmentCode: string;
}) {
  const admin = createAdminClient();
  const employee = await resolveEmployeeByDni(input.dni);
  const enrollment = await getValidEnrollment(employee.id, input.enrollmentCode);
  const { rpID } = configFromRequest(input.request);

  const { data: existing, error: existingError } = await admin
    .from("employee_passkeys")
    .select("credential_id, transports")
    .eq("employee_id", employee.id)
    .is("revoked_at", null);

  if (existingError) throw new Error(existingError.message);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(employee.id),
    userName: employee.id,
    userDisplayName: employee.full_name || "Trabajador",
    attestationType: "none",
    supportedAlgorithmIDs: [-7, -257],
    excludeCredentials: (existing ?? []).map((credential) => ({
      id: credential.credential_id,
      transports: (credential.transports ?? []) as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
  });

  const { error: challengeError } = await admin
    .from("passkey_enrollment_tokens")
    .update({ registration_challenge: options.challenge })
    .eq("id", enrollment.id);

  if (challengeError) throw new Error(challengeError.message);
  return options;
}

export async function verifyPasskeyRegistration(input: {
  request: Request;
  dni: string;
  enrollmentCode: string;
  response: RegistrationResponseJSON;
}) {
  const admin = createAdminClient();
  const employee = await resolveEmployeeByDni(input.dni);
  const enrollment = await getValidEnrollment(employee.id, input.enrollmentCode);
  if (!enrollment.registration_challenge) throw new Error("El enrolamiento no tiene un reto activo");

  const { rpID, origin } = configFromRequest(input.request);
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: enrollment.registration_challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("No se pudo validar la credencial del dispositivo");
  }

  const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo;
  const transports = input.response.response.transports ?? [];

  const { error: insertError } = await admin.from("employee_passkeys").insert({
    employee_id: employee.id,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports,
    device_type: credentialDeviceType,
    backed_up: credentialBackedUp,
    webauthn_user_id: employee.id,
  });

  if (insertError) throw new Error(insertError.message);

  const { error: tokenError } = await admin
    .from("passkey_enrollment_tokens")
    .update({ used_at: new Date().toISOString(), registration_challenge: null })
    .eq("id", enrollment.id);

  if (tokenError) throw new Error(tokenError.message);
  return { verified: true };
}

async function getMarkingSession(token: string) {
  const admin = createAdminClient();
  const tokenHash = hashPublicValue(token);
  const { data, error } = await admin
    .from("attendance_marking_sessions")
    .select("id, employee_id, webauthn_challenge, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.used_at || new Date(data.expires_at).getTime() <= Date.now()) {
    throw new Error("La sesión de marcación expiró. Inicia nuevamente.");
  }
  return { ...data, tokenHash };
}

export async function generatePasskeyAuthenticationOptions(input: {
  request: Request;
  token: string;
}) {
  const admin = createAdminClient();
  const session = await getMarkingSession(input.token);
  const { data: credentials, error } = await admin
    .from("employee_passkeys")
    .select("credential_id, transports")
    .eq("employee_id", session.employee_id)
    .is("revoked_at", null);

  if (error) throw new Error(error.message);
  if (!credentials || credentials.length === 0) {
    throw new Error("El trabajador aún no tiene una Passkey enrolada");
  }

  const { rpID } = configFromRequest(input.request);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: credentials.map((credential) => ({
      id: credential.credential_id,
      transports: (credential.transports ?? []) as AuthenticatorTransportFuture[],
    })),
  });

  const { error: updateError } = await admin
    .from("attendance_marking_sessions")
    .update({ webauthn_challenge: options.challenge })
    .eq("id", session.id);

  if (updateError) throw new Error(updateError.message);
  return options;
}

export async function verifyPasskeyAuthentication(input: {
  request: Request;
  token: string;
  response: AuthenticationResponseJSON;
}) {
  const admin = createAdminClient();
  const session = await getMarkingSession(input.token);
  if (!session.webauthn_challenge) throw new Error("No existe un reto WebAuthn activo");

  const { data: stored, error } = await admin
    .from("employee_passkeys")
    .select("id, credential_id, public_key, counter, transports")
    .eq("employee_id", session.employee_id)
    .eq("credential_id", input.response.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!stored) throw new Error("La credencial presentada no pertenece al trabajador");

  const credential: WebAuthnCredential = {
    id: stored.credential_id,
    publicKey: new Uint8Array(Buffer.from(stored.public_key, "base64url")),
    counter: Number(stored.counter),
    transports: (stored.transports ?? []) as AuthenticatorTransportFuture[],
  };

  const { rpID, origin } = configFromRequest(input.request);
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: session.webauthn_challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential,
    requireUserVerification: true,
  });

  if (!verification.verified) throw new Error("No se pudo validar la Passkey");

  const now = new Date().toISOString();
  const [{ error: credentialError }, { error: sessionError }] = await Promise.all([
    admin
      .from("employee_passkeys")
      .update({ counter: verification.authenticationInfo.newCounter, last_used_at: now, updated_at: now })
      .eq("id", stored.id),
    admin
      .from("attendance_marking_sessions")
      .update({
        passkey_verified_at: now,
        passkey_credential_id: stored.credential_id,
        webauthn_challenge: null,
      })
      .eq("id", session.id),
  ]);

  if (credentialError) throw new Error(credentialError.message);
  if (sessionError) throw new Error(sessionError.message);
  return { verified: true };
}
