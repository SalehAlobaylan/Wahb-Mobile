import { getEnv } from '@/core/config/env';

import { createCmsApi, type CmsApi } from './cms';
import { createIamApi, type IamApi } from './iam';
import {
  createTransport,
  type AccessTokenProvider,
  type Transport,
} from './transport';

export type ServiceClients = {
  cms: CmsApi;
  cmsTransport: Transport;
  iamTransport: Transport;
  iam: IamApi;
};

/**
 * The mobile app talks to CMS and IAM directly. This intentionally has no
 * Wahb-Platform/Next.js proxy because browser cookie semantics are not part of
 * the native client contract.
 */
export function createServiceClients(
  getAccessToken?: AccessTokenProvider,
): ServiceClients {
  const env = getEnv();
  const cmsTransport = createTransport({
    baseUrl: env.EXPO_PUBLIC_CMS_URL,
    getAccessToken,
  });

  const iamTransport = createTransport({
    baseUrl: env.EXPO_PUBLIC_IAM_URL,
    getAccessToken,
  });

  return {
    cms: createCmsApi(cmsTransport),
    cmsTransport,
    iam: createIamApi(iamTransport),
    iamTransport,
  };
}
