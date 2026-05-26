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
  Select, SelectContent, SelectItem, SelectTrigger,
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
  messageTpl: z.string().max(2000).optional(),
});

type AlertRuleFormData = z.infer<typeof alertRuleFormSchema>;
type ConditionType = AlertRuleFormData['condition']['type'];
type Channel = AlertRuleFormData['channel'];

const DEFAULTS: AlertRuleFormData = {
  sourceId: '',
  name: '',
  channel: 'telegram',
  isActive: true,
  condition: { type: 'new_item' },
  messageTpl: '',
};

const CONDITION_LABELS: Record<ConditionType, string> = {
  new_item: 'New item',
  field_changed: 'Field changed',
  threshold: 'Threshold',
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

  // Local state drives all controlled selects so UI updates immediately,
  // independent of react-hook-form's watch subscription timing.
  const [conditionType, setConditionType] = useState<ConditionType>('new_item');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<Channel>('telegram');
  const [isActive, setIsActive] = useState(true);

  const {
    register, handleSubmit, reset, setValue, setError,
    formState: { errors, isDirty },
  } = useForm<AlertRuleFormData>({
    resolver: zodResolver(alertRuleFormSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (open) {
      if (rule) {
        const ruleCondition = rule.condition as AlertRuleFormData['condition'];
        setConditionType(ruleCondition.type);
        setSelectedSourceId(rule.sourceId);
        setSelectedChannel(rule.channel);
        setIsActive(rule.isActive);
        reset({
          sourceId: rule.sourceId,
          name: rule.name,
          channel: rule.channel,
          isActive: rule.isActive,
          condition: ruleCondition,
          messageTpl: rule.messageTpl ?? '',
        });
      } else {
        setConditionType('new_item');
        setSelectedSourceId('');
        setSelectedChannel('telegram');
        setIsActive(true);
        reset(DEFAULTS);
      }
      setServerError(null);
    }
  }, [open, rule, reset]);

  function handleConditionTypeChange(newType: string | null): void {
    if (!newType) return;
    const type = newType as ConditionType;
    setConditionType(type);
    if (type === 'new_item') {
      setValue('condition', { type: 'new_item' }, { shouldValidate: false });
    } else if (type === 'field_changed') {
      setValue('condition', { type: 'field_changed', fieldPath: '' }, { shouldValidate: false });
    } else if (type === 'threshold') {
      setValue('condition', { type: 'threshold', fieldPath: '', threshold: 0 }, { shouldValidate: false });
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
            messageTpl: data.messageTpl ?? '',
          })
        : await createAlertRuleAction(data);

      if (!result.ok) {
        setServerError(result.error);
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            if (msgs?.[0]) {
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

  const selectedSourceName = sources.find((s) => s.id === selectedSourceId)?.displayName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-foreground">
            {isEdit ? 'Edit Alert Rule' : 'New Alert Rule'}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-0.5">
            {isEdit
              ? 'Update rule settings. Source cannot be changed after creation.'
              : 'Configure when and how you want to be notified.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">

            {/* Source */}
            <Field label="Source" required error={errors.sourceId?.message}>
              <Select
                value={selectedSourceId}
                onValueChange={(v) => {
                  if (!v) return;
                  setSelectedSourceId(v);
                  setValue('sourceId', v, { shouldValidate: true });
                }}
                disabled={isEdit}
              >
                {/* Render the display name directly — avoids Radix UI's lazy
                    item-registry lookup which shows raw UUIDs before first open */}
                <SelectTrigger id="sourceId" className="w-full">
                  {selectedSourceName
                    ? <span>{selectedSourceName}</span>
                    : <span className="text-muted-foreground">Select a source…</span>}
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Name */}
            <Field label="Rule name" required error={errors.name?.message}>
              <Input
                id="name"
                {...register('name')}
                placeholder="e.g. New Genshin event"
                className="w-full"
              />
            </Field>

            {/* Condition section */}
            <div className="rounded-lg border border-border bg-muted/40">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condition</p>
              </div>
              <div className="px-4 py-4 space-y-4">
                <Field label="Type" error={errors.condition?.message}>
                  <Select value={conditionType} onValueChange={handleConditionTypeChange}>
                    <SelectTrigger id="conditionType" className="w-full">
                      <span>{CONDITION_LABELS[conditionType]}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_item">New item</SelectItem>
                      <SelectItem value="field_changed">Field changed</SelectItem>
                      <SelectItem value="threshold">Threshold</SelectItem>
                    </SelectContent>
                  </Select>
                  {conditionType === 'new_item' && (
                    <p className="text-xs text-muted-foreground mt-1">Triggers when a new entry key is seen for the first time.</p>
                  )}
                </Field>

                {(conditionType === 'field_changed' || conditionType === 'threshold') && (
                  <Field
                    label="Field path"
                    required
                    error={(errors.condition as { fieldPath?: { message?: string } })?.fieldPath?.message}
                  >
                    <Input
                      id="fieldPath"
                      {...register('condition.fieldPath' as keyof AlertRuleFormData)}
                      placeholder="e.g. patch_version"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Dot-notation path into the entry&apos;s JSON payload.</p>
                  </Field>
                )}

                {conditionType === 'threshold' && (
                  <Field
                    label="Threshold value"
                    required
                    error={(errors.condition as { threshold?: { message?: string } })?.threshold?.message}
                  >
                    <Input
                      id="threshold"
                      type="number"
                      placeholder="e.g. 100"
                      {...register('condition.threshold' as keyof AlertRuleFormData, { valueAsNumber: true })}
                    />
                  </Field>
                )}
              </div>
            </div>

            {/* Delivery section */}
            <div className="rounded-lg border border-border bg-muted/40">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery</p>
              </div>
              <div className="px-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Channel" error={errors.channel?.message}>
                    <Select
                      value={selectedChannel}
                      onValueChange={(v) => {
                        const ch = v as Channel;
                        setSelectedChannel(ch);
                        setValue('channel', ch, { shouldValidate: true });
                      }}
                    >
                      <SelectTrigger id="channel" className="w-full">
                        <span className="capitalize">{selectedChannel}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="telegram">Telegram</SelectItem>
                        <SelectItem value="discord">Discord</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-foreground">Status</Label>
                    <label
                      htmlFor="isActive"
                      className="flex items-center gap-2.5 h-9 cursor-pointer select-none"
                    >
                      <div className="relative flex items-center">
                        <input
                          id="isActive"
                          type="checkbox"
                          checked={isActive}
                          onChange={(e) => {
                            setIsActive(e.target.checked);
                            setValue('isActive', e.target.checked, { shouldValidate: true });
                          }}
                          className="peer h-4 w-4 rounded border-input text-primary accent-primary cursor-pointer"
                        />
                      </div>
                      <span className="text-sm text-foreground">
                        {isActive ? 'Active' : 'Paused'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Message template */}
            <Field label="Message template" hint="Optional — leave blank for the default format." error={errors.messageTpl?.message}>
              <Input
                id="messageTpl"
                {...register('messageTpl')}
                placeholder="e.g. New anime: {title} — Ep {episode}"
              />
            </Field>

            {serverError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2.5">
                <p className="text-sm text-red-700">{serverError}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/40 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="text-muted-foreground"
            >
              {isDirty ? 'Discard Changes' : 'Close'}
            </Button>
            <Button type="submit" disabled={isPending} className="min-w-[120px]">
              {isPending ? 'Saving…' : 'Save Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
