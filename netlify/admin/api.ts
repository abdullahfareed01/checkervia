// The admin-api handler and its table of operations (D100). Phases 1 and 2
// read; phase 3 (D110) adds the reports queue, live play and the actions.
import { overviewOperation } from "./handlers/overview";
import { reportOperation } from "./handlers/reports";
import { adminApi } from "./handlers/operation";
import {
  deletePlayerOperation, deviceBanOperation, hidePlayerOperation, hideWinOperation, liveOperation, renameOperation,
  reportGroupsOperation, reportsOperation, reportStatusOperation, resetProfileOperation, suspendOperation, unsuspendOperation,
} from "./handlers/moderation";
import { auditOperation, playerOperation, playersOperation, playersExportOperation } from "./handlers/reads";

export const ADMIN_OPERATIONS = {
  overview: overviewOperation,
  countries: reportOperation("countries"),
  winners: reportOperation("winners"),
  resigned: reportOperation("resigned"),
  players: playersOperation,
  playersExport: playersExportOperation,
  player: playerOperation,
  audit: auditOperation,
  reports: reportsOperation,
  reportGroups: reportGroupsOperation,
  live: liveOperation,
  reportStatus: reportStatusOperation,
  suspend: suspendOperation,
  unsuspend: unsuspendOperation,
  deviceBan: deviceBanOperation,
  hidePlayer: hidePlayerOperation,
  hideWin: hideWinOperation,
  rename: renameOperation,
  resetProfile: resetProfileOperation,
  deletePlayer: deletePlayerOperation,
};

export const handleAdminApi = adminApi(ADMIN_OPERATIONS);
