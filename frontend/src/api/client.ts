// Calls to the BirdBrained backend (FastAPI, see backend/README.md).
// The address defaults to the local server; set VITE_API_URL in frontend/.env to change it.

export const API_BASE: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type Direction = "up" | "down";

export interface Species {
  key: string;
  commonName: string;
  scientificName: string;
  gbifKey: number;
  story: string;
}

export interface Region {
  id: string;
  name: string;
  gadmGid: string;
  centroid: [number, number];
  areaKm2: number;
}

/** One state on the globe: the corrected and raw change between the chosen years. */
export interface GrabPoint {
  region: string;
  name: string;
  lat: number;
  lng: number;
  status: "ok" | "insufficient";
  changePct: number | null;
  changePerYear: number | null;
  low: number | null;
  high: number | null;
  direction: Direction | null;
  confident: boolean;
  height: number | null;
  startIndex: number | null;
  endIndex: number | null;
  startCount: number;
  endCount: number;
  rawChangePct: number | null;
  rawDirection: Direction | null;
  rawHeight: number | null;
}

export interface GrabData {
  startYear: number;
  endYear: number;
  availableYears: { start: number; end: number };
  species: { key: string; name: string; dataPoints: GrabPoint[] }[];
}

export interface Anomaly {
  id: string;
  type: "regional_divergence" | "sudden_change" | "strong_trend" | "range_shift";
  species: string;
  region: string;
  years: [number, number];
  direction: Direction;
  headline: string;
  changePerYear: number;
  z: number;
  score: number;
  sufficiency: string;
  confirmedBySecondSource: boolean;
}

export interface Trend {
  changePerYear: number;
  low: number;
  high: number;
  class: string;
}

export interface Detail {
  species: string;
  region: string;
  trend: Trend | null;
  rawTrend: { changePerYear: number } | null;
  allBirdsTrend: { changePerYear: number | null };
  sufficiency: { label: string; yearsOk: number; yearsTotal: number };
  secondSource: { changePerYear: number; agrees: boolean | null } | null;
  survey: {
    changePerYear: number;
    period: string;
    low?: number;
    high?: number;
    agrees: boolean | null;
  } | null;
  effort: { year: number; records: number }[];
  climate: { year: number; tempC: number; rainMm: number }[];
}

export interface Answer {
  summary: string;
  data_check: { sufficient: boolean; note: string };
  evidence: { claim: string; tool: string }[];
  hypotheses: {
    cause: string;
    support: string[];
    against: string[];
    confidence: string;
  }[];
  could_be_artifact: string;
  next_steps: string[];
}

export interface AskResponse {
  answer: Answer;
  toolCalls: { tool: string; args: Record<string, unknown>; ms: number }[];
  cached: boolean;
  model: string | null;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_BASE + path, init);
  } catch {
    throw new ApiError(0, "unreachable", `Can't reach the backend at ${API_BASE}. Is it running?`);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? "http_error",
      body?.error?.message ?? `The backend answered ${response.status}.`
    );
  }
  return body as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) q.set(key, String(value));
  }
  return q.toString();
}

export const api = {
  species: () => request<Species[]>("/api/species"),

  regions: () => request<Region[]>("/api/regions"),

  grabData: (species: string, start?: number, end?: number) =>
    request<GrabData>(`/api/grab_data?${query({ species, start, end })}`),

  anomalies: (limit = 10, species?: string) =>
    request<Anomaly[]>(`/api/anomalies?${query({ limit, species })}`),

  detail: (species: string, region: string) =>
    request<Detail>(`/api/detail?${query({ species, region })}`),

  ask: (body: { question: string; species: string; region: string; start?: number; end?: number }) =>
    request<AskResponse>("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
