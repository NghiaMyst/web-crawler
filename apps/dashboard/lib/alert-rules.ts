import type { AlertCondition } from '@/types/api';

export function formatCondition(condition: AlertCondition): string {
  switch (condition.type) {
    case 'new_item':
      return 'New item';
    case 'field_changed':
      return `Field changed: ${condition.fieldPath}`;
    case 'threshold':
      return `Threshold: ${condition.fieldPath} > ${condition.threshold}`;
  }
}
