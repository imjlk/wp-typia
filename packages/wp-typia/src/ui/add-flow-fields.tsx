import { createElement, useMemo } from 'react';

import { useFormContext, useTerminalDimensions } from '@bunli/tui';

import type { AddFlowValues } from './add-flow-model';
import {
  getAddScrollTop,
  getAddViewportHeight,
  getVisibleAddFieldNames,
} from './add-flow-model';
import {
  ADD_FLOW_FIELD_GROUPS,
  type WorkspaceBlockOption,
} from './add-flow-field-groups';
import { FirstPartyFormViewport } from './first-party-form';

export type { WorkspaceBlockOption } from './add-flow-field-groups';

export function AddFlowFields({
  workspaceBlockOptions,
}: {
  workspaceBlockOptions: WorkspaceBlockOption[];
}) {
  const { activeFieldName, isSubmitting, values } = useFormContext();
  const { height: terminalHeight = 24 } = useTerminalDimensions();
  const addValues = values as Partial<AddFlowValues>;
  const kind = addValues.kind ?? 'block';
  const template = addValues.template;
  const viewportHeight = getAddViewportHeight(terminalHeight);
  const scrollValues = useMemo(() => ({ kind, template }), [kind, template]);
  const scrollTop = useMemo(
    () =>
      getAddScrollTop({
        activeFieldName,
        values: scrollValues,
        viewportHeight,
      }),
    [activeFieldName, scrollValues, viewportHeight],
  );
  const orderedVisibleFields = useMemo(
    () => getVisibleAddFieldNames({ kind, template }),
    [kind, template],
  );
  const visibleFields = useMemo(
    () => new Set(orderedVisibleFields),
    [orderedVisibleFields],
  );
  const fieldContext = useMemo(
    () => ({
      kind,
      orderedVisibleFields,
      template,
      visibleFields,
      workspaceBlockOptions,
    }),
    [kind, orderedVisibleFields, template, visibleFields, workspaceBlockOptions],
  );
  const fields = useMemo(
    () => ADD_FLOW_FIELD_GROUPS.flatMap((group) => group.render(fieldContext)),
    [fieldContext],
  );

  return createElement(
    FirstPartyFormViewport,
    {
      isSubmitting,
      scrollTop,
      submittingDescription: 'Applying your workspace changes...',
      submittingTitle: 'Updating workspace...',
      viewportHeight,
    },
    fields,
  );
}
