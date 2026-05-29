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
        const RECORD_TYPE = 'vendorbill';
        const ITEM_SUBLIST_ID = 'item';
        const DEFAULT_LIMIT = 10;
        const MAX_LIMIT = 20;
        const logDebugError = globalHelper.createDebugLogger(log);

        const createBadRequestError = (message) => error.create({
            name: 'INVALID_DATA',
            message
        });

        const isBadRequestError = (errorObject) => ['MISSING_REQ_ARG', 'INVALID_DATA'].indexOf(errorObject && errorObject.name) >= 0;

        const getPostSource = (requestBody = {}) => requestBody.fields || requestBody;

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

        const loadVendorBill = (recordId) => globalHelper.loadRecordData(
            record,
            RECORD_TYPE,
            recordId,
            { sublistIds: [ITEM_SUBLIST_ID] },
            logDebugError
        );

        const buildHeaderFields = (requestBody = {}) => {
            const payload = getPostSource(requestBody);
            const headerFields = {};

            globalHelper.doValidation(
                error,
                [
                    payload.subsidiary,
                    payload.location,
                    payload.entity,
                    payload.trandate,
                    payload.duedate,
                    payload.currency,
                    payload.account
                ],
                ['subsidiary', 'location', 'entity', 'trandate', 'duedate', 'currency', 'account'],
                'post'
            );

            headerFields.subsidiary = globalHelper.resolveRecordId(
                search,
                payload.subsidiary,
                ['name', 'namenohierarchy'],
                ['subsidiary'],
                'subsidiary',
                error
            );

            headerFields.location = globalHelper.resolveRecordId(
                search,
                payload.location,
                ['name'],
                ['location'],
                'location',
                error
            );

            headerFields.entity = globalHelper.resolveRecordId(
                search,
                payload.entity,
                ['altname'],
                ['vendor'],
                'entity',
                error
            );

            headerFields.trandate = globalHelper.normalizeDateValue(payload.trandate, 'trandate', error);
            headerFields.duedate = globalHelper.normalizeDateValue(payload.duedate, 'duedate', error);

            if (!globalHelper.isEmpty(payload.memo)) {
                headerFields.memo = payload.memo;
            }

            headerFields.currency = globalHelper.resolveRecordId(
                search,
                payload.currency,
                ['symbol'],
                ['currency'],
                'currency',
                error
            );

            headerFields.account = globalHelper.resolveRecordId(
                search,
                payload.account,
                ['name'],
                ['account'],
                'account',
                error
            );

            return headerFields;
        };

        const buildItemLines = (requestBody = {}, headerFields = {}) => {
            const itemLines = globalHelper.extractItemLines(requestBody);

            if (!Array.isArray(itemLines) || itemLines.length === 0) {
                throw createBadRequestError('item is required');
            }

            return itemLines.map((line, lineIndex) => {
                globalHelper.doValidation(
                    error,
                    [line && line.item, line && line.quantity, line && line.rate, line && line.taxcode],
                    ['item', 'quantity', 'rate', 'taxcode'],
                    'post.item[' + lineIndex + ']'
                );

                return {
                    item: globalHelper.resolveRecordId(
                        search,
                        line.item,
                        ['itemid'],
                        ['inventoryitem'],
                        'item',
                        error
                    ),
                    quantity: globalHelper.normalizeNumberValue(line.quantity, 'quantity', error),
                    rate: globalHelper.normalizeNumberValue(line.rate, 'rate', error),
                    location: !globalHelper.isEmpty(line && line.location)
                        ? globalHelper.resolveRecordId(
                            search,
                            line.location,
                            ['name'],
                            ['location'],
                            'location',
                            error
                        )
                        : headerFields.location,
                    taxcode: globalHelper.resolveRecordId(
                        search,
                        line.taxcode,
                        ['itemid'],
                        ['salestaxitem'],
                        'taxcode',
                        error
                    )
                };
            });
        };

        const post = (requestBody = {}) => {
            try {
                log.debug('POST requestBody', JSON.stringify(requestBody));
                globalHelper.doValidation(error, [requestBody], ['requestBody'], 'post');

                const bodyFields = buildHeaderFields(requestBody);
                const itemLines = buildItemLines(requestBody, bodyFields);

                const createdId = globalHelper.createRecord(record, {
                    recordType: RECORD_TYPE,
                    bodyFields,
                    sublistId: ITEM_SUBLIST_ID,
                    sublistLines: itemLines,
                    isDynamic: false
                }, logDebugError);

                const dataRecord = loadVendorBill(createdId);

                return responseHelper.success('Create Vendor Bill Successfully', dataRecord);
            } catch (e) {
                logDebugError('cp_vendor_bill_reslet.post error', e, { requestBody });
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
                const records = requestedId
                    ? loadVendorBill(recordIds[0])
                    : recordIds.map((recordId) => loadVendorBill(recordId));

                return responseHelper.success('Get Vendor Bill Successfully', {
                    record: records,
                    total_record: Array.isArray(records) ? records.length : 1
                });
            } catch (e) {
                logDebugError('cp_vendor_bill_reslet.get error', e, { requestParams });
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
