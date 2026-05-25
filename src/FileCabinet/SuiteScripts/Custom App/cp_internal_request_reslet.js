/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['./helper/global', './helper/response', 'N/log', 'N/record', 'N/search'],
    /**
 * @param{Object} globalHelper
 * @param{Object} responseHelper
 * @param{log} log
 * @param{record} record
 * @param{search} search
 */
    (globalHelper, responseHelper, log, record, search) => {
        const RECORD_TYPE = 'customrecord_cp_internal_req';
        const LINES_SUBLIST_ID = 'customrecord_cp_ir_lines';
        const DEFAULT_LIMIT = 10;
        const MAX_LIMIT = 20;
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
                end: limit
            });
        };

        const loadInternalRequest = (recordId) => globalHelper.loadRecordData(
            record,
            RECORD_TYPE,
            recordId,
            { sublistIds: [LINES_SUBLIST_ID] },
            logDebugError
        );

        const get = (requestParams = {}) => {
            try {
                log.debug('GET requestParams', requestParams);

                const requestedId = globalHelper.getRequestedId(requestParams);
                const recordIds = getRecordIds(requestParams);
                const dataRecord = requestedId
                    ? loadInternalRequest(recordIds[0])
                    : recordIds.map((recordId) => loadInternalRequest(recordId));

                return responseHelper.success('Get Internal Request Successfully', dataRecord);
            } catch (e) {
                logDebugError('cp_internal_request_reslet.get error', e, { requestParams });
                return responseHelper.serverError(e, null);
            }
        };

        const post = (requestBody = {}) => responseHelper.badRequest('Method POST is not implemented', requestBody);

        const put = (requestBody = {}) => responseHelper.badRequest('Method PUT is not implemented', requestBody);

        const doDelete = (requestParams = {}) => responseHelper.badRequest('Method DELETE is not implemented', requestParams);

        return { get, post, put, delete: doDelete };
    });
