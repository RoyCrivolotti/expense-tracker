/**
 * Prettier add-on: a function with two or more parameters prints one parameter per line, whatever its length.
 *
 * Prettier has no option for this (it rejoins any parameter list that fits, and has frozen its options), so this
 * wraps the built-in printer and forces the parameter list of each function to break. It covers declarations,
 * overloads, arrows and function expressions, methods, constructors, and type signatures (method, call, construct
 * and function types). A function passed directly as an argument, or as a JSX prop, is a callback and keeps
 * Prettier's own layout: `rows.reduce((sum, row) => sum + row.amount, 0)` stays on one line, and so does one behind
 * `??`, `||` or `?:` (`foo(opt ?? ((a, b) => 1))`). A function in an array, or called at once, is not a callback and
 * wraps.
 *
 * It touches only printing, never the syntax tree, so formatting is safe to run on any code. After a Prettier
 * upgrade, scripts/prettierWrapParams.test.ts is what tells you whether this still works: if the printer API moves,
 * the add-on turns into a silent no-op and `format:check` would not notice.
 */
import { doc } from 'prettier'
import { printers as estreePrinters } from 'prettier/plugins/estree'

const { breakParent } = doc.builders

/** The least number of parameters that makes a list wrap. */
const MIN_PARAMETERS = 2

/** Nodes whose parameters are always the function's own (declarations, methods and type signatures). */
const ALWAYS_WRAPPED = new Set([
  'FunctionDeclaration',
  'TSDeclareFunction',
  'TSEmptyBodyFunctionExpression',
  'ClassMethod',
  'ClassPrivateMethod',
  'ObjectMethod',
  'TSDeclareMethod',
  'TSMethodSignature',
  'TSCallSignatureDeclaration',
  'TSConstructSignatureDeclaration',
  'TSFunctionType',
  'TSConstructorType',
])

/** Function values, which are wrapped unless they are a callback. */
const FUNCTION_VALUES = new Set(['ArrowFunctionExpression', 'FunctionExpression'])

/** Syntax that wraps an expression without changing which expression it is. */
const TRANSPARENT = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
])

const CALLS = new Set(['CallExpression', 'OptionalCallExpression', 'NewExpression'])

/** Whether the node being printed is a parameter of a function that should wrap. */
function isWrappedParameter(path) {
  if (path.key !== 'params' && path.key !== 'parameters') return false
  const fn = path.parent
  if (!fn) return false
  const parameters = fn.params ?? fn.parameters
  if (!Array.isArray(parameters) || parameters.length < MIN_PARAMETERS) return false
  if (ALWAYS_WRAPPED.has(fn.type)) return true
  if (!FUNCTION_VALUES.has(fn.type)) return false
  return !isCallback(path)
}

/** Whether `parent` hands `child` on as its own value: `a ?? child`, `test ? child : other`, `child as T`. */
function passesThrough(
  parent,
  child,
) {
  if (TRANSPARENT.has(parent.type) || parent.type === 'LogicalExpression') return true
  return parent.type === 'ConditionalExpression' && parent.test !== child
}

/**
 * Whether the function that owns the parameter `path` is a callback: it ends up as an argument of a call or the value
 * of a JSX prop, possibly behind `??`, `||`, `?:` or a type assertion.
 */
function isCallback(path) {
  let child = path.parent
  for (let level = 1; ; level++) {
    const parent = path.getParentNode(level)
    if (!parent) return false
    if (passesThrough(parent, child)) {
      // `child` moves up only through these, so that when the walk stops it is the exact node a call takes as its
      // argument (checked by identity below). A function in an array or called at once is not a callback and wraps.
      child = parent
      continue
    }
    if (CALLS.has(parent.type)) return parent.arguments?.includes(child) ?? false
    return parent.type === 'JSXExpressionContainer'
  }
}

const base = estreePrinters.estree

export const printers = {
  estree: {
    ...base,
    print(
      path,
      options,
      print,
      args,
    ) {
      const printed = base.print(path, options, print, args)
      return isWrappedParameter(path) ? [printed, breakParent] : printed
    },
  },
}
