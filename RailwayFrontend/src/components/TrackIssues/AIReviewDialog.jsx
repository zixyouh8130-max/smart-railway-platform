import React from 'react';
import ModalShell from './ModalShell';
import AIReviewPanel from './AIReviewPanel';
import { defectTypeLabel } from './kanbanUtils';

const AIReviewDialog = ({ issue, open, onClose }) => (
  <ModalShell
    open={open}
    onClose={onClose}
    title={
      issue
        ? `သုံးသပ်ချက် — ${defectTypeLabel(issue.defect_type)}`
        : 'တွေ့ရှိချက် သုံးသပ်ချက်'
    }
  >
    {issue ? (
      <AIReviewPanel issue={issue} compact />
    ) : (
      <p className="text-sm text-slate-500">တွေ့ရှိချက် မရွေးရသေးပါ။</p>
    )}
  </ModalShell>
);

export default AIReviewDialog;
