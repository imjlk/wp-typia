import * as fs from 'node:fs';
import * as path from 'node:path';

import ts from '@typescript/typescript6';

import type { AnalysisContext } from './metadata-analysis.js';

export function resolveIndexedAccessPropertyDeclaration(
	objectTypeNode: ts.TypeNode,
	propertyKey: string,
	ctx: AnalysisContext,
	pathLabel: string,
): ts.PropertySignature | ts.PropertyDeclaration {
  const objectType = ctx.checker.getTypeFromTypeNode(objectTypeNode);
  const propertySymbol = ctx.checker
		.getPropertiesOfType(objectType)
		.find((candidate) => candidate.name === propertyKey);

  if (propertySymbol === undefined) {
    throw new Error(
      `Indexed access could not resolve property "${propertyKey}" at ${pathLabel}`,
    );
  }

  const valueDeclaration = propertySymbol.valueDeclaration;
  const declaration =
		valueDeclaration !== undefined &&
		(ts.isPropertySignature(valueDeclaration) ||
			ts.isPropertyDeclaration(valueDeclaration))
			? valueDeclaration
			: propertySymbol.declarations?.find(
					(
						candidate,
					): candidate is ts.PropertySignature | ts.PropertyDeclaration =>
						ts.isPropertySignature(candidate) ||
						ts.isPropertyDeclaration(candidate),
			  );
  if (declaration === undefined) {
    throw new Error(
      `Indexed access property "${propertyKey}" does not resolve to a typed property at ${pathLabel}`,
    );
  }
  if (!isSerializableExternalDeclaration(declaration, ctx)) {
    throw new Error(
      `External or non-serializable indexed access property "${propertyKey}" is not supported at ${pathLabel}`,
    );
  }

  return declaration;
}

export function resolveSymbol(
	node: ts.TypeReferenceNode | ts.ExpressionWithTypeArguments,
	checker: ts.TypeChecker,
): ts.Symbol | undefined {
  const symbol = checker.getSymbolAtLocation(
    ts.isTypeReferenceNode(node) ? node.typeName : node.expression,
  );
  if (symbol === undefined) {
    return undefined;
  }
  return symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

export function getReferenceName(
	node: ts.TypeReferenceNode | ts.ExpressionWithTypeArguments,
): string {
  if (ts.isTypeReferenceNode(node)) {
    return getEntityNameText(node.typeName);
  }
  return node.expression.getText();
}

function getEntityNameText(name: ts.EntityName): string {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  return `${getEntityNameText(name.left)}.${name.right.text}`;
}

function isProjectLocalDeclaration(
	declaration: ts.Declaration,
	projectRoot: string,
): boolean {
  const fileName = declaration.getSourceFile().fileName;
  return (
		!fileName.includes('node_modules') &&
		!path.relative(projectRoot, fileName).startsWith('..')
	);
}

export function isSerializableExternalDeclaration(
	declaration: ts.Declaration,
	ctx: AnalysisContext,
): boolean {
  if (isProjectLocalDeclaration(declaration, ctx.projectRoot)) {
    return true;
  }

  const packageName = getOwningPackageName(
    declaration.getSourceFile().fileName,
    ctx.packageNameCache,
  );
  return packageName !== null && ctx.allowedExternalPackages.has(packageName);
}

function getOwningPackageName(
	fileName: string,
	cache: Map<string, string | null>,
): string | null {
  let currentDir = path.dirname(fileName);

  while (true) {
    if (cache.has(currentDir)) {
      return cache.get(currentDir) ?? null;
    }

    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8'),
        ) as {
          name?: string;
        };
        const packageName =
					typeof packageJson.name === 'string' ? packageJson.name : null;
        cache.set(currentDir, packageName);
        return packageName;
      } catch {
        cache.set(currentDir, null);
        return null;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      cache.set(currentDir, null);
      return null;
    }

    currentDir = parentDir;
  }
}
