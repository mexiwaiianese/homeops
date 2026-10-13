/**
 * Social sign-in stays off while Supabase rejects the provider
 * ("Unsupported provider: provider is not enabled"). A button that is on
 * sends the browser to that raw error page. Flip a flag only after that
 * provider is enabled in the Supabase dashboard, with /auth/callback allowed.
 */
export const googleAuthEnabled = false;
export const appleAuthEnabled = false;
