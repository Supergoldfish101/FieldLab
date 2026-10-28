import { selectEvaluator } from "./field-selection.js";
export { NecCancellationError, NecConditioningError, NecError, NecGeometryError, NecInputError, NecPortError, NecRuntimeError, NecSolverError, NecStateError, } from "./errors.js";
export { abiVersion, engineVersion, packageVersion } from "./versions.js";
export { rotationalOrder } from "./symmetry.js";
export { analyzeArraySymmetry, createExplicitArrayBuildPlan } from "./array-symmetry.js";
export { applyArrayBuildPlan, createNecArraySolver, gatherComplexMatrix, gatherComplexVector, gatherEmbeddedBasis, rephaseFarField, scatterComplexVector, } from "./array-solver.js";
import { runDeckWithModule, validateDeckText } from "./deck.js";
import { NecInputError } from "./errors.js";
import { instantiateNecModule } from "./loader.js";
import { createModelFromModule } from "./model.js";
export { transferIsolatedElementCharacterization } from "./handoff.js";
/** Create an isolated stateful NEC model backed by a new WASM module instance. */
export async function createNecModel(options) {
    const evaluator = selectEvaluator(options?.farFieldEvaluator);
    const module = await instantiateNecModule(options);
    return createModelFromModule(module, evaluator);
}
/** Compatibility escape hatch for complete NEC text decks. */
export async function runDeck(deck, options) {
    validateDeckText(deck);
    if (options?.signal?.aborted === true) {
        throw new NecInputError("Deck execution was aborted before it started", {
            details: { operation: "runDeck", aborted: true },
        });
    }
    const module = await instantiateNecModule(options);
    return runDeckWithModule(module, deck, options);
}
