// Netlify function: GET and POST /.netlify/functions/account (D150).
// A thin wrapper. The logic is in ../accounts so it can be tested.
import { serveAccount } from "../accounts/netlify";

export default (request: Request, context?: Parameters<typeof serveAccount>[1]) => serveAccount(request, context);
