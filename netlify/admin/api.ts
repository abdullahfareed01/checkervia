// The admin-api handler and its table of operations (D100). Phase 1: the
// read only players table, player details and audit log.
import { overviewOperation } from "./handlers/overview";
import { reportOperation } from "./handlers/reports";
import { adminApi } from "./handlers/operation";
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
};

export const handleAdminApi = adminApi(ADMIN_OPERATIONS);
