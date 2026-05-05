'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createAlertRuleAction, updateAlertRuleAction } from '@/actions/alert-rule.actions';
import type { AlertRule, Source } from '@/types/api';

// Form-specific schema uses z.number() (not z.coerce) because valueAsNumber:true
// in register() already converts the HTML string value to a number before Zod sees it.
const conditionFormSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('new_item') }),
  z.object({ type: z.literal('field_changed'), fieldPath: z.string().min(1, 'Field path is required') }),
  z.object({
    type: z.literal('threshold'),
    fieldPath: z.string().min(1, 'Field path is required'),
    threshold: z.number().finite('Threshold must be a number'),
  }),
]);

const alertRuleFormSchema = z.object({
  sourceId: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(200),
  channel: z.enum(['telegram', 'discord']),
  isActive: z.boolean(),
  condition: conditionFormSchema,
});

type AlertRuleFormData = z.infer<typeof alertRuleFormSchema>;

const DEFAULTS: AlertRuleFormData = {
  sourceId: '',
  name: '',
  channel: 'telegram',
  isActive: true,
  condition: { type: 'new_item' },
};

export function AlertRuleModal({
  open,
  onOpenChange,
  rule,
  sources,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AlertRule | null;
  sources: Source[];
  onSuccess: (saved: AlertRule, mode: 'add' | 'edit') => void;
}): React.JSX.Element {
  const isEdit = rule !== null;
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register, handleSubmit, reset, setValue, watch, setError, resetField,
    formState: { errors },
  } = useForm<AlertRuleFormData>({
    resolver: zodResolver(alertRuleFormSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (open) {
      if (rule) {
        reset({
          sourceId: rule.sourceId,
          name: rule.name,
          channel: rule.channel,
          isActive: rule.isActive,
          condition: rule.condition as AlertRuleFormData['condition'],
        });
      } else {
        reset(DEFAULTS);
      }
      setServerError(null);
    }
  }, [open, rule, reset]);

  const conditionType = watch('condition.type');
  const isActive = watch('isActive');

  function handleConditionTypeChange(newType: string | null): void {
    if (!newType) return;
    if (newType === 'new_item') {
      setValue('condition', { type: 'new_item' });
    } else if (newType === 'field_changed') {
      setValue('condition', { type: 'field_changed', fieldPath: '' });
      resetField('condition.fieldPath' as keyof AlertRuleFormData);
    } else if (newType === 'threshold') {
      setValue('condition', { type: 'threshold', fieldPath: '', threshold: 0 });
      resetField('condition.fieldPath' as keyof AlertRuleFormData);
      resetField('condition.threshold' as keyof AlertRuleFormData);
    }
  }

  function onSubmit(data: AlertRuleFormData): void {
    setServerError(null);
    startTransition(async () => {
      const result = isEdit && rule
        ? await updateAlertRuleAction(rule.id, {
            name: data.name,
            channel: data.channel,
            isActive: data.isActive,
            condition: data.condition,
          })
        : await createAlertRuleAction(data);

      if (!result.ok) {
        setServerError(result.error);
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            if (msgs?.[0]) {
              // Cast to Parameters<typeof setError>[0] so dot-notation paths like
              // "condition.fieldPath" are forwarded correctly to react-hook-form
              // instead of being truncated to the parent key by a keyof cast.
              setError(field as Parameters<typeof setError>[0], { message: msgs[0] });
            }
          }
        }
        return;
      }
      onSuccess(result.data, isEdit ? 'edit' : 'add');
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Alert Rule' : 'Add Alert Rule'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the rule. Source cannot be changed after creation.'
              : 'Configure a new alert rule for a crawl source.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Source" htmlFor="sourceId" error={errors.sourceId?.message}>
            <Select
              value={watch('sourceId')}
              onValueChange={(v) => { if (v) setValue('sourceId', v, { shouldValidate: true }); }}
              disabled={isEdit}
            >
              <SelectTrigger id="sourceId"><SelectValue placeholder="Select a source" /></SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register('name')} placeholder="e.g. New Genshin event" />
          </FormField>

          <FormField label="Condition type" htmlFor="conditionType" error={errors.condition?.message}>
            <Select
              value={conditionType}
              onValueChange={handleConditionTypeChange}
            >
              <SelectTrigger id="conditionType"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new_item">New item</SelectItem>
                <SelectItem value="field_changed">Field changed</SelectItem>
                <SelectItem value="threshold">Threshold</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {(conditionType === 'field_changed' || conditionType === 'threshold') && (
            <FormField
              label="Field path"
              htmlFor="fieldPath"
              error={(errors.condition as { fieldPath?: { message?: string } })?.fieldPath?.message}
            >
              <Input
                id="fieldPath"
                {...register('condition.fieldPath' as keyof AlertRuleFormData)}
                placeholder="e.g. patch_version"
              />
            </FormField>
          )}

          {conditionType === 'threshold' && (
            <FormField
              label="Threshold value"
              htmlFor="threshold"
              error={(errors.condition as { threshold?: { message?: string } })?.threshold?.message}
            >
              <Input
                id="threshold"
                type="number"
                placeholder="e.g. 100"
                {...register('condition.threshold' as keyof AlertRuleFormData, { valueAsNumber: true })}
              />
            </FormField>
          )}

          <FormField label="Notification channel" htmlFor="channel" error={errors.channel?.message}>
            <Select
              value={watch('channel')}
              onValueChange={(v) => setValue('channel', v as AlertRuleFormData['channel'], { shouldValidate: true })}
            >
              <SelectTrigger id="channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="discord">Discord</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <div className="flex items-center gap-2">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setValue('isActive', e.target.checked, { shouldValidate: true })}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <Label htmlFor="isActive" className="text-sm">Active (send notifications)</Label>
          </div>

          {serverError && (
            <p className="text-sm text-red-600" role="alert">{serverError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Discard changes
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Alert Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormField({
  label, htmlFor, error, children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
