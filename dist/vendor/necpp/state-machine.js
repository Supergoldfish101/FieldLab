import { NecStateError } from "./errors.js";
/** Executable form of the normative lifecycle table in docs/wasm-api.md. */
export const MODEL_TRANSITIONS = {
    addWire: {
        empty: "geometry-building",
        "geometry-building": "geometry-building",
    },
    completeGeometry: {
        "geometry-building": "geometry-complete",
    },
    definePorts: {
        "geometry-complete": "geometry-complete",
    },
    addLoad: {
        "geometry-complete": "geometry-complete",
        prepared: "geometry-complete",
        solved: "geometry-complete",
    },
    clearLoads: {
        "geometry-complete": "geometry-complete",
        prepared: "geometry-complete",
        solved: "geometry-complete",
    },
    setGround: {
        "geometry-complete": "geometry-complete",
        prepared: "geometry-complete",
        solved: "geometry-complete",
    },
    prepare: {
        "geometry-complete": "prepared",
        prepared: "prepared",
        solved: {
            configurationChanged: "prepared",
            configurationUnchanged: "solved",
        },
    },
    computeImpedanceMatrix: {
        prepared: "prepared",
        solved: "solved",
    },
    solveVoltages: {
        prepared: "solved",
        solved: "solved",
    },
    solveCurrents: {
        prepared: "solved",
        solved: "solved",
    },
    computeFarField: {
        solved: "solved",
    },
    computeEmbeddedFarFields: {
        prepared: "prepared",
        solved: "solved",
    },
    getCurrentDistribution: {
        prepared: "prepared",
        solved: "solved",
    },
    prepareCurrentQuadrature: {
        prepared: "prepared",
        solved: "solved",
    },
    characterizeIsolatedElement: {
        prepared: "prepared",
        solved: "solved",
    },
    dispose: {
        empty: "disposed",
        "geometry-building": "disposed",
        "geometry-complete": "disposed",
        prepared: "disposed",
        solved: "disposed",
        disposed: "disposed",
    },
};
export function transitionModelState(state, operation, options = {}) {
    const target = MODEL_TRANSITIONS[operation][state];
    if (target === undefined) {
        throw new NecStateError(operation, state);
    }
    if (typeof target === "string") {
        return target;
    }
    return options.configurationChanged === false
        ? target.configurationUnchanged
        : target.configurationChanged;
}
