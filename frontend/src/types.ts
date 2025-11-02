export type ID = string;

export interface Driver {
  id: ID;
  name: string;
  canNight: boolean;
  sleepsInCab: boolean;
  doubleMannedEligible: boolean;
}

export interface Tractor {
  id: ID;
  code: string;
  plate?: string;
  currentLocation: string;
  doubleManned: boolean;
}

export interface Trailer {
  id: ID;
  code: string;
  plate?: string;
  type: string;
}

export type PriceModel = { type: "per_km" | "fixed"; value: number };

export interface Job {
  id: ID;
  date: string;
  start: string;
  slot: "day" | "night";
  client: string;
  pickup: string;
  dropoff: string;
  durationHours: number;
  pricing: PriceModel;
  tractorId?: ID;
  trailerId?: ID;
  driverIds: ID[];
  notes?: string;
}

export type DistanceKm = Record<string, Record<string, number>>;

export interface Settings {
  rates: {
    loadedKmRevenue: number;
    emptyKmCost: number;
    tractorKmCostLoaded: number;
    driverHourCost: number;
    nightPremiumPct: number;
  };
  trailerDayCost: Record<string, number>;
}

export interface AppState {
  weekStart: string;
  locations: string[];
  distanceKm: DistanceKm;
  settings: Settings;
  drivers: Driver[];
  tractors: Tractor[];
  trailers: Trailer[];
  jobs: Job[];
}

export interface FinanceData {
  revenue: number;
  driverCost: number;
  tractorLoadedCost: number;
  emptyKmCost: number;
  trailerDayCost: number;
  totalCost: number;
  margin: number;
}
