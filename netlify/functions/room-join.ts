// Netlify function: POST /.netlify/functions/room-join
// A thin wrapper. The logic is in ../online/handlers/joinRoom.ts so it can be tested.
import { handleJoinRoom } from "../online/handlers/joinRoom";
import { serveOnline } from "../online/netlify";

export default (request: Request, context?: Parameters<typeof serveOnline>[1]) => serveOnline(request, context, handleJoinRoom);
