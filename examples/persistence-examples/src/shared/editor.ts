export function resolveCurrentEditorPostId(): number {
  const wpData = (
		window as typeof window & {
			wp?: {
				data?: {
					select?: (
						storeName: string,
					) => { getCurrentPostId?: () => unknown } | undefined;
				};
			};
		}
	 ).wp?.data;

  const editorStore = wpData?.select?.( 'core/editor' ) as
		| { getCurrentPostId?: () => unknown }
		| undefined;
  const postId = editorStore?.getCurrentPostId?.();

  return typeof postId === 'number' && postId > 0 ? postId : 0;
}
