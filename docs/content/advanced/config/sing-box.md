---
title: sing-box
---

wg-easy can generate [sing-box](https://sing-box.sagernet.org/) client configurations from the same client data used for WireGuard `.conf` files. The configuration is a JSON template stored in **Admin Panel → Config → sing-box Client Template**.

The built-in template targets sing-box 1.12 or newer and creates a TUN-based full-tunnel client with a WireGuard endpoint. You can replace it with your own JSON template; wg-easy validates the template and substitutes per-client values when a configuration is downloaded. The template is global for the interface; per-client differences come from the placeholders below.

## Downloading

Each client card has a download menu with two entries:

- **WireGuard (.conf)** downloads the regular `wg-quick` configuration.
- **sing-box (.json)** downloads the rendered sing-box configuration.

The same generated JSON is available in the **View Configuration** dialog by selecting **sing-box** and is served by:

```text
GET /api/client/{clientId}/configuration?format=singbox
```

One-time links accept the same parameter:

```text
GET /cnf/{token}?format=singbox
```

The authenticated endpoint requires the same permissions as the regular `.conf` download. A one-time link follows the normal five-minute expiry behavior.

The QR dialog and `GET /api/client/{clientId}/qrcode.svg` accept the same `?format=singbox` parameter. JSON configurations are larger than `.conf` files, so an oversized custom template may exceed the QR code capacity.

## Template Variables

Placeholders are written as `{{variable}}`. String variables are JSON-escaped, so put them inside quotes. Numbers, booleans, and arrays are inserted as JSON values, so do not quote them.

| Variable              | Type    | Description                                                     |
| --------------------- | ------- | --------------------------------------------------------------- |
| `privateKey`          | string  | Client private key                                              |
| `clientPrivateKey`    | string  | Alias of `privateKey`                                           |
| `clientPublicKey`     | string  | Client public key                                               |
| `publicKey`           | string  | Server public key (alias of `serverPublicKey`)                  |
| `serverPublicKey`     | string  | WireGuard interface public key                                  |
| `preSharedKey`        | string  | Client preshared key, or an empty string                        |
| `clientName`          | string  | Client name                                                     |
| `clientId`            | number  | Client ID                                                       |
| `interfaceName`       | string  | WireGuard interface name                                        |
| `ipv4Address`         | string  | Client IPv4 address                                             |
| `ipv6Address`         | string  | Client IPv6 address, or an empty string when IPv6 is disabled   |
| `ipv4Cidr`            | string  | WireGuard IPv4 CIDR                                             |
| `ipv6Cidr`            | string  | WireGuard IPv6 CIDR                                             |
| `host`, `serverHost`  | string  | Public server host                                              |
| `port`, `serverPort`  | number  | Public server port                                              |
| `serverEndpoint`      | string  | Public server endpoint as `host:port`                           |
| `endpoint`            | string  | Alias of `serverEndpoint`                                       |
| `addresses`           | array   | Client tunnel addresses with `/32` and `/128`                   |
| `allowedIps`          | array   | Allowed IPs, filtered to IPv4 when IPv6 is disabled             |
| `allowedIpsAll`       | array   | Allowed IPs without filtering                                   |
| `fullTunnel`          | boolean | Whether Allowed IPs route all IPv4 and IPv6 traffic through VPN |
| `dnsServers`          | array   | DNS server objects, including a local `dns-bootstrap` server    |
| `dnsUserServers`      | array   | DNS server objects without the bootstrap server                 |
| `dnsFinal`            | string  | Tag of the first configured DNS server or `dns-bootstrap`       |
| `dnsBootstrap`        | string  | Tag of the local bootstrap DNS server                           |
| `tunAddresses`        | array   | Recommended TUN addresses, excluding IPv6 when it is disabled   |
| `mtu`                 | number  | Client MTU, interface MTU, or the sing-box default (`1408`)     |
| `persistentKeepalive` | number  | Keepalive interval in seconds                                   |
| `enableIpv6`          | boolean | Whether IPv6 is enabled                                         |
| `hasPreSharedKey`     | boolean | Whether the client has a preshared key                          |
| `hasDns`              | boolean | Whether any DNS servers are configured                          |

### Conditionals

Two block helpers are supported for optional JSON fragments:

```json
{
  "log": { "level": "warn" }{{#if enableIpv6}},
  "ipv6": "{{ipv6Address}}"{{/if}}
}
```

Use `{{#unless variable}}...{{/unless}}` for the inverse. Blocks may be nested. The resulting configuration must be valid JSON with every conditional both included and excluded; wg-easy checks this when you save the template and again when it generates a client configuration.

## DNS

DNS entries from **Admin Panel → Config → DNS** and per-client overrides are converted to sing-box DNS server objects:

- Plain addresses become `udp` servers.
- `tcp://`, `tls://`, `quic://`, `https://`, and `h3://` prefixes select the matching sing-box server type.
- `local` becomes a `local` server.

A local `dns-bootstrap` server is always appended. The built-in template uses it as `route.default_domain_resolver`, so a server hostname can be resolved before the tunnel is established.

When Allowed IPs is not a full tunnel, the built-in template routes only the listed networks to the WireGuard endpoint and sends the remaining traffic through a `direct` outbound.

## Limitations

- sing-box does not support AmneziaWG. If wg-easy runs in AmneziaWG mode, the generated sing-box configuration uses plain WireGuard and will not connect to an AmneziaWG server. Write a compatible template only if your client supports AmneziaWG extensions.
- Hooks (`PreUp`, `PostUp`, `PreDown`, `PostDown`) are `wg-quick`-specific and are not included in sing-box templates.
- The client device must import the updated JSON after changing its keys, addresses, DNS, or the server endpoint.

Always validate a customized template with `sing-box check -c config.json` on the target client before distributing it.
