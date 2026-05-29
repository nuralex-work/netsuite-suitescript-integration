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
        const RECORD_TYPE = 'transaction';
        const DEFAULT_LIMIT = 100;
        const MAX_LIMIT = 1000;
        const DEFAULT_OFFSET = 0;
        const logDebugError = globalHelper.createDebugLogger(log);

        const isBadRequestError = (errorObject) => ['MISSING_REQ_ARG', 'INVALID_DATA'].indexOf(errorObject && errorObject.name) >= 0;

        const resolveOptionalRecordId = (value, searchKeys, recordTypes, fieldLabel) => {
            if (globalHelper.isEmpty(value)) {
                return null;
            }

            return globalHelper.resolveRecordId(
                search,
                value,
                searchKeys,
                recordTypes,
                fieldLabel,
                error
            );
        };

        const buildFilters = (requestParams = {}) => {
            const filters = [
                ['posting', 'is', 'T'],
                'and',
                ['mainline', 'is', 'F'],
                'and',
                ['taxline', 'is', 'F'],
                'and',
                ['account', 'noneof', '@NONE@']
            ];

            const subsidiaryId = resolveOptionalRecordId(
                requestParams.subsidiary,
                ['name', 'namenohierarchy'],
                ['subsidiary'],
                'subsidiary'
            );
            const locationId = resolveOptionalRecordId(
                requestParams.location,
                ['name'],
                ['location'],
                'location'
            );
            const accountId = resolveOptionalRecordId(
                requestParams.account,
                ['number', 'name'],
                ['account'],
                'account'
            );

            if (!globalHelper.isEmpty(subsidiaryId)) {
                filters.push('and', ['subsidiary', 'anyof', String(subsidiaryId)]);
            }

            if (!globalHelper.isEmpty(locationId)) {
                filters.push('and', ['location', 'anyof', String(locationId)]);
            }

            if (!globalHelper.isEmpty(accountId)) {
                filters.push('and', ['account', 'anyof', String(accountId)]);
            }

            if (!globalHelper.isEmpty(requestParams.periodStart) && !globalHelper.isEmpty(requestParams.periodEnd)) {
                filters.push('and', ['trandate', 'within', requestParams.periodStart, requestParams.periodEnd]);
            } else if (!globalHelper.isEmpty(requestParams.periodStart)) {
                filters.push('and', ['trandate', 'onorafter', requestParams.periodStart]);
            } else if (!globalHelper.isEmpty(requestParams.periodEnd)) {
                filters.push('and', ['trandate', 'onorbefore', requestParams.periodEnd]);
            }

            return filters;
        };

        const buildSearch = (requestParams = {}) => search.create({
            type: RECORD_TYPE,
            filters: buildFilters(requestParams),
            columns: [
                search.createColumn({
                    name: 'trandate',
                    sort: search.Sort.DESC
                }),
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'type' }),
                search.createColumn({ name: 'account' }),
                search.createColumn({ name: 'number', join: 'account' }),
                search.createColumn({ name: 'memo' }),
                search.createColumn({ name: 'amount' }),
                search.createColumn({ name: 'location' }),
                search.createColumn({ name: 'subsidiary' })
            ]
        });

        const mapResult = (result) => ({
            id: String(result.getValue({ name: 'internalid' }) || ''),
            tranDate: result.getValue({ name: 'trandate' }),
            account: result.getValue({ name: 'number', join: 'account' }) || result.getValue({ name: 'account' }),
            accountName: result.getText({ name: 'account' }) || '',
            amount: Number(result.getValue({ name: 'amount' }) || 0),
            memo: result.getValue({ name: 'memo' }) || '',
            location: result.getText({ name: 'location' }) || result.getValue({ name: 'location' }) || '',
            subsidiary: result.getText({ name: 'subsidiary' }) || result.getValue({ name: 'subsidiary' }) || '',
            type: result.getText({ name: 'type' }) || result.getValue({ name: 'type' }) || ''
        });

        const get = (requestParams = {}) => {
            try {
                log.debug('GET requestParams', requestParams);

                const limit = Math.min(
                    globalHelper.parsePositiveInt(requestParams && requestParams.limit, DEFAULT_LIMIT),
                    MAX_LIMIT
                );
                const actualOffset = globalHelper.isEmpty(requestParams && requestParams.offset)
                    ? DEFAULT_OFFSET
                    : Math.max(parseInt(requestParams.offset, 10) || 0, DEFAULT_OFFSET);
                const actualSearch = buildSearch(requestParams);
                const pagedData = actualSearch.runPaged({ pageSize: limit });
                const totalResults = pagedData.count;
                const results = actualSearch.run().getRange({
                    start: actualOffset,
                    end: actualOffset + limit
                }) || [];
                const items = results.map(mapResult);

                return responseHelper.success('Get Actual Expenses Successfully', {
                    totalResults,
                    count: items.length,
                    offset: actualOffset,
                    hasMore: actualOffset + items.length < totalResults,
                    items
                });
            } catch (e) {
                logDebugError('cp_actual_expenses_reslet.get error', e, { requestParams });
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
