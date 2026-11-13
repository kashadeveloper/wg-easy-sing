/**
 * sing-box client configuration templates use `{{variable}}` placeholders.
 * String variables are JSON-escaped and can be placed inside quotes; all other
 * variables are inserted as JSON values (numbers, booleans and arrays).
 */

export const SINGBOX_TEMPLATE_MAX_LENGTH = 200_000;

export type SingBoxTemplateVariableType =
  'string' | 'number' | 'boolean' | 'array';

export type SingBoxTemplateVariable = {
  name: string;
  type: SingBoxTemplateVariableType;
  description: string;
};

export const SINGBOX_TEMPLATE_VARIABLES: readonly SingBoxTemplateVariable[] = [
  {
    name: 'privateKey',
    type: 'string',
    description: 'Client private key',
  },
  {
    name: 'clientPrivateKey',
    type: 'string',
    description: 'Client private key (alias of privateKey)',
  },
  {
    name: 'clientPublicKey',
    type: 'string',
    description: 'Client public key',
  },
  {
    name: 'publicKey',
    type: 'string',
    description: 'Server public key (alias of serverPublicKey)',
  },
  {
    name: 'serverPublicKey',
    type: 'string',
    description: 'Server (interface) public key',
  },
  {
    name: 'preSharedKey',
    type: 'string',
    description: 'Client preshared key, empty when not configured',
  },
  {
    name: 'clientName',
    type: 'string',
    description: 'Client name',
  },
  {
    name: 'clientId',
    type: 'number',
    description: 'Client ID',
  },
  {
    name: 'interfaceName',
    type: 'string',
    description: 'WireGuard interface name',
  },
  {
    name: 'ipv4Address',
    type: 'string',
    description: 'Client IPv4 address',
  },
  {
    name: 'ipv6Address',
    type: 'string',
    description: 'Client IPv6 address, empty when IPv6 is disabled',
  },
  {
    name: 'ipv4Cidr',
    type: 'string',
    description: 'WireGuard IPv4 CIDR',
  },
  {
    name: 'ipv6Cidr',
    type: 'string',
    description: 'WireGuard IPv6 CIDR',
  },
  {
    name: 'host',
    type: 'string',
    description: 'Public server host (alias of serverHost)',
  },
  {
    name: 'serverHost',
    type: 'string',
    description: 'Public server host',
  },
  {
    name: 'port',
    type: 'number',
    description: 'Public server port (alias of serverPort)',
  },
  {
    name: 'serverPort',
    type: 'number',
    description: 'Public server port',
  },
  {
    name: 'serverEndpoint',
    type: 'string',
    description: 'Public server endpoint as host:port',
  },
  {
    name: 'endpoint',
    type: 'string',
    description: 'Public server endpoint (alias of serverEndpoint)',
  },
  {
    name: 'addresses',
    type: 'array',
    description: 'Client tunnel addresses as a JSON array with /32 and /128',
  },
  {
    name: 'allowedIps',
    type: 'array',
    description: 'Allowed IPs as a JSON array, filtered when IPv6 is disabled',
  },
  {
    name: 'allowedIpsAll',
    type: 'array',
    description: 'Allowed IPs as a JSON array without filtering',
  },
  {
    name: 'fullTunnel',
    type: 'boolean',
    description:
      'Whether Allowed IPs route all IPv4 and IPv6 traffic through the VPN',
  },
  {
    name: 'dnsServers',
    type: 'array',
    description:
      'sing-box DNS server objects built from the client DNS settings, including a local bootstrap server',
  },
  {
    name: 'dnsUserServers',
    type: 'array',
    description: 'Configured DNS server objects without the bootstrap server',
  },
  {
    name: 'dnsFinal',
    type: 'string',
    description: 'Tag of the first configured DNS server or dns-bootstrap',
  },
  {
    name: 'dnsBootstrap',
    type: 'string',
    description: 'Tag of the local bootstrap DNS server',
  },
  {
    name: 'tunAddresses',
    type: 'array',
    description: 'Recommended TUN addresses as a JSON array',
  },
  {
    name: 'mtu',
    type: 'number',
    description: 'Client, interface, or default sing-box MTU',
  },
  {
    name: 'persistentKeepalive',
    type: 'number',
    description: 'Persistent keepalive interval in seconds',
  },
  {
    name: 'enableIpv6',
    type: 'boolean',
    description: 'Whether IPv6 is enabled',
  },
  {
    name: 'hasPreSharedKey',
    type: 'boolean',
    description: 'Whether the client has a preshared key',
  },
  {
    name: 'hasDns',
    type: 'boolean',
    description: 'Whether any DNS servers are configured',
  },
];

export type SingBoxTemplateContext = Record<
  string,
  string | number | boolean | string[] | Record<string, unknown>[]
>;

type TemplateNode =
  | string
  | {
      kind: 'if' | 'unless';
      variable: string;
      children: TemplateNode[];
    };

const rawVariables = new Set(
  SINGBOX_TEMPLATE_VARIABLES.filter(
    (variable) => variable.type !== 'string'
  ).map((variable) => variable.name)
);

const knownVariables = new Set(
  SINGBOX_TEMPLATE_VARIABLES.map((variable) => variable.name)
);

const TAG_SOURCE = String.raw`\{\{\s*([#/]?\w+)(?:\s+(\w+))?\s*\}\}`;

export class SingBoxTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SingBoxTemplateError';
  }
}

function tagRegex() {
  return new RegExp(TAG_SOURCE, 'g');
}

function variableRegex() {
  return /\{\{\s*(\w+)\s*\}\}/g;
}

function parseTemplate(template: string): TemplateNode[] {
  const root: TemplateNode[] = [];
  const stack: {
    node: Extract<TemplateNode, { kind: 'if' | 'unless' }>;
    parent: TemplateNode[];
  }[] = [];
  let current = root;
  let lastIndex = 0;

  for (const match of template.matchAll(tagRegex())) {
    const index = match.index;
    if (index > lastIndex) {
      current.push(template.slice(lastIndex, index));
    }

    const token = match[1]!;
    const argument = match[2];

    if (token === '#if' || token === '#unless') {
      if (!argument) {
        throw new SingBoxTemplateError(
          `Conditional block ${token} requires a variable name`
        );
      }
      if (!knownVariables.has(argument)) {
        throw new SingBoxTemplateError(`Unknown variable: ${argument}`);
      }
      const node: Extract<TemplateNode, { kind: 'if' | 'unless' }> = {
        kind: token === '#if' ? 'if' : 'unless',
        variable: argument,
        children: [],
      };
      current.push(node);
      stack.push({ node, parent: current });
      current = node.children;
    } else if (token === '/if' || token === '/unless') {
      const expected = token.slice(1);
      const entry = stack.pop();
      if (!entry || entry.node.kind !== expected) {
        throw new SingBoxTemplateError(`Unexpected closing tag ${token}`);
      }
      current = entry.parent;
    } else if (token.startsWith('#')) {
      throw new SingBoxTemplateError(`Unknown block tag: {{${token}}}`);
    } else {
      // Keep the original placeholder text for substitution.
      current.push(match[0]);
    }

    lastIndex = index + match[0].length;
  }

  if (stack.length) {
    throw new SingBoxTemplateError('Unclosed conditional block');
  }

  if (lastIndex < template.length) {
    current.push(template.slice(lastIndex));
  }

  return root;
}

function isTruthy(value: SingBoxTemplateContext[string] | undefined) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return Boolean(value);
}

function escapeJsonString(value: string) {
  return JSON.stringify(value).slice(1, -1);
}

function substitute(text: string, context: SingBoxTemplateContext) {
  return text.replace(variableRegex(), (_match, name: string) => {
    if (!knownVariables.has(name)) {
      throw new SingBoxTemplateError(`Unknown variable: ${name}`);
    }
    const value = context[name];
    if (value === undefined) {
      throw new SingBoxTemplateError(`Missing variable value: ${name}`);
    }
    if (rawVariables.has(name)) {
      return JSON.stringify(value) ?? 'null';
    }
    return typeof value === 'string' ? escapeJsonString(value) : String(value);
  });
}

function renderNodes(
  nodes: TemplateNode[],
  context: SingBoxTemplateContext,
  mode: 'evaluate' | 'include' | 'exclude'
): string {
  return nodes
    .map((node) => {
      if (typeof node === 'string') {
        return substitute(node, context);
      }

      const active =
        mode === 'include'
          ? true
          : mode === 'exclude'
            ? false
            : node.kind === 'if'
              ? isTruthy(context[node.variable])
              : !isTruthy(context[node.variable]);

      return active ? renderNodes(node.children, context, mode) : '';
    })
    .join('');
}

function validateVariables(template: string) {
  for (const match of template.matchAll(tagRegex())) {
    const token = match[1]!;
    if (token.startsWith('/')) {
      continue;
    }
    const name = token.startsWith('#') ? match[2] : token;
    if (!name || !knownVariables.has(name)) {
      throw new SingBoxTemplateError(`Unknown variable: ${name ?? token}`);
    }
  }
}

/**
 * Returns a human-readable validation error or `null` when the template is
 * structurally valid JSON in both conditional branches.
 */
export function validateSingBoxTemplate(template: string): string | null {
  if (template.length > SINGBOX_TEMPLATE_MAX_LENGTH) {
    return `Template exceeds ${SINGBOX_TEMPLATE_MAX_LENGTH} characters`;
  }

  try {
    validateVariables(template);
    const parsed = parseTemplate(template);
    for (const mode of ['include', 'exclude'] as const) {
      const rendered = renderNodes(parsed, SAMPLE_CONTEXT, mode);
      try {
        JSON.parse(rendered);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return `Template is not valid JSON: ${detail}`;
      }
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function renderSingBoxTemplate(
  template: string,
  context: SingBoxTemplateContext
) {
  return renderNodes(parseTemplate(template), context, 'evaluate');
}

const SAMPLE_CONTEXT: SingBoxTemplateContext = {
  privateKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  clientPrivateKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  clientPublicKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
  publicKey: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=',
  serverPublicKey: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=',
  preSharedKey: 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=',
  clientName: 'Client',
  clientId: 1,
  interfaceName: 'wg0',
  ipv4Address: '10.8.0.2',
  ipv6Address: 'fd00::2',
  ipv4Cidr: '10.8.0.0/24',
  ipv6Cidr: 'fd00::/64',
  host: 'vpn.example.com',
  serverHost: 'vpn.example.com',
  port: 51820,
  serverPort: 51820,
  serverEndpoint: 'vpn.example.com:51820',
  endpoint: 'vpn.example.com:51820',
  addresses: ['10.8.0.2/32', 'fd00::2/128'],
  allowedIps: ['0.0.0.0/0', '::/0'],
  allowedIpsAll: ['0.0.0.0/0', '::/0'],
  fullTunnel: true,
  dnsServers: [
    { type: 'udp', tag: 'dns-0', server: '1.1.1.1' },
    { type: 'local', tag: 'dns-bootstrap' },
  ],
  dnsUserServers: [{ type: 'udp', tag: 'dns-0', server: '1.1.1.1' }],
  dnsFinal: 'dns-0',
  dnsBootstrap: 'dns-bootstrap',
  tunAddresses: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
  mtu: 1408,
  persistentKeepalive: 25,
  enableIpv6: true,
  hasPreSharedKey: true,
  hasDns: true,
};

export const DEFAULT_SINGBOX_TEMPLATE = `{
  "log": {
    "level": "warn",
    "timestamp": true
  },
  "dns": {
    "servers": {{dnsServers}},
    "final": "{{dnsFinal}}",
    "strategy": "prefer_ipv4"
  },
  "inbounds": [
    {
      "type": "tun",
      "tag": "tun-in",
      "address": {{tunAddresses}},
      "auto_route": true,
      "strict_route": true
    }
  ],
  "endpoints": [
    {
      "type": "wireguard",
      "tag": "wireguard-out",
      "system": false,
      "mtu": {{mtu}},
      "address": {{addresses}},
      "private_key": "{{privateKey}}",
      "peers": [
        {
          "address": "{{serverHost}}",
          "port": {{serverPort}},
          "public_key": "{{serverPublicKey}}",
          "pre_shared_key": "{{preSharedKey}}",
          "allowed_ips": {{allowedIps}},
          "persistent_keepalive_interval": {{persistentKeepalive}}
        }
      ]
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct"
    }
  ],
  "route": {
    "rules": [
      {
        "action": "sniff"
      },
      {
        "protocol": "dns",
        "action": "hijack-dns"
      }{{#unless fullTunnel}},
      {
        "ip_cidr": {{allowedIps}},
        "outbound": "wireguard-out"
      }{{/unless}}
    ],
    "final": "{{#if fullTunnel}}wireguard-out{{/if}}{{#unless fullTunnel}}direct{{/unless}}",
    "default_domain_resolver": "dns-bootstrap",
    "auto_detect_interface": true
  }
}`;
