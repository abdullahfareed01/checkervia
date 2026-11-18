// Netlify function: POST /.netlify/functions/admin-api (every admin operation, D100).
// A thin wrapper. The logic is in ../admin/api.ts so it can be tested.
import { handleAdminApi } from "../admin/api";
import { serveAdmin } from "../admin/netlify";

export default (request: Request, context?: Parameters<typeof serveAdmin>[1]) => serveAdmin(request, context, handleAdminApi);
