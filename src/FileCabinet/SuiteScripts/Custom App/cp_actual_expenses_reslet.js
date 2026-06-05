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

        const normalizeSearchDate = (value, fieldName) => {
            if (globalHelper.isEmpty(value)) {
                return '';
            }

            return format.format({
                value: globalHelper.normalizeDateValue(value, fieldName, error),
                type: format.Type.DATE
            });
        };

        const getPeriodEndValue = (requestParams = {}) => requestParams.periodEnd;

        const parseDateForCompare = (dateValue) => {
            if (globalHelper.isEmpty(dateValue)) {
                return null;
            }

            if (dateValue instanceof Date) {
                const dateObject = new Date(dateValue.getTime());
                dateObject.setHours(0, 0, 0, 0);
                return dateObject;
            }

            const normalizedDateValue = String(dateValue).trim();
            const isoDateParts = normalizedDateValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

            if (isoDateParts) {
                const dateObject = new Date(
                    Number(isoDateParts[1]),
                    Number(isoDateParts[2]) - 1,
                    Number(isoDateParts[3])
                );

                dateObject.setHours(0, 0, 0, 0);
                return dateObject;
            }

            const slashDateParts = normalizedDateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

            if (slashDateParts) {
                const dateObject = new Date(
                    Number(slashDateParts[3]),
                    Number(slashDateParts[2]) - 1,
                    Number(slashDateParts[1])
                );

                dateObject.setHours(0, 0, 0, 0);
                return dateObject;
            }

            try {
                const parsedDate = format.parse({
                    value: normalizedDateValue,
                    type: format.Type.DATE
                });

                parsedDate.setHours(0, 0, 0, 0);
                return parsedDate;
            } catch (e) {
                logDebugError('cp_actual_expenses_reslet.parseDateForCompare.formatParse error', e, { dateValue });
            }

            try {
                const parsedDate = globalHelper.normalizeDateValue(dateValue, 'date', error);

                parsedDate.setHours(0, 0, 0, 0);
                return parsedDate;
            } catch (e) {
                logDebugError('cp_actual_expenses_reslet.parseDateForCompare.normalizeDateValue error', e, { dateValue });
                return null;
            }
        };

        const buildAdditionalFilters = (requestParams = {}) => {
            const filters = [];
            const periodStart = normalizeSearchDate(requestParams.periodStart, 'periodStart');
            const periodEnd = normalizeSearchDate(getPeriodEndValue(requestParams), 'periodEnd');
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

        const getResultDateValue = (result) => {
            let dateValue = null;

            (result.columns || []).some((column, index) => {
                const columnKey = normalizeColumnKey((column && column.label) || (column && column.name) || ('column_' + (index + 1)));

                if (['date', 'trandate', 'tran_date', 'transaction_date'].indexOf(columnKey) < 0) {
                    return false;
                }

                dateValue = getColumnValue(result, column);
                return true;
            });

            return dateValue;
        };

        const filterResultsByPeriod = (results, requestParams = {}) => {
            const periodStart = parseDateForCompare(requestParams.periodStart);
            const periodEnd = parseDateForCompare(getPeriodEndValue(requestParams));

            if (!periodStart && !periodEnd) {
                return results;
            }

            return (results || []).filter((result) => {
                const itemDate = parseDateForCompare(getResultDateValue(result));

                if (!itemDate) {
                    return false;
                }

                if (periodStart && itemDate.getTime() < periodStart.getTime()) {
                    return false;
                }

                if (periodEnd && itemDate.getTime() > periodEnd.getTime()) {
                    return false;
                }

                return true;
            });
        };

        const getAllSearchResults = (actualSearch) => {
            const searchResults = [];
            const pagedData = actualSearch.runPaged({ pageSize: 1000 });

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

                const limit = Math.min(
                    globalHelper.parsePositiveInt(requestParams && requestParams.limit, DEFAULT_LIMIT),
                    MAX_LIMIT
                );
                const actualOffset = globalHelper.isEmpty(requestParams && requestParams.offset)
                    ? DEFAULT_OFFSET
                    : Math.max(parseInt(requestParams.offset, 10) || 0, DEFAULT_OFFSET);
                const actualSearch = buildSearch(requestParams);
                const filteredResults = filterResultsByPeriod(
                    getAllSearchResults(actualSearch),
                    requestParams
                );
                const items = filteredResults.slice(actualOffset, actualOffset + limit).map(mapResult);

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
