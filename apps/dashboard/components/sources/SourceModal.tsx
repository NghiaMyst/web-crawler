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
  Select, SelectContent, SelectItem, SelectTrigger,
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
  source: Source | null;
  onSuccess: (saved: Source, mode: 'add' | 'edit') => void;
}): React.JSX.Element {
  const isEdit = source !== null;
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Local state for controlled selects — avoids stale watch() subscriptions.
  const [selectedCategory, setSelectedCategory] = useState<SourceFormData['category']>('game');
  const [selectedCrawlerType, setSelectedCrawlerType] = useState<SourceFormData['crawlerType']>('cheerio');
  const [isActive, setIsActive] = useState(true);

  const {
    register, handleSubmit, reset, setValue, setError,
    formState: { errors },
  } = useForm<SourceFormData>({
    resolver: zodResolver(sourceFormSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (open) {
      if (source) {
        const category = (source.category as SourceFormData['category']) || 'game';
        setSelectedCategory(category);
        setSelectedCrawlerType(source.crawlerType);
        setIsActive(source.isActive);
        reset({
          name: source.name,
          displayName: source.displayName,
          url: source.url,
          category,
          parserKey: source.parserKey,
          crawlerType: source.crawlerType,
          crawlInterval: source.crawlInterval,
          priority: source.priority,
          isActive: source.isActive,
        });
      } else {
        setSelectedCategory('game');
        setSelectedCrawlerType('cheerio');
        setIsActive(true);
        reset(DEFAULTS);
      }
      setServerError(null);
    }
  }, [open, source, reset]);

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
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <DialogTitle className="text-base font-semibold text-zinc-900">
            {isEdit ? 'Edit Source' : 'New Source'}
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-500 mt-0.5">
            {isEdit
              ? 'Update editable fields. Name, category, parser key, and crawler type are fixed after creation.'
              : 'Configure a new crawl source. Name, category, parser key, and crawler type cannot be changed later.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">

            {/* Identity section */}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/50">
              <div className="px-4 py-3 border-b border-zinc-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Identity</p>
              </div>
              <div className="px-4 py-4 grid grid-cols-2 gap-4">
                <Field label="Slug name" required error={errors.name?.message}>
                  <Input
                    id="name"
                    {...register('name')}
                    disabled={isEdit}
                    placeholder="genshin-events"
                  />
                  {!isEdit && <p className="text-xs text-zinc-400 mt-1">Unique identifier. Cannot be changed later.</p>}
                </Field>
                <Field label="Display name" required error={errors.displayName?.message}>
                  <Input
                    id="displayName"
                    {...register('displayName')}
                    placeholder="Genshin Impact Events"
                  />
                </Field>
              </div>
            </div>

            {/* Source section */}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/50">
              <div className="px-4 py-3 border-b border-zinc-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Source</p>
              </div>
              <div className="px-4 py-4 space-y-4">
                <Field label="URL" required error={errors.url?.message}>
                  <Input
                    id="url"
                    type="url"
                    {...register('url')}
                    placeholder="https://example.com/api/data"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Category" error={errors.category?.message}>
                    <Select
                      value={selectedCategory}
                      onValueChange={(v) => {
                        const cat = v as SourceFormData['category'];
                        setSelectedCategory(cat);
                        setValue('category', cat, { shouldValidate: true });
                      }}
                      disabled={isEdit}
                    >
                      <SelectTrigger id="category">
                        <span className="capitalize">{selectedCategory}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Parser key" required error={errors.parserKey?.message}>
                    <Input
                      id="parserKey"
                      {...register('parserKey')}
                      disabled={isEdit}
                      placeholder="genshin"
                    />
                  </Field>
                </div>
              </div>
            </div>

            {/* Crawl settings section */}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/50">
              <div className="px-4 py-3 border-b border-zinc-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Crawl settings</p>
              </div>
              <div className="px-4 py-4 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Crawler type" error={errors.crawlerType?.message}>
                    <Select
                      value={selectedCrawlerType}
                      onValueChange={(v) => {
                        const ct = v as SourceFormData['crawlerType'];
                        setSelectedCrawlerType(ct);
                        setValue('crawlerType', ct, { shouldValidate: true });
                      }}
                      disabled={isEdit}
                    >
                      <SelectTrigger id="crawlerType">
                        <span className="capitalize">{selectedCrawlerType}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {CRAWLER_TYPES.map((c) => (
                          <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Interval (seconds)" error={errors.crawlInterval?.message}>
                    <Input
                      id="crawlInterval"
                      type="number"
                      {...register('crawlInterval', { valueAsNumber: true })}
                      placeholder="3600"
                    />
                  </Field>
                  <Field label="Priority (1–10)" error={errors.priority?.message}>
                    <Input
                      id="priority"
                      type="number"
                      min={1}
                      max={10}
                      {...register('priority', { valueAsNumber: true })}
                    />
                  </Field>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-zinc-700">Status</Label>
                  <label htmlFor="isActive" className="flex items-center gap-2.5 h-9 cursor-pointer select-none">
                    <input
                      id="isActive"
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => {
                        setIsActive(e.target.checked);
                        setValue('isActive', e.target.checked, { shouldValidate: true });
                      }}
                      className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 cursor-pointer"
                    />
                    <span className="text-sm text-zinc-700">{isActive ? 'Active — crawling enabled' : 'Paused — crawling disabled'}</span>
                  </label>
                </div>
              </div>
            </div>

            {serverError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2.5">
                <p className="text-sm text-red-700">{serverError}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="text-zinc-600"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="min-w-[120px]">
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create source'}
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
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
