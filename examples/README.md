# FLUF workflow templates

Import the JSON into n8n, select your own credentials, and follow the setup notes inside each workflow. Exports are inactive and contain no credentials.

- `sales-to-google-sheets.json`: sale ledger, matched by event ID. Sheets is not an atomic deduplication store.
- `approved-sheet-to-drafts.json`: manually import approved rows as zero-stock drafts; reconcile existing SKUs and write IDs back. Run once at a time.
- `ai-inventory-assistant.json`: private chat with one read-only SKU lookup tool. Requires your model-provider credential.
- `new-sale.json`: minimal event inspection example.

Full instructions: https://fluf.io/support/connect-n8n/
