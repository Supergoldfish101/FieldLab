import { createNecModel } from "./index.js";
import { NecRuntimeError } from "./errors.js";
import { isNodeRuntime, isWorkerResponse, serializeError, } from "./worker-protocol.js";
import { cancelWorkerFarField, handleWorkerRequest, } from "./worker-runtime.js";
async function connectParent() {
    if (typeof document !== "undefined") {
        throw new NecRuntimeError("NEC worker entry must run inside a worker");
    }
    if (isNodeRuntime()) {
        const { parentPort } = await import("node:worker_threads");
        if (parentPort === null) {
            throw new NecRuntimeError("NEC worker entry must run inside a worker");
        }
        return {
            postMessage(value, transfer = []) {
                parentPort.postMessage(value, transfer);
            },
            onMessage(listener) {
                parentPort.on("message", listener);
            },
        };
    }
    const scope = globalThis;
    if (typeof scope.postMessage !== "function") {
        throw new NecRuntimeError("NEC worker entry must run inside a worker");
    }
    return {
        postMessage(value, transfer = []) {
            scope.postMessage(value, transfer);
        },
        onMessage(listener) {
            scope.addEventListener("message", (event) => {
                listener(event.data);
            });
        },
    };
}
function isWorkerRequest(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value;
    return typeof record.id === "number"
        && (record.kind === "create" || record.kind === "invoke");
}
function isCancelFieldRequest(value) {
    return typeof value === "object" && value !== null
        && value.kind === "cancel-field";
}
void startWorker();
async function startWorker() {
    const parent = await connectParent();
    const session = { model: undefined };
    let queue = Promise.resolve();
    function post(response, transfer = []) {
        parent.postMessage(response, transfer);
    }
    parent.onMessage((value) => {
        if (isCancelFieldRequest(value)) {
            cancelWorkerFarField(session);
            return;
        }
        queue = queue.then(async () => {
            if (!isWorkerRequest(value)) {
                post({
                    kind: "crash",
                    error: serializeError(new NecRuntimeError("The NEC worker received a malformed request")),
                });
                return;
            }
            try {
                const { response, transfer } = await handleWorkerRequest(session, value, {
                    createModel: createNecModel,
                    emitProgress(event) {
                        post({
                            kind: "progress",
                            operation: event.operation,
                            phase: event.phase,
                        });
                    },
                });
                if (!isWorkerResponse(response)) {
                    post({
                        id: value.id,
                        kind: "error",
                        error: serializeError(new NecRuntimeError("The NEC worker produced an invalid response")),
                    });
                    return;
                }
                post(response, transfer);
            }
            catch (error) {
                post({
                    id: value.id,
                    kind: "error",
                    error: serializeError(error),
                });
            }
        }, () => undefined);
    });
}
