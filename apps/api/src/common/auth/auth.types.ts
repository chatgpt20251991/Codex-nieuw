export interface Actor {
  subject: string;
  organisationId: string;
  role: string;
  email?: string;
  displayName?: string;
  mode: 'dev' | 'oidc';
}
