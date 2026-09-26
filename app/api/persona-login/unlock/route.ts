import { createPersonaLoginHandlers } from "@/lib/persona-login";
import { homeopsPersonaLogin } from "@/lib/persona-login-homeops";

export const dynamic = "force-dynamic";

const handlers = createPersonaLoginHandlers(homeopsPersonaLogin);

export const POST = handlers.unlock.POST;
export const DELETE = handlers.unlock.DELETE;
