import { NecCancellationError, NecInputError, NecRuntimeError, NecStateError, } from "./errors.js";
import { cloneFloat64, isNodeRuntime, isWorkerResponse, reviveEmbeddedFarFieldResult, reviveError, reviveFarFieldResult, reviveGeometryCompletionResult, reviveImpedanceResult, reviveIsolatedElementCharacterization, reviveIsolatedElementHandoff, reviveCurrentDistribution, revivePortSolution, revivePreparedTransferHandle, serializeCreateOptions, } from "./worker-protocol.js";
function isAborted(signal) {
    return signal?.aborted === true;
}
function createWebWorker() {
    return new Worker(new URL("./worker-entry.js", import.meta.url), {
        type: "module",
    });
}
async function openWorkerHost() {
    if (isNodeRuntime()) {
        const { Worker: NodeWorker } = await import("node:worker_threads");
        const worker = new NodeWorker(new URL("./worker-entry.js", import.meta.url));
        return {
            postMessage(data, transfer = []) {
                worker.postMessage(data, transfer);
            },
            subscribe(listener) {
                const handler = (value) => {
                    listener(value);
                };
                worker.on("message", handler);
                return () => {
                    worker.off("message", handler);
                };
            },
            subscribeError(listener) {
                const handler = (error) => {
                    listener(error);
                };
                worker.on("error", handler);
                return () => {
                    worker.off("error", handler);
                };
            },
            subscribeExit(listener) {
                const handler = (code) => {
                    listener(code);
                };
                worker.on("exit", handler);
                return () => {
                    worker.off("exit", handler);
                };
            },
            terminate() {
                void worker.terminate();
            },
        };
    }
    const worker = createWebWorker();
    return {
        postMessage(data, transfer = []) {
            worker.postMessage(data, transfer);
        },
        subscribe(listener) {
            const handler = (event) => {
                listener(event.data);
            };
            worker.addEventListener("message", handler);
            return () => {
                worker.removeEventListener("message", handler);
            };
        },
        subscribeError(listener) {
            const errorHandler = (event) => {
                listener(event.error ?? event.message);
            };
            const messageErrorHandler = () => {
                listener(new Error("The NEC worker could not deserialize a message"));
            };
            worker.addEventListener("error", errorHandler);
            worker.addEventListener("messageerror", messageErrorHandler);
            return () => {
                worker.removeEventListener("error", errorHandler);
                worker.removeEventListener("messageerror", messageErrorHandler);
            };
        },
        terminate() {
            worker.terminate();
        },
    };
}
function cloneComplexVector(vector) {
    const real = cloneFloat64(vector.real);
    const imag = cloneFloat64(vector.imag);
    return {
        vector: { real, imag },
        transfer: [real.buffer, imag.buffer],
    };
}
class WorkerNecModel {
    #host;
    #state = "empty";
    #terminated = false;
    #nextId = 1;
    #tail = Promise.resolve();
    #pending = new Map();
    #listeners = new Set();
    #unsubscribeMessage;
    #unsubscribeError;
    #unsubscribeExit;
    #fieldCancellationEnabled;
    constructor(host, onProgress, fieldCancellationEnabled = false) {
        this.#host = host;
        this.#fieldCancellationEnabled = fieldCancellationEnabled;
        if (onProgress !== undefined) {
            this.#listeners.add(onProgress);
        }
        this.#unsubscribeMessage = host.subscribe((data) => {
            this.#onMessage(data);
        });
        this.#unsubscribeError = host.subscribeError((error) => {
            this.#failAll(new NecRuntimeError("The NEC worker failed", { cause: error }));
        });
        this.#unsubscribeExit = host.subscribeExit?.((code) => {
            if (!this.#terminated) {
                this.#failAll(new NecRuntimeError(`The NEC worker exited unexpectedly with code ${code}`, { details: { exitCode: code } }));
            }
        }) ?? (() => undefined);
    }
    get state() {
        return this.#state;
    }
    subscribeProgress(listener) {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }
    async initialize(options, fieldPool) {
        const serialized = serializeCreateOptions(options, fieldPool);
        await this.#request(serialized.payload === undefined
            ? { kind: "create" }
            : { kind: "create", options: serialized.payload }, serialized.transfer);
    }
    addWire(wire) {
        return this.#invokeVoid("addWire", [wire]);
    }
    async completeGeometry(options) {
        const result = await this.#invoke("completeGeometry", options === undefined ? [] : [options]);
        return reviveGeometryCompletionResult(result);
    }
    definePorts(ports) {
        return this.#invokeVoid("definePorts", [ports]);
    }
    addLoad(load) {
        return this.#invokeVoid("addLoad", [load]);
    }
    clearLoads() {
        return this.#invokeVoid("clearLoads", []);
    }
    setGround(ground) {
        return this.#invokeVoid("setGround", [ground]);
    }
    prepare(options) {
        return this.#invokeVoid("prepare", [options]);
    }
    async computeImpedanceMatrix() {
        return reviveImpedanceResult(await this.#invoke("computeImpedanceMatrix", []));
    }
    async solveVoltages(voltages) {
        this.#cancelField();
        const cloned = cloneComplexVector(voltages);
        return revivePortSolution(await this.#invoke("solveVoltages", [cloned.vector], cloned.transfer));
    }
    async solveCurrents(currents) {
        this.#cancelField();
        const cloned = cloneComplexVector(currents);
        return revivePortSolution(await this.#invoke("solveCurrents", [cloned.vector], cloned.transfer));
    }
    async computeFarField(request) {
        this.#cancelField();
        return reviveFarFieldResult(await this.#invoke("computeFarField", [request]));
    }
    async computeEmbeddedFarFields(request, normalization) {
        const args = normalization === undefined ? [request] : [request, normalization];
        return reviveEmbeddedFarFieldResult(await this.#invoke("computeEmbeddedFarFields", args));
    }
    async getCurrentDistribution(options) {
        return reviveCurrentDistribution(await this.#invoke("getCurrentDistribution", [options]));
    }
    async prepareCurrentQuadrature(request) {
        const nodes = cloneFloat64(request.nodes);
        const transfer = [nodes.buffer];
        const payload = request.weights === undefined
            ? { ...request, nodes }
            : { ...request, nodes, weights: cloneFloat64(request.weights) };
        if (payload.weights !== undefined) {
            transfer.push(payload.weights.buffer);
        }
        return revivePreparedTransferHandle(await this.#invoke("prepareCurrentQuadrature", [payload], transfer));
    }
    async characterizeIsolatedElement(request, options) {
        const nodes = cloneFloat64(request.quadrature.nodes);
        const transfer = [nodes.buffer];
        const quadrature = request.quadrature.weights === undefined
            ? { ...request.quadrature, nodes }
            : {
                ...request.quadrature,
                nodes,
                weights: cloneFloat64(request.quadrature.weights),
            };
        if (quadrature.weights !== undefined) {
            transfer.push(quadrature.weights.buffer);
        }
        const clonedRequest = {
            ...request,
            quadrature,
        };
        if (options !== undefined) {
            transfer.push(options.destination);
            return reviveIsolatedElementHandoff(await this.#request({
                kind: "invoke",
                method: "characterizeIsolatedElement",
                args: [clonedRequest],
                destination: options.destination,
            }, transfer));
        }
        return reviveIsolatedElementCharacterization(await this.#invoke("characterizeIsolatedElement", [clonedRequest], transfer));
    }
    cancelFarField() {
        this.#cancelField();
    }
    async dispose() {
        this.#cancelField();
        if (this.#terminated || this.#state === "disposed") {
            this.#state = "disposed";
            this.terminate();
            return;
        }
        try {
            await this.#invoke("dispose", []);
        }
        finally {
            this.terminate();
        }
    }
    terminate() {
        this.#terminateWith(new NecCancellationError("terminated"));
    }
    #terminateWith(error) {
        if (this.#terminated) {
            return;
        }
        this.#terminated = true;
        this.#state = "disposed";
        this.#unsubscribeMessage();
        this.#unsubscribeError();
        this.#unsubscribeExit();
        for (const pending of this.#pending.values()) {
            pending.reject(error);
        }
        this.#pending.clear();
        try {
            this.#host.terminate();
        }
        catch {
            // Termination is best-effort once outstanding work has been rejected.
        }
    }
    #notify(listenerEvent) {
        for (const listener of [...this.#listeners]) {
            try {
                listener(listenerEvent);
            }
            catch {
                // Progress listeners must not break the worker client.
            }
        }
    }
    #cancelField() {
        if (!this.#fieldCancellationEnabled || this.#terminated)
            return;
        queueMicrotask(() => {
            if (this.#terminated)
                return;
            try {
                this.#host.postMessage({ kind: "cancel-field" });
            }
            catch {
                // The ordered request reports a typed worker failure if the host is gone.
            }
        });
    }
    #failAll(error) {
        if (this.#terminated) {
            return;
        }
        this.#terminated = true;
        this.#state = "disposed";
        this.#unsubscribeMessage();
        this.#unsubscribeError();
        this.#unsubscribeExit();
        for (const pending of this.#pending.values()) {
            pending.reject(error);
        }
        this.#pending.clear();
        try {
            this.#host.terminate();
        }
        catch {
            // The host is already failing.
        }
    }
    #onMessage(data) {
        if (!isWorkerResponse(data)) {
            this.#failAll(new NecRuntimeError("The NEC worker returned a malformed message"));
            return;
        }
        if (data.kind === "progress") {
            this.#notify(data);
            return;
        }
        if (data.kind === "crash") {
            this.#failAll(new NecRuntimeError(data.error.message, data.error.details === undefined ? {} : { details: data.error.details }));
            return;
        }
        const pending = this.#pending.get(data.id);
        if (pending === undefined) {
            return;
        }
        this.#pending.delete(data.id);
        if (data.state !== undefined) {
            this.#state = data.state;
        }
        if (data.kind === "ok") {
            pending.resolve(data.result);
            return;
        }
        pending.reject(reviveError(data.error));
    }
    #assertCallable(method) {
        if (this.#terminated || this.#state === "disposed") {
            if (method === "dispose") {
                return;
            }
            throw new NecStateError(method, "disposed");
        }
    }
    #request(body, transfer = []) {
        this.#assertCallable(body.kind === "create" ? "create" : body.method);
        const run = this.#tail.then(() => {
            if (this.#terminated) {
                throw new NecCancellationError("terminated");
            }
            return new Promise((resolve, reject) => {
                const id = this.#nextId;
                this.#nextId += 1;
                this.#pending.set(id, { resolve, reject });
                try {
                    this.#host.postMessage({ ...body, id }, transfer);
                }
                catch (cause) {
                    this.#pending.delete(id);
                    reject(new NecRuntimeError("Failed to post a NEC worker request", {
                        cause,
                    }));
                }
            });
        });
        this.#tail = run.then(() => undefined, () => undefined);
        return run;
    }
    #invokeVoid(method, args, transfer = []) {
        return this.#invoke(method, args, transfer).then(() => undefined);
    }
    async #invoke(method, args, transfer = []) {
        if (method !== "dispose") {
            this.#assertCallable(method);
        }
        else if (this.#terminated || this.#state === "disposed") {
            return undefined;
        }
        return this.#request({ kind: "invoke", method, args }, transfer);
    }
}
export async function createNecWorkerModelFromHost(host, options, fieldPool) {
    const signal = options?.signal;
    if (signal !== undefined
        && (typeof signal !== "object"
            || typeof signal.aborted !== "boolean"
            || typeof signal.addEventListener !== "function"
            || typeof signal.removeEventListener !== "function")) {
        host.terminate();
        throw new NecInputError("signal must be an AbortSignal");
    }
    if (isAborted(signal)) {
        host.terminate();
        throw new NecCancellationError("aborted");
    }
    const model = new WorkerNecModel(host, options?.onProgress, fieldPool !== undefined);
    const abort = () => {
        model.terminate();
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
        await model.initialize(options, fieldPool);
        return model;
    }
    catch (error) {
        model.terminate();
        if (isAborted(signal) && error instanceof NecCancellationError) {
            throw new NecCancellationError("aborted");
        }
        throw error;
    }
    finally {
        signal?.removeEventListener("abort", abort);
    }
}
/** Create a stateful NEC model that runs inside a dedicated worker. */
export async function createNecWorkerModel(options) {
    if (options !== undefined && (typeof options !== "object" || options === null)) {
        throw new NecInputError("WASM loading options must be an object");
    }
    const host = await openWorkerHost();
    return createNecWorkerModelFromHost(host, options);
}
/** @internal Array facade: create an outer worker that owns evaluator children. */
export async function createNecArrayWorkerModel(fieldPool, signal) {
    const host = await openWorkerHost();
    return createNecWorkerModelFromHost(host, signal === undefined ? undefined : { signal }, fieldPool);
}
