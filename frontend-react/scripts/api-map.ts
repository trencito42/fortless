// Generates docs/SERVICE_DETAIL_API_MAP.md from the typed API_MAP. Run: npx tsx scripts/api-map.ts
import { writeFileSync } from 'node:fs';
import { API_MAP, NOT_YET_IN_VIEW } from '../src/views/service-detail/api-map';

const esc = (s: string) => s.replace(/\|/g, '\\|');
const rows = API_MAP.map((e) => `| \`${e.port}\` | ${e.method} | \`${esc(e.path)}\` | ${e.line} | ${e.capability} | ${e.permission} | ${[e.confirm ? 'confirm:true' : '', e.pendingOutcome ? 'pending on timeout' : ''].filter(Boolean).join(', ') || '-'} | ${e.tests.map((t) => `\`${t}\``).join(', ')}${e.sandbox ? ' (+sandbox)' : ''} |${e.note ? '' : ''}`);
const notes = API_MAP.filter((e) => e.note).map((e) => `- \`${e.port}\`: ${e.note}`);
const md = `# Service Detail: typed API mapping

Generated from \`src/views/service-detail/api-map.ts\` (do not edit by hand). Backend reference: trencito42/fortless @ c6bab7e, \`src/server.ts\` (line numbers below).

## The five levels

| Level | Question | Where it comes from in the view |
|---|---|---|
| 1 | Endpoint implemented in source | this table (\`API_MAP\`, \`line\`) |
| 2 | Reachable in the current runtime | \`platform.provisioning.enabled\`; typed 503s (\`PROVIDER_NOT_CONFIGURED\`, \`KEYMINT_NOT_CONFIGURED\`) |
| 3 | Provider capability available | \`ServiceDetailDto.providerCapabilities\` (Capability column) |
| 4 | User authorised | \`access.permissions\` (Permission column) plus lifecycle (contract ACTIVE, runtime settled) |
| 5 | Verified end to end | \`platform.provisioning.verification\` tier; the Tests column lists repository tests. **Nothing here was run live against a panel by this project.** |

"Unavailable" is only rendered with a reason produced by one of levels 2-4.

## Routes used by the view (${API_MAP.length})

Every row is executed against the real HTTP adapter by \`tests/service-api.spec.ts\` (method, URL, body, CSRF header, \`confirm\`).

| Port | Method | Path | server.ts line | Capability | Permission | Notes | Backend tests |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}

${notes.length ? `### Route notes\n\n${notes.join('\n')}\n` : ''}
## Not wired into the view yet

| Method | Path | server.ts line | Reason |
|---|---|---|---|
${NOT_YET_IN_VIEW.map((n) => `| ${n.method} | \`${esc(n.path)}\` | ${n.line} | ${esc(n.reason)} |`).join('\n')}

## Console (Wings WebSocket)

Fortless stays the intermediary: \`GET /services/:id/console\` returns short-lived, server-scoped \`{token, socket}\`; the browser opens the socket and sends \`auth\`, \`send logs\`, \`send command\`. It receives \`auth success\`, \`console output\`, \`install output\`, \`daemon message\`, \`status\`, \`stats\`, \`token expiring\` (adapter refreshes the credential), \`token expired\` and \`jwt error\` (terminal; shown as a refusal). No Pterodactyl admin key or Application API access exists anywhere in the React code.

## Discrepancies and open points

- \`GET /console/history\` returns \`commandRedacted\`; the shipped client reads \`command\`. The typed contract follows the server. History seeding of the console input is not wired.
- Startup: there is no route to change the startup command, so the command is shown locked; image and variables save per call.
- Allocation tab: no backend route; it shows plan limits from \`desiredConfig\`.
- Mutations can answer \`{pending:true}\` when the panel times out; the view reports "outcome unknown" rather than success.
- Destructive routes require \`confirm:true\`; the adapter sends it only from an explicit confirm dialog.
`;
writeFileSync(new URL('../docs/SERVICE_DETAIL_API_MAP.md', import.meta.url), md);
console.log(`wrote ${API_MAP.length} routes`);
