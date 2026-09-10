// Safe arithmetic for Formulate recipes.
// Expressions may only use numbers, + - * / ( ), and named variables
// (beam, dig, footing, …). No function calls, no property access.

function round3(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function parseVariablesJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function evaluateExpression(expression, variables) {
  const expr = String(expression || '').trim();
  if (!expr) return 0;

  const vars = {};
  for (const [k, v] of Object.entries(variables || {})) {
    vars[String(k).toLowerCase()] = Number(v) || 0;
  }

  // Tokenise so we can substitute only whole identifiers, never substrings.
  const tokenRe = /[A-Za-z_][A-Za-z0-9_]*|[0-9]*\.?[0-9]+|[+\-*/()]|\s+/g;
  const tokens = expr.match(tokenRe);
  if (!tokens || tokens.join('') !== expr) {
    throw new Error('Expression has characters that are not allowed.');
  }

  let rewritten = '';
  for (const tok of tokens) {
    if (/^\s+$/.test(tok) || /^[0-9]*\.?[0-9]+$/.test(tok) || /^[+\-*/()]$/.test(tok)) {
      rewritten += tok;
      continue;
    }
    if (!IDENT.test(tok)) throw new Error(`Invalid name "${tok}".`);
    const key = tok.toLowerCase();
    if (!(key in vars)) throw new Error(`Unknown variable "${tok}".`);
    rewritten += String(vars[key]);
  }

  // Final guard: only digits, operators, dots, parens, whitespace.
  if (!/^[0-9+\-*/().\s]+$/.test(rewritten)) {
    throw new Error('Expression could not be sanitised.');
  }

  let value;
  try {
    value = Function(`"use strict"; return (${rewritten});`)();
  } catch {
    throw new Error('Could not calculate that expression.');
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Expression did not produce a number.');
  }
  return value;
}

function expandRecipe(recipe, lines, variableValues) {
  const variables = parseVariablesJson(recipe.variables_json);
  const values = {};
  for (const v of variables) {
    const raw = variableValues[v.name];
    values[v.name] = raw === undefined || raw === '' ? Number(v.default) || 0 : Number(raw) || 0;
  }
  return lines.map((line) => {
    const raw = evaluateExpression(line.expression, values);
    const withWaste = raw * (1 + (Number(line.wastage_pct) || 0) / 100);
    return {
      ...line,
      quantity: round3(withWaste),
      raw_quantity: round3(raw),
    };
  });
}

module.exports = { evaluateExpression, expandRecipe, parseVariablesJson, round3 };
