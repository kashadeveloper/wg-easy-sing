import { createError } from 'nuxt/server';
import { containsCidr } from 'cidr-tools';

import { formatEndpoint } from '#server/utils/endpoint';
import type { ClientType } from '#db/repositories/client/types';
import type { InterfaceType } from '#db/repositories/interface/types';
import type { UserConfigType } from '#db/repositories/userConfig/types';
import {
  DEFAULT_SINGBOX_TEMPLATE,
  SINGBOX_TEMPLATE_MAX_LENGTH,
  renderSingBoxTemplate,
  type SingBoxTemplateContext,
} from '#shared/utils/singbox';

type Options = {
  enableIpv6?: boolean;
};

type DnsServer =
  | { type: 'local'; tag: string }
  | {
      type: 'udp' | 'tcp' | 'tls' | 'quic' | 'https' | 'h3';
      tag: string;
      server: string;
      server_port?: number;
      path?: string;
    };

const BOOTSTRAP_DNS_TAG = 'dns-bootstrap';

const TUN_IPV4_CANDIDATES = [
  '172.19.0.1/30',
  '172.20.0.1/30',
  '172.21.0.1/30',
  '172.22.0.1/30',
  '192.0.2.1/30',
  '198.51.100.1/30',
  '203.0.113.1/30',
];

const TUN_IPV6_CANDIDATES = [
  'fdfe:dcba:9876::1/126',
  'fd00:1::1/126',
  'fd00:2::1/126',
];

function stripBrackets(host: string) {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function overlaps(a: string, b: string) {
  try {
    return containsCidr(a, b) || containsCidr(b, a);
  } catch {
    return false;
  }
}

function tunAddresses(network: InterfaceType, enableIpv6: boolean) {
  const ipv4 =
    TUN_IPV4_CANDIDATES.find(
      (candidate) => !overlaps(candidate, network.ipv4Cidr)
    ) ?? TUN_IPV4_CANDIDATES[0]!;

  if (!enableIpv6) {
    return [ipv4];
  }

  const ipv6 =
    TUN_IPV6_CANDIDATES.find(
      (candidate) => !overlaps(candidate, network.ipv6Cidr)
    ) ?? TUN_IPV6_CANDIDATES[0]!;

  return [ipv4, ipv6];
}

function parseHostPort(value: string) {
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(value);
  if (bracketed) {
    return {
      host: bracketed[1]!,
      port: bracketed[2] ? Number(bracketed[2]) : undefined,
    };
  }

  const colon = value.lastIndexOf(':');
  if (colon > 0 && /^\d+$/.test(value.slice(colon + 1))) {
    const host = value.slice(0, colon);
    // A bare IPv6 address contains multiple colons; only a single-colon
    // host:port pair is treated as a port here.
    if (!host.includes(':')) {
      return { host, port: Number(value.slice(colon + 1)) };
    }
  }

  return { host: value, port: undefined };
}

function dnsServer(address: string, index: number): DnsServer {
  const tag = `dns-${index}`;
  const trimmed = address.trim();

  if (trimmed.toLowerCase() === 'local') {
    return { type: 'local', tag };
  }

  const scheme = /^(udp|tcp|tls|quic|https|h3):\/\/(.*)$/i.exec(trimmed);
  if (!scheme) {
    const { host, port } = parseHostPort(trimmed);
    return {
      type: 'udp',
      tag,
      server: host,
      ...(port !== undefined ? { server_port: port } : {}),
    };
  }

  const type = scheme[1]!.toLowerCase() as Exclude<DnsServer['type'], 'local'>;
  let value = scheme[2]!;
  let path: string | undefined;

  if (type === 'https' || type === 'h3') {
    const slash = value.indexOf('/');
    if (slash >= 0) {
      path = value.slice(slash);
      value = value.slice(0, slash);
    }
  }

  const { host, port } = parseHostPort(value);
  return {
    type,
    tag,
    server: host,
    ...(port !== undefined ? { server_port: port } : {}),
    ...(path !== undefined ? { path } : {}),
  };
}

function dnsServers(dns: string[], enableIpv6: boolean) {
  const configured = dns
    .map((address, index) => dnsServer(address, index))
    .filter((server) => {
      if (enableIpv6 || server.type === 'local') {
        return true;
      }
      return !server.server.includes(':');
    });

  return {
    configured,
    all: [...configured, { type: 'local' as const, tag: BOOTSTRAP_DNS_TAG }],
  };
}

function templateContext(
  network: InterfaceType,
  userConfig: UserConfigType,
  client: ClientType,
  options: Options = {}
): SingBoxTemplateContext {
  const enableIpv6 = options.enableIpv6 ?? true;
  const configuredDns = client.dns ?? userConfig.defaultDns;
  const dns = dnsServers(configuredDns, enableIpv6);
  const allAllowedIps = client.allowedIps ?? userConfig.defaultAllowedIps;
  const filteredAllowedIps = enableIpv6
    ? allAllowedIps
    : allAllowedIps.filter((entry) => !entry.includes(':'));
  const allowedIps =
    filteredAllowedIps.length > 0 ? filteredAllowedIps : ['0.0.0.0/0'];
  const fullTunnel =
    allowedIps.includes('0.0.0.0/0') &&
    (!enableIpv6 || allowedIps.includes('::/0'));
  const host = stripBrackets(userConfig.host);

  return {
    privateKey: client.privateKey,
    clientPrivateKey: client.privateKey,
    clientPublicKey: client.publicKey,
    publicKey: network.publicKey,
    serverPublicKey: network.publicKey,
    preSharedKey: client.preSharedKey ?? '',
    clientName: client.name,
    clientId: client.id,
    interfaceName: network.name,
    ipv4Address: client.ipv4Address,
    ipv6Address: enableIpv6 ? client.ipv6Address : '',
    ipv4Cidr: network.ipv4Cidr,
    ipv6Cidr: network.ipv6Cidr,
    host,
    serverHost: host,
    port: userConfig.port,
    serverPort: userConfig.port,
    serverEndpoint: formatEndpoint(userConfig.host, userConfig.port),
    endpoint: formatEndpoint(userConfig.host, userConfig.port),
    addresses: [
      `${client.ipv4Address}/32`,
      ...(enableIpv6 ? [`${client.ipv6Address}/128`] : []),
    ],
    allowedIps,
    allowedIpsAll: allAllowedIps,
    fullTunnel,
    dnsServers: dns.all,
    dnsUserServers: dns.configured,
    dnsFinal: dns.configured[0]?.tag ?? BOOTSTRAP_DNS_TAG,
    dnsBootstrap: BOOTSTRAP_DNS_TAG,
    tunAddresses: tunAddresses(network, enableIpv6),
    mtu: client.mtu ?? network.mtu ?? 1408,
    persistentKeepalive: client.persistentKeepalive,
    enableIpv6,
    hasPreSharedKey: Boolean(client.preSharedKey),
    hasDns: dns.configured.length > 0,
  };
}

export function generateSingBoxConfig(
  network: InterfaceType,
  userConfig: UserConfigType,
  client: ClientType,
  options: Options = {}
) {
  const template =
    userConfig.singBoxTemplate?.trim() || DEFAULT_SINGBOX_TEMPLATE;
  if (template.length > SINGBOX_TEMPLATE_MAX_LENGTH) {
    throw createError({
      status: 500,
      statusText: 'Invalid sing-box template',
      message: `The sing-box template exceeds ${SINGBOX_TEMPLATE_MAX_LENGTH} characters.`,
    });
  }

  let contents: string;
  try {
    contents = renderSingBoxTemplate(
      template,
      templateContext(network, userConfig, client, options)
    );
    JSON.parse(contents);
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Invalid sing-box template',
      message:
        error instanceof Error
          ? `Invalid sing-box template: ${error.message}`
          : 'Invalid sing-box template: the template could not be rendered.',
      cause: error,
    });
  }

  return contents.endsWith('\n') ? contents : `${contents}\n`;
}
