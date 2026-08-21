import { apiPost } from './client';
import type { Monitor } from '@/types';

/**
 * ONVIF discovery — the legacy "SCAN NETWORK" / `?view=onvifprobe` flow.
 * Three calls: a WS-Discovery multicast probe lists candidates, an inspect
 * of one candidate's device-service URL returns its identity and media
 * profiles with resolved stream URIs, and {@link onboardCamera} turns a
 * profile straight into a monitor server-side.
 */

/** One camera that answered the WS-Discovery probe. */
export interface CameraCandidate {
  /** Usually a `urn:uuid:…`; may be empty. */
  endpoint_reference: string;
  /** ONVIF service URLs; the first is the natural inspect target. */
  xaddrs: string[];
  types: string[];
  name?: string | null;
  hardware?: string | null;
  location?: string | null;
  /** Id of the monitor already watching this device, matched by ONVIF URL /
   *  RTSP host. `null` ⇒ a new camera worth offering to add. */
  monitor_id?: number | null;
}

export interface InspectProfile {
  token: string;
  name?: string | null;
  encoding?: string | null;
  width?: number | null;
  height?: number | null;
  /** `null` when the device refused `GetStreamUri` for this profile. */
  stream_uri?: string | null;
}

export interface InspectResult {
  device_service: string;
  media_service?: string | null;
  events_service?: string | null;
  ptz_service?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  firmware_version?: string | null;
  serial_number?: string | null;
  hardware_id?: string | null;
  profiles: InspectProfile[];
  /** Id of an existing monitor for this device, if already onboarded. */
  monitor_id?: number | null;
}

export interface InspectRequest {
  xaddr: string;
  /** Empty string queries the device unauthenticated. */
  username: string;
  password: string;
}

/** Run a multicast probe and wait `timeoutMs` for answers. Read-only on the network. */
export async function probeCameras(timeoutMs: number): Promise<CameraCandidate[]> {
  return apiPost<{ timeout_ms: number }, CameraCandidate[]>('/discovery/probe', { timeout_ms: timeoutMs });
}

export async function inspectCamera(input: InspectRequest): Promise<InspectResult> {
  return apiPost<InspectRequest, InspectResult>('/discovery/inspect', input);
}

/**
 * Body of `POST /discovery/onboard`. The backend re-inspects the device,
 * picks the profile's RTSP stream URI and writes an `Ffmpeg` monitor with
 * the ONVIF service URL and credentials attached — everything the client
 * would otherwise assemble into a create payload.
 */
export interface OnboardRequest {
  /** The probed `XAddr`. SSRF-gated server-side. */
  xaddr: string;
  username: string;
  password: string;
  /** Media profile to use; the backend picks the first with a stream URI when omitted. */
  profile_token?: string | null;
  /** Monitor name; defaults to the device model, else "ONVIF Camera". */
  name?: string | null;
  /** Storage area for recordings; the backend defaults to the lowest configured one. */
  storage_id?: number | null;
}

/**
 * One-shot "add this camera": inspect + create in a single request, so the
 * credentials the operator typed for the probe are the ones stored on the
 * monitor. Returns the created monitor — same shape as `GET /monitors/{id}`,
 * so no `pass` / `onvif_password` come back.
 */
export async function onboardCamera(input: OnboardRequest): Promise<Monitor> {
  return apiPost<OnboardRequest, Monitor>('/discovery/onboard', input);
}
