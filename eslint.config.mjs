// ESLINT – dò lỗi code tự động cho cả 3 phần (client / server / shared). Chạy: npm run lint
// Quy tắc bảo mật của README (mục Bảo mật → Quy tắc khi thêm / sửa code) được kiểm tra tự động ở đây.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
    rules: {
      'no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-console': 'off', // máy chủ ghi log bằng console (in ra cửa sổ đang chạy máy chủ)
    },
  },
  // máy chủ, lệnh chạy trên máy chủ, kiểm thử: Node.js
  { files: ['server/**/*.{js,mjs}', 'scripts/**/*.mjs', 'eslint.config.mjs'], languageOptions: { globals: globals.node } },
  // lệnh tạo dữ liệu mẫu: một phần code chạy TRONG trình duyệt (page.evaluate của Playwright)
  { files: ['server/scripts/seed-demo.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // code dùng chung: chạy ở cả trình duyệt lẫn Node
  { files: ['shared/**/*.js'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  // trang web (React)
  {
    files: ['client/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Không dùng dangerouslySetInnerHTML (README → Bảo mật): để React tự escape chuỗi.',
        },
        {
          selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]",
          message: 'Không gán innerHTML / outerHTML (README → Bảo mật): dùng textContent hoặc JSX.',
        },
        {
          selector: "JSXAttribute[name.name='href'] > Literal[value=/^\\s*javascript:/i]",
          message: 'Không dùng liên kết javascript:.',
        },
      ],
    },
  },
  // cấu hình build của trang web (chạy bằng Node)
  { files: ['client/vite.config.js'], languageOptions: { globals: globals.node } },
  // Web Worker (dựng hình CSG)
  { files: ['client/**/*.worker.js'], languageOptions: { globals: globals.worker } },
];
