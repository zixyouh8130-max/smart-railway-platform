import React from 'react';
import ModalShell from './ModalShell';
import AIReviewPanel from './AIReviewPanel';

const AIReviewDialog = ({ issue, open, onClose }) => (
  <ModalShell
    open={open}
    onClose={onClose}
    title={issue ? `AI review — ${issue.defect_type || 'Finding'}` : 'AI finding review'}
  >
    {issue ? (
      <AIReviewPanel issue={issue} compact />
    ) : (
      <p className="text-sm text-slate-500">No finding selected.</p>
    )}
  </ModalShell>
);

export default AIReviewDialog;
