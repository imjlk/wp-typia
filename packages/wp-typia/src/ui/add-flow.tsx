import { createElement, useEffect, useState } from 'react';

import { Form, useTerminalDimensions } from '@bunli/tui';

import {
  executeAddCommand,
  loadAddWorkspaceBlockOptions,
} from '../runtime-bridge';
import { useAlternateBufferLifecycle } from './alternate-buffer-lifecycle';
import {
  type AddFlowValues,
  addFlowSchema,
  getAddViewportHeight,
  sanitizeAddSubmitValues,
} from './add-flow-model';
import {
  AddFlowFields,
  type WorkspaceBlockOption,
} from './add-flow-fields';
import { FirstPartyCompletionViewport } from './first-party-form';

type AddFlowProps = {
  cwd: string;
  initialValues: Partial<AddFlowValues>;
};

export function AddFlow({ cwd, initialValues }: AddFlowProps) {
  const { completion, handleCancel, handleFailure, handleSubmit, status } =
    useAlternateBufferLifecycle('wp-typia add failed');
  const { height: terminalHeight = 24 } = useTerminalDimensions();
  const [workspaceBlockOptions, setWorkspaceBlockOptions] = useState<
    WorkspaceBlockOption[]
  >([]);

  useEffect(() => {
    let disposed = false;
    setWorkspaceBlockOptions([]);

    void loadAddWorkspaceBlockOptions(cwd)
      .then((options) => {
        if (!disposed) {
          setWorkspaceBlockOptions(options);
        }
      })
      .catch((error) => {
        if (!disposed) {
          handleFailure(error);
        }
      });

    return () => {
      disposed = true;
    };
  }, [cwd, handleFailure]);

  if (status === 'completed' && completion) {
    return createElement(FirstPartyCompletionViewport, {
      completion,
      viewportHeight: getAddViewportHeight(terminalHeight),
    });
  }

  return (
    <Form
      initialValues={initialValues}
      onCancel={handleCancel}
      onSubmit={async (values) =>
        handleSubmit(async () => {
          const flags = sanitizeAddSubmitValues(values);
          return executeAddCommand({
            cwd,
            emitOutput: false,
            flags,
            interactive: false,
            kind: values.kind,
            name: typeof flags.name === 'string' ? flags.name : undefined,
          });
        })
      }
      schema={addFlowSchema}
      title="Extend a wp-typia workspace"
    >
      <AddFlowFields workspaceBlockOptions={workspaceBlockOptions} />
    </Form>
  );
}
