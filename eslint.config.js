import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';
import fs from 'node:fs';

const autoImportGlobals = JSON.parse(fs.readFileSync('./.eslintrc-auto-import.json', 'utf-8')).globals;

export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.vscode/**',
      '**/.claude/**',
      '**/public/**',
      '**/backend/**',
      '**/test/resource/**',
      'package-lock.json',
      'pnpm-lock.yaml',
    ],
  },
  // 基础 JS 规则
  eslint.configs.recommended,
  // TS 规则
  ...tseslint.configs.recommended,
  // Vue 规则
  ...pluginVue.configs['flat/recommended'],
  // 综合配置
  {
    files: ['**/*.{ts,vue,js,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...autoImportGlobals,
        process: 'readonly',
      },
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      // 开启 Prettier 格式化检查
      'prettier/prettier': 'off',
      // Vue 相关规则定制
      'vue/multi-word-component-names': 'off',
      'vue/no-unused-vars': 'warn',
      'vue/no-mutating-props': 'warn', // 允许某些情况下的 prop 修改（虽然不推荐，但本项目目前存在）
      // TS 相关规则定制
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-case-declarations': 'off', // 允许在 case 中声明变量
      'no-undef': 'error',
    },
  },
  // 覆盖 Prettier 冲突规则
  prettierConfig
);
