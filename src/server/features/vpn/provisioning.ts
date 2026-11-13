import { createError } from 'nuxt/server';
import CRC32 from 'crc-32';

import { authorizeClient, isExpired, type Actor } from './policies';
import { generateClientConfig } from './configuration';
import { generateSingBoxConfig } from './singbox';

import { WG_ENV } from '#server/utils/config';
import { getDatabase } from '#db';
import type { Repositories } from '#db/store';
import type { ClientConfigFormat } from '#shared/contracts/client';

function filenameBase(name: string, id: number) {
  const clean = name
    .replace(/[^a-zA-Z0-9_=+.-]/g, '-')
    .replace(/(-{2,}|-$)/g, '-')
    .replace(/-$/, '')
    .substring(0, 32);
  return clean || id.toString();
}

async function configuration(
  tx: Repositories,
  client: NonNullable<Awaited<ReturnType<Repositories['clients']['get']>>>,
  format: ClientConfigFormat = 'wireguard'
) {
  const network = await tx.interfaces.get();
  const defaults = await tx.userConfigs.get();
  const base = filenameBase(client.name, client.id);

  if (format === 'singbox') {
    return {
      filename: `${base}.json`,
      contents: generateSingBoxConfig(network, defaults, client, {
        enableIpv6: !WG_ENV.DISABLE_IPV6,
      }),
      contentType: 'application/json; charset=utf-8',
    };
  }

  return {
    filename: `${base}.conf`,
    contents: generateClientConfig(network, defaults, client, {
      enableIpv6: !WG_ENV.DISABLE_IPV6,
      amnezia: WG_ENV.WG_EXECUTABLE === 'awg',
    }),
    contentType: 'application/octet-stream',
  };
}

export function download(
  actor: Actor,
  clientId: number,
  format: ClientConfigFormat = 'wireguard'
) {
  return getDatabase().transaction(async (tx) => {
    const client = authorizeClient(
      actor,
      'view',
      await tx.clients.get(clientId)
    );
    return configuration(tx, client, format);
  });
}

export function generateOneTimeLink(actor: Actor, clientId: number) {
  return getDatabase().transaction(async (tx) => {
    authorizeClient(actor, 'update', await tx.clients.getPublic(clientId));
    // Short for manual entry; the sharing guide documents the guessing risk.
    const key = `${clientId}-${Math.floor(Math.random() * 1000)}`;
    const token = Math.abs(CRC32.str(key)).toString(16);
    await tx.oneTimeLinks.save(
      clientId,
      token,
      new Date(Date.now() + 5 * 60 * 1000).toISOString()
    );
  });
}

export function redeemOneTimeLink(
  token: string,
  format: ClientConfigFormat = 'wireguard'
) {
  return getDatabase().transaction(async (tx) => {
    const link = await tx.oneTimeLinks.getByToken(token);
    if (!link) {
      throw createError({
        status: 404,
        statusText: 'Invalid One Time Link',
      });
    }
    const now = Date.now();
    if (isExpired(link.expiresAt, now)) {
      throw createError({
        status: 410,
        statusText: 'One Time Link has expired',
      });
    }
    const client = await tx.clients.get(link.id);
    if (!client) {
      throw createError({
        status: 404,
        statusText: 'Invalid One Time Link',
      });
    }
    const result = await configuration(tx, client, format);
    // Downloads may shorten the lifetime, but must never extend it.
    const expiresAt = Math.min(Date.parse(link.expiresAt), now + 10_000);
    await tx.oneTimeLinks.setExpiry(link.id, new Date(expiresAt).toISOString());
    return result;
  });
}
