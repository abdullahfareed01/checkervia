// Netlify function: POST /.netlify/functions/room-create
// A thin wrapper. The logic is in ../online/handlers/createRoom.ts so it can be tested.
import { handleCreateRoom } from "../online/handlers/createRoom";
import { serveOnline } from "../online/netlify";

export default (request: Request, context?: Parameters<typeof serveOnline>[1]) => serveOnline(request, context, handleCreateRoom);
