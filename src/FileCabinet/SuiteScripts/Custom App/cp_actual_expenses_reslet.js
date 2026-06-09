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
        const SAVED_SEARCH_ID = 'customsearchactual_expense';
        const SEARCH_PAGE_SIZE = 1000;
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

        const normalizeDateFilterValue = (value, fieldName) => {
            if (globalHelper.isEmpty(value)) {
                return '';
            }

            return format.format({
                value: globalHelper.normalizeDateValue(value, fieldName, error),
                type: format.Type.DATE
            });
        };

        const buildAdditionalFilters = (requestParams = {}) => {
            const filters = [];
            const periodStart = normalizeDateFilterValue(requestParams.periodStart, 'periodStart');
            const periodEnd = normalizeDateFilterValue(requestParams.periodEnd, 'periodEnd');
            const locationId = resolveOptionalRecordId(
                requestParams.location,
                ['name'],
                ['location'],
                'location'
            );

            if (!globalHelper.isEmpty(locationId)) {
                appendFilter(filters, ['location', 'anyof', String(locationId)]);
            }

            if (!globalHelper.isEmpty(requestParams.proposal_id)) {
                appendFilter(filters, ['custbodycustbody_field_proposalid', 'is', String(requestParams.proposal_id)]);
            }

            if (!globalHelper.isEmpty(periodStart) && !globalHelper.isEmpty(periodEnd)) {
                appendFilter(filters, ['trandate', 'within', periodStart, periodEnd]);
            } else if (!globalHelper.isEmpty(periodStart)) {
                appendFilter(filters, ['trandate', 'onorafter', periodStart]);
            } else if (!globalHelper.isEmpty(periodEnd)) {
                appendFilter(filters, ['trandate', 'onorbefore', periodEnd]);
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

        const normalizeColumnKey = (value) => {
            const normalizedValue = String(value || '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '');

            return normalizedValue || null;
        };

        const getColumnKey = (column, index, existingKeys) => {
            const keyParts = [];

            if (!globalHelper.isEmpty(column && column.join)) {
                keyParts.push(column.join);
            }

            if (!globalHelper.isEmpty(column && column.name)) {
                keyParts.push(column.name);
            }

            if (!globalHelper.isEmpty(column && column.summary)) {
                keyParts.push(column.summary);
            }

            const baseKey = normalizeColumnKey((column && column.label) || keyParts.join('_')) || ('column_' + (index + 1));
            let uniqueKey = baseKey;
            let duplicateIndex = 2;

            while (Object.prototype.hasOwnProperty.call(existingKeys, uniqueKey)) {
                uniqueKey = baseKey + '_' + duplicateIndex;
                duplicateIndex += 1;
            }

            existingKeys[uniqueKey] = true;
            return uniqueKey;
        };

        const getColumnValue = (result, column) => {
            try {
                const textValue = result.getText(column);

                if (!globalHelper.isEmpty(textValue) || textValue === 0 || textValue === false) {
                    return textValue;
                }
            } catch (e) {
                logDebugError('cp_actual_expenses_reslet.getColumnValue.getText error', e, {
                    columnName: column && column.name,
                    columnJoin: column && column.join,
                    columnLabel: column && column.label
                });
            }

            try {
                const value = result.getValue(column);

                if (!globalHelper.isEmpty(value) || value === 0 || value === false) {
                    return value;
                }

                return '';
            } catch (e) {
                logDebugError('cp_actual_expenses_reslet.getColumnValue.getValue error', e, {
                    columnName: column && column.name,
                    columnJoin: column && column.join,
                    columnLabel: column && column.label
                });
                return '';
            }
        };

        const normalizeMappedValue = (key, value) => {
            if (key === 'quantity') {
                const parsedQuantity = Number(String(value || '').replace(/,/g, ''));
                return Number.isNaN(parsedQuantity) ? 0 : parsedQuantity;
            }

            return value;
        };

        const mapResult = (result) => {
            const mappedResult = {};
            const existingKeys = {};

            (result.columns || []).forEach((column, index) => {
                const columnKey = getColumnKey(column, index, existingKeys);
                mappedResult[columnKey] = normalizeMappedValue(columnKey, getColumnValue(result, column));
            });

            return mappedResult;
        };

        const getAllSearchResults = (actualSearch) => {
            const searchResults = [];
            const pagedData = actualSearch.runPaged({ pageSize: SEARCH_PAGE_SIZE });

            pagedData.pageRanges.forEach((pageRange) => {
                const page = pagedData.fetch({ index: pageRange.index });

                page.data.forEach((result) => {
                    searchResults.push(result);
                });
            });

            return searchResults;
        };

        const get = (requestParams = {}) => {
            try {
                log.debug('GET requestParams', requestParams);

                const actualSearch = buildSearch(requestParams);
                const items = getAllSearchResults(actualSearch).map(mapResult);

                return responseHelper.success('Get Actual Expenses Successfully', items);
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
