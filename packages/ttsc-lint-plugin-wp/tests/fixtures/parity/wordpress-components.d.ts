declare module '@wordpress/components' {
  export const __experimentalBlocked: unknown;
  export const __unstableAllowed: unknown;
  export const Card: unknown;
  export const Animate: unknown;
  export const ExternalLink: unknown;
  export const privateApis: unknown;
  export const Button: (props: Record<string, unknown>) => any;
  export const ClipboardButton: (props: Record<string, unknown>) => any;
  export const IconButton: (props: Record<string, unknown>) => any;
}

declare module '@wordpress/ui' {
  export const Link: any;
  export const Text: any;
  export const VisuallyHidden: any;
  export const NotRecommended: any;
}

declare module '@wordpress/data' {
  export const select: (...args: unknown[]) => unknown;
  export const dispatch: (...args: unknown[]) => unknown;
  export const resolveSelect: (...args: unknown[]) => unknown;
  export const useDispatch: (...args: unknown[]) => unknown;
  export const useSelect: (...args: unknown[]) => unknown;
  export const withSelect: (...args: unknown[]) => unknown;
  export const withDispatch: (...args: unknown[]) => unknown;
  export const createRegistrySelector: (...args: unknown[]) => unknown;
  export const controls: Record<string, unknown>;
}
