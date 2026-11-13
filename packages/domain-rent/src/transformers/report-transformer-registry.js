import { transformPropertyClosingStatus } from "./property-closing-status.transformer.js";
import { transformBoxScoreReport } from "./box-score.transformer.js";
import { transformResidentRetentionReport } from "./resident-retention.transformer.js";
const registry = {
    property_closings: transformPropertyClosingStatus,
    box_score: transformBoxScoreReport,
    resident_retention: transformResidentRetentionReport
};
export function getReportTransformer(reportCode) {
    return registry[reportCode];
}
//# sourceMappingURL=report-transformer-registry.js.map