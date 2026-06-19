export interface AuthConfig {
  /** Comma-separated allow-list; empty/omitted means any authenticated user is accepted. */
  allowedEmails?: string | undefined
}

/** Resolves the authenticated owner key (email) from an incoming HTTP request. */
export interface AuthProvider {
  resolveUser(request: Request, config: AuthConfig): string
}
