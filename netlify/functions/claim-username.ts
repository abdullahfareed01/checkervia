// Netlify function: POST /.netlify/functions/claim-username
// A thin wrapper. The logic is in ../leaderboard/handlers/claimUsername.ts so it can be tested.
import { handleClaimUsername } from "../leaderboard/handlers/claimUsername";
import { serve } from "../leaderboard/netlify";

export default (request: Request, context?: Parameters<typeof serve>[1]) => serve(request, context, handleClaimUsername);
