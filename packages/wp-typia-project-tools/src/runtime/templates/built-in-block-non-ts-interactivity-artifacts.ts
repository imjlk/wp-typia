import type { BuiltInCodeArtifact } from "./built-in-block-code-artifacts.js";
import { renderArtifact } from "./built-in-block-non-ts-render-utils.js";
import type { ScaffoldTemplateVariables } from "./scaffold.js";

const INTERACTIVITY_STYLE_TEMPLATE = `.{{cssClassName}} {
  position: relative;
  padding: 1rem;
  border: 1px solid #dcdcde;
  border-radius: 0.75rem;
  background: #fff;

  &__content {
    display: grid;
    gap: 0.75rem;
  }

  &__counter {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    font-size: 0.9rem;
    font-weight: 600;
  }

  &__progress {
    width: 100%;
    height: 0.5rem;
    overflow: hidden;
    background: #f0f0f1;
    border-radius: 999px;
  }

  &__progress-bar {
    height: 100%;
    background: #3858e9;
    transition: width 0.2s ease;
  }

  &__animation {
    min-height: 1.5rem;
    font-size: 0.85rem;
    color: #3858e9;
    opacity: 0;
    transition: opacity 0.2s ease;

    &.is-active {
      opacity: 1;
    }
  }

  &__completion {
    font-weight: 700;
    color: #06752d;
  }

  &__reset {
    align-self: start;
    padding: 0.4rem 0.7rem;
    border: 1px solid #dcdcde;
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
  }
}
`;

const INTERACTIVITY_EDITOR_STYLE_TEMPLATE = `/**
 * {{title}} Block Editor Styles
 */

.{{cssClassName}} {
	outline: 1px dashed #ddd;
	outline-offset: -1px;
}
`;

/**
 * Builds the interactivity family non-TypeScript scaffold artifacts.
 *
 * @param variables Scaffold template variables used to render the artifact set.
 * @returns The SCSS artifacts owned by the interactivity template family.
 */
export function buildInteractivityArtifacts(
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact[] {
	return [
		renderArtifact(
			"src/editor.scss",
			INTERACTIVITY_EDITOR_STYLE_TEMPLATE,
			variables,
		),
		renderArtifact("src/style.scss", INTERACTIVITY_STYLE_TEMPLATE, variables),
	];
}
