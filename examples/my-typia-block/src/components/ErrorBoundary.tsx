/* eslint-disable no-console */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary component for My Typia Block
 */
export class ErrorBoundary extends Component< Props, State > {
  public override state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError( error: Error ): State {
    return { hasError: true, error };
  }

  public override componentDidCatch( error: Error, errorInfo: ErrorInfo ) {
    console.error( 'My Typia Block Error:', error, errorInfo );
  }

  public override render() {
    if ( this.state.hasError ) {
      return (
				this.props.fallback || (
					<div className="my-typia-block-error-boundary">
						<h3>Something went wrong with My Typia Block</h3>
						<p>Please check the console for more details.</p>
						{ this.state.error && (
							<details>
								<summary>Error details</summary>
								<pre>{ this.state.error.stack }</pre>
							</details>
						) }
					</div>
				)
			);
    }

    return this.props.children;
  }
}
