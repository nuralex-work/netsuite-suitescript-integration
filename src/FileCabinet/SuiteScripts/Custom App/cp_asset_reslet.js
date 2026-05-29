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
        const logDebugError = globalHelper.createDebugLogger(log);

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
                    logDebugError('cp_asset_reslet.getTextValue error', e, { fieldId });
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

                    if (!globalHelper.isEmpty(fieldValue) || fieldValue === 0) {
                        resolvedValue = fieldValue;
                        return true;
                    }
                } catch (e) {
                    logDebugError('cp_asset_reslet.getValue error', e, { fieldId });
                }

                return false;
            });

            return resolvedValue;
        };

        const parseNumber = (value) => {
            const parsedValue = Number(value);
            return Number.isNaN(parsedValue) ? 0 : parsedValue;
        };

        const normalizeCompareValue = (value) => String(value || '').trim().toLowerCase();

        const loadAssetSummary = (recordId) => {
            const loadedRecord = record.load({
                type: RECORD_TYPE,
                id: recordId,
                isDynamic: false
            });

            return {
                id: String(
                    getValue(loadedRecord, ['name', 'custrecord_assetid', 'custrecord_ncfar_assetid', 'internalid'])
                    || recordId
                ),
                assetName: getTextValue(loadedRecord, ['custrecord_assetname'])
                    || String(getValue(loadedRecord, ['custrecord_assetname', 'altname', 'name']) || ''),
                assetCost: parseNumber(getValue(loadedRecord, [
                    'custrecord_assetcost',
                    'custrecord_ncfar_assetcost',
                    'custrecord_asset_cost'
                ])),
                depreciationMethod: getTextValue(loadedRecord, [
                    'custrecord_deprmethod',
                    'custrecord_ncfar_deprmethod',
                    'custrecord_depreciationmethod'
                ]) || String(getValue(loadedRecord, [
                    'custrecord_deprmethod',
                    'custrecord_ncfar_deprmethod',
                    'custrecord_depreciationmethod'
                ]) || ''),
                usefulLife: parseNumber(getValue(loadedRecord, [
                    'custrecord_assetlifetime',
                    'custrecord_ncfar_assetlifetime',
                    'custrecord_usefullife',
                    'custrecord_useful_life'
                ])),
                location: getTextValue(loadedRecord, ['custrecord_assetlocation', 'custrecord_ncfar_assetlocation', 'location'])
                    || String(getValue(loadedRecord, ['custrecord_assetlocation', 'custrecord_ncfar_assetlocation', 'location']) || ''),
                subsidiary: getTextValue(loadedRecord, ['custrecord_assetsubsidiary', 'custrecord_ncfar_assetsubsidiary', 'subsidiary'])
                    || String(getValue(loadedRecord, ['custrecord_assetsubsidiary', 'custrecord_ncfar_assetsubsidiary', 'subsidiary']) || ''),
                status: getTextValue(loadedRecord, ['custrecord_assetstatus', 'custrecord_ncfar_assetstatus'])
                    || String(getValue(loadedRecord, ['custrecord_assetstatus', 'custrecord_ncfar_assetstatus']) || ''),
                custrecord_ir_ref: String(getValue(loadedRecord, ['custrecord_ir_ref']) || ''),
                bookValue: parseNumber(getValue(loadedRecord, [
                    'custrecord_bookvalue',
                    'custrecord_ncfar_bookvalue',
                    'custrecord_book_value'
                ]))
            };
        };

        const getAllAssetIds = () => {
            const assetSearch = search.create({
                type: RECORD_TYPE,
                columns: [
                    search.createColumn({
                        name: 'internalid',
                        sort: search.Sort.ASC
                    })
                ]
            });
            const pagedData = assetSearch.runPaged({ pageSize: 1000 });
            const recordIds = [];

            pagedData.pageRanges.forEach((pageRange) => {
                const page = pagedData.fetch({ index: pageRange.index });

                page.data.forEach((result) => {
                    recordIds.push(result.id);
                });
            });

            return recordIds;
        };

        const matchesFilter = (item, requestParams = {}) => {
            const subsidiaryFilter = requestParams.subsidiary;
            const locationFilter = requestParams.location;
            const irReferenceFilter = requestParams.irReference;

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

            if (
                !globalHelper.isEmpty(irReferenceFilter)
                && normalizeCompareValue(item.custrecord_ir_ref) !== normalizeCompareValue(irReferenceFilter)
            ) {
                return false;
            }

            return true;
        };

        const get = (requestParams = {}) => {
            try {
                log.debug('GET requestParams', requestParams);

                const requestedId = globalHelper.getRequestedId(requestParams);
                const allItems = requestedId
                    ? [loadAssetSummary(requestedId)]
                    : getAllAssetIds().map((recordId) => loadAssetSummary(recordId));
                const filteredItems = allItems.filter((item) => matchesFilter(item, requestParams));

                return responseHelper.success('Get Asset Successfully', {
                    items: filteredItems
                });
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
