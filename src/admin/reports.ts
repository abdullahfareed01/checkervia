import type { LevelTotals, OverviewRange } from "./analytics";

export interface CountryRow { readonly country: string; readonly players: number; readonly signups: number; readonly games: number; readonly onlineNow: number }
export interface CountriesData { readonly range: OverviewRange; readonly rows: readonly CountryRow[] }
export interface RankingRow { readonly rank: number; readonly playerId: string; readonly username: string; readonly country: string | null; readonly wins: number; readonly bestMoves: number | null; readonly games: number }
export interface WinnerRow { readonly playerId: string; readonly username: string; readonly country: string | null; readonly hidden: boolean; readonly wins: number; readonly games: number }
export interface WinnersData { readonly range: OverviewRange; readonly level: number; readonly rows: readonly RankingRow[]; readonly top: readonly WinnerRow[]; readonly levels: readonly LevelTotals[] }
export interface ResignerRow { readonly playerId: string; readonly username: string; readonly country: string | null; readonly resigned: number; readonly abandoned: number; readonly games: number }
export interface DailyLevel extends LevelTotals { readonly day: string }
export interface ResignedData { readonly range: OverviewRange; readonly levels: readonly LevelTotals[]; readonly daily: readonly DailyLevel[]; readonly rows: readonly ResignerRow[] }
