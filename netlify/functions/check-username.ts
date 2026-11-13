// Netlify function: GET /.netlify/functions/check-username
// A thin wrapper. The logic is in ../leaderboard/handlers/checkUsername.ts so it can be tested.
import { handleCheckUsername } from "../leaderboard/handlers/checkUsername";
import { serve } from "../leaderboard/netlify";

export default (request: Request, context?: Parameters<typeof serve>[1]) => serve(request, context, handleCheckUsername);
