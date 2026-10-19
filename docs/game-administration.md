# Game administration

Fortless resolves game identity, player-query transport and administration transport independently for every Pterodactyl service. Existing services are discovered lazily from their current game profile/egg, allocations, startup environment and authorized configuration files; no reinstall or reprovision is required.

## Supported transports

- Minecraft on Pterodactyl: native authorized Client API console commands (preferred). Kick, ban and pardon do not require RCON.
- GoldSrc: UDP challenge/response RCON using the assigned game administration allocation.
- Source: TCP Source RCON using an assigned administration allocation.
- Minecraft RCON: TCP RCON only when the customer explicitly selects it.
- Rust WebRCON: detected and reported as unsupported until a verified WebSocket implementation is available.

Server List Ping player samples are labelled non-authoritative and are not offered as safe moderation targets.

## Configuration and safety

Customers configure the transport under **Service → Settings → Game Administration / RCON**, or follow **Configure** from Players. Fortless never accepts an arbitrary RCON host: the target comes from the trusted provider node/allocation mapping, and a selected port must belong to that server. Manual passwords are encrypted with AES-256-GCM under a service-secret-specific HKDF context. Passwords are never returned by the API, written to audit metadata or logged.

Detection is read-only. File synchronization is separate and explicit, preserves comments and unrelated settings, asks Pterodactyl to create a recovery copy first, and records that a restart is required. Fortless never restarts the server as part of detection or configuration.

Native console HTTP acceptance is recorded as `SUBMITTED`, not confirmed in-game success. Network timeouts are returned as an unknown outcome so the UI does not encourage a blind duplicate retry.

## API

- `GET /api/v1/services/:id/game-administration`
- `POST /api/v1/services/:id/game-administration/detect`
- `PUT /api/v1/services/:id/game-administration`
- `DELETE /api/v1/services/:id/game-administration`
- `POST /api/v1/services/:id/game-administration/test`
- `POST /api/v1/services/:id/players/{kick,ban,unban}`
- `GET /api/v1/admin/game-administration` (credential-free staff inspection)

Migration 62 adds `service_game_administration`. It is additive and keeps automatic discovery as the default for every existing service.
