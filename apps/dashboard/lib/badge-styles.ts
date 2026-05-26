/**
 * Shared status / channel / condition badge className constants.
 * Used by JobsTable, NotificationsTable, AlertsTable to render
 * <Badge variant="outline" className={STYLES[key]}> with consistent
 * colors across the dashboard (D-08).
 */

import type { JobStatus, AlertRule, NotificationLog } from '@/types/api';

type Channel = AlertRule['channel'];
type NotifStatus = NotificationLog['status'];
type ConditionType = AlertRule['condition']['type'];

export const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  pending: 'border-amber-500 text-amber-600 bg-amber-50',
  running: 'border-blue-500 text-blue-600 bg-blue-50',
  done:    'border-green-600 text-green-600 bg-green-50',
  failed:  'border-red-500 text-red-500 bg-red-50',
  skipped: 'border-zinc-400 text-zinc-500 bg-zinc-50',
};

export const NOTIF_STATUS_STYLES: Record<NotifStatus, string> = {
  sent:   'border-green-600 text-green-600 bg-green-50',
  failed: 'border-red-500 text-red-500 bg-red-50',
};

export const CHANNEL_STYLES: Record<Channel, string> = {
  telegram: 'border-blue-400 text-blue-500 bg-blue-50',
  discord:  'border-indigo-500 text-indigo-500 bg-indigo-50',
};

export const ALERT_CONDITION_STYLES: Record<ConditionType, string> = {
  new_item:      'border-emerald-500 text-emerald-600 bg-emerald-50',
  field_changed: 'border-sky-500 text-sky-600 bg-sky-50',
  threshold:     'border-orange-500 text-orange-600 bg-orange-50',
};

/** Generic active/inactive on/off status badge (shared between Sources and Alerts isActive). */
export const ACTIVE_INACTIVE_STYLES = {
  active:   'border-green-600 text-green-600 bg-green-50',
  inactive: 'border-red-500 text-red-500 bg-red-50',
} as const;
