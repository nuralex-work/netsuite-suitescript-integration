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
        const RECORD_TYPE = 'customrecord_ncfar_asset';
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

        const loadAsset = (recordId) => globalHelper.loadRecordData(
            record,
            RECORD_TYPE,
            recordId,
            {},
            logDebugError
        );

        const get = (requestParams = {}) => {
            try {
                log.debug('GET requestParams', requestParams);

                const requestedId = globalHelper.getRequestedId(requestParams);
                const recordIds = getRecordIds(requestParams);
                const dataRecord = requestedId
                    ? loadAsset(recordIds[0])
                    : recordIds.map((recordId) => loadAsset(recordId));

                return responseHelper.success('Get Asset Successfully', dataRecord);
            } catch (e) {
                logDebugError('cp_asset_reslet.get error', e, { requestParams });
                return responseHelper.serverError(e, null);
            }
        };

        const post = (requestBody = {}) => responseHelper.badRequest('Method POST is not implemented', requestBody);

        const put = (requestBody = {}) => responseHelper.badRequest('Method PUT is not implemented', requestBody);

        const doDelete = (requestParams = {}) => responseHelper.badRequest('Method DELETE is not implemented', requestParams);

        return { get, post, put, delete: doDelete };
    });
