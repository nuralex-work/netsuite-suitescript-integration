/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['./helper/global', './helper/response', 'N/error', 'N/log', 'N/search', 'N/format'],
    /**
 * @param{Object} globalHelper
 * @param{Object} responseHelper
 * @param{error} error
 * @param{log} log
 * @param{search} search
 * @param{format} format
 */
    (globalHelper, responseHelper, error, log, search, format) => {
        const RECORD_TYPE = 'accountingperiod';
        const SEARCH_PAGE_SIZE = 1000;
        const logDebugError = globalHelper.createDebugLogger(log);

        const isBadRequestError = (errorObject) => ['MISSING_REQ_ARG', 'INVALID_DATA'].indexOf(errorObject && errorObject.name) >= 0;

        const toBoolean = (value) => {
            if (typeof value === 'boolean') {
                return value;
            }

            if (typeof value === 'string') {
                return ['t', 'true', '1', 'yes', 'y', 'T'].indexOf(value) >= 0;
            }

            return value === 1;
        };

        const normalizeCompareValue = (value) => String(value || '').trim().toLowerCase();

        const normalizeRequestDate = (periodDate) => {
            globalHelper.doValidation(error, [periodDate], ['periodDate'], 'get');

            const normalizedDate = globalHelper.normalizeDateValue(periodDate, 'periodDate', error);

            return {
                dateObject: normalizedDate,
                searchValue: format.format({
                    value: normalizedDate,
                    type: format.Type.DATE
                }),
                isoValue: normalizedDate.toISOString().slice(0, 10)
            };
        };

        const parseSearchDate = (value) => {
            if (globalHelper.isEmpty(value)) {
                return null;
            }

            try {
                return format.parse({
                    value,
                    type: format.Type.DATE
                });
            } catch (e) {
                logDebugError('cp_accounting_period_status_reslet.parseSearchDate error', e, { value });
                return null;
            }
        };

        const buildBaseSearch = () => search.create({
            type: RECORD_TYPE,
            filters: [
                ['isquarter', 'is', 'F'],
                'and',
                ['isyear', 'is', 'F']
            ],
            columns: [
                search.createColumn({
                    name: 'startdate',
                    sort: search.Sort.ASC
                }),
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'periodname' }),
                search.createColumn({ name: 'enddate' }),
                search.createColumn({ name: 'closed' }),
                search.createColumn({ name: 'alllocked' }),
                search.createColumn({ name: 'aplocked' }),
                search.createColumn({ name: 'arlocked' }),
                search.createColumn({ name: 'payrolllocked' })
            ]
        });

        const getSubsidiaryValue = (requestParams = {}) => {
            if (globalHelper.isEmpty(requestParams.subsidiary)) {
                return '';
            }

            try {
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
            } catch (e) {
                logDebugError('cp_accounting_period_status_reslet.getSubsidiaryValue error', e, { requestParams });
                throw e;
            }
        };

        const isDateWithinPeriod = (targetDate, startDateValue, endDateValue) => {
            const startDate = parseSearchDate(startDateValue);
            const endDate = parseSearchDate(endDateValue);

            if (!startDate || !endDate) {
                return false;
            }

            return targetDate.getTime() >= startDate.getTime() && targetDate.getTime() <= endDate.getTime();
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

                const normalizedPeriodDate = normalizeRequestDate(requestParams.periodDate);
                const subsidiaryValue = getSubsidiaryValue(requestParams);
                const searchResults = [];
                const periodSearch = buildBaseSearch();
                const pagedData = periodSearch.runPaged({ pageSize: SEARCH_PAGE_SIZE });

                pagedData.pageRanges.forEach((pageRange) => {
                    const page = pagedData.fetch({ index: pageRange.index });

                    page.data.forEach((result) => {
                        searchResults.push(result);
                    });
                });

                const items = searchResults
                    .filter((result) => isDateWithinPeriod(
                        normalizedPeriodDate.dateObject,
                        result.getValue({ name: 'startdate' }),
                        result.getValue({ name: 'enddate' })
                    ))
                    .map((result) => mapResult(result, subsidiaryValue))
                    .filter((item) => {
                        if (globalHelper.isEmpty(requestParams.subsidiary)) {
                            return true;
                        }

                        return normalizeCompareValue(item.subsidiary) === normalizeCompareValue(subsidiaryValue);
                    });

                return responseHelper.success('Get Accounting Period Status Successfully', {
                    items
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
