// Netlify function: POST /.netlify/functions/room-resign
// A thin wrapper. The logic is in ../online/handlers/matchActions.ts so it can be tested.
import { handleResign } from "../online/handlers/matchActions";
import { serveOnline } from "../online/netlify";

export default (request: Request, context?: Parameters<typeof serveOnline>[1]) => serveOnline(request, context, handleResign);
