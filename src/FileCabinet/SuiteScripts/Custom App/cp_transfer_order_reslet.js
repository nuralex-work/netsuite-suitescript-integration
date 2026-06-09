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

        const loadTransferOrder = (recordId) => globalHelper.loadRecordData(
            record,
            RECORD_TYPE,
            recordId,
            { sublistIds: [ITEM_SUBLIST_ID] },
            logDebugError
        );

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

            if (!globalHelper.isEmpty(payload.custbody_proposal_id)) {
                headerFields.custbody_proposal_id = payload.custbody_proposal_id;
            }

            headerFields.custbodycustbody_trx_req_custapp = true;

            if (!globalHelper.isEmpty(payload.custbodycustbody_transac_cp)) {
                headerFields.custbodycustbody_transac_cp = payload.custbodycustbody_transac_cp;
            }

            return headerFields;
        };

        const resolveLineUnit = (line, itemReference) => {
            if (globalHelper.isEmpty(line && line.units)) {
                return itemReference.unitId;
            }

            return globalHelper.normalizeSelectValue(line.units);
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
                const unitId = resolveLineUnit(line, itemReference);

                if (!globalHelper.isEmpty(unitId)) {
                    mappedLine.units = unitId;
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
                    sublistTextFieldIds: ['units']
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

        const get = (requestParams = {}) => responseHelper.badRequest('Method GET is not implemented', requestParams);

        const put = (requestBody = {}) => responseHelper.badRequest('Method PUT is not implemented', requestBody);

        const doDelete = (requestParams = {}) => responseHelper.badRequest('Method DELETE is not implemented', requestParams);

        return { get, post, put, delete: doDelete };
    });
