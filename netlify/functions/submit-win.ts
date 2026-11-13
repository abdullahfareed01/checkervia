// Netlify function: POST /.netlify/functions/submit-win
// A thin wrapper. The logic is in ../leaderboard/handlers/submitWin.ts so it can be tested.
import { handleSubmitWin } from "../leaderboard/handlers/submitWin";
import { serve } from "../leaderboard/netlify";

export default (request: Request, context?: Parameters<typeof serve>[1]) => serve(request, context, handleSubmitWin);
