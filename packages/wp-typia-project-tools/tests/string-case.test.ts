import { expect, test } from 'bun:test';

import {
  toCamelCase,
  toKebabCase,
  toPascalCase,
  toSnakeCase,
  toTitleCase,
} from '../src/runtime/string-case.js';

const WORDPRESS_SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

test('toKebabCase keeps acronym runs together', () => {
  expect(toKebabCase('XMLParser')).toBe('xml-parser');
  expect(toKebabCase('getURL')).toBe('get-url');
  expect(toKebabCase('URLSlug')).toBe('url-slug');
  expect(toKebabCase('parseJSONValue')).toBe('parse-json-value');
  expect(toKebabCase('HeroCTABlock')).toBe('hero-cta-block');
  expect(toKebabCase('JSONAPIResponse')).toBe('json-api-response');
  expect(toKebabCase('XMLHTTPParser')).toBe('xml-http-parser');
  expect(toKebabCase('AJAXHandler')).toBe('ajax-handler');
  expect(toKebabCase('CPTArchive')).toBe('cpt-archive');

  const repeatedIds = `${'ID'.repeat(256)}Ab`;
  expect(toKebabCase(repeatedIds)).toBe(
    `${Array.from({ length: 256 }, () => 'id').join('-')}-ab`,
  );
});

test('toKebabCase splits selected acronym-lowercase slug terms', () => {
  expect(toKebabCase('URLslug')).toBe('url-slug');
  expect(toKebabCase('AJAXslug')).toBe('ajax-slug');
  expect(toKebabCase('CPTslug')).toBe('cpt-slug');
  expect(toKebabCase('AJAXURLslug')).toBe('ajax-url-slug');
});

test('toKebabCase keeps naturalized acronym-lowercase words stable', () => {
  expect(toKebabCase('RESTful')).toBe('restful');
  expect(toKebabCase('HTTPserver')).toBe('httpserver');
  expect(toKebabCase('XMLparser')).toBe('xmlparser');
  expect(toKebabCase('GUIDe')).toBe('guide');
  expect(toKebabCase('AABBcc')).toBe('aabbcc');
});

test('toKebabCase keeps project-specific acronyms deterministic unless separated', () => {
  expect(toKebabCase('CRMLeadForm')).toBe('crmlead-form');
  expect(toKebabCase('SEOSettingsPanel')).toBe('seosettings-panel');
  expect(toKebabCase('SSOLoginBlock')).toBe('ssologin-block');

  expect(toKebabCase('CRM Lead Form')).toBe('crm-lead-form');
  expect(toKebabCase('SEO Settings Panel')).toBe('seo-settings-panel');
  expect(toKebabCase('SSO Login Block')).toBe('sso-login-block');
});

test('toKebabCase preserves common slug normalization behavior', () => {
  expect(toKebabCase('Demo Card')).toBe('demo-card');
  expect(toKebabCase('demo_card')).toBe('demo-card');
  expect(toKebabCase('demo/card')).toBe('demo-card');
  expect(toKebabCase('demo--card')).toBe('demo-card');
  expect(toKebabCase('  my cool block!  ')).toBe('my-cool-block');
  expect(toKebabCase('Block Name 123')).toBe('block-name-123');
});

test('string case helpers continue to derive WordPress-safe identifiers', () => {
  const slug = toKebabCase('Hero CTA Block!');

  expect(slug).toBe('hero-cta-block');
  expect(slug).toMatch(WORDPRESS_SAFE_SLUG);
  expect(toSnakeCase('Hero CTA Block!')).toBe('hero_cta_block');
  expect(toPascalCase('hero-cta-block')).toBe('HeroCtaBlock');
  expect(toCamelCase('hero-cta-block')).toBe('heroCtaBlock');
  expect(toTitleCase('hero-cta-block')).toBe('Hero Cta Block');
});
