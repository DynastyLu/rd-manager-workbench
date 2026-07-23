import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = join(process.cwd(), 'src')
const PAGES_ROOT = join(SOURCE_ROOT, 'pages')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || path === join(SOURCE_ROOT, 'components', 'ui')
        ? []
        : sourceFiles(path)
    }
    return ['.tsx', '.ts'].includes(extname(entry.name)) ? [path] : []
  })
}

function styleFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return styleFiles(path)
    return ['.css', '.less'].includes(extname(entry.name)) ? [path] : []
  })
}

describe('UI library control consistency', () => {
  it('keeps the single main landmark owned by AppShell', () => {
    const nestedMainLandmarks = sourceFiles(PAGES_ROOT).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      const sourceFile = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      const matches: string[] = []

      function inspect(node: ts.Node) {
        if (
          (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          node.tagName.getText(sourceFile) === 'main'
        ) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          matches.push(`${relative(SOURCE_ROOT, path)}:${line}: nested main landmark`)
        }
        ts.forEachChild(node, inspect)
      }

      inspect(sourceFile)
      return matches
    })

    expect(nestedMainLandmarks, nestedMainLandmarks.join('\n')).toEqual([])
  })

  it('does not remove keyboard focus or animate every property', () => {
    const unsafeStyles = styleFiles(SOURCE_ROOT).flatMap((path) => {
        const source = readFileSync(path, 'utf8')
        return source.split('\n').flatMap((line, index) => {
          if (/outline\s*:\s*(?:none|0(?:\s*!important)?)\b|transition\s*:\s*all\b/.test(line)) {
            return [`${relative(SOURCE_ROOT, path)}:${index + 1}: ${line.trim()}`]
          }
          return []
        })
      })

    expect(unsafeStyles, unsafeStyles.join('\n')).toEqual([])
  })

  it('does not use browser-native select controls in production screens', () => {
    const nativeSelects = sourceFiles(SOURCE_ROOT).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      const sourceFile = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      const matches: string[] = []

      function inspect(node: ts.Node) {
        if (
          (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          node.tagName.getText(sourceFile) === 'select'
        ) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          matches.push(`${relative(SOURCE_ROOT, path)}:${line}: browser-native select`)
        }
        ts.forEachChild(node, inspect)
      }

      inspect(sourceFile)
      return matches
    })

    expect(nativeSelects, nativeSelects.join('\n')).toEqual([])
  })

  it('does not import the retired shadcn business component layer', () => {
    const legacyImports = sourceFiles(SOURCE_ROOT).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      const sourceFile = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      return sourceFile.statements.flatMap((statement) => {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
          return []
        }
        if (!statement.moduleSpecifier.text.startsWith('@/components/ui/')) return []
        const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1
        return [`${relative(SOURCE_ROOT, path)}:${line}: ${statement.moduleSpecifier.text}`]
      })
    })

    expect(legacyImports, legacyImports.join('\n')).toEqual([])
  })

  it('does not use browser-native date and time inputs in production screens', () => {
    const nativeControls = sourceFiles(SOURCE_ROOT).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      const sourceFile = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      const matches: string[] = []

      function inspect(node: ts.Node) {
        if (ts.isStringLiteral(node) && node.text === 'datetime-local') {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          matches.push(
            `${relative(SOURCE_ROOT, path)}:${line}: browser-native datetime-local token`,
          )
        }
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagName = node.tagName.getText(sourceFile)
          if (tagName === 'input' || tagName === 'Input') {
            const typeAttribute = node.attributes.properties.find(
              (attribute): attribute is ts.JsxAttribute =>
                ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'type',
            )
            const typeExpression = typeAttribute?.initializer?.getText(sourceFile) ?? ''
            if (/['"](?:date|datetime-local|time|month|week)['"]/.test(typeExpression)) {
              const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
              matches.push(
                `${relative(SOURCE_ROOT, path)}:${line}: ${node.getText(sourceFile).replace(/\s+/g, ' ')}`,
              )
            }
          }
        }
        ts.forEachChild(node, inspect)
      }

      inspect(sourceFile)
      return matches
    })

    expect(nativeControls, nativeControls.join('\n')).toEqual([])
  })
})
