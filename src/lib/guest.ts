// The guest choice cookie. Kept out of components/GameProvider ("use client"): a server component importing a constant from a
// client module gets a client reference instead of the string, and the cookie would never be read on the server.
export const GUEST_COOKIE = "gl_guest";
