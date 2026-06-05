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
        const SAVED_SEARCH_ID = 'customsearchactual_expense';
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

        const appendFilter = (filters, nextFilter) => {
            if (!nextFilter) {
                return filters;
            }

            if ((filters || []).length > 0) {
                filters.push('and');
            }

            filters.push(nextFilter);
            return filters;
        };

        const buildAdditionalFilters = (requestParams = {}) => {
            const filters = [];
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
                appendFilter(filters, ['subsidiary', 'anyof', String(subsidiaryId)]);
            }

            if (!globalHelper.isEmpty(locationId)) {
                appendFilter(filters, ['location', 'anyof', String(locationId)]);
            }

            if (!globalHelper.isEmpty(accountId)) {
                appendFilter(filters, ['account', 'anyof', String(accountId)]);
            }

            if (!globalHelper.isEmpty(requestParams.periodStart) && !globalHelper.isEmpty(requestParams.periodEnd)) {
                appendFilter(filters, ['trandate', 'within', requestParams.periodStart, requestParams.periodEnd]);
            } else if (!globalHelper.isEmpty(requestParams.periodStart)) {
                appendFilter(filters, ['trandate', 'onorafter', requestParams.periodStart]);
            } else if (!globalHelper.isEmpty(requestParams.periodEnd)) {
                appendFilter(filters, ['trandate', 'onorbefore', requestParams.periodEnd]);
            }

            return filters;
        };

        const buildSearch = (requestParams = {}) => {
            const loadedSearch = search.load({
                id: SAVED_SEARCH_ID
            });
            const baseFilters = Array.isArray(loadedSearch.filterExpression)
                ? loadedSearch.filterExpression.slice()
                : [];
            const additionalFilters = buildAdditionalFilters(requestParams);

            if (additionalFilters.length > 0) {
                loadedSearch.filterExpression = baseFilters.length > 0
                    ? [baseFilters, 'and', additionalFilters]
                    : additionalFilters;
            }

            return loadedSearch;
        };

        const getColumn = (result, candidates) => {
            const columns = result.columns || [];
            let matchedColumn = null;

            (candidates || []).some((candidate) => {
                return columns.some((column) => {
                    const nameMatches = !candidate.name || column.name === candidate.name;
                    const joinMatches = !candidate.join || column.join === candidate.join;
                    const labelMatches = !candidate.label || column.label === candidate.label;

                    if (nameMatches && joinMatches && labelMatches) {
                        matchedColumn = column;
                        return true;
                    }

                    return false;
                });
            });

            return matchedColumn;
        };

        const getResultValue = (result, candidates, getterName) => {
            const targetColumn = getColumn(result, candidates);

            if (!targetColumn) {
                return '';
            }

            try {
                return result[getterName](targetColumn) || '';
            } catch (e) {
                logDebugError('cp_actual_expenses_reslet.getResultValue error', e, {
                    getterName,
                    columnName: targetColumn.name,
                    columnJoin: targetColumn.join,
                    columnLabel: targetColumn.label
                });
                return '';
            }
        };

        const mapResult = (result) => ({
            id: String(getResultValue(result, [
                { name: 'internalid' },
                { name: 'internalid', label: 'Internal ID' }
            ], 'getValue') || ''),
            tranDate: getResultValue(result, [
                { name: 'trandate' },
                { name: 'trandate', label: 'Date' }
            ], 'getValue'),
            account: getResultValue(result, [
                { name: 'number', join: 'account' },
                { name: 'account', label: 'Account Number' },
                { name: 'account' }
            ], 'getValue'),
            accountName: getResultValue(result, [
                { name: 'account' },
                { name: 'account', label: 'Account' }
            ], 'getText'),
            amount: Number(getResultValue(result, [
                { name: 'amount' },
                { name: 'amount', label: 'Amount' }
            ], 'getValue') || 0),
            memo: getResultValue(result, [
                { name: 'memo' },
                { name: 'memo', label: 'Memo' }
            ], 'getValue'),
            location: getResultValue(result, [
                { name: 'location' },
                { name: 'location', label: 'Location' }
            ], 'getText') || getResultValue(result, [
                { name: 'location' },
                { name: 'location', label: 'Location' }
            ], 'getValue'),
            subsidiary: getResultValue(result, [
                { name: 'subsidiary' },
                { name: 'subsidiary', label: 'Subsidiary' }
            ], 'getText') || getResultValue(result, [
                { name: 'subsidiary' },
                { name: 'subsidiary', label: 'Subsidiary' }
            ], 'getValue'),
            type: getResultValue(result, [
                { name: 'type' },
                { name: 'type', label: 'Type' }
            ], 'getText') || getResultValue(result, [
                { name: 'type' },
                { name: 'type', label: 'Type' }
            ], 'getValue')
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
