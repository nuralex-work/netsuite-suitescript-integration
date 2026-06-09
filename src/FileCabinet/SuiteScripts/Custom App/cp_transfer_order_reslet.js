/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['./helper/global', './helper/response', 'N/error', 'N/log', 'N/record', 'N/search'],
    /**
 * @param{Object} globalHelper
 * @param{Object} responseHelper
 * @param{error} error
 * @param{log} log
 * @param{record} record
 * @param{search} search
 */
    (globalHelper, responseHelper, error, log, record, search) => {
        const RECORD_TYPE = 'transferorder';
        const ITEM_SUBLIST_ID = 'item';
        const logDebugError = globalHelper.createDebugLogger(log);

        const isBadRequestError = (errorObject) => ['MISSING_REQ_ARG', 'INVALID_DATA'].indexOf(errorObject && errorObject.name) >= 0;

        const createBadRequestError = (message) => error.create({
            name: 'INVALID_DATA',
            message
        });

        const getPostSource = (requestBody = {}) => requestBody.fields || requestBody;

        const getRecordIds = (requestParams = {}) => {
            const requestedId = globalHelper.getRequestedId(requestParams);

            if (requestedId) {
                return [requestedId];
            }

            return globalHelper.searchRecordIds(search, {
                recordType: RECORD_TYPE,
                filters: [['mainline', 'is', 'T']],
                start: 0,
                end: globalHelper.parsePositiveInt(requestParams && requestParams.limit, 100)
            });
        };

        const loadTransferOrder = (recordId) => globalHelper.loadRecordData(
            record,
            RECORD_TYPE,
            recordId,
            { sublistIds: [ITEM_SUBLIST_ID] },
            logDebugError
        );

        const getBodyValue = (loadedRecord, fieldId) => {
            try {
                return loadedRecord.getValue({ fieldId });
            } catch (e) {
                logDebugError('cp_transfer_order_reslet.getBodyValue error', e, { fieldId });
                return '';
            }
        };

        const getBodyText = (loadedRecord, fieldId) => {
            try {
                return loadedRecord.getText({ fieldId }) || '';
            } catch (e) {
                logDebugError('cp_transfer_order_reslet.getBodyText error', e, { fieldId });
                return '';
            }
        };

        const getLineValue = (loadedRecord, line, fieldId) => {
            try {
                return loadedRecord.getSublistValue({
                    sublistId: ITEM_SUBLIST_ID,
                    fieldId,
                    line
                });
            } catch (e) {
                logDebugError('cp_transfer_order_reslet.getLineValue error', e, { fieldId, line });
                return '';
            }
        };

        const getLineText = (loadedRecord, line, fieldId) => {
            try {
                return loadedRecord.getSublistText({
                    sublistId: ITEM_SUBLIST_ID,
                    fieldId,
                    line
                }) || '';
            } catch (e) {
                logDebugError('cp_transfer_order_reslet.getLineText error', e, { fieldId, line });
                return '';
            }
        };

        const formatDateValue = (value) => {
            if (!(value instanceof Date)) {
                return value || '';
            }

            const year = value.getFullYear();
            const month = String(value.getMonth() + 1).padStart(2, '0');
            const day = String(value.getDate()).padStart(2, '0');

            return year + '-' + month + '-' + day;
        };

        const getItemIdValue = (itemInternalId, fallbackText) => {
            if (globalHelper.isEmpty(itemInternalId)) {
                return fallbackText || '';
            }

            try {
                const itemLookup = globalHelper.lookupFields(search, 'item', itemInternalId, ['itemid']);
                return itemLookup.itemid || fallbackText || String(itemInternalId);
            } catch (e) {
                logDebugError('cp_transfer_order_reslet.getItemIdValue error', e, { itemInternalId });
                return fallbackText || String(itemInternalId);
            }
        };

        const mapTransferOrder = (recordId) => {
            const loadedRecord = record.load({
                type: RECORD_TYPE,
                id: recordId,
                isDynamic: false
            });
            const lineCount = loadedRecord.getLineCount({ sublistId: ITEM_SUBLIST_ID }) || 0;
            const dataRecord = {
                id: String(recordId),
                subsidiary: getBodyText(loadedRecord, 'subsidiary') || String(getBodyValue(loadedRecord, 'subsidiary') || ''),
                trandate: formatDateValue(getBodyValue(loadedRecord, 'trandate')),
                location: getBodyText(loadedRecord, 'location') || String(getBodyValue(loadedRecord, 'location') || ''),
                transferlocation: getBodyText(loadedRecord, 'transferlocation') || String(getBodyValue(loadedRecord, 'transferlocation') || ''),
                department: getBodyText(loadedRecord, 'department') || String(getBodyValue(loadedRecord, 'department') || ''),
                custbody_from_proposal: getBodyValue(loadedRecord, 'custbody_from_proposal') || '',
                custbodycustbody_field_proposalid: getBodyValue(loadedRecord, 'custbodycustbody_field_proposalid') || '',
                custbodycustbody_trx_req_custapp: !!getBodyValue(loadedRecord, 'custbodycustbody_trx_req_custapp'),
                custbodycustbody_transac_cp: getBodyText(loadedRecord, 'custbodycustbody_transac_cp')
                    || String(getBodyValue(loadedRecord, 'custbodycustbody_transac_cp') || ''),
                item: []
            };

            for (let line = 0; line < lineCount; line += 1) {
                const itemInternalId = getLineValue(loadedRecord, line, 'item');
                const quantity = globalHelper.normalizeNumberValue(
                    getLineValue(loadedRecord, line, 'quantity') || 0,
                    'quantity',
                    error
                );

                dataRecord.item.push({
                    item: getItemIdValue(itemInternalId, getLineText(loadedRecord, line, 'item')),
                    quantity,
                    units: getLineText(loadedRecord, line, 'units') || String(getLineValue(loadedRecord, line, 'units') || '')
                });
            }

            return dataRecord;
        };

        const buildHeaderFields = (requestBody = {}) => {
            const payload = getPostSource(requestBody);

            globalHelper.doValidation(
                error,
                [
                    payload.subsidiary,
                    payload.trandate,
                    payload.location,
                    payload.transferlocation
                ],
                [
                    'subsidiary',
                    'trandate',
                    'location',
                    'transferlocation'
                ],
                'post'
            );

            const headerFields = {
                subsidiary: globalHelper.resolveRecordId(
                    search,
                    payload.subsidiary,
                    ['name', 'namenohierarchy'],
                    ['subsidiary'],
                    'subsidiary',
                    error
                ),
                trandate: globalHelper.normalizeDateValue(payload.trandate, 'trandate', error),
                location: globalHelper.resolveRecordId(
                    search,
                    payload.location,
                    ['name'],
                    ['location'],
                    'location',
                    error
                ),
                transferlocation: globalHelper.resolveRecordId(
                    search,
                    payload.transferlocation,
                    ['name'],
                    ['location'],
                    'transferlocation',
                    error
                )
            };

            if (!globalHelper.isEmpty(payload.department)) {
                headerFields.department = globalHelper.resolveRecordId(
                    search,
                    payload.department,
                    ['name'],
                    ['department'],
                    'department',
                    error
                );
            }

            if (!globalHelper.isEmpty(payload.custbody_from_proposal)) {
                headerFields.custbody_from_proposal = payload.custbody_from_proposal;
            }

            if (!globalHelper.isEmpty(payload.custbodycustbody_field_proposalid)) {
                headerFields.custbodycustbody_field_proposalid = payload.custbodycustbody_field_proposalid;
            }

            headerFields.custbodycustbody_trx_req_custapp = true;

            if (!globalHelper.isEmpty(payload.custbodycustbody_transac_cp)) {
                headerFields.custbodycustbody_transac_cp = payload.custbodycustbody_transac_cp;
            }

            return headerFields;
        };

        const buildItemLines = (requestBody = {}) => {
            const itemLines = globalHelper.extractItemLines(getPostSource(requestBody));

            if (!Array.isArray(itemLines) || itemLines.length === 0) {
                throw createBadRequestError('item is required');
            }

            return itemLines.map((line, lineIndex) => {
                globalHelper.doValidation(
                    error,
                    [line && line.item, line && line.quantity],
                    ['item', 'quantity'],
                    'post.item[' + lineIndex + ']'
                );

                const itemReference = globalHelper.resolveItemReference(search, line.item, error, {
                    recordType: 'inventoryitem',
                    searchKeys: ['itemid'],
                    unitFieldId: 'stockunit',
                    itemLabel: 'item'
                });
                const mappedLine = {
                    item: itemReference.itemId,
                    quantity: globalHelper.normalizeNumberValue(line.quantity, 'quantity', error)
                };

                if (!globalHelper.isEmpty(itemReference.unitId)) {
                    mappedLine.units = itemReference.unitId;
                }

                return mappedLine;
            });
        };

        const post = (requestBody = {}) => {
            try {
                log.debug('POST requestBody', JSON.stringify(requestBody));
                globalHelper.doValidation(error, [requestBody], ['requestBody'], 'post');

                const createdId = globalHelper.createRecord(record, {
                    recordType: RECORD_TYPE,
                    bodyFields: buildHeaderFields(requestBody),
                    sublistId: ITEM_SUBLIST_ID,
                    sublistLines: buildItemLines(requestBody),
                    isDynamic: false,
                    bodyTextFieldIds: ['custbodycustbody_transac_cp'],
                    sublistTextFieldIds: []
                }, logDebugError);

                return responseHelper.success('Create Transfer Order Successfully', loadTransferOrder(createdId));
            } catch (e) {
                logDebugError('cp_transfer_order_reslet.post error', e, { requestBody });
                if (isBadRequestError(e)) {
                    return responseHelper.badRequest(e.message, null);
                }

                return responseHelper.serverError(e, null);
            }
        };

        const get = (requestParams = {}) => {
            try {
                log.debug('GET requestParams', requestParams);

                const requestedId = globalHelper.getRequestedId(requestParams);
                const recordIds = getRecordIds(requestParams);
                const dataRecord = requestedId
                    ? mapTransferOrder(recordIds[0])
                    : recordIds.map((recordId) => mapTransferOrder(recordId));

                return responseHelper.success('Get Transfer Order Successfully', dataRecord);
            } catch (e) {
                logDebugError('cp_transfer_order_reslet.get error', e, { requestParams });
                if (isBadRequestError(e)) {
                    return responseHelper.badRequest(e.message, null);
                }

                return responseHelper.serverError(e, null);
            }
        };

        const put = (requestBody = {}) => responseHelper.badRequest('Method PUT is not implemented', requestBody);

        const doDelete = (requestParams = {}) => responseHelper.badRequest('Method DELETE is not implemented', requestParams);

        return { get, post, put, delete: doDelete };
    });
