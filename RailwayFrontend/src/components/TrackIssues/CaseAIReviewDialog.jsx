import React from 'react';
import ModalShell from './ModalShell';
import InspectionCaseAIReview from './InspectionCaseAIReview';

const CaseAIReviewDialog = ({ inspectionCase, open, onClose }) => (
  <ModalShell
    open={open}
    onClose={onClose}
    title="စစ်ဆေးမှုတစ်ခုလုံးအတွက် AI သုံးသပ်ချက်"
  >
    {inspectionCase ? (
      <InspectionCaseAIReview inspectionCase={inspectionCase} />
    ) : (
      <p className="text-sm text-slate-500">စစ်ဆေးမှုCase မရွေးရသေးပါ။</p>
    )}
  </ModalShell>
);

export default CaseAIReviewDialog;
