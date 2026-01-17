import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        // Test environment
        environment: 'node',
        
        // Include patterns
        include: ['tests/unit/**/*.test.ts'],
        
        // Exclude patterns
        exclude: [
            'node_modules',
            'tests/e2e/**',
            'tests/arena/**',
        ],
        
        // Setup files run before each test file
        setupFiles: ['tests/unit/setup.ts'],
        
        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            reportsDirectory: './coverage',
            include: [
                'src/lib/**/*.ts',
                'src/lib/**/*.tsx',
            ],
            exclude: [
                'src/lib/actions/**', // Server actions need integration tests
                'src/lib/socket/**',   // Socket code needs integration tests
                'src/lib/db/**',       // DB code needs integration tests
                '**/*.d.ts',
            ],
            // Coverage thresholds - fail if coverage drops below current levels
            thresholds: {
                statements: 5,
                branches: 4,
                functions: 4,
                lines: 5,
            },
        },
        
        // Global timeout
        testTimeout: 10000,
        
        // Watch mode settings (disabled in CI)
        watch: !process.env.CI,
        
        // Reporters
        reporters: ['verbose'],
        
        // Fail fast on first error in CI
        bail: process.env.CI ? 1 : 0,
        
        // Retry failed tests (useful for flaky tests)
        retry: process.env.CI ? 2 : 0,
        
        // Parallel execution (Vitest 4 style)
        minWorkers: 1,
        maxWorkers: 4,
    },
    
    // Path aliases (match tsconfig)
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
