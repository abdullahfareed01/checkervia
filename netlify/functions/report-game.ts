// Netlify function: POST /.netlify/functions/report-game
// A thin wrapper. The logic is in ../leaderboard/handlers/reportGame.ts so it can be tested.
import { handleReportGame } from "../leaderboard/handlers/reportGame";
import { serve } from "../leaderboard/netlify";

export default (request: Request, context?: Parameters<typeof serve>[1]) => serve(request, context, handleReportGame);
