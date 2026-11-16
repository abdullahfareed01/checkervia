// Netlify function: POST /.netlify/functions/report-abandon
// A thin wrapper. The logic is in ../leaderboard/handlers/reportAbandon.ts so it can be tested.
import { handleReportAbandon } from "../leaderboard/handlers/reportAbandon";
import { serve } from "../leaderboard/netlify";

export default (request: Request, context?: Parameters<typeof serve>[1]) => serve(request, context, handleReportAbandon);
