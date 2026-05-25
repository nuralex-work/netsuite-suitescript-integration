/**
 * @NApiVersion 2.1
 */
define(['./global'],
    /**
 * @param{Object} globalHelper
 */
    (globalHelper) => {
        const buildResponse = (statusCode, message, data, extras) => JSON.stringify(Object.assign({
            status_code: statusCode,
            message,
            data: typeof data === 'undefined' ? null : data
        }, extras || {}));

        const success = (message, data, extras) => buildResponse(200, message, data, extras);

        const accepted = (message, data, extras) => buildResponse(202, message, data, extras);

        const badRequest = (message, data, extras) => buildResponse(400, message, data, extras);

        const serverError = (error, data, extras) => {
            const serializedError = globalHelper.serializeError(error);
            return buildResponse(500, serializedError.message, typeof data === 'undefined' ? null : data, extras);
        };

        return {
            buildResponse,
            success,
            accepted,
            badRequest,
            serverError
        };
    });
