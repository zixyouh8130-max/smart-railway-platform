import React from 'react';
import ModalShell from './ModalShell';
import InspectionCaseAIReview from './InspectionCaseAIReview';

const CaseAIReviewDialog = ({ inspectionCase, open, onClose }) => (
  <ModalShell
    open={open}
    onClose={onClose}
    title="Inspection-wide AI review"
  >
    {inspectionCase ? (
      <InspectionCaseAIReview inspectionCase={inspectionCase} />
    ) : (
      <p className="text-sm text-slate-500">No inspection case selected.</p>
    )}
  </ModalShell>
);

export default CaseAIReviewDialog;
