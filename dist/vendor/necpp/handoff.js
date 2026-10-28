import { NecInputError } from "./errors.js";
export const ISOLATED_ELEMENT_HANDOFF_KIND = "isolated-element-characterization";
function isMessagePort(value) {
    return typeof value === "object"
        && value !== null
        && typeof value.postMessage === "function";
}
function requireHandle(handle, name) {
    if (handle === undefined
        || handle.schemaVersion !== 1
        || !Number.isInteger(handle.byteLength)
        || handle.byteLength < 0
        || !(handle.buffer instanceof ArrayBuffer)
        || handle.buffer.byteLength !== handle.byteLength) {
        throw new NecInputError(`${name} is not a transferable packed handle`);
    }
    return handle.buffer;
}
/** Move large characterization buffers onto `destination`. Caller keeps Z/Y. */
export function transferIsolatedElementCharacterization(characterization, destination) {
    if (!isMessagePort(destination)) {
        throw new NecInputError("destination must be a MessagePort");
    }
    const quadratureBuffer = requireHandle(characterization.quadrature, "quadrature");
    const embeddedBuffer = requireHandle(characterization.embeddedField, "embeddedField");
    const message = {
        kind: ISOLATED_ELEMENT_HANDOFF_KIND,
        schemaVersion: 1,
        ...(characterization.fieldEvaluation === undefined ? {} : { fieldEvaluation: characterization.fieldEvaluation }),
        impedance: characterization.impedance,
        admittance: characterization.admittance,
        quadrature: characterization.quadrature,
        embeddedField: characterization.embeddedField,
    };
    destination.postMessage(message, [quadratureBuffer, embeddedBuffer]);
    return {
        ...(characterization.fieldEvaluation === undefined ? {} : { fieldEvaluation: characterization.fieldEvaluation }),
        impedance: characterization.impedance,
        admittance: characterization.admittance,
        quadratureByteLength: characterization.quadrature.byteLength,
        embeddedFieldByteLength: characterization.embeddedField.byteLength,
    };
}
