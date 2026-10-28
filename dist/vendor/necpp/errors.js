/** Base class for every package-defined operational error. */
export class NecError extends Error {
    code;
    details;
    constructor(code, message, options = {}) {
        super(message, { cause: options.cause });
        this.name = "NecError";
        this.code = code;
        this.details = options.details;
    }
}
export class NecStateError extends NecError {
    operation;
    state;
    constructor(operation, state, message) {
        super("NEC_STATE", message ?? `Operation ${operation} is not valid while the model is ${state}`, { details: { operation, state } });
        this.name = "NecStateError";
        this.operation = operation;
        this.state = state;
    }
}
export class NecInputError extends NecError {
    constructor(message, options) {
        super("NEC_INPUT", message, options ?? {});
        this.name = "NecInputError";
    }
}
export class NecGeometryError extends NecError {
    constructor(message, options) {
        super("NEC_GEOMETRY", message, options ?? {});
        this.name = "NecGeometryError";
    }
}
export class NecPortError extends NecError {
    constructor(message, options) {
        super("NEC_PORT", message, options ?? {});
        this.name = "NecPortError";
    }
}
export class NecSolverError extends NecError {
    constructor(message, options) {
        super("NEC_SOLVER", message, options ?? {});
        this.name = "NecSolverError";
    }
}
export class NecConditioningError extends NecError {
    constructor(message, options) {
        super("NEC_CONDITIONING", message, options ?? {});
        this.name = "NecConditioningError";
    }
}
export class NecRuntimeError extends NecError {
    constructor(message, options) {
        super("NEC_RUNTIME", message, options ?? {});
        this.name = "NecRuntimeError";
    }
}
/**
 * Intentional cancellation of worker-backed work.
 *
 * This remains a `NecRuntimeError` (`code === "NEC_RUNTIME"`) for backwards
 * compatibility while providing a typed class and stable `details.reason`
 * discriminant for callers that must separate cancellation from solver
 * failures.
 */
export class NecCancellationError extends NecRuntimeError {
    reason;
    constructor(reason, message) {
        super(message ?? (reason === "aborted"
            ? "The NEC worker creation was aborted"
            : "The NEC worker was terminated"), { details: { reason } });
        this.name = "NecCancellationError";
        this.reason = reason;
    }
}
