// Netlify function: POST /.netlify/functions/admin-auth (the admin's sign in, D100).
// A thin wrapper. The logic is in ../admin/handlers/auth.ts so it can be tested.
import { handleAdminAuth } from "../admin/handlers/auth";
import { serveAdmin } from "../admin/netlify";

export default (request: Request, context?: Parameters<typeof serveAdmin>[1]) => serveAdmin(request, context, handleAdminAuth);
