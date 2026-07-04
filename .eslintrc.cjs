module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    'react-hooks/rules-of-hooks': 'error',
    // Existing effects intentionally manage several mutable refs and one-shot lifecycles.
    // Enable this rule per file while refactoring those effects; rules-of-hooks stays strict.
    'react-hooks/exhaustive-deps': 'off',
  },
};
