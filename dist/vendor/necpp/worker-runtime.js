import { selectEvaluator } from "./field-selection.js";
import { NecRuntimeError, NecStateError } from "./errors.js";
import { FarFieldWorkerPool, StaleFarFieldJobError, } from "./field-worker-pool.js";
import { validateFarFieldGrid, } from "./model.js";
import { collectTransferables, serializeError, toCreateNecModelOptions, } from "./worker-protocol.js";
import { transferIsolatedElementCharacterization } from "./handoff.js";
const FIELD_TILE_SIZE = 512;
const AUTO_MIN_CONTRIBUTIONS = 250_000;
function resultBytes(request) {
    return (4 * request.theta.count * request.phi.count
        + request.theta.count + request.phi.count) * Float64Array.BYTES_PER_ELEMENT;
}
function logicalCores() {
    const value = globalThis.navigator?.hardwareConcurrency;
    return Number.isInteger(value) && value > 0 ? value : 1;
}
function autoWorkerCount(samples) {
    const cores = logicalCores();
    const candidate = cores >= 8 ? 4 : cores >= 4 ? 2 : 1;
    return Math.min(candidate, Math.ceil(samples / FIELD_TILE_SIZE));
}
function serialDiagnostics(session, request, totalMs, fallbackReason, snapshotCaptureMs = 0) {
    return Object.freeze({
        backend: "serial",
        requestedWorkers: session.fieldWorkers ?? 1,
        activeWorkerCount: 1,
        tileSize: FIELD_TILE_SIZE,
        totalTiles: 1,
        completedTiles: 1,
        cancelledTiles: 0,
        cancelledJobs: 0,
        restartedWorkers: 0,
        snapshotBytesPerWorker: 0,
        lastBroadcastBytesPerWorker: 0,
        resultBytes: resultBytes(request),
        geometryReused: false,
        warmupMs: session.fieldPool?.warmupMs ?? 0,
        snapshotCaptureMs,
        snapshotBroadcastMs: 0,
        dispatchMs: 0,
        kernelMs: totalMs,
        mergeMs: 0,
        totalMs,
        fallbackReason,
    });
}
function serialField(session, model, request, reason, snapshotCaptureMs = 0) {
    const started = performance.now();
    const result = model.computeFarField(request);
    const totalMs = performance.now() - started;
    return {
        ...result,
        fieldBackend: serialDiagnostics(session, request, totalMs, reason, snapshotCaptureMs),
    };
}
async function pooledField(session, model, request) {
    request = { ...request, evaluator: selectEvaluator(request?.evaluator, session.farFieldEvaluator) };
    const requestGeneration = session.fieldCancellationGeneration ?? 0;
    const requested = session.fieldWorkers ?? 1;
    if (requested === 1) {
        return serialField(session, model, request, "explicit-one-worker");
    }
    if (model.state !== "solved") {
        throw new NecStateError("computeFarField", model.state);
    }
    const grid = validateFarFieldGrid(request);
    request = {
        evaluator: request.evaluator,
        radiusM: grid.radiusM,
        theta: {
            startDeg: grid.thetaStartDeg,
            count: grid.thetaCount,
            stepDeg: grid.thetaStepDeg,
        },
        phi: {
            startDeg: grid.phiStartDeg,
            count: grid.phiCount,
            stepDeg: grid.phiStepDeg,
        },
    };
    const samples = request.theta.count * request.phi.count;
    const segments = session.fullSegmentCount ?? session.wireSegmentCount ?? 0;
    const workers = requested === "auto" ? autoWorkerCount(samples) : requested;
    const contributions = samples * segments * (session.perfectGround ? 2 : 1);
    if (requested === "auto" && contributions < AUTO_MIN_CONTRIBUTIONS) {
        return serialField(session, model, request, "below-auto-threshold");
    }
    if (requested === "auto" && workers < 2) {
        return serialField(session, model, request, "insufficient-hardware-or-grid");
    }
    const snapshotStarted = performance.now();
    const snapshot = model.captureFarFieldEvaluationSnapshot();
    const snapshotCaptureMs = performance.now() - snapshotStarted;
    if (snapshot.capability !== "supported") {
        return serialField(session, model, request, `unsupported-${snapshot.capability}`, snapshotCaptureMs);
    }
    let pool = session.fieldPool;
    try {
        if (pool === undefined || pool.workerCount !== workers) {
            pool?.dispose();
            pool = new FarFieldWorkerPool(workers, FIELD_TILE_SIZE, "dedicated", session.fieldWorkerAssetBaseUrl);
            session.fieldPool = pool;
        }
        await pool.setSnapshot(snapshot);
        if ((session.fieldCancellationGeneration ?? 0) !== requestGeneration) {
            throw new StaleFarFieldJobError();
        }
        const field = await pool.computeFarField(request, requested === "auto");
        const diagnostics = field.poolDiagnostics;
        const dispatchMs = Math.max(0, diagnostics.dispatchComputeTransferMs - diagnostics.kernelMs);
        return {
            ...(field.fieldEvaluation === undefined ? {} : { fieldEvaluation: field.fieldEvaluation }),
            radiusM: field.radiusM,
            frequencyMHz: field.frequencyMHz,
            thetaDeg: field.thetaDeg,
            phiDeg: field.phiDeg,
            eThetaReal: field.eThetaReal,
            eThetaImag: field.eThetaImag,
            ePhiReal: field.ePhiReal,
            ePhiImag: field.ePhiImag,
            fieldBackend: Object.freeze({
                backend: "worker-pool",
                requestedWorkers: requested,
                activeWorkerCount: diagnostics.workers,
                tileSize: diagnostics.tileSize,
                totalTiles: diagnostics.tiles,
                completedTiles: diagnostics.completedTiles,
                cancelledTiles: diagnostics.cancelledTiles,
                cancelledJobs: diagnostics.cancelledJobs,
                restartedWorkers: diagnostics.restartedWorkers,
                snapshotBytesPerWorker: diagnostics.snapshotBytesPerWorker,
                lastBroadcastBytesPerWorker: diagnostics.lastBroadcastBytesPerWorker,
                resultBytes: resultBytes(request),
                geometryReused: diagnostics.geometryReused,
                warmupMs: pool.warmupMs,
                snapshotCaptureMs,
                snapshotBroadcastMs: diagnostics.snapshotBroadcastMs,
                dispatchMs,
                kernelMs: diagnostics.kernelMs,
                mergeMs: diagnostics.mergeMs,
                totalMs: snapshotCaptureMs + diagnostics.snapshotBroadcastMs
                    + diagnostics.totalMs,
            }),
        };
    }
    catch (error) {
        if (error instanceof StaleFarFieldJobError
            || (session.fieldCancellationGeneration ?? 0) !== requestGeneration) {
            throw new NecRuntimeError("Far-field request was superseded", {
                details: { reason: "superseded", boundedTileSize: request.evaluator === "ring" ? request.phi.count : FIELD_TILE_SIZE },
            });
        }
        pool?.dispose();
        delete session.fieldPool;
        return serialField(session, model, request, "worker-pool-failed", snapshotCaptureMs);
    }
}
async function invokeModel(session, model, method, args) {
    switch (method) {
        case "addWire":
            model.addWire(args[0]);
            session.wireSegmentCount = (session.wireSegmentCount ?? 0)
                + args[0].segments;
            return undefined;
        case "completeGeometry":
            {
                const result = model.completeGeometry(args[0]);
                session.fullSegmentCount = result.symmetry?.fullSegmentCount
                    ?? session.wireSegmentCount ?? 0;
                return result;
            }
        case "definePorts":
            model.definePorts(args[0]);
            return undefined;
        case "addLoad":
            model.addLoad(args[0]);
            return undefined;
        case "clearLoads":
            model.clearLoads();
            return undefined;
        case "setGround":
            model.setGround(args[0]);
            session.perfectGround = args[0].kind === "perfect";
            return undefined;
        case "prepare":
            model.prepare(args[0]);
            return undefined;
        case "computeImpedanceMatrix":
            return model.computeImpedanceMatrix();
        case "solveVoltages":
            return model.solveVoltages(args[0]);
        case "solveCurrents":
            return model.solveCurrents(args[0]);
        case "computeFarField":
            return session.fieldWorkers === undefined
                ? model.computeFarField(args[0])
                : pooledField(session, model, args[0]);
        case "computeEmbeddedFarFields":
            return model.computeEmbeddedFarFields(args[0], args[1]);
        case "getCurrentDistribution":
            return model.getCurrentDistribution(args[0]);
        case "prepareCurrentQuadrature":
            return model.prepareCurrentQuadrature(args[0]);
        case "characterizeIsolatedElement":
            return model.characterizeIsolatedElement(args[0]);
        case "dispose":
            session.fieldPool?.dispose();
            delete session.fieldPool;
            model.dispose();
            return undefined;
        default: {
            const unexpected = method;
            throw new NecRuntimeError(`Unsupported worker method ${String(unexpected)}`);
        }
    }
}
export function cancelWorkerFarField(session) {
    session.fieldCancellationGeneration =
        (session.fieldCancellationGeneration ?? 0) + 1;
    session.fieldPool?.cancelActive();
}
async function withProgress(emitProgress, operation, body) {
    emitProgress({ operation, phase: "start" });
    try {
        return await body();
    }
    finally {
        emitProgress({ operation, phase: "complete" });
    }
}
export async function handleWorkerRequest(session, request, deps) {
    if (request.kind === "create") {
        if (session.model !== undefined) {
            return {
                response: {
                    id: request.id,
                    kind: "error",
                    state: session.model.state,
                    error: serializeError(new NecRuntimeError("The worker model has already been created")),
                },
                transfer: [],
            };
        }
        try {
            const fieldWorkers = request.options?.fieldWorkers;
            if (fieldWorkers !== undefined && fieldWorkers !== "auto"
                && (!Number.isInteger(fieldWorkers) || fieldWorkers < 1 || fieldWorkers > 8)) {
                throw new NecRuntimeError("Invalid evaluator worker configuration");
            }
            const model = await withProgress(deps.emitProgress, "create", () => deps.createModel(toCreateNecModelOptions(request.options)));
            session.model = model;
            session.farFieldEvaluator = selectEvaluator(request.options?.farFieldEvaluator);
            if (fieldWorkers === undefined)
                delete session.fieldWorkers;
            else
                session.fieldWorkers = fieldWorkers;
            const assetBaseUrl = request.options?.fieldWorkerAssetBaseUrl;
            if (assetBaseUrl === undefined)
                delete session.fieldWorkerAssetBaseUrl;
            else
                session.fieldWorkerAssetBaseUrl = assetBaseUrl;
            session.wireSegmentCount = 0;
            session.fullSegmentCount = 0;
            session.perfectGround = false;
            session.fieldCancellationGeneration = 0;
            return {
                response: {
                    id: request.id,
                    kind: "ok",
                    state: model.state,
                    transferredBufferCount: 0,
                },
                transfer: [],
            };
        }
        catch (error) {
            return {
                response: {
                    id: request.id,
                    kind: "error",
                    error: serializeError(error),
                },
                transfer: [],
            };
        }
    }
    const model = session.model;
    if (model === undefined) {
        return {
            response: {
                id: request.id,
                kind: "error",
                error: serializeError(new NecStateError(request.method, "disposed", "The worker model is not created")),
            },
            transfer: [],
        };
    }
    try {
        const result = await withProgress(deps.emitProgress, request.method, () => invokeModel(session, model, request.method, request.args));
        if (request.method === "dispose") {
            session.model = undefined;
        }
        if (request.method === "characterizeIsolatedElement"
            && request.destination !== undefined) {
            const handoff = transferIsolatedElementCharacterization(result, request.destination);
            try {
                request.destination.close();
            }
            catch {
                // Terminate may already have closed the transferred port.
            }
            return {
                response: {
                    id: request.id,
                    kind: "ok",
                    state: model.state,
                    result: handoff,
                    transferredBufferCount: 0,
                },
                transfer: [],
            };
        }
        const transfer = collectTransferables(result);
        return {
            response: {
                id: request.id,
                kind: "ok",
                state: request.method === "dispose" ? "disposed" : model.state,
                result,
                transferredBufferCount: transfer.length,
            },
            transfer,
        };
    }
    catch (error) {
        return {
            response: {
                id: request.id,
                kind: "error",
                state: model.state,
                error: serializeError(error),
            },
            transfer: [],
        };
    }
}
