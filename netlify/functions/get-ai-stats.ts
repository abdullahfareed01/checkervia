// Netlify function: GET /.netlify/functions/get-ai-stats
// A thin wrapper. The logic is in ../leaderboard/handlers/getAiStats.ts so it can be tested.
import { handleGetAiStats } from "../leaderboard/handlers/getAiStats";
import { serve } from "../leaderboard/netlify";

export default (request: Request, context?: Parameters<typeof serve>[1]) => serve(request, context, handleGetAiStats);
