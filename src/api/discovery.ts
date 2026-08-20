import { apiPost } from './client';

/**
 * ONVIF discovery — the legacy "SCAN NETWORK" / `?view=onvifprobe` flow.
 * Two steps: a WS-Discovery multicast probe lists candidates, then an
 * inspect of one candidate's device-service URL returns its identity and
 * media profiles with resolved stream URIs. There is no one-shot onboard
 * endpoint in the OpenAPI snapshot; creating the monitor is the client's job.
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
