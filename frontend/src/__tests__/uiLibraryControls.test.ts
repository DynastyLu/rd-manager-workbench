import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = join(process.cwd(), 'src')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(path)
    }
    return ['.tsx', '.ts'].includes(extname(entry.name)) ? [path] : []
  })
}

describe('UI library control consistency', () => {
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
