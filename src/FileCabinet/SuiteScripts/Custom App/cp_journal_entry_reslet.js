/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['./helper/global', './helper/response', 'N/error', 'N/log', 'N/record', 'N/search'],
    /**
 * @param{Object} globalHelper
 * @param{Object} responseHelper
 * @param{error} error
 * @param{log} log
 * @param{record} record
 * @param{search} search
 */
    (globalHelper, responseHelper, error, log, record, search) => {
        const RECORD_TYPE = 'journalentry';
        const LINE_SUBLIST_ID = 'line';
        const DEFAULT_LIMIT = 10;
        const MAX_LIMIT = 20;
        const logDebugError = globalHelper.createDebugLogger(log);

        const createBadRequestError = (message) => error.create({
            name: 'INVALID_DATA',
            message
        });

        const isBadRequestError = (errorObject) => ['MISSING_REQ_ARG', 'INVALID_DATA'].indexOf(errorObject && errorObject.name) >= 0;

        const getPostSource = (requestBody = {}) => requestBody.fields || requestBody;

        const getRecordIds = (requestParams = {}) => {
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
                filters: [['mainline', 'is', 'T']],
                end: limit
            });
        };

        const loadJournalEntry = (recordId) => globalHelper.loadRecordData(
            record,
            RECORD_TYPE,
            recordId,
            { sublistIds: [LINE_SUBLIST_ID] },
            logDebugError
        );

        const resolveAccountId = (accountValue) => globalHelper.resolveRecordId(
            search,
            accountValue,
            ['number', 'name'],
            ['account'],
            'account',
            error
        );

        const buildHeaderFields = (requestBody = {}) => {
            const payload = getPostSource(requestBody);
            const bodyFields = {};

            if (!globalHelper.isEmpty(payload.subsidiary)) {
                bodyFields.subsidiary = globalHelper.resolveRecordId(
                    search,
                    payload.subsidiary,
                    ['name', 'namenohierarchy'],
                    ['subsidiary'],
                    'subsidiary',
                    error
                );
            }

            if (!globalHelper.isEmpty(payload.location)) {
                bodyFields.location = globalHelper.resolveRecordId(
                    search,
                    payload.location,
                    ['name'],
                    ['location'],
                    'location',
                    error
                );
            }

            if (!globalHelper.isEmpty(payload.trandate)) {
                bodyFields.trandate = globalHelper.normalizeDateValue(payload.trandate, 'trandate', error);
            }

            if (!globalHelper.isEmpty(payload.approvalstatus)) {
                bodyFields.approvalstatus = globalHelper.normalizeSelectValue(payload.approvalstatus);
            }

            if (!globalHelper.isEmpty(payload.memo)) {
                bodyFields.memo = payload.memo;
            }

            if (!globalHelper.isEmpty(payload.currency)) {
                bodyFields.currency = globalHelper.resolveRecordId(
                    search,
                    payload.currency,
                    ['symbol'],
                    ['currency'],
                    'currency',
                    error
                );
            }

            if (!globalHelper.isEmpty(payload.exchangerate)) {
                bodyFields.exchangerate = globalHelper.normalizeNumberValue(payload.exchangerate, 'exchangerate', error);
            }

            return bodyFields;
        };

        const getLineEntries = (requestBody = {}) => {
            const payload = getPostSource(requestBody);

            if (Array.isArray(payload.line)) {
                return payload.line;
            }

            if (Array.isArray(payload.lines)) {
                return payload.lines;
            }

            return [];
        };

        const buildLines = (requestBody = {}) => {
            const lineEntries = getLineEntries(requestBody);

            if (!Array.isArray(lineEntries) || lineEntries.length === 0) {
                throw createBadRequestError('line is required');
            }

            return lineEntries.map((line, lineIndex) => {
                globalHelper.doValidation(
                    error,
                    [line && line.account],
                    ['account'],
                    'post.line[' + lineIndex + ']'
                );

                const hasDebit = !globalHelper.isEmpty(line && line.debit);
                const hasCredit = !globalHelper.isEmpty(line && line.credit);

                if (!hasDebit && !hasCredit) {
                    throw createBadRequestError('debit or credit is required for line[' + lineIndex + ']');
                }

                const mappedLine = {
                    account: resolveAccountId(line.account)
                };

                if (hasDebit) {
                    mappedLine.debit = globalHelper.normalizeNumberValue(line.debit, 'debit', error);
                }

                if (hasCredit) {
                    mappedLine.credit = globalHelper.normalizeNumberValue(line.credit, 'credit', error);
                }

                if (!globalHelper.isEmpty(line.memo)) {
                    mappedLine.memo = line.memo;
                }

                if (!globalHelper.isEmpty(line.department)) {
                    mappedLine.department = globalHelper.resolveRecordId(
                        search,
                        line.department,
                        ['name'],
                        ['department'],
                        'department',
                        error
                    );
                }

                if (!globalHelper.isEmpty(line.location)) {
                    mappedLine.location = globalHelper.resolveRecordId(
                        search,
                        line.location,
                        ['name'],
                        ['location'],
                        'location',
                        error
                    );
                }

                return mappedLine;
            });
        };

        const get = (requestParams = {}) => {
            try {
                log.debug('GET requestParams', requestParams);

                const requestedId = globalHelper.getRequestedId(requestParams);
                const recordIds = getRecordIds(requestParams);
                const records = requestedId
                    ? loadJournalEntry(recordIds[0])
                    : recordIds.map((recordId) => loadJournalEntry(recordId));

                return responseHelper.success('Get Journal Entry Successfully', {
                    record: records,
                    total_record: Array.isArray(records) ? records.length : 1
                });
            } catch (e) {
                logDebugError('cp_journal_entry_reslet.get error', e, { requestParams });
                if (isBadRequestError(e)) {
                    return responseHelper.badRequest(e.message, null);
                }

                return responseHelper.serverError(e, null);
            }
        };

        const post = (requestBody = {}) => {
            try {
                log.debug('POST requestBody', JSON.stringify(requestBody));
                globalHelper.doValidation(error, [requestBody], ['requestBody'], 'post');

                const bodyFields = buildHeaderFields(requestBody);
                const lineEntries = buildLines(requestBody);

                const createdId = globalHelper.createRecord(record, {
                    recordType: RECORD_TYPE,
                    bodyFields,
                    sublistId: LINE_SUBLIST_ID,
                    sublistLines: lineEntries,
                    isDynamic: false
                }, logDebugError);

                return responseHelper.success('Create Journal Entry Successfully', loadJournalEntry(createdId));
            } catch (e) {
                logDebugError('cp_journal_entry_reslet.post error', e, { requestBody });
                if (isBadRequestError(e)) {
                    return responseHelper.badRequest(e.message, null);
                }

                return responseHelper.serverError(e, null);
            }
        };

        const put = (requestBody = {}) => responseHelper.badRequest('Method PUT is not implemented', requestBody);

        const doDelete = (requestParams = {}) => responseHelper.badRequest('Method DELETE is not implemented', requestParams);

        return { get, post, put, delete: doDelete };
    });
