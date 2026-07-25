import type { Page } from '@playwright/test';

interface BrowserRestRequestOptions {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  method?: string;
  params?: Record<string, string>;
  routePath: string;
}

interface BrowserRestResponse {
  body: string;
  status: number;
}

export async function requestWordPressRest(
	page: Page,
	options: BrowserRestRequestOptions,
): Promise<BrowserRestResponse> {
  return page.evaluate(async (requestOptions) => {
		const mergeHeaders = (
			headers: Record<string, string> | undefined,
			body: Record<string, unknown> | undefined,
		) => {
			const nextHeaders = { ...(headers ?? {}) };
			if (typeof body === 'undefined') {
				return nextHeaders;
			}

			const hasContentType = Object.keys(nextHeaders).some(
				(headerName) => headerName.toLowerCase() === 'content-type',
			);
			if (!hasContentType) {
				nextHeaders['Content-Type'] = 'application/json';
			}

			return nextHeaders;
		};

		const resolveRestRootInBrowser = () => {
			const wpApiSettings = (window as typeof window & {
				wpApiSettings?: { root?: string };
			}).wpApiSettings;
			if (typeof wpApiSettings?.root === 'string' && wpApiSettings.root.length > 0) {
				return wpApiSettings.root;
			}

			const apiLink = document.querySelector<HTMLLinkElement>('link[rel="https://api.w.org/"]');
			const href = apiLink?.getAttribute('href');
			if (typeof href === 'string' && href.length > 0) {
				return new URL(href, window.location.origin).toString();
			}

			throw new Error(
				'Unable to resolve the WordPress REST root in E2E. Provide wpApiSettings.root or an api.w.org discovery link.',
			);
		};

		const buildRestUrlInBrowser = (
			root: string,
			routePath: string,
			params?: Record<string, string>,
		) => {
			const normalizedRoute = routePath.endsWith('/') ? routePath : `${routePath}/`;
			const url = new URL(root);

			if (url.searchParams.has('rest_route')) {
				url.searchParams.set('rest_route', normalizedRoute);
			} else {
				url.pathname = `${url.pathname.replace(/\/?$/, '/')}${normalizedRoute.replace(/^\/+/, '')}`;
			}

			for (const [key, value] of Object.entries(params ?? {})) {
				url.searchParams.set(key, value);
			}

			return url.toString();
		};

		const restRoot = resolveRestRootInBrowser();
		const response = await fetch(
			buildRestUrlInBrowser(
				restRoot,
				requestOptions.routePath,
				requestOptions.params,
			),
			{
				method: requestOptions.method ?? 'GET',
				headers: mergeHeaders(requestOptions.headers, requestOptions.body),
				body:
					typeof requestOptions.body === 'undefined'
						? undefined
						: JSON.stringify(requestOptions.body),
			},
		);

		return {
			body: await response.text(),
			status: response.status,
		};
	}, options);
}
