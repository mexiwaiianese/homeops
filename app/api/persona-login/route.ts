import { createPersonaLoginHandlers } from "@/lib/persona-login";
import { homeopsPersonaLogin } from "@/lib/persona-login-homeops";

export const dynamic = "force-dynamic";

const handlers = createPersonaLoginHandlers(homeopsPersonaLogin);

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
