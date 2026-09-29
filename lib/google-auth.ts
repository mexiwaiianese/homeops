/**
 * Google OAuth is off until the app is served from portonos.com.
 * Supabase rejects it today ("Unsupported provider: provider is not enabled"),
 * and the Google client should be created against the production domain.
 * Flip this on, then enable the Google provider in Supabase, to bring the buttons back.
 */
export const googleAuthEnabled = false;
