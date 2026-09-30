import "server-only"

export type RequestUser = {
  email: string | null
  role: string | null
}

type AuthProvider = {
  getRequestUser(request: Request): Promise<RequestUser | null>
}

// The browser sends identity headers from its localStorage session. Anyone can forge these,
// so this provider is only a placeholder until Entra ID sign-in is in place.
const clientAssertedProvider: AuthProvider = {
  async getRequestUser(request) {
    const email = request.headers.get("x-fmv-email")
    const role = request.headers.get("x-fmv-role")
    if (!email && !role) return null
    return { email, role }
  },
}

// Reserved for Microsoft Entra ID: validate the session token server-side and map the
// Entra object ID to a row in `profiles` (see scripts/aurora/001_profile_identity_mapping.sql).
const entraProvider: AuthProvider = {
  async getRequestUser() {
    throw new Error("AUTH_PROVIDER=entra is not implemented yet")
  },
}

function getProvider(): AuthProvider {
  return process.env.AUTH_PROVIDER === "entra" ? entraProvider : clientAssertedProvider
}

export function getRequestUser(request: Request): Promise<RequestUser | null> {
  return getProvider().getRequestUser(request)
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  const user = await getRequestUser(request)
  return user?.role === "ADMIN"
}
