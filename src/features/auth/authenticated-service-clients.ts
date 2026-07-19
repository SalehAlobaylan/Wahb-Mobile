import {
  createCmsApi,
  createIamApi,
  createServiceClients,
  type ServiceClients,
} from '@/core/api';

import { createAuthenticatedTransport } from './authenticated-transport';
import type { AuthSessionManager } from './auth-session';

/** Reusable authenticated CMS/IAM clients for post-login feature modules. */
export function createAuthenticatedServiceClients(
  session: AuthSessionManager,
): ServiceClients {
  const base = createServiceClients(session.getAccessToken);
  const cmsTransport = createAuthenticatedTransport(base.cmsTransport, session);
  const iamTransport = createAuthenticatedTransport(base.iamTransport, session);
  return {
    ...base,
    cms: createCmsApi(cmsTransport),
    cmsTransport,
    iam: createIamApi(iamTransport),
    iamTransport,
  };
}
