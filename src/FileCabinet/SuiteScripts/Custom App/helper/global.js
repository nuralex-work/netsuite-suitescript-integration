/**
 * @NApiVersion 2.1
 */
define([], () => {
    const isEmpty = (value) => value === null || value === '' || typeof value === 'undefined';

    const normalizeValue = (value) => {
        if (value instanceof Date) {
            return value.toISOString();
        }

        if (Array.isArray(value)) {
            return value.map(normalizeValue);
        }

        return typeof value === 'undefined' ? null : value;
    };

    const serializeError = (error) => ({
        name: error && error.name ? error.name : 'UNEXPECTED_ERROR',
        message: error && error.message ? error.message : String(error)
    });

    const parsePositiveInt = (value, fallbackValue) => {
        const parsedValue = parseInt(value, 10);
        return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
    };

    const createInvalidDataError = (errorModule, fieldName) => errorModule.create({
        name: 'INVALID_DATA',
        message: fieldName + ' is invalid'
    });

    const isNumericLike = (value) => {
        if (typeof value === 'number') {
            return true;
        }

        if (typeof value !== 'string') {
            return false;
        }

        return /^\d+(\.\d+)?$/.test(value.trim());
    };

    const normalizeDateValue = (value, fieldName, errorModule) => {
        if (value instanceof Date) {
            return value;
        }

        if (typeof value === 'string') {
            const normalizedDateValue = value.trim();
            const matchedDateParts = normalizedDateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

            if (matchedDateParts) {
                const parsedDate = new Date(
                    Number(matchedDateParts[1]),
                    Number(matchedDateParts[2]) - 1,
                    Number(matchedDateParts[3]),
                    12,
                    0,
                    0,
                    0
                );

                if (Number.isNaN(parsedDate.getTime())) {
                    throw createInvalidDataError(errorModule, fieldName);
                }

                return parsedDate;
            }
        }

        const parsedDate = new Date(value);

        if (Number.isNaN(parsedDate.getTime())) {
            throw createInvalidDataError(errorModule, fieldName);
        }

        return parsedDate;
    };

    const normalizeNumberValue = (value, fieldName, errorModule) => {
        const parsedValue = Number(value);

        if (Number.isNaN(parsedValue)) {
            throw createInvalidDataError(errorModule, fieldName);
        }

        return parsedValue;
    };

    const normalizeSelectValue = (value) => {
        if (isEmpty(value)) {
            return value;
        }

        return isNumericLike(value) ? Number(value) : value;
    };

    const normalizeCheckboxValue = (value, fieldName, errorModule) => {
        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'string') {
            const normalizedValue = value.trim().toLowerCase();

            if (['true', 't', 'yes', 'y', '1'].indexOf(normalizedValue) >= 0) {
                return true;
            }

            if (['false', 'f', 'no', 'n', '0'].indexOf(normalizedValue) >= 0) {
                return false;
            }
        }

        if (typeof value === 'number') {
            return value === 1;
        }

        throw createInvalidDataError(errorModule, fieldName);
    };

    const createDebugLogger = (log) => (title, error, context) => {
        log.debug(title, {
            error: serializeError(error),
            context: context || null
        });
    };

    const doValidation = (errorModule, args, argNames, methodName, optionalFieldNames) => {
        const skippedFields = Array.isArray(optionalFieldNames) ? optionalFieldNames : [];

        for (let i = 0; i < args.length; i += 1) {
            if (skippedFields.indexOf(argNames[i]) >= 0) {
                continue;
            }

            if (isEmpty(args[i]) && args[i] !== 0) {
                throw errorModule.create({
                    name: 'MISSING_REQ_ARG',
                    message: 'Missing a required argument: [' + argNames[i] + '] for method: ' + methodName
                });
            }
        }
    };

    const mergeOptions = (obj1, obj2) => {
        const obj3 = {};

        Object.keys(obj1 || {}).forEach((key) => {
            obj3[key] = obj1[key];
        });

        Object.keys(obj2 || {}).forEach((key) => {
            obj3[key] = obj2[key];
        });

        return obj3;
    };

    const getRequestedId = (requestParams) => {
        if (!isEmpty(requestParams && requestParams.id)) {
            return requestParams.id;
        }

        if (!isEmpty(requestParams && requestParams.custrecord_id)) {
            return requestParams.custrecord_id;
        }

        return null;
    };

    const findData = (searchModule, key, value, arrRecordType, columns) => {
        const searchKeys = Array.isArray(key) ? key : [key];
        const searchColumns = Array.isArray(columns) ? columns : [];

        if (!Array.isArray(arrRecordType) || arrRecordType.length === 0 || searchKeys.length === 0) {
            return null;
        }

        let dataRecord = null;

        arrRecordType.some((recordType) => {
            return searchKeys.some((searchKey) => {
                const existingRecordSearch = searchModule.create({
                    type: recordType,
                    filters: [
                        [searchKey, 'is', value]
                    ],
                    columns: searchColumns
                });

                const existingRecord = existingRecordSearch.run().getRange({
                    start: 0,
                    end: 1
                });

                if (existingRecord.length > 0) {
                    dataRecord = existingRecord[0];
                    return true;
                }

                return false;
            });
        });

        return dataRecord;
    };

    const resolveRecordId = (searchModule, value, searchKeys, recordTypes, fieldLabel, errorModule) => {
        if (isEmpty(value)) {
            return value;
        }

        if (isNumericLike(value)) {
            return normalizeSelectValue(value);
        }

        const dataRecord = findData(searchModule, searchKeys, String(value), recordTypes);

        if (!dataRecord || isEmpty(dataRecord.id)) {
            throw errorModule.create({
                name: 'INVALID_DATA',
                message: fieldLabel + ' not found for value: ' + value
            });
        }

        return normalizeNumberValue(dataRecord.id, fieldLabel, errorModule);
    };

    const resolveTargetRecordId = (requestParams, errorModule) => {
        const requestedId = getRequestedId(requestParams);

        if (isEmpty(requestedId)) {
            throw errorModule.create({
                name: 'INVALID_DATA',
                message: 'id is required'
            });
        }

        return normalizeSelectValue(requestedId);
    };

    const lookupFields = (searchModule, recordType, recordId, columns) => searchModule.lookupFields({
        type: recordType,
        id: recordId,
        columns
    });

    const resolveItemReference = (searchModule, itemValue, errorModule, options) => {
        const itemRecordType = options && options.recordType ? options.recordType : 'inventoryitem';
        const itemSearchKeys = options && Array.isArray(options.searchKeys) ? options.searchKeys : ['itemid'];
        const itemLabel = options && options.itemLabel ? options.itemLabel : 'item';
        const unitFieldId = options && options.unitFieldId ? options.unitFieldId : 'stockunit';
        const itemId = resolveRecordId(
            searchModule,
            itemValue,
            itemSearchKeys,
            [itemRecordType],
            itemLabel,
            errorModule
        );
        const itemLookup = lookupFields(searchModule, itemRecordType, itemId, [unitFieldId]);
        const unitValue = getLookupValue(itemLookup[unitFieldId]);

        return {
            itemId,
            unitId: isEmpty(unitValue) ? null : normalizeSelectValue(unitValue)
        };
    };

    const resolveSingleTextValue = (values, fieldLabel, errorModule, options) => {
        const candidateValues = (values || [])
            .filter((value) => !isEmpty(value))
            .map((value) => String(value));
        const uniqueValues = candidateValues.filter((value, index) => candidateValues.indexOf(value) === index);

        if (uniqueValues.length > 1) {
            throw errorModule.create({
                name: 'INVALID_DATA',
                message: options && options.multipleValueMessage
                    ? options.multipleValueMessage
                    : 'Multiple ' + fieldLabel + ' values are not supported'
            });
        }

        if (uniqueValues.length === 0) {
            return options && Object.prototype.hasOwnProperty.call(options, 'defaultValue')
                ? options.defaultValue
                : null;
        }

        return uniqueValues[0];
    };

    const getLookupValue = (fieldLookup) => {
        if (Array.isArray(fieldLookup)) {
            return fieldLookup.length > 0 ? fieldLookup[0].value : null;
        }

        if (fieldLookup && typeof fieldLookup === 'object' && Object.prototype.hasOwnProperty.call(fieldLookup, 'value')) {
            return fieldLookup.value;
        }

        return fieldLookup || null;
    };

    const getAllFieldValues = (loadedRecord, logDebugError) => {
        let fields = {};

        loadedRecord.getFields().forEach((fieldId) => {
            try {
                const fieldValue = normalizeValue(loadedRecord.getValue({fieldId}));
                fields = mergeOptions(fields, {
                    [fieldId]: fieldValue
                });
            } catch (error) {
                if (logDebugError) {
                    logDebugError('getAllFieldValues error', error, {fieldId});
                }

                fields = mergeOptions(fields, {
                    [fieldId]: null
                });
            }
        });

        return fields;
    };

    const getSublistLines = (loadedRecord, sublistId, logDebugError) => {
        let lineCount = 0;
        let fieldIds = [];
        const lines = [];

        try {
            lineCount = loadedRecord.getLineCount({sublistId}) || 0;
        } catch (error) {
            if (logDebugError) {
                logDebugError('getSublistLines.getLineCount error', error, {sublistId});
            }
            return lines;
        }

        try {
            fieldIds = loadedRecord.getSublistFields({sublistId}) || [];
        } catch (error) {
            if (logDebugError) {
                logDebugError('getSublistLines.getSublistFields error', error, {sublistId});
            }
            return lines;
        }

        for (let line = 0; line < lineCount; line += 1) {
            let lineData = {};

            fieldIds.forEach((fieldId) => {
                try {
                    const lineValue = normalizeValue(loadedRecord.getSublistValue({
                        sublistId,
                        fieldId,
                        line
                    }));

                    lineData = mergeOptions(lineData, {
                        [fieldId]: lineValue
                    });
                } catch (error) {
                    if (logDebugError) {
                        logDebugError('getSublistLines.getSublistValue error', error, {sublistId, fieldId, line});
                    }

                    lineData = mergeOptions(lineData, {
                        [fieldId]: null
                    });
                }
            });

            lines.push(lineData);
        }

        return lines;
    };

    const getAllSublistIds = (loadedRecord, logDebugError) => {
        try {
            return loadedRecord.getSublists() || [];
        } catch (error) {
            if (logDebugError) {
                logDebugError('getAllSublistIds error', error, null);
            }

            return [];
        }
    };

    const loadRecordData = (recordModule, recordType, recordId, options, logDebugError) => {
        const loadedRecord = recordModule.load({
            type: recordType,
            id: recordId,
            isDynamic: false
        });

        let dataRecord = {
            id: loadedRecord.id,
            recordType: loadedRecord.type,
            fields: getAllFieldValues(loadedRecord, logDebugError)
        };

        const explicitSublistIds = options && Array.isArray(options.sublistIds) ? options.sublistIds : [];
        const allSublistIds = options && options.includeAllSublists ? getAllSublistIds(loadedRecord, logDebugError) : [];
        const sublistIds = explicitSublistIds.concat(allSublistIds)
            .filter((sublistId, index, list) => list.indexOf(sublistId) === index);

        sublistIds.forEach((sublistId) => {
            dataRecord = mergeOptions(dataRecord, {
                [sublistId]: getSublistLines(loadedRecord, sublistId, logDebugError)
            });
        });

        return dataRecord;
    };

    const searchRecordIds = (searchModule, options) => {
        const recordSearch = searchModule.create({
            type: options.recordType,
            filters: options.filters || [],
            columns: [
                searchModule.createColumn({
                    name: options.sortBy || 'internalid',
                    sort: options.sortDirection || searchModule.Sort.DESC
                })
            ]
        });

        return recordSearch
            .run()
            .getRange({
                start: options.start || 0,
                end: options.end
            })
            .map((result) => result.id);
    };

    const extractBodyFields = (requestBody, excludedKeys) => {
        const bodyFields = {};
        const ignoredKeys = excludedKeys || [];

        Object.keys(requestBody || {}).forEach((key) => {
            if (ignoredKeys.indexOf(key) >= 0) {
                return;
            }

            if (isEmpty(requestBody[key])) {
                return;
            }

            bodyFields[key] = requestBody[key];
        });

        return bodyFields;
    };

    const extractItemLines = (requestBody) => {
        if (Array.isArray(requestBody && requestBody.item)) {
            return requestBody.item;
        }

        if (Array.isArray(requestBody && requestBody.sublist_item)) {
            return requestBody.sublist_item;
        }

        return [];
    };

    const shouldUseTextSetter = (fieldId, fieldValue, textFieldIds) => (
        Array.isArray(textFieldIds)
        && textFieldIds.indexOf(fieldId) >= 0
        && !isNumericLike(fieldValue)
    );

    const setBodyFields = (targetRecord, fieldValues, logDebugError, options) => {
        const textFieldIds = options && Array.isArray(options.textFieldIds) ? options.textFieldIds : [];

        Object.keys(fieldValues || {}).forEach((fieldId) => {
            const fieldValue = fieldValues[fieldId];

            if (isEmpty(fieldValue)) {
                return;
            }

            try {
                if (shouldUseTextSetter(fieldId, fieldValue, textFieldIds)) {
                    targetRecord.setText({
                        fieldId,
                        text: String(fieldValue)
                    });
                } else {
                    targetRecord.setValue({
                        fieldId,
                        value: fieldValue
                    });
                }
            } catch (error) {
                if (logDebugError) {
                    logDebugError('setBodyFields error', error, {fieldId, fieldValue});
                }
                throw error;
            }
        });
    };

    const setSublistLines = (targetRecord, sublistId, lines, logDebugError, options) => {
        const textFieldIds = options && Array.isArray(options.textFieldIds) ? options.textFieldIds : [];
        const ignoredFieldIds = options && Array.isArray(options.ignoredFieldIds) ? options.ignoredFieldIds : [];

        (lines || []).forEach((lineData, lineIndex) => {
            targetRecord.selectNewLine({sublistId});

            Object.keys(lineData || {}).forEach((fieldId) => {
                const fieldValue = lineData[fieldId];

                if (ignoredFieldIds.indexOf(fieldId) >= 0) {
                    return;
                }

                if (isEmpty(fieldValue)) {
                    return;
                }

                try {
                    if (shouldUseTextSetter(fieldId, fieldValue, textFieldIds)) {
                        targetRecord.setCurrentSublistText({
                            sublistId,
                            fieldId,
                            text: String(fieldValue),
                            ignoreFieldChange: true
                        });
                    } else {
                        targetRecord.setCurrentSublistValue({
                            sublistId,
                            fieldId,
                            value: fieldValue,
                            ignoreFieldChange: true
                        });
                    }
                } catch (error) {
                    if (logDebugError) {
                        logDebugError('setSublistLines error', error, {sublistId, fieldId, fieldValue, lineIndex});
                    }
                    throw error;
                }
            });

            targetRecord.commitLine({sublistId});
        });
    };

    const setSublistLinesStandard = (targetRecord, sublistId, lines, logDebugError, options) => {
        const textFieldIds = options && Array.isArray(options.textFieldIds) ? options.textFieldIds : [];
        const ignoredFieldIds = options && Array.isArray(options.ignoredFieldIds) ? options.ignoredFieldIds : [];

        (lines || []).forEach((lineData, lineIndex) => {
            Object.keys(lineData || {}).forEach((fieldId) => {
                const fieldValue = lineData[fieldId];

                if (ignoredFieldIds.indexOf(fieldId) >= 0) {
                    return;
                }

                if (isEmpty(fieldValue)) {
                    return;
                }

                try {
                    if (shouldUseTextSetter(fieldId, fieldValue, textFieldIds)) {
                        targetRecord.setSublistText({
                            sublistId,
                            fieldId,
                            line: lineIndex,
                            text: String(fieldValue)
                        });
                    } else {
                        targetRecord.setSublistValue({
                            sublistId,
                            fieldId,
                            line: lineIndex,
                            value: fieldValue
                        });
                    }
                } catch (error) {
                    if (logDebugError) {
                        logDebugError('setSublistLinesStandard error', error, {sublistId, fieldId, fieldValue, lineIndex});
                    }
                    throw error;
                }
            });
        });
    };

    const createRecord = (recordModule, options, logDebugError) => {
        const createdRecord = recordModule.create({
            type: options.recordType,
            isDynamic: !!options.isDynamic
        });

        setBodyFields(createdRecord, options.bodyFields, logDebugError, {
            textFieldIds: options.bodyTextFieldIds || []
        });

        if (options.sublistId && Array.isArray(options.sublistLines) && options.sublistLines.length > 0) {
            if (options.isDynamic) {
                setSublistLines(createdRecord, options.sublistId, options.sublistLines, logDebugError, {
                    textFieldIds: options.sublistTextFieldIds || [],
                    ignoredFieldIds: options.sublistIgnoredFieldIds || []
                });
            } else {
                setSublistLinesStandard(createdRecord, options.sublistId, options.sublistLines, logDebugError, {
                    textFieldIds: options.sublistTextFieldIds || [],
                    ignoredFieldIds: options.sublistIgnoredFieldIds || []
                });
            }
        }
        return createdRecord.save();
    };

    const removeAllSublistLines = (targetRecord, sublistId, logDebugError) => {
        const lineCount = targetRecord.getLineCount({sublistId}) || 0;

        for (let lineIndex = lineCount - 1; lineIndex >= 0; lineIndex -= 1) {
            try {
                targetRecord.removeLine({
                    sublistId,
                    line: lineIndex
                });
            } catch (error) {
                if (logDebugError) {
                    logDebugError('removeAllSublistLines error', error, {sublistId, lineIndex});
                }
                throw error;
            }
        }
    };

    const updateRecord = (recordModule, options, logDebugError) => {
        const updatedRecord = recordModule.load({
            type: options.recordType,
            id: options.recordId,
            isDynamic: !!options.isDynamic
        });

        setBodyFields(updatedRecord, options.bodyFields, logDebugError, {
            textFieldIds: options.bodyTextFieldIds || []
        });

        if (options.replaceSublist && options.sublistId) {
            removeAllSublistLines(updatedRecord, options.sublistId, logDebugError);
        }

        if (options.sublistId && Array.isArray(options.sublistLines) && options.sublistLines.length > 0) {
            if (options.isDynamic) {
                setSublistLines(updatedRecord, options.sublistId, options.sublistLines, logDebugError, {
                    textFieldIds: options.sublistTextFieldIds || [],
                    ignoredFieldIds: options.sublistIgnoredFieldIds || []
                });
            } else {
                setSublistLinesStandard(updatedRecord, options.sublistId, options.sublistLines, logDebugError, {
                    textFieldIds: options.sublistTextFieldIds || [],
                    ignoredFieldIds: options.sublistIgnoredFieldIds || []
                });
            }
        }

        return updatedRecord.save();
    };

    return {
        isEmpty,
        normalizeValue,
        serializeError,
        parsePositiveInt,
        normalizeDateValue,
        normalizeNumberValue,
        normalizeSelectValue,
        normalizeCheckboxValue,
        isNumericLike,
        createDebugLogger,
        doValidation,
        mergeOptions,
        getRequestedId,
        findData,
        resolveRecordId,
        resolveTargetRecordId,
        lookupFields,
        resolveItemReference,
        resolveSingleTextValue,
        getLookupValue,
        getAllFieldValues,
        getSublistLines,
        getAllSublistIds,
        loadRecordData,
        searchRecordIds,
        extractBodyFields,
        extractItemLines,
        shouldUseTextSetter,
        setBodyFields,
        setSublistLines,
        setSublistLinesStandard,
        createRecord,
        removeAllSublistLines,
        updateRecord
    };
});
