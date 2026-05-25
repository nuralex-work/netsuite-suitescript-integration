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
        const RECORD_TYPE = 'inventoryitem';
        const DEFAULT_UNITSTYPE = 'Unit';
        const DEFAULT_TAXSCHEDULE = 'Non Taxable';
        const DEFAULT_LIMIT = 10;
        const MAX_LIMIT = 20;
        const logDebugError = globalHelper.createDebugLogger(log);

        const isBadRequestError = (errorObject) => ['MISSING_REQ_ARG', 'INVALID_DATA'].indexOf(errorObject && errorObject.name) >= 0;

        const createBadRequestError = (message) => error.create({
            name: 'INVALID_DATA',
            message
        });

        const getRequestRecords = (requestBody = {}) => {
            if (Array.isArray(requestBody)) {
                return requestBody;
            }

            if (Array.isArray(requestBody.records)) {
                return requestBody.records;
            }

            if (Array.isArray(requestBody.data)) {
                return requestBody.data;
            }

            if (requestBody && typeof requestBody === 'object') {
                return [requestBody.fields || requestBody];
            }

            return [];
        };

        const getRecordIds = (requestParams = {}) => {
            const requestedId = globalHelper.getRequestedId(requestParams);

            if (!globalHelper.isEmpty(requestedId)) {
                return [globalHelper.normalizeSelectValue(requestedId)];
            }

            if (!globalHelper.isEmpty(requestParams.itemid)) {
                const existingRecord = globalHelper.findData(search, ['itemid'], String(requestParams.itemid), [RECORD_TYPE]);

                if (!existingRecord || globalHelper.isEmpty(existingRecord.id)) {
                    throw createBadRequestError('itemid not found for value: ' + requestParams.itemid);
                }

                return [globalHelper.normalizeSelectValue(existingRecord.id)];
            }

            const limit = Math.min(
                globalHelper.parsePositiveInt(requestParams && requestParams.limit, DEFAULT_LIMIT),
                MAX_LIMIT
            );

            return globalHelper.searchRecordIds(search, {
                recordType: RECORD_TYPE,
                end: limit
            });
        };

        const loadInventoryItem = (recordId) => globalHelper.loadRecordData(
            record,
            RECORD_TYPE,
            recordId,
            {},
            logDebugError
        );

        const findInventoryItemId = (payload = {}) => {
            if (!globalHelper.isEmpty(payload.id)) {
                return globalHelper.normalizeSelectValue(payload.id);
            }

            if (!globalHelper.isEmpty(payload.custrecord_id)) {
                return globalHelper.normalizeSelectValue(payload.custrecord_id);
            }

            if (globalHelper.isEmpty(payload.itemid)) {
                return null;
            }

            const existingRecord = globalHelper.findData(search, ['itemid'], String(payload.itemid), [RECORD_TYPE]);

            if (!existingRecord || globalHelper.isEmpty(existingRecord.id)) {
                return null;
            }

            return globalHelper.normalizeSelectValue(existingRecord.id);
        };

        const buildBodyFields = (payload = {}, options) => {
            globalHelper.doValidation(error, [payload.itemid], ['itemid'], 'post.record');

            const bodyFields = globalHelper.extractBodyFields(payload, [
                'id',
                'custrecord_id',
                'records',
                'data',
                'subsidiary',
                'department',
                'cogsaccount',
                'assetaccount',
                'unitstype',
                'taxschedule'
            ]);
            const shouldSkipUnitstype = options && options.skipUnitstype;
            const resolveUnitstypeId = (unitstypeValue) => {
                const normalizedUnitstypeValue = globalHelper.isEmpty(unitstypeValue) ? DEFAULT_UNITSTYPE : unitstypeValue;

                try {
                    return globalHelper.resolveRecordId(
                        search,
                        normalizedUnitstypeValue,
                        ['name', 'unitname'],
                        ['unitstype'],
                        'unitstype',
                        error
                    );
                } catch (resolveError) {
                    if (normalizedUnitstypeValue === DEFAULT_UNITSTYPE) {
                        throw resolveError;
                    }

                    return globalHelper.resolveRecordId(
                        search,
                        DEFAULT_UNITSTYPE,
                        ['name', 'unitname'],
                        ['unitstype'],
                        'unitstype',
                        error
                    );
                }
            };
            const resolveTaxscheduleId = (taxscheduleValue) => {
                const normalizedTaxscheduleValue = globalHelper.isEmpty(taxscheduleValue) ? DEFAULT_TAXSCHEDULE : taxscheduleValue;

                try {
                    return globalHelper.resolveRecordId(
                        search,
                        normalizedTaxscheduleValue,
                        ['name'],
                        ['taxschedule'],
                        'taxschedule',
                        error
                    );
                } catch (resolveError) {
                    if (normalizedTaxscheduleValue === DEFAULT_TAXSCHEDULE) {
                        throw resolveError;
                    }

                    return globalHelper.resolveRecordId(
                        search,
                        DEFAULT_TAXSCHEDULE,
                        ['name'],
                        ['taxschedule'],
                        'taxschedule',
                        error
                    );
                }
            };

            if (!globalHelper.isEmpty(payload.subsidiary)) {
                bodyFields.subsidiary = globalHelper.resolveRecordId(
                    search,
                    payload.subsidiary,
                    ['name', 'namenohierarchy'],
                    ['subsidiary'],
                    'subsidiary',
                    error
                );
            }

            if (!globalHelper.isEmpty(payload.department)) {
                bodyFields.department = globalHelper.resolveRecordId(
                    search,
                    payload.department,
                    ['name'],
                    ['department'],
                    'department',
                    error
                );
            }

            if (!globalHelper.isEmpty(payload.cogsaccount)) {
                bodyFields.cogsaccount = globalHelper.resolveRecordId(
                    search,
                    payload.cogsaccount,
                    ['number'],
                    ['account'],
                    'cogsaccount',
                    error
                );
            }

            if (!globalHelper.isEmpty(payload.assetaccount)) {
                bodyFields.assetaccount = globalHelper.resolveRecordId(
                    search,
                    payload.assetaccount,
                    ['number'],
                    ['account'],
                    'assetaccount',
                    error
                );
            }

            if (!shouldSkipUnitstype) {
                bodyFields.unitstype = resolveUnitstypeId(payload.unitstype);
            }
            bodyFields.taxschedule = resolveTaxscheduleId(payload.taxschedule);

            return bodyFields;
        };

        const upsertRecord = (payload = {}) => {
            const existingRecordId = findInventoryItemId(payload);
            const bodyFields = buildBodyFields(payload, {
                skipUnitstype: !globalHelper.isEmpty(existingRecordId)
            });

            if (!globalHelper.isEmpty(existingRecordId)) {
                const updatedId = globalHelper.updateRecord(record, {
                    recordType: RECORD_TYPE,
                    recordId: existingRecordId,
                    bodyFields,
                    isDynamic: false
                }, logDebugError);

                return {
                    action: 'updated',
                    id: updatedId,
                    record: loadInventoryItem(updatedId)
                };
            }

            const createdId = globalHelper.createRecord(record, {
                recordType: RECORD_TYPE,
                bodyFields,
                isDynamic: false
            }, logDebugError);

            return {
                action: 'created',
                id: createdId,
                record: loadInventoryItem(createdId)
            };
        };

        const get = (requestParams = {}) => {
            try {
                log.debug('GET requestParams', requestParams);

                const requestedId = globalHelper.getRequestedId(requestParams) || requestParams.itemid;
                const recordIds = getRecordIds(requestParams);
                const records = requestedId
                    ? loadInventoryItem(recordIds[0])
                    : recordIds.map((recordId) => loadInventoryItem(recordId));

                return responseHelper.success('Get Inventory Item Successfully', {
                    record: records,
                    total_record: Array.isArray(records) ? records.length : 1
                });
            } catch (e) {
                logDebugError('cp_inventoryitem_reslet.get error', e, { requestParams });
                if (isBadRequestError(e)) {
                    return responseHelper.badRequest(e.message, null);
                }

                return responseHelper.serverError(e, null);
            }
        };

        const post = (requestBody = {}) => {
            try {
                log.debug('POST requestBody', JSON.stringify(requestBody));

                const records = getRequestRecords(requestBody);

                if (!Array.isArray(records) || records.length === 0) {
                    throw createBadRequestError('records is required');
                }

                const results = records.map((payload) => upsertRecord(payload));

                return responseHelper.success('Create Or Update Inventory Item Successfully', {
                    record: results,
                    total_record: results.length
                });
            } catch (e) {
                logDebugError('cp_inventoryitem_reslet.post error', e, { requestBody });
                if (isBadRequestError(e)) {
                    return responseHelper.badRequest(e.message, null);
                }

                return responseHelper.serverError(e, null);
            }
        };

        const doDelete = (requestParams = {}) => {
            try {
                log.debug('DELETE requestParams', requestParams);

                const recordIds = getRecordIds(requestParams);
                const deletedIds = recordIds.map((recordId) => record.delete({
                    type: RECORD_TYPE,
                    id: recordId
                }));

                return responseHelper.success('Delete Inventory Item Successfully', {
                    record: deletedIds,
                    total_record: deletedIds.length
                });
            } catch (e) {
                logDebugError('cp_inventoryitem_reslet.delete error', e, { requestParams });
                if (isBadRequestError(e)) {
                    return responseHelper.badRequest(e.message, null);
                }

                return responseHelper.serverError(e, null);
            }
        };

        const put = (requestBody = {}) => responseHelper.badRequest('Method PUT is not implemented. Use POST for upsert', requestBody);

        return { get, post, put, delete: doDelete };
    });
