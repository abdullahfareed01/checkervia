// Netlify function: POST /.netlify/functions/room-move
// A thin wrapper. The logic is in ../online/handlers/makeMove.ts so it can be tested.
import { handleMakeMove } from "../online/handlers/makeMove";
import { serveOnline } from "../online/netlify";

export default (request: Request, context?: Parameters<typeof serveOnline>[1]) => serveOnline(request, context, handleMakeMove);
