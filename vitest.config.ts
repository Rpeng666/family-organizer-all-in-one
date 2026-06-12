import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./test/setup/vitest.setup.ts'],
        include: ['test/**/*.test.{ts,tsx}'],
        exclude: ['node_modules/**', '.next/**', 'e2e/**'],
        restoreMocks: true,
        clearMocks: true,
        mockReset: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: './coverage',
            include: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'middleware.ts', 'instant.perms.ts'],
            exclude: ['**/*.d.ts', '**/*.test.*', 'components/ui/**'],
        },
    },
});
