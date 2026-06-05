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
        const RECORD_TYPE = 'purchaserequisition';
        const ITEM_SUBLIST_ID = 'item';
        const DEFAULT_LIMIT = 10;
        const MAX_LIMIT = 20;
        const DEFAULT_CURRENCY = 'IDR';
        const DEFAULT_DEPARTMENT = 'IT & Smartpay';
        const ADDITIONAL_HEADER_FIELD_IDS = [
            'custbodycustbody_ea_car',
            'custbodycustbody_ea_motorbike',
            'custbodycustbody_ex_car',
            'custbodycustbody_ex_motorbike',
            'custbodycustbody_srf_entry',
            'custbodycustbody_srf_exit'
        ];
        const logDebugError = globalHelper.createDebugLogger(log);

        const getRecordIds = (requestParams) => {
            const requestedId = globalHelper.getRequestedId(requestParams);

            if (requestedId) {
                return [requestedId];
            }

            const limit = Math.min(
                globalHelper.parsePositiveInt(requestParams && requestParams.limit, DEFAULT_LIMIT),
                MAX_LIMIT
            );

            return globalHelper.searchRecordIds(search, {
                recordType: RECORD_TYPE,
                filters: [['mainline', 'is', 'T']],
                end: limit
            });
        };

        const loadPurchaseRequisition = (recordId) => globalHelper.loadRecordData(
            record,
            RECORD_TYPE,
            recordId,
            { sublistIds: [ITEM_SUBLIST_ID] },
            logDebugError
        );

        const createBadRequestError = (message) => error.create({
            name: 'INVALID_DATA',
            message
        });

        const isBadRequestError = (errorObject) => ['MISSING_REQ_ARG', 'INVALID_DATA'].indexOf(errorObject && errorObject.name) >= 0;

        const getEstimatedRateInput = (line) => {
            if (!globalHelper.isEmpty(line && line.estimatedrate)) {
                return line.estimatedrate;
            }

            return line && line.rate;
        };

        const getEstimatedRateValue = (line) => globalHelper.normalizeNumberValue(
            getEstimatedRateInput(line),
            'estimatedrate',
            error
        );

        const getEstimatedAmountValue = (line) => {
            if (!globalHelper.isEmpty(line && line.estimatedamount)) {
                return globalHelper.normalizeNumberValue(line.estimatedamount, 'estimatedamount', error);
            }

            return globalHelper.normalizeNumberValue(line.quantity, 'quantity', error) * getEstimatedRateValue(line);
        };

        const getPostSource = (requestBody = {}) => requestBody.fields || requestBody;

        const findExistingPurchaseRequisitionByProposalId = (proposalIdValue) => {
            if (globalHelper.isEmpty(proposalIdValue)) {
                return null;
            }

            const existingRecordSearch = search.create({
                type: RECORD_TYPE,
                filters: [
                    ['mainline', 'is', 'T'],
                    'and',
                    ['custbodycustbody_field_proposalid', 'is', String(proposalIdValue)],
                    'and',
                    ['custbodycustbody_trx_req_custapp', 'is', 'T']
                ],
                columns: [
                    search.createColumn({
                        name: 'internalid'
                    })
                ]
            });

            const existingRecords = existingRecordSearch.run().getRange({
                start: 0,
                end: 1
            });

            return existingRecords.length > 0 ? existingRecords[0].id : null;
        };

        const buildHeaderFields = (requestBody = {}, currencyText, options) => {
            const payload = getPostSource(requestBody);
            const headerFields = {};
            const shouldValidateMandatory = options && options.requireMandatory;

            if (shouldValidateMandatory) {
                globalHelper.doValidation(
                    error,
                    [payload.subsidiary, payload.location, payload.trandate],
                    ['subsidiary', 'location', 'trandate'],
                    'post'
                );
            }

            if (!globalHelper.isEmpty(payload.subsidiary)) {
                headerFields.subsidiary = globalHelper.resolveRecordId(
                    search,
                    payload.subsidiary,
                    ['name', 'namenohierarchy'],
                    ['subsidiary'],
                    'subsidiary',
                    error
                );
            }

            if (!globalHelper.isEmpty(payload.location)) {
                headerFields.location = globalHelper.resolveRecordId(
                    search,
                    payload.location,
                    ['name'],
                    ['location'],
                    'location',
                    error
                );
            }

            if (!globalHelper.isEmpty(payload.trandate)) {
                headerFields.trandate = globalHelper.normalizeDateValue(payload.trandate, 'trandate', error);
            }

            headerFields.department = globalHelper.resolveRecordId(
                search,
                globalHelper.isEmpty(payload.department) ? DEFAULT_DEPARTMENT : payload.department,
                ['name'],
                ['department'],
                'department',
                error
            );

            if (!globalHelper.isEmpty(currencyText)) {
                headerFields.currency = globalHelper.resolveRecordId(
                    search,
                    currencyText,
                    ['symbol'],
                    ['currency'],
                    'currency',
                    error
                );
            }

            if (!globalHelper.isEmpty(payload.memo)) {
                headerFields.memo = payload.memo;
            }

            if (!globalHelper.isEmpty(payload.custbodycustbody_field_proposalid)) {
                headerFields.custbodycustbody_field_proposalid = payload.custbodycustbody_field_proposalid;
            }

            if (!globalHelper.isEmpty(payload.custbody_proposal_number)) {
                headerFields.custbody_proposal_number = payload.custbody_proposal_number;
            }

            ADDITIONAL_HEADER_FIELD_IDS.forEach((fieldId) => {
                if (!globalHelper.isEmpty(payload[fieldId])) {
                    headerFields[fieldId] = payload[fieldId];
                }
            });

            headerFields.custbodycustbody_trx_req_custapp = globalHelper.normalizeCheckboxValue(
                true,
                'custbodycustbody_trx_req_custapp',
                error
            );
            return headerFields;
        };

        const buildItemLines = (requestBody = {}) => {
            const itemLines = globalHelper.extractItemLines(requestBody);

            if (!Array.isArray(itemLines) || itemLines.length === 0) {
                throw createBadRequestError('item is required');
            }

            return itemLines.map((line, lineIndex) => {
                const itemReference = globalHelper.resolveItemReference(search, line && line.item, error, {
                    recordType: 'inventoryitem',
                    searchKeys: ['itemid'],
                    unitFieldId: 'stockunit',
                    itemLabel: 'item'
                });

                globalHelper.doValidation(
                    error,
                    [line && line.item, line && line.quantity, getEstimatedRateInput(line), line && line.units],
                    ['item', 'quantity', 'estimatedrate', 'units'],
                    'post.item[' + lineIndex + ']',
                    ['units']
                );

                const mappedLine = {
                    item: itemReference.itemId,
                    quantity: globalHelper.normalizeNumberValue(line.quantity, 'quantity', error),
                    estimatedrate: getEstimatedRateValue(line),
                    estimatedamount: getEstimatedAmountValue(line)
                };

                if (!globalHelper.isEmpty(itemReference.unitId)) {
                    mappedLine.units = itemReference.unitId;
                }

                if (!globalHelper.isEmpty(line.description)) {
                    mappedLine.description = line.description;
                }

                if (!globalHelper.isEmpty(line.currency)) {
                    mappedLine.currency = line.currency;
                }

                return mappedLine;
            });
        };

        const get = (requestParams = {}) => {
            try {
                log.debug('GET requestParams', requestParams);

                const requestedId = globalHelper.getRequestedId(requestParams);
                const recordIds = getRecordIds(requestParams);
                const dataRecord = requestedId
                    ? loadPurchaseRequisition(recordIds[0])
                    : recordIds.map((recordId) => loadPurchaseRequisition(recordId));

                return responseHelper.success('Get Purchase Requisition Successfully', dataRecord);
            } catch (e) {
                logDebugError('cp_purchase_request_reslet.get error', e, { requestParams });
                return responseHelper.serverError(e, null);
            }
        };

        const post = (requestBody = {}) => {
            try {
                log.debug('POST requestBody', JSON.stringify(requestBody));
                globalHelper.doValidation(error, [requestBody], ['requestBody'], 'post');
                const payload = getPostSource(requestBody);
                const existingRecordId = findExistingPurchaseRequisitionByProposalId(payload.custbodycustbody_field_proposalid);
                const itemLines = buildItemLines(requestBody);
                const currencyText = globalHelper.resolveSingleTextValue([
                    payload.currency
                ].concat(itemLines.map((line) => line.currency)), 'currency', error, {
                    defaultValue: DEFAULT_CURRENCY,
                    multipleValueMessage: 'Multiple currencies are not supported in one purchase requisition'
                });
                const bodyFields = buildHeaderFields(requestBody, currencyText, { requireMandatory: true });

                if (!globalHelper.isEmpty(existingRecordId)) {
                    const updatedId = globalHelper.updateRecord(record, {
                        recordType: RECORD_TYPE,
                        recordId: globalHelper.normalizeSelectValue(existingRecordId),
                        bodyFields,
                        sublistId: ITEM_SUBLIST_ID,
                        sublistLines: itemLines,
                        replaceSublist: true,
                        isDynamic: false,
                        bodyTextFieldIds: ['currency'],
                        sublistTextFieldIds: ['units'],
                        sublistIgnoredFieldIds: ['currency']
                    }, logDebugError);
                    const updatedRecord = loadPurchaseRequisition(updatedId);

                    return responseHelper.success('Update Purchase Requisition Successfully', updatedRecord);
                }

                const createdId = globalHelper.createRecord(record, {
                    recordType: RECORD_TYPE,
                    bodyFields,
                    sublistId: ITEM_SUBLIST_ID,
                    sublistLines: itemLines,
                    isDynamic: false,
                    bodyTextFieldIds: ['currency'],
                    sublistTextFieldIds: ['units'],
                    sublistIgnoredFieldIds: ['currency']
                }, logDebugError);

                const dataRecord = loadPurchaseRequisition(createdId);

                return responseHelper.success('Create Purchase Requisition Successfully', dataRecord);
            } catch (e) {
                logDebugError('cp_purchase_request_reslet.post error', e, { requestBody });
                if (isBadRequestError(e)) {
                    return responseHelper.badRequest(e.message, null);
                }

                return responseHelper.serverError(e, null);
            }
        };

        const put = (requestBody = {}) => {
            try {
                log.debug('PUT requestBody', JSON.stringify(requestBody));
                globalHelper.doValidation(error, [requestBody], ['requestBody'], 'put');

                const recordId = globalHelper.resolveTargetRecordId(requestBody, error);
                const itemLines = globalHelper.extractItemLines(requestBody);
                const resolvedItemLines = itemLines.length > 0 ? buildItemLines(requestBody) : [];
                const payload = getPostSource(requestBody);
                const currencyText = globalHelper.resolveSingleTextValue([
                    payload.currency
                ].concat(resolvedItemLines.map((line) => line.currency)), 'currency', error, {
                    defaultValue: null,
                    multipleValueMessage: 'Multiple currencies are not supported in one purchase requisition'
                });
                const bodyFields = buildHeaderFields(requestBody, currencyText, { requireMandatory: false });

                const updatedId = globalHelper.updateRecord(record, {
                    recordType: RECORD_TYPE,
                    recordId,
                    bodyFields,
                    sublistId: ITEM_SUBLIST_ID,
                    sublistLines: resolvedItemLines,
                    replaceSublist: itemLines.length > 0,
                    isDynamic: false,
                    bodyTextFieldIds: ['currency'],
                    sublistTextFieldIds: ['units'],
                    sublistIgnoredFieldIds: ['currency']
                }, logDebugError);

                const dataRecord = loadPurchaseRequisition(updatedId);

                return responseHelper.success('Update Purchase Requisition Successfully', dataRecord);
            } catch (e) {
                logDebugError('cp_purchase_request_reslet.put error', e, { requestBody });
                if (isBadRequestError(e)) {
                    return responseHelper.badRequest(e.message, null);
                }

                return responseHelper.serverError(e, null);
            }
        };

        const doDelete = (requestParams = {}) => responseHelper.badRequest('Method DELETE is not implemented', requestParams);

        return { get, put, post, delete: doDelete };
    });
