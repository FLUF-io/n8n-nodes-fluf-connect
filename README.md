# FLUF Connect for n8n

Automate FLUF listings, orders and marketplace events with two n8n nodes:

- **FLUF Connect**: create a draft, find a listing by SKU, update a listing, crosslist, delist, find an order, mark an order shipped, and get connected channels.
- **FLUF Connect Trigger**: new sale, new listing, listing crosslisted, crosslisting error, listing sold out, out of stock, and crosslisting job completed.

## Release status

The FLUF backend is live. This community package is undergoing release acceptance and is **not yet verified by n8n**. n8n Cloud discovery requires separate approval. Check [GitHub releases](https://github.com/FLUF-io/n8n-nodes-fluf-connect/releases) for available installation artifacts.

## Run locally

Use Node.js 24 or newer (the current n8n runtime requires Node 24):

```sh
npm ci
npm test
npm run lint
npm run dev
```

`n8n-node dev` starts n8n with this package loaded. For a standalone artifact, run `npm pack`; install the resulting tarball in your self-hosted n8n community-node directory (`~/.n8n/nodes`), then restart n8n. The package name is `n8n-nodes-fluf-connect`; do not search for a public npm release until publication is confirmed.

## Connect FLUF

1. In [FLUF Connect → Developers](https://fluf.io/connect/developers), create a personal access token named **n8n**. Copy it when shown.
2. In n8n, add a **FLUF Connect API** credential and paste that token. Test the credential.
3. Select the credential on each FLUF node.

The credential uses the existing FLUF personal-token API. Paid API access is required; plan and token permissions still apply. Write operations require write access where scope enforcement is enabled. This differs from the open-access Zapier integration. No Zapier client secret or OAuth redirect registration is needed. Credentials are sent only to `https://fluf.io`.

## Actions

| Resource | Operation | Inputs / behavior |
|---|---|---|
| Listing | Create | Title, positive price; optional description, SKU, quantity and HTTPS photo URLs. Creates a FLUF draft. Quantity zero is preserved. |
| Listing | Find by SKU | Exact SKU; missing results produce no output items. |
| Listing | Update | FLUF listing ID and selected fields. Omitted fields are unchanged. |
| Listing | Crosslist | FLUF listing ID and connected store targets. A target includes the connection ID, e.g. `ebay:123`. |
| Listing | Delist | FLUF listing ID and channels. Removes channel listings and retains the FLUF product. This is channel-wide, not a per-store operation. |
| Order | Find | Native marketplace order ID and channel; missing results produce no output items. |
| Order | Mark shipped | Native order ID, channel, tracking number and carrier. Currently supports Depop, eBay, Etsy and Temu. |
| Channel | Get connected | Lists usable store connections and their target values. |

Crosslisting is asynchronous. An accepted response means work was queued, not that a listing is already live. Use **Listing Crosslisted** and **Crosslisting Error** to follow the outcome. **Crosslisting Job Completed** means bulk processing finished; queued marketplace work can remain.

Each input item runs one action. n8n expressions and item pairing work across batches. HTTP errors fail the node unless you choose n8n's Continue On Fail behavior. Writes are not automatically retried by this package; repeated execution can repeat a create or fulfillment action.

## Triggers

Choose an event, select the credential, then listen for a test event or activate the workflow. n8n registers and removes the FLUF webhook automatically. Test and production subscriptions use separate signing secrets.

Self-hosted n8n needs a **public HTTPS webhook URL** reachable by FLUF. Configure n8n's `WEBHOOK_URL` behind your HTTPS reverse proxy; localhost and private-network callbacks are rejected by FLUF. No tunnel subscription is provided by this package.

Trigger payloads contain the existing FLUF event fields, including `event_id` for real events. FLUF uses at-least-once delivery: retries may repeat an event. Deduplicate on `event_id` before irreversible downstream actions. The trigger verifies HMAC-SHA256 over the original body and delivery timestamp, accepting timestamps within five minutes. Keep the server clocks synchronized.

To test without creating a sale, use the webhook's **Test** action in FLUF's developer/webhook tooling. Synthetic payloads include `test: true`; they do not prove a real sale occurred.

Import [the example workflow](examples/new-sale.json), select your credential, and listen for a **New Sale** event. It retains the payload for inspection without contacting another app. Add Google Sheets, email, accounting or other n8n nodes afterwards.

To disconnect, deactivate the workflows first so their webhooks are deleted, then revoke the personal token in FLUF. Revoking a token alone does not remove independently stored webhook subscriptions. Signing secrets are stored in n8n workflow static data; handle workflow exports and database backups accordingly.

## Development and checks

```sh
npm test                 # build + node contract/security tests; no external HTTP
npm run lint            # unmodified n8n strict ESLint configuration
npm pack --dry-run
```

The package uses the official `@n8n/node-cli` and has no external runtime dependencies beyond the n8n-workflow peer. Report problems through [GitHub issues](https://github.com/FLUF-io/n8n-nodes-fluf-connect/issues); never include personal access tokens or webhook signing secrets.
