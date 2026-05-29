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
        const DEFAULT_LIMIT = 100;
        const MAX_LIMIT = 1000;
        const DEFAULT_OFFSET = 0;
        const logDebugError = globalHelper.createDebugLogger(log);

        const isBadRequestError = (errorObject) => ['MISSING_REQ_ARG', 'INVALID_DATA'].indexOf(errorObject && errorObject.name) >= 0;

        const HEADER_FIELD_CANDIDATES = {
            subsidiary: ['custrecord_subsidiary', 'subsidiary'],
            location: ['custrecord_location', 'location']
        };

        const LINE_FIELD_CANDIDATES = {
            item: ['custrecord_item', 'item', 'custrecord_ir_item'],
            rate: ['custrecord_rate', 'rate', 'custrecord_estimatedrate', 'custrecord_estimated_rate']
        };

        const ITEM_LOOKUP_COLUMNS = [
            'itemid',
            'displayname',
            'type',
            'quantityonhand',
            'custitem_ir_flag'
        ];

        const getTextValue = (loadedRecord, fieldIds) => {
            let resolvedValue = '';

            (fieldIds || []).some((fieldId) => {
                try {
                    const fieldText = loadedRecord.getText({ fieldId });

                    if (!globalHelper.isEmpty(fieldText)) {
                        resolvedValue = fieldText;
                        return true;
                    }
                } catch (e) {
                    logDebugError('cp_internal_request_reslet.getTextValue error', e, { fieldId });
                }

                return false;
            });

            return resolvedValue;
        };

        const getValue = (loadedRecord, fieldIds) => {
            let resolvedValue = null;

            (fieldIds || []).some((fieldId) => {
                try {
                    const fieldValue = loadedRecord.getValue({ fieldId });

                    if (!globalHelper.isEmpty(fieldValue) || fieldValue === 0 || fieldValue === false) {
                        resolvedValue = fieldValue;
                        return true;
                    }
                } catch (e) {
                    logDebugError('cp_internal_request_reslet.getValue error', e, { fieldId });
                }

                return false;
            });

            return resolvedValue;
        };

        const getSublistValue = (loadedRecord, line, fieldIds) => {
            let resolvedValue = null;

            (fieldIds || []).some((fieldId) => {
                try {
                    const fieldValue = loadedRecord.getSublistValue({
                        sublistId: LINES_SUBLIST_ID,
                        fieldId,
                        line
                    });

                    if (!globalHelper.isEmpty(fieldValue) || fieldValue === 0 || fieldValue === false) {
                        resolvedValue = fieldValue;
                        return true;
                    }
                } catch (e) {
                    logDebugError('cp_internal_request_reslet.getSublistValue error', e, { fieldId, line });
                }

                return false;
            });

            return resolvedValue;
        };

        const normalizeCompareValue = (value) => String(value || '').trim().toLowerCase();

        const parseNumber = (value) => {
            const parsedValue = Number(value);
            return Number.isNaN(parsedValue) ? 0 : parsedValue;
        };

        const parseBoolean = (value) => {
            if (typeof value === 'boolean') {
                return value;
            }

            if (typeof value === 'string') {
                return ['t', 'true', 'y', 'yes', '1'].indexOf(value.toLowerCase()) >= 0;
            }

            if (typeof value === 'number') {
                return value === 1;
            }

            return false;
        };

        const getLookupTextOrValue = (fieldLookup) => {
            if (Array.isArray(fieldLookup)) {
                if (fieldLookup.length === 0) {
                    return '';
                }

                return fieldLookup[0].text || fieldLookup[0].value || '';
            }

            if (fieldLookup && typeof fieldLookup === 'object') {
                return fieldLookup.text || fieldLookup.value || '';
            }

            return fieldLookup || '';
        };

        const getRecordIds = (requestParams = {}) => {
            const requestedId = globalHelper.getRequestedId(requestParams);

            if (requestedId) {
                return [requestedId];
            }

            const recordSearch = search.create({
                type: RECORD_TYPE,
                columns: [
                    search.createColumn({
                        name: 'internalid',
                        sort: search.Sort.ASC
                    })
                ]
            });
            const pagedData = recordSearch.runPaged({ pageSize: 1000 });
            const recordIds = [];

            pagedData.pageRanges.forEach((pageRange) => {
                const page = pagedData.fetch({ index: pageRange.index });

                page.data.forEach((result) => {
                    recordIds.push(result.id);
                });
            });

            return recordIds;
        };

        const getItemLookup = (itemId) => {
            if (globalHelper.isEmpty(itemId)) {
                return null;
            }

            try {
                return globalHelper.lookupFields(search, 'item', itemId, ITEM_LOOKUP_COLUMNS);
            } catch (e) {
                logDebugError('cp_internal_request_reslet.getItemLookup error', e, { itemId });
                return null;
            }
        };

        const mapLineItem = (loadedRecord, line, headerLocationText) => {
            const itemId = getSublistValue(loadedRecord, line, LINE_FIELD_CANDIDATES.item);

            if (globalHelper.isEmpty(itemId)) {
                return null;
            }

            const itemLookup = getItemLookup(itemId) || {};

            return {
                id: String(itemId),
                itemId: itemLookup.itemid || '',
                displayName: itemLookup.displayname || itemLookup.itemid || '',
                type: String(getLookupTextOrValue(itemLookup.type) || ''),
                quantityOnHand: parseNumber(itemLookup.quantityonhand),
                location: headerLocationText || '',
                custitem_ir_flag: parseBoolean(globalHelper.getLookupValue(itemLookup.custitem_ir_flag)),
                rate: parseNumber(getSublistValue(loadedRecord, line, LINE_FIELD_CANDIDATES.rate))
            };
        };

        const loadRecordItems = (recordId) => {
            const loadedRecord = record.load({
                type: RECORD_TYPE,
                id: recordId,
                isDynamic: false
            });
            const lineCount = loadedRecord.getLineCount({ sublistId: LINES_SUBLIST_ID }) || 0;
            const headerSubsidiaryText = getTextValue(loadedRecord, HEADER_FIELD_CANDIDATES.subsidiary);
            const headerLocationText = getTextValue(loadedRecord, HEADER_FIELD_CANDIDATES.location)
                || String(getValue(loadedRecord, HEADER_FIELD_CANDIDATES.location) || '');
            const items = [];

            for (let line = 0; line < lineCount; line += 1) {
                const itemSummary = mapLineItem(loadedRecord, line, headerLocationText);

                if (!itemSummary) {
                    continue;
                }

                items.push(Object.assign(itemSummary, {
                    subsidiary: headerSubsidiaryText
                }));
            }

            return items;
        };

        const filterItems = (items, requestParams = {}) => {
            const subsidiaryFilter = globalHelper.isEmpty(requestParams.subsidiary) ? '' : String(requestParams.subsidiary);
            const locationFilter = globalHelper.isEmpty(requestParams.location) ? '' : String(requestParams.location);

            return (items || []).filter((item) => {
                if (
                    !globalHelper.isEmpty(subsidiaryFilter)
                    && normalizeCompareValue(item.subsidiary) !== normalizeCompareValue(subsidiaryFilter)
                ) {
                    return false;
                }

                if (
                    !globalHelper.isEmpty(locationFilter)
                    && normalizeCompareValue(item.location) !== normalizeCompareValue(locationFilter)
                ) {
                    return false;
                }

                return true;
            }).map((item) => ({
                id: item.id,
                itemId: item.itemId,
                displayName: item.displayName,
                type: item.type,
                quantityOnHand: item.quantityOnHand,
                location: item.location,
                custitem_ir_flag: item.custitem_ir_flag,
                rate: item.rate
            }));
        };

        const get = (requestParams = {}) => {
            try {
                log.debug('GET requestParams', requestParams);

                const limit = Math.min(
                    globalHelper.parsePositiveInt(requestParams && requestParams.limit, DEFAULT_LIMIT),
                    MAX_LIMIT
                );
                const offset = globalHelper.isEmpty(requestParams && requestParams.offset)
                    ? DEFAULT_OFFSET
                    : Math.max(parseInt(requestParams.offset, 10) || 0, DEFAULT_OFFSET);
                const recordIds = getRecordIds(requestParams);
                const allItems = [];

                recordIds.forEach((recordId) => {
                    loadRecordItems(recordId).forEach((item) => {
                        allItems.push(item);
                    });
                });

                const filteredItems = filterItems(allItems, requestParams);
                const items = filteredItems.slice(offset, offset + limit);

                return responseHelper.success('Get Internal Request Successfully', {
                    totalResults: filteredItems.length,
                    count: items.length,
                    items
                });
            } catch (e) {
                logDebugError('cp_internal_request_reslet.get error', e, { requestParams });
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
