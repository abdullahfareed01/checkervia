// Netlify function: POST /.netlify/functions/update-profile
// A thin wrapper. The logic is in ../leaderboard/handlers/updateProfile.ts so it can be tested.
import { handleUpdateProfile } from "../leaderboard/handlers/updateProfile";
import { serve } from "../leaderboard/netlify";

export default (request: Request, context?: Parameters<typeof serve>[1]) => serve(request, context, handleUpdateProfile);
