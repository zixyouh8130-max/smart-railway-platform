import React from 'react';
import {
  Activity,
  Bot,
  MapPin,
  MessageCircle,
  ShieldCheck,
  UserRound,
  Wrench,
} from 'lucide-react';
import {
  dateTimeLabel,
  humanize,
} from './kanbanUtils';

const iconForActivity = (activityType = '') => {
  const type = String(activityType).toUpperCase();

  if (type.includes('AI') || type.includes('CREATED_FROM')) return Bot;
  if (type.includes('LOCATION')) return MapPin;
  if (type.includes('FIELD_VERIFICATION')) return ShieldCheck;
  if (type.includes('MAINTENANCE')) return Wrench;
  if (type.includes('COMMENT') || type.includes('MESSAGE')) return MessageCircle;

  return Activity;
};

const ChatterMessage = ({ activity }) => {
  const Icon = iconForActivity(activity.activity_type);

  const system =
    String(activity.activity_type || '').toUpperCase().includes('AI') ||
    String(activity.activity_type || '').toUpperCase().includes('CREATED_FROM');

  const actor =
    activity.actor_name ||
    activity.actor_staff_name ||
    (system ? 'AI System' : 'System');

  return (
    <article className="flex gap-3 py-4">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
        {system ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-slate-900">{actor}</span>
            {activity.actor_role && (
              <span className="ml-2 text-xs text-slate-400">
                {humanize(activity.actor_role)}
              </span>
            )}
          </div>

          <time className="text-xs text-slate-400">
            {dateTimeLabel(activity.created_at)}
          </time>
        </div>

        {activity.message && (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {activity.message}
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            <Icon className="h-3 w-3" />
            {humanize(activity.activity_type || 'Activity')}
          </span>

          {activity.from_status && activity.to_status && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
              {humanize(activity.from_status)} → {humanize(activity.to_status)}
            </span>
          )}

          {activity.proximity && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
              GPS: {humanize(activity.proximity)}
            </span>
          )}

          {activity.issue_id && (
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
              This defect
            </span>
          )}
        </div>
      </div>
    </article>
  );
};

export default ChatterMessage;
