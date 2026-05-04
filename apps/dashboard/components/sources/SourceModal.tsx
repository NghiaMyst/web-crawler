'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { z } from 'zod';
import { sourceCategoryEnum, crawlerTypeEnum } from '@/lib/schemas/source';
import { createSourceAction, updateSourceAction } from '@/actions/source.actions';
import type { Source } from '@/types/api';

// Form-specific schema uses z.number() (not z.coerce) because valueAsNumber:true
// in register() already converts the HTML string value to a number before validation.
const sourceFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  displayName: z.string().min(1, 'Display name is required').max(100, 'Display name too long'),
  url: z.string().url('Must be a valid URL'),
  category: sourceCategoryEnum,
  parserKey: z.string().min(1, 'Parser key is required').max(50),
  crawlerType: crawlerTypeEnum,
  crawlInterval: z.number().int().min(60, 'Minimum 60 seconds').max(86400, 'Maximum 24 hours'),
  priority: z.number().int().min(1).max(10),
  isActive: z.boolean(),
});

type SourceFormData = z.infer<typeof sourceFormSchema>;

const CATEGORIES = ['game', 'football', 'anime', 'manga', 'music'] as const;
const CRAWLER_TYPES = ['cheerio', 'playwright'] as const;

const DEFAULTS: SourceFormData = {
  name: '',
  displayName: '',
  url: '',
  category: 'game',
  parserKey: '',
  crawlerType: 'cheerio',
  crawlInterval: 3600,
  priority: 5,
  isActive: true,
};

export function SourceModal({
  open,
  onOpenChange,
  source,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: Source | null; // null = add mode
  onSuccess: (saved: Source, mode: 'add' | 'edit') => void;
}): React.JSX.Element {
  const isEdit = source !== null;
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register, handleSubmit, reset, setValue, watch, setError,
    formState: { errors },
  } = useForm<SourceFormData>({
    resolver: zodResolver(sourceFormSchema),
    defaultValues: DEFAULTS,
  });

  // Reset form when source prop changes (edit vs add) or modal opens.
  useEffect(() => {
    if (open) {
      reset(source ? {
        name: source.name,
        displayName: source.displayName,
        url: source.url,
        category: (source.category as SourceFormData['category']) || 'game',
        parserKey: source.parserKey,
        crawlerType: source.crawlerType,
        crawlInterval: source.crawlInterval,
        priority: source.priority,
        isActive: source.isActive,
      } : DEFAULTS);
      setServerError(null);
    }
  }, [open, source, reset]);

  const isActive = watch('isActive');

  function onSubmit(data: SourceFormData): void {
    setServerError(null);
    startTransition(async () => {
      const result = isEdit && source
        ? await updateSourceAction(source.id, {
            displayName: data.displayName,
            url: data.url,
            crawlInterval: data.crawlInterval,
            priority: data.priority,
            isActive: data.isActive,
          })
        : await createSourceAction(data);

      if (!result.ok) {
        setServerError(result.error);
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof SourceFormData, { message: msgs[0] });
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
          <DialogTitle>{isEdit ? 'Edit source' : 'Add source'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the editable fields. Name, category, parser, and crawler type are immutable.'
              : 'Configure a new crawl source.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Name (unique slug)" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register('name')} disabled={isEdit} placeholder="genshin-events" />
          </FormField>
          <FormField label="Display name" htmlFor="displayName" error={errors.displayName?.message}>
            <Input id="displayName" {...register('displayName')} placeholder="Genshin Impact Events" />
          </FormField>
          <FormField label="URL" htmlFor="url" error={errors.url?.message}>
            <Input id="url" type="url" {...register('url')} placeholder="https://example.com/api" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Category" htmlFor="category" error={errors.category?.message}>
              <Select
                value={watch('category')}
                onValueChange={(v) => setValue('category', v as SourceFormData['category'], { shouldValidate: true })}
                disabled={isEdit}
              >
                <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Parser key" htmlFor="parserKey" error={errors.parserKey?.message}>
              <Input id="parserKey" {...register('parserKey')} disabled={isEdit} placeholder="genshin" />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Crawler" htmlFor="crawlerType" error={errors.crawlerType?.message}>
              <Select
                value={watch('crawlerType')}
                onValueChange={(v) => setValue('crawlerType', v as SourceFormData['crawlerType'], { shouldValidate: true })}
                disabled={isEdit}
              >
                <SelectTrigger id="crawlerType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRAWLER_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Interval (s)" htmlFor="crawlInterval" error={errors.crawlInterval?.message}>
              <Input id="crawlInterval" type="number" {...register('crawlInterval', { valueAsNumber: true })} />
            </FormField>
            <FormField label="Priority" htmlFor="priority" error={errors.priority?.message}>
              <Input id="priority" type="number" min={1} max={10} {...register('priority', { valueAsNumber: true })} />
            </FormField>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setValue('isActive', e.target.checked, { shouldValidate: true })}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <Label htmlFor="isActive" className="text-sm">Active (enable crawling)</Label>
          </div>

          {serverError && (
            <p className="text-sm text-red-600" role="alert">{serverError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save Source'}
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
