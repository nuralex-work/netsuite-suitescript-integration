# Repo Pattern

## File Targets

- Example source: `src/FileCabinet/SuiteScripts/Custom App/example_reslet.js`
- Shared helpers:
  - `src/FileCabinet/SuiteScripts/Custom App/helper/global.js`
  - `src/FileCabinet/SuiteScripts/Custom App/helper/response.js`
- New or updated RESTlet:
  - `src/FileCabinet/SuiteScripts/Custom App/<name>.js`

## Response Convention

Use helper-driven JSON strings from `helper/response.js`:

```js
return responseHelper.success('Create Something Successfully', dataRecord);
```

Standard response shape:

```js
{
    status_code: 200,
    message: 'Success',
    data: {}
}
```

Helper variants currently available:

- `success(message, data, extras)`
- `accepted(message, data, extras)`
- `badRequest(message, data, extras)`
- `serverError(error, data, extras)`

## Reusable Global Helpers

Common helpers worth centralizing:

- `doValidation(errorModule, args, argNames, methodName, optionalFieldNames)`
- `parsePositiveInt(value, fallbackValue)`
- `normalizeDateValue(value, fieldName, errorModule)`
- `normalizeNumberValue(value, fieldName, errorModule)`
- `normalizeSelectValue(value)`
- `normalizeCheckboxValue(value, fieldName, errorModule)`
- `findData(searchModule, key, value, arrRecordType)`
- `getRequestedId(requestParams)`
- `resolveRecordId(searchModule, value, searchKeys, recordTypes, fieldLabel, errorModule)`
- `resolveTargetRecordId(requestParams, errorModule)`
- `resolveItemReference(searchModule, itemValue, errorModule, options)`
- `resolveSingleTextValue(values, fieldLabel, errorModule, options)`
- `mergeOptions(obj1, obj2)`
- `isEmpty(value)`
- `searchRecordIds(searchModule, options)`
- `loadRecordData(recordModule, recordType, recordId, options, logDebugError)`
- `extractBodyFields(requestBody, excludedKeys)`
- `extractItemLines(requestBody)`
- `setBodyFields(targetRecord, fieldValues, logDebugError)`
- `setSublistLines(targetRecord, sublistId, lines, logDebugError)`
- `setSublistLinesStandard(targetRecord, sublistId, lines, logDebugError, options)`
- `createRecord(recordModule, options, logDebugError)`
- `updateRecord(recordModule, options, logDebugError)`

## CRUD Flow

### GET

1. Log request params.
2. Resolve id from `id` or alias keys.
3. If id exists, load one record.
4. If no id, search ids then load records one by one.
5. Return body fields and needed sublists.

### POST

1. Validate request body.
2. Extract the effective payload from `requestBody.fields || requestBody` when middleware uses nested `fields`.
3. Resolve incoming display values or codes to internal ids through shared helper functions.
4. Resolve single-value fields such as currency with `resolveSingleTextValue(...)`.
5. If the business key already exists and the integration is idempotent, update the existing record and replace the target sublist.
6. Otherwise create a new record.
7. Reload the saved record for response payload.

### PUT

1. Validate request body and target identifier.
2. Resolve internal id directly or via `resolveTargetRecordId(...)`.
3. Load record.
4. Apply provided body fields.
5. Replace sublist lines only when the request includes that sublist.
6. Save and return updated data.

## Purchase Requisition Notes

- Record type: `purchaserequisition`
- Common transaction sublist: `item`
- Prefer `isDynamic: false` with `setSublistLinesStandard(...)`
- Middleware may send header display values instead of ids:
  - `subsidiary` by `name` or `namenohierarchy`
  - `location` by `name`
  - `department` by `name` when provided
  - `currency` by `symbol`
- Middleware may send line display values instead of ids:
  - `item` by `itemid` on `inventoryitem`
  - `units` from item `stockunit`
- Common header fields in current flow:
  - `subsidiary`
  - `location`
  - `trandate`
  - `memo`
  - `department`
  - `custbodycustbody_field_proposalid`
  - `custbodycustbody_trx_req_custapp`
  - `custbody_proposal_number`
- Common line fields in current flow:
  - `item`
  - `quantity`
  - `units`
  - `estimatedrate`
  - `estimatedamount`
  - `description`
  - `currency`
- `department` is not mandatory and can be skipped through `doValidation(..., optionalFieldNames)`
- Parse `trandate` through shared normalizer to avoid `YYYY-MM-DD` timezone shifts
- Default currency can be `IDR` depending on the flow
- Current duplicate business key for PR sync flow:
  - `custbodycustbody_field_proposalid`
  - `custbodycustbody_trx_req_custapp = true`
- Current duplicate behavior for PR sync flow:
  - `POST` acts as upsert
  - existing record is updated
  - `item` sublist is replaced
- For inspection requests, return:
  - `id`
  - `recordType`
  - `fields`
  - `item`

## Verification

After editing:

```bash
node --check 'src/FileCabinet/SuiteScripts/Custom App/<file>.js'
node --check 'src/FileCabinet/SuiteScripts/Custom App/helper/global.js'
node --check 'src/FileCabinet/SuiteScripts/Custom App/helper/response.js'
```
