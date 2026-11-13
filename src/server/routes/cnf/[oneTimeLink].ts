import {
  defineEventHandler,
  getValidatedQuery,
  isNuxtError,
} from 'nuxt/server';

import * as provisioning from '#server/features/vpn/provisioning';
import { logSecurityEvent } from '#server/utils/securityLogger';
import { validateZod, getValidatedRouterParams } from '#server/http/validation';
import { OneTimeLinkGetSchema } from '#shared/contracts/oneTimeLink';
import { ClientConfigurationQuerySchema } from '#shared/contracts/client';

export default defineEventHandler(async (event) => {
  const { oneTimeLink } = await getValidatedRouterParams(
    event,
    validateZod(OneTimeLinkGetSchema, event)
  );
  const { format } = await getValidatedQuery(
    event,
    validateZod(ClientConfigurationQuerySchema, event)
  );
  try {
    const download = await provisioning.redeemOneTimeLink(oneTimeLink, format);
    event.res.headers.set(
      'Content-Disposition',
      `attachment; filename="${download.filename}"`
    );
    event.res.headers.set('Content-Type', download.contentType);
    return download.contents;
  } catch (error) {
    if (isNuxtError(error) && error.status === 404) {
      logSecurityEvent(event, 'one-time-link');
    }
    throw error;
  }
});
