# Staging test plan for provider-dependent findings

Status: every item is `TEST_NEEDED`. Nothing below was run or simulated by the audit. Use a disposable staging panel, Wings node, Stripe test mode and throw-away accounts; never production. Capture the evidence listed under each item and attach it to the finding in the tracker.

| # | Finding | Setup | Steps | Pass condition | Evidence |
|---|---|---|---|---|---|
| 1 | NEW-413 | Server with an open console tab | Remove the shared member / suspend the service / lock the account / demote the owner's role while the websocket is connected | Console input stops working within a stated bound (target: under 60 s) and no output is delivered afterwards | Timestamps of the action and of the last console frame; Wings log lines |
| 2 | NEW-404 | Member invited with the viewer preset | Connect to the console and send a harmless command (`say audit`) | Command is refused, input is not rendered | Wings log, screenshot |
| 3 | NEW-396 | Customer user signed in through SSO | (a) log out of Fortless and reload the panel; (b) demote the user and reload; (c) open `/auth/password` for the same user and request a reset | (a)(b) panel session ends; (c) no reset is possible for `fortless_acc_*` users | Panel session cookie state, mail log |
| 4 | NEW-396 | Panel host | `diff` the deployed `FortlessSsoController.php`, `FortlessKeyMintController.php`, `config/fortless_sso.php` and the route lines against `panel-sso/` in the repository | Files identical (or differences explained) | `sha256sum` of both sides |
| 5 | NEW-397 | Panel `.env` | Read `FORTLESS_KEYMINT_ALLOWED_IPS`; mint a key and call the Client API from a different IP | Call from another IP is refused; empty setting is refused at mint | Panel log, curl output |
| 6 | NEW-381 | Staging Wings with traffic shaping | Add 30 s latency to Wings, then delete, rename and write a file through Fortless | UI reports "pending", the file state is re-read before any retry, an audit intent exists | Audit rows, Wings file listing |
| 7 | NEW-389 | Shared server with two subusers | Make `/users` return an empty or malformed body (proxy stub) and run the reconcile job | No member is deleted | `service_members` before and after |
| 8 | NEW-393 | Pending service invitation | Cut the connection after the panel `POST /users` succeeds, then retry the accept | Retry adopts the existing subuser; one `service_members` row | Panel subuser list, DB rows |
| 9 | NEW-392 | Server being reinstalled | Poll runtime state while the install runs | State stays INSTALLING until the install flag clears; the ready email is sent once, afterwards | State timeline, mail log |
| 10 | NEW-411 | Operator-preset member | Start 20 parallel mod installs of a large jar | Fortless process memory stays bounded; excess requests get 429 | RSS graph |
| 11 | NEW-405 | Browser, any customer page | Wait 61 minutes, then save something | Save succeeds or shows a clear re-auth message | Console and network trace |
| 12 | NEW-412 | Staging panel | Time out `PATCH suspend` on the panel side, then check Fortless state and audit | State and provider agree after reconciliation; audit shows the real client IP | DB rows, panel state |
| 13 | NEW-409 | Account with a shared server | Set the account to LOCKED | Behaviour matches the documented policy for services, shares and panel sessions | Console/API results per actor |
| 14 | Role matrix (batch 8) | One account per role, shared members per preset | Walk each page and action in the browser at desktop and phone width, light and dark | Every cell in `AUDIT_BATCH8_ROLE_STATE_MATRIX.md` holds | Screenshots, HAR |
| 15 | Stripe, webhooks | Stripe test mode | Run the payment, renewal, refund and dispute flows from the earlier batches with failures injected | See the acceptance tests in the workbook | Stripe event ids, DB rows |
