// Netlify function: GET /.netlify/functions/get-leaderboard
// A thin wrapper. The logic is in ../leaderboard/handlers/getLeaderboard.ts so it can be tested.
import { handleGetLeaderboard } from "../leaderboard/handlers/getLeaderboard";
import { serve } from "../leaderboard/netlify";

export default (request: Request, context?: Parameters<typeof serve>[1]) => serve(request, context, handleGetLeaderboard);
