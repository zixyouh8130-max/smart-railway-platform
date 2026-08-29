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
  activityTypeLabel,
  caseStatusLabel,
  dateTimeLabel,
  proximityLabel,
  staffRoleLabel,
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
  const activityType = String(activity.activity_type || '').toUpperCase();

  const system =
    activityType.includes('AI') ||
    activityType.includes('CREATED_FROM') ||
    (!activity.actor_name && !activity.actor_staff_name);

  const actor =
    activity.actor_name ||
    activity.actor_staff_name ||
    (system ? 'စနစ်' : 'ဝန်ထမ်း');

  return (
    <article className={system ? 'flex justify-center' : 'flex gap-2.5'}>
      {!system && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600">
          <UserRound className="h-3.5 w-3.5" />
        </div>
      )}

      {system ? (
        <div className="max-w-[95%] rounded-lg bg-slate-200/70 px-3 py-2 text-center text-xs text-slate-600">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Icon className="h-3.5 w-3.5" />
            <span className="font-medium">
              {activityTypeLabel(activity.activity_type || 'ACTIVITY')}
            </span>
            <span>·</span>
            <time>{dateTimeLabel(activity.created_at)}</time>
          </div>
          {activity.message && (
            <p className="mt-1 whitespace-pre-wrap leading-5">{activity.message}</p>
          )}
          {activity.from_status && activity.to_status && (
            <p className="mt-1 font-medium">
              {caseStatusLabel(activity.from_status)} → {caseStatusLabel(activity.to_status)}
            </p>
          )}
        </div>
      ) : (
        <div className="min-w-0 max-w-[88%] flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1">
            <span className="text-xs font-semibold text-slate-700">{actor}</span>
            {activity.actor_role && (
              <span className="text-[10px] text-slate-400">
                {staffRoleLabel(activity.actor_role)}
              </span>
            )}
            <time className="ml-auto text-[10px] text-slate-400">
              {dateTimeLabel(activity.created_at)}
            </time>
          </div>

          <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            {activity.message && (
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {activity.message}
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                <Icon className="h-3 w-3" />
                {activityTypeLabel(activity.activity_type || 'ACTIVITY')}
              </span>

              {activity.from_status && activity.to_status && (
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">
                  {caseStatusLabel(activity.from_status)} → {caseStatusLabel(activity.to_status)}
                </span>
              )}

              {activity.proximity && (
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
                  GPS: {proximityLabel(activity.proximity)}
                </span>
              )}

              {activity.issue_id && (
                <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700">
                  ဤချို့ယွင်းချက်
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
};

export default ChatterMessage;
