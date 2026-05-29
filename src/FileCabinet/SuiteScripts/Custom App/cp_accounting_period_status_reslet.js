/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['./helper/global', './helper/response', 'N/error', 'N/log', 'N/search'],
    /**
 * @param{Object} globalHelper
 * @param{Object} responseHelper
 * @param{error} error
 * @param{log} log
 * @param{search} search
 */
    (globalHelper, responseHelper, error, log, search) => {
        const RECORD_TYPE = 'accountingperiod';
        const logDebugError = globalHelper.createDebugLogger(log);

        const isBadRequestError = (errorObject) => ['MISSING_REQ_ARG', 'INVALID_DATA'].indexOf(errorObject && errorObject.name) >= 0;

        const buildSearch = (requestParams = {}) => {
            globalHelper.doValidation(error, [requestParams.periodDate], ['periodDate'], 'get');

            return search.create({
                type: RECORD_TYPE,
                filters: [
                    ['startdate', 'onorbefore', requestParams.periodDate],
                    'and',
                    ['enddate', 'onorafter', requestParams.periodDate],
                    'and',
                    ['isquarter', 'is', 'F'],
                    'and',
                    ['isyear', 'is', 'F']
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'periodname' }),
                    search.createColumn({ name: 'startdate' }),
                    search.createColumn({ name: 'enddate' }),
                    search.createColumn({ name: 'closed' }),
                    search.createColumn({ name: 'alllocked' }),
                    search.createColumn({ name: 'aplocked' }),
                    search.createColumn({ name: 'arlocked' }),
                    search.createColumn({ name: 'payrolllocked' })
                ]
            });
        };

        const getSubsidiaryValue = (requestParams = {}) => {
            if (globalHelper.isEmpty(requestParams.subsidiary)) {
                return '';
            }

            const subsidiaryId = globalHelper.resolveRecordId(
                search,
                requestParams.subsidiary,
                ['name', 'namenohierarchy'],
                ['subsidiary'],
                'subsidiary',
                error
            );
            const subsidiaryLookup = globalHelper.lookupFields(search, 'subsidiary', subsidiaryId, ['namenohierarchy']);

            return subsidiaryLookup.namenohierarchy || String(requestParams.subsidiary);
        };

        const toBoolean = (value) => {
            if (typeof value === 'boolean') {
                return value;
            }

            if (typeof value === 'string') {
                return ['T', 'true', '1', 'yes', 'y'].indexOf(value) >= 0;
            }

            return value === 1;
        };

        const mapResult = (result, subsidiaryValue) => {
            const isClosed = toBoolean(result.getValue({ name: 'closed' }));
            const isAllLocked = toBoolean(result.getValue({ name: 'alllocked' }));
            const isLocked = isAllLocked
                || toBoolean(result.getValue({ name: 'aplocked' }))
                || toBoolean(result.getValue({ name: 'arlocked' }))
                || toBoolean(result.getValue({ name: 'payrolllocked' }));

            return {
                id: String(result.getValue({ name: 'internalid' }) || ''),
                periodName: result.getValue({ name: 'periodname' }) || '',
                startDate: result.getValue({ name: 'startdate' }) || '',
                endDate: result.getValue({ name: 'enddate' }) || '',
                isClosed,
                isLocked,
                isAllLocked,
                subsidiary: subsidiaryValue
            };
        };

        const get = (requestParams = {}) => {
            try {
                log.debug('GET requestParams', requestParams);

                const subsidiaryValue = getSubsidiaryValue(requestParams);
                const results = buildSearch(requestParams).run().getRange({
                    start: 0,
                    end: 100
                }) || [];

                return responseHelper.success('Get Accounting Period Status Successfully', {
                    items: results.map((result) => mapResult(result, subsidiaryValue))
                });
            } catch (e) {
                logDebugError('cp_accounting_period_status_reslet.get error', e, { requestParams });
                if (isBadRequestError(e)) {
                    return responseHelper.badRequest(e.message, null);
                }

                return responseHelper.serverError(e, null);
            }
        };

        const post = (requestBody = {}) => responseHelper.badRequest('Method POST is not implemented', requestBody);

        const put = (requestBody = {}) => responseHelper.badRequest('Method PUT is not implemented', requestBody);

        const doDelete = (requestParams = {}) => responseHelper.badRequest('Method DELETE is not implemented', requestParams);

        return { get, post, put, delete: doDelete };
    });
