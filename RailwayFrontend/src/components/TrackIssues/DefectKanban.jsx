import React, { useMemo } from 'react';
import DefectKanbanColumn from './DefectKanbanColumn';
import {
  DEFECT_COLUMNS,
  deriveDefectKanbanStatus,
} from './kanbanUtils';

const DefectKanban = ({
  issues = [],
  onOpenIssue,
  onOpenAI,
}) => {
  const grouped = useMemo(() => {
    const result = Object.fromEntries(
      DEFECT_COLUMNS.map((column) => [column.key, []]),
    );

    issues.forEach((issue) => {
      result[deriveDefectKanbanStatus(issue)].push(issue);
    });

    return result;
  }, [issues]);

  return (
    <div className="overflow-x-auto pb-3">
      <div className="grid min-w-[1900px] grid-cols-7 gap-4">
        {DEFECT_COLUMNS.map((column) => (
          <DefectKanbanColumn
            key={column.key}
            column={column}
            issues={grouped[column.key] || []}
            onOpenIssue={onOpenIssue}
            onOpenAI={onOpenAI}
          />
        ))}
      </div>
    </div>
  );
};

export default DefectKanban;
