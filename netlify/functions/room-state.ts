// Netlify function: GET /.netlify/functions/room-state
// A thin wrapper. The logic is in ../online/handlers/roomState.ts so it can be tested.
import { handleRoomState } from "../online/handlers/roomState";
import { serveOnline } from "../online/netlify";

export default (request: Request, context?: Parameters<typeof serveOnline>[1]) => serveOnline(request, context, handleRoomState);
