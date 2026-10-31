export type Alliance = "red" | "blue";
export type Owner = Alliance | "none";
export interface Entity {
  id: string;
  updatedAt: string;
  deleted?: boolean;
}
export interface Elements {
  pollen: number;
  redNectar: number;
  blueNectar: number;
}
export interface Flower extends Elements {
  owner: Owner;
  bottomRed: boolean;
  bottomBlue: boolean;
}
export interface RPThresholds {
  swarm: number;
  pollinator1: number;
  pollinator2: number;
}
export interface Team extends Entity {
  number: number;
  name: string;
}
export interface Event extends Entity {
  name: string;
  code: string;
  season: number;
  teams: number[];
  thresholds: RPThresholds;
}
export interface Phase {
  leave: boolean;
  park: boolean;
  tips: number;
  pollen: number;
  nectar: number;
  cell: number;
  flower: number;
  garden: number;
  flowerPlaced: number;
  gardenDelivered: number;
}
export interface Observation extends Entity {
  eventId: string;
  match: number;
  team: number;
  alliance: Alliance;
  scout: string;
  auto: Phase;
  tele: Phase;
  bottom: number;
  minor: number;
  major: number;
  earlyNectar: number;
  breakdown: boolean;
  downtime: number;
  canSort: boolean;
  offense: number;
  defense: boolean;
  launchPosition: string;
  fixedPosition: boolean;
  compatibility: number;
  loadingNotes: string;
  note: string;
}
export interface Board extends Entity {
  eventId: string;
  match: number;
  flowers: Flower[];
  redCell: Elements;
  blueCell: Elements;
  redGarden: Elements;
  blueGarden: Elements;
  confirmed: boolean;
}
export interface OfficialResult {
  score: number;
  foulPoints: number;
  movement: number;
  tips: number;
  auto: number;
  rp?: number;
}
export interface Match extends Entity {
  eventId: string;
  number: number;
  red: number[];
  blue: number[];
  played: boolean;
  surrogate?: number[];
  dq?: number[];
  redResult?: OfficialResult;
  blueResult?: OfficialResult;
  rawScore?: unknown;
}
export interface Point {
  x: number;
  y: number;
}
export interface Route {
  id: string;
  label: string;
  start: string;
  paths: Point[][];
}
export type PitAnswers = Record<string, string | number | boolean>;
export interface Pit extends Entity {
  eventId: string;
  team: number;
  scout: string;
  talkedAt: string;
  routes: Route[];
  answers: PitAnswers;
  photo: string;
}
export interface Note extends Entity {
  team: number;
  eventId: string;
  text: string;
  author: string;
}
export interface Pick extends Entity {
  eventId: string;
  team: number;
  tier: string;
  order: number;
  available: boolean;
  note: string;
}
export interface Settings {
  team: number;
  eventId: string;
  syncUrl: string;
  scoutName?: string;
}
export interface Database {
  schemaVersion: 1;
  teams: Team[];
  events: Event[];
  observations: Observation[];
  boards: Board[];
  matches: Match[];
  pits: Pit[];
  notes: Note[];
  picks: Pick[];
}
export const collections = [
  "teams",
  "events",
  "observations",
  "boards",
  "matches",
  "pits",
  "notes",
  "picks",
] as const;
export type Collection = (typeof collections)[number];
export const active = <T extends Entity>(items: T[]): T[] =>
  items.filter((i) => !i.deleted);
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export const elements = (): Elements => ({
  pollen: 0,
  redNectar: 0,
  blueNectar: 0,
});
export const phase = (): Phase => ({
  leave: false,
  park: false,
  tips: 0,
  pollen: 0,
  nectar: 0,
  cell: 0,
  flower: 0,
  garden: 0,
  flowerPlaced: 0,
  gardenDelivered: 0,
});
export const blankObservation = (
  eventId: string,
  team: number,
  match = 1,
): Observation => ({
  id: uid(),
  updatedAt: now(),
  eventId,
  team,
  match,
  alliance: "red",
  scout: "",
  auto: phase(),
  tele: phase(),
  bottom: 0,
  minor: 0,
  major: 0,
  earlyNectar: 0,
  breakdown: false,
  downtime: 0,
  canSort: false,
  offense: 3,
  defense: false,
  launchPosition: "Near",
  fixedPosition: false,
  compatibility: 3,
  loadingNotes: "",
  note: "",
});
export const blankBoard = (eventId: string, match: number): Board => ({
  id: `${eventId}:${match}`,
  updatedAt: now(),
  eventId,
  match,
  flowers: Array.from({ length: 4 }, () => ({
    ...elements(),
    owner: "none",
    bottomRed: false,
    bottomBlue: false,
  })),
  redCell: elements(),
  blueCell: elements(),
  redGarden: elements(),
  blueGarden: elements(),
  confirmed: false,
});
