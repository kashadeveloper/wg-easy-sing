import { expect, test } from 'vitest';

import { databaseFixture } from '../helpers/database';

import { generateSingBoxConfig } from '#server/features/vpn/singbox';
import { encodeQRCode } from '#server/utils/qr';
import { UserConfigUpdateSchema } from '#shared/contracts/userConfig';
import { roles } from '#shared/utils/permissions';
import {
  DEFAULT_SINGBOX_TEMPLATE,
  renderSingBoxTemplate,
  validateSingBoxTemplate,
} from '#shared/utils/singbox';

async function fixture() {
  const { store } = await databaseFixture();
  await store.users.insert({
    id: 1,
    username: 'admin',
    name: 'Admin',
    role: roles.ADMIN,
    enabled: true,
    totpVerified: false,
  });
  await store.userConfigs.update({
    host: 'vpn.example.com',
    port: 51820,
    defaultDns: ['1.1.1.1', '2606:4700:4700::1111'],
    defaultAllowedIps: ['0.0.0.0/0', '::/0'],
    defaultMtu: 1420,
  });
  await store.clients.insert({
    id: 1,
    userId: 1,
    interfaceId: 'wg0',
    name: 'Client "one"',
    enabled: true,
    privateKey: 'private',
    publicKey: 'public',
    preSharedKey: 'shared',
    ipv4Address: '10.8.0.2',
    ipv6Address: 'fd00::2',
    serverAllowedIps: [],
    persistentKeepalive: 25,
    mtu: 1420,
  });
  return {
    network: await store.interfaces.get(),
    defaults: await store.userConfigs.get(),
    client: (await store.clients.get(1))!,
  };
}

test('renders the default sing-box template with client values', async () => {
  const { network, defaults, client } = await fixture();
  const config = generateSingBoxConfig(network, defaults, client);
  const parsed = JSON.parse(config);

  expect(parsed.endpoints[0]).toMatchObject({
    type: 'wireguard',
    tag: 'wireguard-out',
    mtu: 1420,
    address: ['10.8.0.2/32', 'fd00::2/128'],
    private_key: 'private',
    peers: [
      {
        address: 'vpn.example.com',
        port: 51820,
        public_key: network.publicKey,
        pre_shared_key: 'shared',
        allowed_ips: ['0.0.0.0/0', '::/0'],
        persistent_keepalive_interval: 25,
      },
    ],
  });
  expect(parsed.route.final).toBe('wireguard-out');
  expect(parsed.dns.final).toBe('dns-0');
  expect(parsed.dns.servers).toEqual([
    { type: 'udp', tag: 'dns-0', server: '1.1.1.1' },
    { type: 'udp', tag: 'dns-1', server: '2606:4700:4700::1111' },
    { type: 'local', tag: 'dns-bootstrap' },
  ]);
  expect(config.endsWith('\n')).toBe(true);
});

test('renders custom templates, escapes strings, and evaluates conditionals', async () => {
  const { network, defaults, client } = await fixture();
  const template = `{
    "name": "{{clientName}}",
    "private": "{{privateKey}}",
    "port": {{serverPort}},
    "addresses": {{addresses}},
    {{#if enableIpv6}}"ipv6": "{{ipv6Address}}",{{/if}}
    {{#unless enableIpv6}}"ipv4": "{{ipv4Address}}",{{/unless}}
    "shared": {{#if hasPreSharedKey}}"{{preSharedKey}}"{{/if}}{{#unless hasPreSharedKey}}null{{/unless}}
  }`;

  const config = generateSingBoxConfig(
    network,
    { ...defaults, singBoxTemplate: template },
    client,
    { enableIpv6: false }
  );
  expect(JSON.parse(config)).toEqual({
    name: 'Client "one"',
    private: 'private',
    port: 51820,
    addresses: ['10.8.0.2/32'],
    ipv4: '10.8.0.2',
    shared: 'shared',
  });
});

test('filters IPv6 addresses, allowed IPs, and DNS when IPv6 is disabled', async () => {
  const { network, defaults, client } = await fixture();
  const parsed = JSON.parse(
    generateSingBoxConfig(network, defaults, client, { enableIpv6: false })
  );

  expect(parsed.endpoints[0].address).toEqual(['10.8.0.2/32']);
  expect(parsed.endpoints[0].peers[0].allowed_ips).toEqual(['0.0.0.0/0']);
  expect(parsed.dns.servers).toEqual([
    { type: 'udp', tag: 'dns-0', server: '1.1.1.1' },
    { type: 'local', tag: 'dns-bootstrap' },
  ]);
  expect(parsed.inbounds[0].address).toEqual(['172.19.0.1/30']);
});

test('routes only Allowed IPs through the endpoint for split tunnels', async () => {
  const { network, defaults, client } = await fixture();
  const parsed = JSON.parse(
    generateSingBoxConfig(
      network,
      defaults,
      { ...client, allowedIps: ['10.8.0.0/24'] },
      { enableIpv6: true }
    )
  );

  expect(parsed.endpoints[0].peers[0].allowed_ips).toEqual(['10.8.0.0/24']);
  expect(parsed.route.final).toBe('direct');
  expect(parsed.route.rules).toContainEqual({
    ip_cidr: ['10.8.0.0/24'],
    outbound: 'wireguard-out',
  });
});

test('supports DNS protocol schemes and falls back to a local bootstrap', async () => {
  const { network, defaults, client } = await fixture();
  const config = generateSingBoxConfig(
    network,
    {
      ...defaults,
      defaultDns: [
        'tls://dns.google',
        'https://1.1.1.1/dns-query',
        'quic://dns.adguard.com:853',
      ],
    },
    client,
    { enableIpv6: true }
  );
  const parsed = JSON.parse(config);
  expect(parsed.dns.servers).toEqual([
    { type: 'tls', tag: 'dns-0', server: 'dns.google' },
    {
      type: 'https',
      tag: 'dns-1',
      server: '1.1.1.1',
      path: '/dns-query',
    },
    {
      type: 'quic',
      tag: 'dns-2',
      server: 'dns.adguard.com',
      server_port: 853,
    },
    { type: 'local', tag: 'dns-bootstrap' },
  ]);
  expect(parsed.dns.final).toBe('dns-0');
});

test('rejects invalid and unknown templates', async () => {
  const { network, defaults, client } = await fixture();

  expect(() =>
    generateSingBoxConfig(
      network,
      { ...defaults, singBoxTemplate: '{"broken": }' },
      client
    )
  ).toThrow('Invalid sing-box template');

  expect(() =>
    generateSingBoxConfig(
      network,
      { ...defaults, singBoxTemplate: '{"key": "{{unknown}}"}' },
      client
    )
  ).toThrow('Unknown variable: unknown');
});

test('validates templates for the admin form', () => {
  expect(validateSingBoxTemplate(DEFAULT_SINGBOX_TEMPLATE)).toBeNull();
  expect(
    validateSingBoxTemplate('{"key": {{clientId}}, "flag": {{enableIpv6}}}')
  ).toBeNull();
  expect(validateSingBoxTemplate('{"broken": }')).toContain('not valid JSON');
  expect(validateSingBoxTemplate('{"key": "{{unknown}}"}')).toBe(
    'Unknown variable: unknown'
  );
  expect(validateSingBoxTemplate('{{#if enableIpv6}}"x"')).toBe(
    'Unclosed conditional block'
  );
});

test('rejects invalid templates in the admin form schema', async () => {
  const { defaults } = await fixture();
  expect(
    UserConfigUpdateSchema.safeParse({
      ...defaults,
      singBoxTemplate: DEFAULT_SINGBOX_TEMPLATE,
    }).success
  ).toBe(true);
  expect(
    UserConfigUpdateSchema.safeParse({
      ...defaults,
      singBoxTemplate: '{"broken": }',
    }).success
  ).toBe(false);
});

test('default sing-box configuration fits in a QR code', async () => {
  const { network, defaults, client } = await fixture();
  const config = generateSingBoxConfig(network, defaults, client);
  expect(() => encodeQRCode(config)).not.toThrow();
});

test('renders nested conditionals and inserts raw values', () => {
  const rendered = renderSingBoxTemplate(
    '{{{#if enableIpv6}}{{#if hasDns}}"a": true,{{/if}}{{/if}}"b": {{allowedIps}}}',
    {
      enableIpv6: true,
      hasDns: false,
      allowedIps: ['0.0.0.0/0', '::/0'],
    }
  );
  expect(JSON.parse(rendered)).toEqual({ b: ['0.0.0.0/0', '::/0'] });
});
