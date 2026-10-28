import { validateFarFieldSnapshot, } from "./field-evaluator.js";
async function endpoint() {
    const runtime = globalThis;
    if (typeof runtime.process?.versions?.node === "string") {
        const { parentPort } = await import("node:worker_threads");
        if (parentPort === null)
            throw new Error("Evaluator must run in a worker");
        return {
            post: (message, transfer = []) => parentPort.postMessage(message, transfer),
            listen: (handler) => parentPort.on("message", handler),
            close: () => parentPort.close(),
        };
    }
    const scope = globalThis;
    return {
        post: (message, transfer = []) => scope.postMessage(message, transfer),
        listen: (handler) => scope.addEventListener("message", (event) => handler(event.data)),
        close: () => globalThis.close(),
    };
}
const host = await endpoint();
const queuedMessages = [];
let dispatchMessage = (message) => { queuedMessages.push(message); };
host.listen((message) => dispatchMessage(message));
const artifactShape = new URL(import.meta.url).searchParams.get("artifact") === "full-nec"
    ? "full-nec" : "dedicated";
const moduleImport = artifactShape === "full-nec"
    ? await import("./nec2pp.generated.js")
    : await import("./necpp-field-evaluator.generated.js");
const createFieldEvaluatorModule = moduleImport.default;
const evaluatorWasmUrl = artifactShape === "full-nec"
    ? new URL("./nec2pp.wasm", import.meta.url).href
    : new URL("./necpp-field-evaluator.wasm", import.meta.url).href;
const wasm = await createFieldEvaluatorModule({
    locateFile(path, prefix) {
        return path.endsWith(".wasm") ? evaluatorWasmUrl : `${prefix}${path}`;
    },
});
if (wasm._necpp_field_evaluator_v1_version() !== 1) {
    throw new Error("Unsupported dedicated field-evaluator WASM version");
}
let snapshot;
const pointers = new Map();
let outputCapacity = 0;
let ringContext = 0;
const snapshotNames = [
    "x", "y", "z", "cab", "sab", "salp", "segmentHalfLengths",
    "air", "aii", "bir", "bii", "cir", "cii",
];
const outputNames = ["eThetaReal", "eThetaImag", "ePhiReal", "ePhiImag"];
function releasePointers() {
    if (ringContext)
        wasm._necpp_field_evaluator_ring_v1_delete(ringContext);
    ringContext = 0;
    for (const pointer of pointers.values())
        wasm._free(pointer);
    pointers.clear();
    outputCapacity = 0;
}
function store(name, values) {
    let pointer = pointers.get(name);
    if (pointer === undefined) {
        pointer = wasm._malloc(values.byteLength);
        if (pointer === 0)
            throw new Error(`Unable to allocate evaluator ${name}`);
        pointers.set(name, pointer);
    }
    wasm.HEAPF64.set(values, pointer / Float64Array.BYTES_PER_ELEMENT);
}
function configure(next) {
    validateFarFieldSnapshot(next);
    releasePointers();
    for (const name of snapshotNames)
        store(name, next[name]);
    snapshot = next;
}
function ensureOutputs(count) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 0x7fffffff / 8) {
        throw new Error("Evaluator output exceeds the WASM addressable size");
    }
    if (count <= outputCapacity)
        return;
    for (const name of outputNames) {
        const old = pointers.get(name);
        if (old !== undefined)
            wasm._free(old);
        const pointer = wasm._malloc(count * Float64Array.BYTES_PER_ELEMENT);
        if (pointer === 0)
            throw new Error(`Unable to allocate evaluator ${name}`);
        pointers.set(name, pointer);
    }
    outputCapacity = count;
}
function pointer(name) {
    const value = pointers.get(name);
    if (value === undefined)
        throw new Error(`Evaluator pointer ${name} is missing`);
    return value;
}
function ringArguments(tile) {
    const current = snapshot;
    if (current === undefined || tile.solutionGeneration !== current.solutionGeneration)
        throw new Error("Evaluator ring is stale or not configured");
    // Keep the default exact worker path free of ring-only allocations.
    if (!ringContext) {
        if (wasm._necpp_field_evaluator_ring_v1_create === undefined)
            throw new Error("Ring evaluator capability unavailable");
        ringContext = wasm._necpp_field_evaluator_ring_v1_create(current.segmentCount, ...["x", "y", "cab", "sab", "segmentHalfLengths"].map(pointer));
        if (!ringContext)
            throw new Error("Unable to allocate ring geometry");
    }
    return [ringContext, current.segmentCount, current.perfectGround ? 1 : 0, current.wavelengthM,
        tile.radiusM, tile.thetaStartDeg, tile.thetaCount, tile.thetaStepDeg,
        tile.phiStartDeg, tile.phiCount, tile.phiStepDeg, ...snapshotNames.map(pointer)];
}
function planRing(tile) {
    if (wasm._necpp_field_evaluator_ring_v1_version?.() !== 1 ||
        wasm._necpp_field_evaluator_ring_v1_plan === undefined)
        throw new Error("Ring evaluator capability unavailable");
    const args = ringArguments(tile);
    const count = tile.thetaCount + 7;
    if (!Number.isSafeInteger(count) || count < 8 || count > 0x7fffffff / 8)
        throw new Error("Ring plan exceeds the WASM addressable size");
    const output = wasm._malloc(count * 8);
    if (!output)
        throw new Error("Unable to allocate ring plan");
    try {
        if (wasm._necpp_field_evaluator_ring_v1_plan(...args, output))
            throw new Error("Invalid ring plan");
        return wasm.HEAPF64.slice(output / 8, output / 8 + count);
    }
    finally {
        wasm._free(output);
    }
}
function evaluate(tile, ring) {
    const current = snapshot;
    if (current === undefined || tile.solutionGeneration !== current.solutionGeneration)
        throw new Error("Evaluator tile is stale or not configured");
    ensureOutputs(tile.count);
    const started = performance.now();
    const status = ring === undefined ? wasm._necpp_field_evaluator_v1_evaluate(current.segmentCount, current.perfectGround ? 1 : 0, current.wavelengthM, tile.radiusM, tile.thetaStartDeg, tile.thetaCount, tile.thetaStepDeg, tile.phiStartDeg, tile.phiCount, tile.phiStepDeg, tile.start, tile.count, pointer("x"), pointer("y"), pointer("z"), pointer("cab"), pointer("sab"), pointer("salp"), pointer("segmentHalfLengths"), pointer("air"), pointer("aii"), pointer("bir"), pointer("bii"), pointer("cir"), pointer("cii"), pointer("eThetaReal"), pointer("eThetaImag"), pointer("ePhiReal"), pointer("ePhiImag")) : wasm._necpp_field_evaluator_ring_v1_evaluate(...ringArguments(tile), tile.start, ring.samples, ring.cx, ring.cy, ...outputNames.map(pointer));
    if (status !== 0)
        throw new Error(`Dedicated evaluator rejected tile (${status})`);
    const copy = (name) => {
        const start = pointer(name) / Float64Array.BYTES_PER_ELEMENT;
        return wasm.HEAPF64.slice(start, start + tile.count);
    };
    return {
        start: tile.start, count: tile.count,
        jobGeneration: tile.jobGeneration,
        solutionGeneration: tile.solutionGeneration,
        computeMs: performance.now() - started,
        eThetaReal: copy("eThetaReal"), eThetaImag: copy("eThetaImag"),
        ePhiReal: copy("ePhiReal"), ePhiImag: copy("ePhiImag"),
    };
}
const handleMessage = (message) => {
    const request = message;
    try {
        if (request.kind === "crash-for-test") {
            throw new Error("intentional evaluator failure");
        }
        if (request.kind === "ping") {
            host.post({ id: request.id, kind: "ok" });
            return;
        }
        if (request.kind === "dispose") {
            releasePointers();
            host.post({ id: request.id, kind: "ok" });
            host.close();
            return;
        }
        if (request.kind === "configure") {
            configure(request.snapshot);
            host.post({ id: request.id, kind: "ok" });
            return;
        }
        if (request.kind === "update-currents") {
            if (snapshot === undefined)
                throw new Error("Evaluator is not configured");
            const updated = {
                ...snapshot,
                solutionGeneration: request.solutionGeneration,
                air: request.air, aii: request.aii, bir: request.bir,
                bii: request.bii, cir: request.cir, cii: request.cii,
            };
            validateFarFieldSnapshot(updated);
            snapshot = updated;
            for (const name of ["air", "aii", "bir", "bii", "cir", "cii"])
                store(name, updated[name]);
            host.post({ id: request.id, kind: "ok" });
            return;
        }
        if (request.kind === "plan-ring") {
            host.post({ id: request.id, kind: "plan", result: planRing(request.tile) });
            return;
        }
        if (request.kind === "evaluate" || request.kind === "evaluate-ring") {
            if (snapshot === undefined)
                throw new Error("Evaluator is not configured");
            const result = evaluate(request.tile, request.kind === "evaluate-ring" ? request : undefined);
            const transfer = [
                result.eThetaReal.buffer,
                result.eThetaImag.buffer,
                result.ePhiReal.buffer,
                result.ePhiImag.buffer,
            ];
            host.post({ id: request.id, kind: "tile", result }, transfer);
            return;
        }
        throw new Error("Malformed evaluator request");
    }
    catch (error) {
        host.post({
            id: typeof request?.id === "number" ? request.id : -1,
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
        });
    }
};
dispatchMessage = handleMessage;
for (const message of queuedMessages.splice(0))
    handleMessage(message);
