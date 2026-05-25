---
name: netsuite-restlet-crud
description: Create or update NetSuite SuiteScript RESTlet CRUD or upsert handlers in this repo, especially files under src/FileCabinet/SuiteScripts/Custom App that should follow the example_reslet.js pattern with shared helper modules for standardized JSON responses, validation, normalize and resolve helpers, record loading, and body or sublist mapping.
---

# NetSuite RESTlet CRUD

Follow this skill when building or revising CRUD-style RESTlets for this project.

## Workflow

1. Inspect `src/FileCabinet/SuiteScripts/Custom App/example_reslet.js` first to match the repo's expected style: request logging, simple `JSON.stringify(...)` responses, helper-first organization, and direct NetSuite record/search APIs.
2. Inspect the current shared helpers before adding new local utilities:
   - `src/FileCabinet/SuiteScripts/Custom App/helper/global.js`
   - `src/FileCabinet/SuiteScripts/Custom App/helper/response.js`
3. Keep the RESTlet file thin. Put reusable logic in:
   - `src/FileCabinet/SuiteScripts/Custom App/helper/global.js`
   - `src/FileCabinet/SuiteScripts/Custom App/helper/response.js`
4. Place target RESTlet files under `src/FileCabinet/SuiteScripts/Custom App/` unless the user explicitly asks for another path.
5. After edits, run `node --check` on each changed `.js` file. This only checks syntax, not NetSuite runtime behavior.

## RESTlet Rules

- Use SuiteScript 2.1.
- Default dependencies:
  - RESTlet: `N/record`, `N/search`, `N/error`, `N/log`, plus local helpers
  - Helpers: local modules only unless a NetSuite module is truly needed
- Use `log.debug(...)` for request payloads and inside `catch` blocks.
- Return JSON strings through the response helper, not ad hoc objects.
- Keep response shape standardized through helper functions such as `success`, `accepted`, `badRequest`, and `serverError`.
- Prefer `isDynamic: false` plus `setSublistLinesStandard(...)` for transaction sublists unless the task specifically needs dynamic mode.
- Prefer plain functions and small helpers over large nested handlers.

## Helper Split

Put reusable functions in `helper/global.js`, for example:

- `doValidation`
- `parsePositiveInt`
- `normalizeDateValue`
- `normalizeNumberValue`
- `normalizeSelectValue`
- `normalizeCheckboxValue`
- `findData`
- `getRequestedId`
- `resolveRecordId`
- `resolveTargetRecordId`
- `resolveItemReference`
- `resolveSingleTextValue`
- `mergeOptions`
- empty checks
- record load helpers
- body field extraction
- sublist line extraction / mapping
- `setSublistLinesStandard`
- create or update helpers that can be reused by other RESTlets

Put response builders in `helper/response.js`, for example:

- `success(message, data, extras)`
- `accepted(message, data, extras)`
- `badRequest(message, data, extras)`
- `serverError(error, data, extras)`

Keep response structure aligned with `example_reslet.js`: `JSON.stringify({ status_code, message, data, ... })`.
Prefer moving generic parse, normalize, resolve, and sublist-write logic to helpers instead of keeping them local in one RESTlet.

## CRUD Pattern

### GET

- Accept `id` or repo-specific aliases such as `custrecord_id` when useful.
- If an id is provided, load one record and return all body fields.
- If no id is provided, search record ids first, then load each record.
- Include requested sublists explicitly. For transaction-style records, `item` is the common default.

### POST

- Validate required input first.
- Resolve external payload values to internal ids through helper functions when middleware sends names, codes, or symbols.
- If the repo flow needs idempotent middleware behavior, support upsert semantics:
  - find an existing record by the business key
  - update the record and replace target sublists when it exists
  - create a new record when it does not exist
- Save and return the refreshed record payload.

### PUT

- Resolve target id from explicit id or lookup helpers such as `findData`.
- Load the record.
- Update only provided non-empty fields unless the user asks for destructive overwrite behavior.
- Replace sublist lines only when the request includes that sublist and replacement is intended.
- Save and return the updated id or refreshed record.

### DELETE

- Only implement when the user explicitly asks for delete behavior.
- Otherwise return a consistent "not implemented" response through the response helper.

## Record Dump Pattern

When the user asks to "show all fields" or inspect a record:

- Use `record.load(...)`
- Read body fields with `getFields()` + `getValue(...)`
- Read sublist lines with `getSublistFields(...)`, `getLineCount(...)`, and `getSublistValue(...)`
- Catch field/sublist read failures individually so one bad field does not break the whole dump

## Purchase Requisition Pattern

For the current repo's `purchaserequisition` RESTlet:

- Use record type `purchaserequisition`
- Default sublist is `item`
- Common middleware payloads may send display values that must be resolved to ids:
  - `subsidiary` by `name` or `namenohierarchy`
  - `location` by `name`
  - `department` by `name` when provided
  - `currency` by `symbol`
  - `item` by `itemid` on `inventoryitem`
  - `units` from item `stockunit`
- Line pricing uses `estimatedrate` and `estimatedamount`
- `department` is optional in the current PR middleware flow
- Parse `trandate` with the shared date normalizer to avoid timezone drift on `YYYY-MM-DD`
- Default single-currency transactions to `IDR` when the flow requires it
- For middleware-driven sync flows, duplicate detection may feed an upsert path rather than a `202` response

## References

Read `references/repo-pattern.md` when you need:

- exact file targets in this repo
- the preferred helper split
- common payload shapes for `get`, `post`, and `put`
- reminders for `purchaserequisition` and `item` sublist handling
