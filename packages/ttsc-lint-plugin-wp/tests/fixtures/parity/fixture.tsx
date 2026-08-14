import {
  __experimentalBlocked,
  __unstableAllowed,
} from '@wordpress/components';
import { Link, Text, VisuallyHidden } from '@wordpress/ui';
import { Link as LocalLink, Text as LocalText } from './local-ui.js';

const __ = (text = '', domain = '') => `${text}${domain}`;
const _n = (single = '', plural = '', count = 0, domain = '') =>
  `${single}${plural}${count}${domain}`;
const _x = (text = '', context = '', domain = '') =>
  `${text}${context}${domain}`;
const _nx = (
  single = '',
  plural = '',
  count = 0,
  context = '',
  domain = '',
) => `${single}${plural}${count}${context}${domain}`;
const _n_noop = (single = '', plural = '', domain = '') =>
  `${single}${plural}${domain}`;
const _nx_noop = (single = '', plural = '', context = '', domain = '') =>
  `${single}${plural}${context}${domain}`;
const sprintf = (format = '', first = '', second = '') =>
  `${format}${first}${second}`;
const domain = 'dynamic';
const message = 'Dynamic message';
const suffix = 'now';
const value = 'value';

__('Wrong domain', 'wrong');
__('Missing domain');
__('Dynamic domain', domain);
_x('Wrong contextual domain', 'context', 'wrong');
_nx('One item', 'Many items', 2, 'context', 'wrong');
// Direct template literals remain TemplateLiteral nodes in the upstream rule.
__('Template domain', `my-plugin`);
sprintf();
sprintf('No value argument');
sprintf('No placeholder', value);
sprintf('%s and %2$s', value, value);
// These edge cases intentionally follow the upstream rule's placeholder regex.
sprintf('%b', value);
sprintf('%%%s', value);
sprintf(`%s`, value);
sprintf(_n('%s item', 'items', 2, 'my-plugin'), value);
// WordPress 25.8.0 does not classify the noop helpers as translation functions.
_n_noop('One', 'Many', 'wrong');
_nx_noop('One', 'Many', 'context', 'wrong');
sprintf(_n_noop('%s item', 'items', 'wrong'), value);
__('Allowed domain', 'my-plugin');
__(('Grouped literal'), 'my-plugin');
_x('Allowed contextual domain', 'context', 'my-plugin');
_nx('One item', 'Many items', 2, 'context', 'my-plugin');
sprintf('%s', value);
sprintf('%1$s and %2$s', value, value);
sprintf(__(`\u0025s`, 'my-plugin'), value);
__('Escaped percentage: %%%s', 'my-plugin');
__('Please wait...', 'my-plugin');
__('Binary ' + 'wait...', 'my-plugin');
__('Please wait...' + suffix, 'my-plugin');
__('Wait\u002e\u002e\u002e', 'my-plugin');
__('Choose 1-3 items', 'my-plugin');
__('Choose 1 - 3 items', 'my-plugin');
__('Choose 1\u002d3 items', 'my-plugin');
__('Do not  collapse this', 'my-plugin');
__(`Line one
line two`, 'my-plugin');
__(' Trim this', 'my-plugin');
__((' Grouped whitespace '), 'my-plugin');
__('' + ' Empty left edge', 'my-plugin');
__('Empty right edge ' + '', 'my-plugin');
__(' Escaped\u2028line separator ', 'my-plugin');
__(` Template whitespace `, 'my-plugin');
__('%s', 'my-plugin');
__(message, 'my-plugin');
__(`Dynamic ${value}`, 'my-plugin');
_x('Literal text', 'Context...', 'my-plugin');
// translators: %d: Count
__('Count: %s', 'my-plugin');
// translators: %s: Label, %d: Count
__('Label: %s', 'my-plugin');
__('Address: %s', 'my-plugin');
// translators: %s: City
__('City: %s', 'my-plugin');
// translators: %s: Preference
sprintf(__('Preference: %s', 'my-plugin'), value);
// translators: %s: Wrapped label
sprintf(
  __('Wrapped label: %s', 'my-plugin'),
  value,
);
// translators: %s: Non-breaking space label
__('Non-breaking space label: %s', 'my-plugin');
/* translators: %s: Line separator label %d: Ignored second line */
__('Line separator label: %s', 'my-plugin');
// translators: city: City
__('City: %(city)s', 'my-plugin');
// translators: 1: Address, 2: City
__('Address: %1$s, City: %2$s', 'my-plugin');
// translators: %.2f: Percentage
__('Percentage: %.2f', 'my-plugin');
// translators: %(named).2s: Truncated name
__('Truncated name: %(named).2s', 'my-plugin');
/*
 * translators: %s is the city name.
 * Keep the locale's preferred spelling.
 */
__('Unknown city: %s', 'my-plugin');
// translators: %s: Point count, 1: First, 2: Second
__('%s point', 'my-plugin');
// translators: %s: Surname
const unrelated = true;
__('Surname: %s', 'my-plugin');
void unrelated;
void __experimentalBlocked;
void __unstableAllowed;

const defaultView = {
  getSelection() {
    return {
      getRangeAt(index) {
        return index;
      },
    };
  },
};
const process = {
  env: {
    GUTENBERG_PHASE: '1',
    IS_GUTENBERG_PLUGIN: '1',
    IS_WORDPRESS_CORE: '1',
    SCRIPT_DEBUG: '1',
  },
};
const BaseControl = (_properties) => null;
class Component {}

<BaseControl label="Missing id" />;
<BaseControl id="allowed" label="Allowed" />;
document.activeElement;
window.getSelection();
defaultView.getSelection().getRangeAt(0);
process.env.IS_GUTENBERG_PLUGIN;
process.env['SCRIPT_DEBUG'];
process['env'][`IS_WORDPRESS_CORE`];
process.env.GUTENBERG_PHASE;

const tokenSuffix = 'md';
const knownTokenDeclaration =
  '--wpds-color-foreground-content-neutral: red;';
const differentlyCasedToken = 'var(--WPDS-color-foreground-content-neutral)';
const unknownToken = 'var(--wpds-nonexistent-token)';
const bareToken = '--wpds-color-foreground-content-neutral';
const dynamicToken = `var(--wpds-dimension-gap-${tokenSuffix})`;
const dynamicDeclaration = `--wpds-color-${tokenSuffix}: red;`;
const tokenStyles = {
  '--wpds-color-foreground-content-neutral': 'red',
};
const computedTokenStyles = {
  ['--wpds-color-foreground-content-neutral']: 'red',
};
const tokenMethods = {
  '--wpds-color-foreground-content-neutral'() {
    return 'red';
  },
};
void knownTokenDeclaration;
void differentlyCasedToken;
void unknownToken;
void bareToken;
void dynamicToken;
void dynamicDeclaration;
void tokenStyles;
void computedTokenStyles;
void tokenMethods;

const CustomThing = (_properties) => null;
<CustomThing render={<VisuallyHidden />}>Hidden content</CustomThing>;
<Link render={<Text />}>Read more</Link>;
<LocalLink render={<LocalText />}>Local read more</LocalLink>;

const doSomeCostlyOperation = () => 1;
const ignoreCostlyOperation = () => 1;
function earlyReturn(number) {
  const deferred = doSomeCostlyOperation();
  if (number > 10) {
    return number + 1;
  }
  return number + deferred;
}
function excludedEarlyReturn(number) {
  const deferred = ignoreCostlyOperation();
  if (number > 10) {
    return number + 1;
  }
  return number + deferred;
}
function nestedBlockDeclarationIsNotFunctionScoped(number) {
  if (number > 0) {
    const nestedValue = doSomeCostlyOperation();
    if (number > 10) return number;
    return nestedValue;
  }
  return number;
}
function nestedVarDeclarationIsFunctionScoped(number) {
  if (number > 0) {
    var nestedValue = doSomeCostlyOperation();
    if (number > 10) return number;
    return nestedValue;
  }
  return number;
}
function closureReferenceCountsAsUsage(number) {
  const deferred = doSomeCostlyOperation();
  const readDeferred = () => deferred;
  if (number > 10) return readDeferred();
  return deferred;
}
function shorthandReferenceCountsAsUsage(number) {
  const deferred = doSomeCostlyOperation();
  const result = { deferred };
  if (number > 10) return result;
  return deferred;
}
function propertyReferenceCountsAsUsage(number) {
  const deferred = createMutableResult();
  deferred.value = number;
  if (number > 10) return number;
  return deferred.value;
}
function arrayBindingsReportPerVariable(number) {
  const [first, second] = getCostlyPair();
  if (number > 10) return number;
  return first + second;
}
const createMutableResult = () => ({ value: 0 });
const getCostlyPair = () => [1, 2];
void earlyReturn;
void excludedEarlyReturn;
void nestedBlockDeclarationIsNotFunctionScoped;
void nestedVarDeclarationIsFunctionScoped;
void closureReferenceCountsAsUsage;
void shorthandReferenceCountsAsUsage;
void propertyReferenceCountsAsUsage;
void arrayBindingsReportPerVariable;

// wordpress/no-dom-globals-* coverage. Bare blocks, catch clauses, and class
// scopes terminate the upstream scope walk, so those references stay
// unreported even though a matching scope exists further out.
document;
window.location;
location.reload?.();
const domGlobalShorthand = { screen };
const [destructuredDomGlobal = history] = [];
if (true) {
  document;
}
{
  screen;
}
try {
  document;
} catch (error) {
  document;
}
for (const domKey in window) {
  break;
}
labeledDomUsage: location;
const domTypeofGuard = typeof window !== 'undefined';
const domGlobalsTemplate = `${screen}`;
const shadowedDomReference = () => {
  const window = { location: null };
  return window.location;
};
const readDomOutsideRender = () => document.body;
class DomGlobalsClass {
  field = document;
  constructor() {
    screen;
  }
  notConstructorMethod() {
    {
      location;
    }
  }
  render() {
    return <div>{history.length}</div>;
  }
  helperReturningJsx() {
    return <span>{location.href}</span>;
  }
  plainMethod() {
    return window;
  }
}
const DomFunctionComponent = () => {
  document;
  return <div />;
};
const NotJsxReturnComponent = () => {
  location;
  return null;
};
const ConciseJsxComponent = () => <div>{history.length}</div>;
function DeclaredFunctionComponent() {
  document;
  return <div />;
}
const domCallbackOutsideRender = () => {
  [].forEach(() => {
    document;
  });
  return <div />;
};
const domBlockInsideRenderCycle = () => {
  {
    screen;
  }
  return <div />;
};

// Codex review follow-ups: each case mirrors oracle-verified scope semantics.
const parenthesizedTypeofGuard = typeof (window);
const objectRenderMethod = {
  render() {
    return <>{window}</>;
  },
};
const namedWindowExpression = function window() {
  return <>{window}</>;
};
function switchScopedDomGlobal(value) {
  switch (value) {
    case 1:
      // biome-ignore lint/correctness/noSwitchDeclarations: Verifies switch-scoped shadowing without a block.
      const window = 1;
    case 2:
      return () => <>{window}</>;
  }
  return null;
}
class StaticBlockVarClass {
  static {
    var document;
  }
}
document;
const parameterDefaultDomGlobal = (value = window) => {
  var window = { length: 1 };
  return <div />;
};
// Class heritage clauses resolve inside the class scope upstream, so neither
// the bare nor the member extends expression is reported.
class HeritageBare extends window {}
class HeritageMember extends window.HTMLElement {}

// wordpress/no-ds-tokens reports every literal or template element that
// mentions the --wpds- namespace, including known tokens.
const disallowedTokenUsage = 'var(--wpds-color-foreground-content-neutral)';
const disallowedTemplateToken = `padding: var(--wpds-dimension-gap-md)`;
const disallowedMultiPartTemplate = `color: var(--wpds-color-foreground-content-neutral)`;

// wordpress/wp-global-usage.
if (globalThis.IS_GUTENBERG_PLUGIN) {
  void 0;
}
const capturedConditional = globalThis.IS_WORDPRESS_CORE ? 'core' : 'plugin';
if (!globalThis.SCRIPT_DEBUG) {
  void 0;
}
window.IS_GUTENBERG_PLUGIN;
window['SCRIPT_DEBUG'];
process.env.IS_GUTENBERG_PLUGIN;
IS_WORDPRESS_CORE;
const ternaryFromBare = !IS_WORDPRESS_CORE ? 'yes' : 'no';
const shorthandGlobalUsage = { SCRIPT_DEBUG };
const destructuredGlobalUsage = { IS_GUTENBERG_PLUGIN };

// wordpress/no-i18n-in-save.
const save = () => {
  return <div>{__('Saved label', 'my-plugin')}</div>;
};
function saveAsDeclaration() {
  return __('Declared save', 'my-plugin');
}
const notSave = () => {
  return __('Regular render', 'my-plugin');
};

// wordpress/react-no-unsafe-timeout.
function ScheduledComponent() {
  setTimeout(() => void 0, 100);
  return <div />;
}
const handledTimeoutComponent = () => {
  const timer = setTimeout(() => void 0, 100);
  clearTimeout(timer);
  return <div />;
};
const outsideComponent = () => {
  setTimeout(() => void 0, 100);
  return null;
};
function lowercasedHelper() {
  setTimeout(() => void 0, 100);
}
const blockSettingsWithSaveProperty = {
  save: () => __('Saved from property', 'my-plugin'),
};
const blockSettingsWithSaveMethod = {
  save() {
    return __('Saved from method', 'my-plugin');
  },
};
class TimeoutClassComponent extends Component {
  render() {
    setTimeout(() => void 0, 100);
    return <div />;
  }
}
const localSetTimeoutBinding = () => {
  const setTimeout = () => 1;
  setTimeout(() => void 0, 100);
  return null;
};
if ((globalThis.IS_GUTENBERG_PLUGIN)) {
  void 0;
}
if (!(globalThis.SCRIPT_DEBUG)) {
  void 0;
}
const parenSaveWrapper = () => {
  const save = () => __('Paren save', 'my-plugin');
  return save;
};
const ParenCaptureComponent = () => {
  const timer = (setTimeout(() => void 0, 100));
  clearTimeout(timer);
  return <div />;
};
const React = { Component };
class MemberSuperComponent extends React.Component {
  render() {
    setTimeout(() => void 0, 100);
    return <div />;
  }
}
