import { getValidatedQuery } from 'nuxt/server';

import * as provisioning from '#server/features/vpn/provisioning';
import { defineAuthenticatedEventHandler } from '#server/utils/handler';
import { validateZod, getValidatedRouterParams } from '#server/http/validation';
import {
  ClientConfigurationQuerySchema,
  ClientGetSchema,
} from '#shared/contracts/client';

export default defineAuthenticatedEventHandler(async ({ event, user }) => {
  const { clientId } = await getValidatedRouterParams(
    event,
    validateZod(ClientGetSchema, event)
  );
  const { format } = await getValidatedQuery(
    event,
    validateZod(ClientConfigurationQuerySchema, event)
  );
  const download = await provisioning.download(user, clientId, format);
  event.res.headers.set(
    'Content-Disposition',
    `attachment; filename="${download.filename}"`
  );
  event.res.headers.set('Content-Type', download.contentType);
  return download.contents;
});
