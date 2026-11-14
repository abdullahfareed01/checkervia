// Netlify function: GET /.netlify/functions/get-profile
// A thin wrapper. The logic is in ../leaderboard/handlers/getProfile.ts so it can be tested.
import { handleGetProfile } from "../leaderboard/handlers/getProfile";
import { serve } from "../leaderboard/netlify";

export default (request: Request, context?: Parameters<typeof serve>[1]) => serve(request, context, handleGetProfile);
