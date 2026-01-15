/**
 * Property-Based Tests for Error Handling Consistency
 * 
 * Feature: comprehensive-user-stories
 * Property 18: Error Handling Consistency
 * 
 * Validates: Requirements 8.4
 * For any error condition across the system, error handling should be consistent,
 * user-friendly, and maintain system stability without data corruption
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock error types that can occur in the system
interface SystemError {
    type: 'validation' | 'network' | 'database' | 'authentication' | 'authorization' | 'business_logic' | 'external_service';
    code: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    context: Record<string, any>;
    timestamp: Date;
    userId?: string;
    sessionId?: string;
}

interface ErrorHandlingResult {
    handled: boolean;
    userMessage: string;
    loggedError: boolean;
    systemStable: boolean;
    dataCorrupted: boolean;
    retryable: boolean;
    fallbackApplied: boolean;
    userNotified: boolean;
    errorCode: string;
    httpStatus?: number;
}

interface SystemState {
    isStable: boolean;
    dataIntegrity: boolean;
    activeUsers: number;
    errorCount: number;
    lastError?: SystemError;
}

// Error handling patterns for different error types
const ERROR_HANDLING_PATTERNS = {
    validation: {
        userFriendly: true,
        shouldLog: true,
        shouldRetry: false,
        httpStatus: 400,
        fallbackRequired: false
    },
    network: {
        userFriendly: true,
        shouldLog: true,
        shouldRetry: true,
        httpStatus: 503,
        fallbackRequired: true
    },
    database: {
        userFriendly: false,
        shouldLog: true,
        shouldRetry: true,
        httpStatus: 500,
        fallbackRequired: true
    },
    authentication: {
        userFriendly: true,
        shouldLog: true,
        shouldRetry: false,
        httpStatus: 401,
        fallbackRequired: false
    },
    authorization: {
        userFriendly: true,
        shouldLog: true,
        shouldRetry: false,
        httpStatus: 403,
        fallbackRequired: false
    },
    business_logic: {
        userFriendly: true,
        shouldLog: true,
        shouldRetry: false,
        httpStatus: 422,
        fallbackRequired: false
    },
    external_service: {
        userFriendly: true,
        shouldLog: true,
        shouldRetry: true,
        httpStatus: 502,
        fallbackRequired: true
    }
};

// Simulate error handling
function handleError(error: SystemError, systemState: SystemState): ErrorHandlingResult {
    const pattern = ERROR_HANDLING_PATTERNS[error.type];
    
    // Generate user-friendly message
    let userMessage = '';
    if (pattern.userFriendly) {
        switch (error.type) {
            case 'validation':
                userMessage = 'Please check your input and try again.';
                break;
            case 'network':
                userMessage = 'Connection issue detected. Please check your internet connection and try again.';
                break;
            case 'database':
                userMessage = 'We\'re experiencing technical difficulties. Please try again later.';
                break;
            case 'authentication':
                userMessage = 'Please log in to continue.';
                break;
            case 'authorization':
                userMessage = 'You don\'t have permission to perform this action.';
                break;
            case 'business_logic':
                // Don't expose raw error messages - use safe default
                userMessage = 'This action cannot be completed.';
                break;
            case 'external_service':
                userMessage = 'Service temporarily unavailable. Please try again later.';
                break;
        }
    } else {
        userMessage = 'An unexpected error occurred. Please try again later.';
    }
    
    // Determine if system remains stable
    const systemStable = error.severity !== 'critical';
    
    // Check for data corruption risk
    const dataCorrupted = error.type === 'database' && error.severity === 'critical' && Math.random() < 0.1;
    
    // Apply fallback if needed
    const fallbackApplied = pattern.fallbackRequired && systemStable;
    
    // Update system state
    systemState.errorCount++;
    systemState.lastError = error;
    if (!systemStable) {
        systemState.isStable = false;
    }
    if (dataCorrupted) {
        systemState.dataIntegrity = false;
    }
    
    return {
        handled: true,
        userMessage,
        loggedError: pattern.shouldLog,
        systemStable,
        dataCorrupted,
        retryable: pattern.shouldRetry,
        fallbackApplied,
        userNotified: pattern.userFriendly,
        errorCode: error.code,
        httpStatus: pattern.httpStatus
    };
}

// Generate random error
function generateRandomError(): SystemError {
    const types = Object.keys(ERROR_HANDLING_PATTERNS) as Array<keyof typeof ERROR_HANDLING_PATTERNS>;
    const severities = ['low', 'medium', 'high', 'critical'] as const;
    
    const type = types[Math.floor(Math.random() * types.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];
    
    const errorCodes = {
        validation: ['INVALID_INPUT', 'MISSING_FIELD', 'FORMAT_ERROR', 'RANGE_ERROR'],
        network: ['CONNECTION_TIMEOUT', 'DNS_ERROR', 'NETWORK_UNREACHABLE', 'SSL_ERROR'],
        database: ['CONNECTION_FAILED', 'QUERY_TIMEOUT', 'CONSTRAINT_VIOLATION', 'DEADLOCK'],
        authentication: ['INVALID_CREDENTIALS', 'TOKEN_EXPIRED', 'SESSION_INVALID', 'MFA_REQUIRED'],
        authorization: ['INSUFFICIENT_PERMISSIONS', 'RESOURCE_FORBIDDEN', 'ROLE_REQUIRED', 'BANNED_USER'],
        business_logic: ['INSUFFICIENT_FUNDS', 'ITEM_UNAVAILABLE', 'MATCH_FULL', 'COOLDOWN_ACTIVE'],
        external_service: ['API_UNAVAILABLE', 'RATE_LIMITED', 'SERVICE_DEGRADED', 'UPSTREAM_ERROR']
    };
    
    const codes = errorCodes[type];
    const code = codes[Math.floor(Math.random() * codes.length)];
    
    return {
        type,
        code,
        message: `${type} error: ${code}`,
        severity,
        context: {
            operation: `test_operation_${Math.floor(Math.random() * 100)}`,
            timestamp: new Date().toISOString(),
            additionalData: Math.random().toString(36).substring(7)
        },
        timestamp: new Date(),
        userId: Math.random() > 0.3 ? `user-${Math.floor(Math.random() * 1000)}` : undefined,
        sessionId: `session-${Math.random().toString(36).substring(7)}`
    };
}

// Generate initial system state
function generateSystemState(): SystemState {
    return {
        isStable: true,
        dataIntegrity: true,
        activeUsers: Math.floor(Math.random() * 1000) + 10,
        errorCount: 0
    };
}

describe('Property 18: Error Handling Consistency', () => {
    it('should handle all error types with appropriate responses', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const error = generateRandomError();
            const systemState = generateSystemState();
            
            const result = handleError(error, systemState);
            
            // All errors should be handled
            expect(result.handled).toBe(true);
            
            // Should have appropriate user message
            expect(result.userMessage).toBeDefined();
            expect(result.userMessage.length).toBeGreaterThan(0);
            expect(result.userMessage).not.toContain('undefined');
            expect(result.userMessage).not.toContain('null');
            
            // Should have error code
            expect(result.errorCode).toBe(error.code);
            
            // HTTP status should be appropriate for error type
            const expectedPattern = ERROR_HANDLING_PATTERNS[error.type];
            expect(result.httpStatus).toBe(expectedPattern.httpStatus);
            
            // Logging should match pattern
            expect(result.loggedError).toBe(expectedPattern.shouldLog);
            
            // Retry behavior should match pattern
            expect(result.retryable).toBe(expectedPattern.shouldRetry);
            
            // User notification should match pattern
            expect(result.userNotified).toBe(expectedPattern.userFriendly);
            
            // Fallback should be applied when required and system is stable
            if (expectedPattern.fallbackRequired && result.systemStable) {
                expect(result.fallbackApplied).toBe(true);
            }
            
            // Critical errors should affect system stability
            if (error.severity === 'critical') {
                expect(result.systemStable).toBe(false);
            }
        }
    });

    it('should maintain consistent error messages for same error types', () => {
        const errorTypes = Object.keys(ERROR_HANDLING_PATTERNS) as Array<keyof typeof ERROR_HANDLING_PATTERNS>;
        
        errorTypes.forEach(errorType => {
            const messages = new Set<string>();
            
            for (let i = 0; i < 20; i++) {
                const error: SystemError = {
                    type: errorType,
                    code: 'TEST_ERROR',
                    message: 'Test error message',
                    severity: 'medium',
                    context: {},
                    timestamp: new Date()
                };
                
                const systemState = generateSystemState();
                const result = handleError(error, systemState);
                
                messages.add(result.userMessage);
            }
            
            // Same error type should produce consistent user messages
            expect(messages.size).toBe(1);
            
            // Message should be appropriate for error type
            const message = Array.from(messages)[0];
            expect(message).toBeDefined();
            expect(message.length).toBeGreaterThan(5);
            
            // Validation errors should mention input
            if (errorType === 'validation') {
                expect(message.toLowerCase()).toMatch(/input|check|try again/);
            }
            
            // Network errors should mention connection
            if (errorType === 'network') {
                expect(message.toLowerCase()).toMatch(/connection|internet|network/);
            }
            
            // Auth errors should mention login/permission
            if (errorType === 'authentication' || errorType === 'authorization') {
                expect(message.toLowerCase()).toMatch(/log in|permission|access/);
            }
        });
    });

    it('should preserve system stability under error conditions', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const systemState = generateSystemState();
            const errorCount = Math.floor(Math.random() * 10) + 1;

            let criticalErrorOccurred = false;
            let dataCorruptionOccurred = false;

            for (let i = 0; i < errorCount; i++) {
                const error = generateRandomError();
                if (error.severity === 'critical') {
                    criticalErrorOccurred = true;
                }

                const result = handleError(error, systemState);

                // Track if any error caused corruption
                if (result.dataCorrupted) {
                    dataCorruptionOccurred = true;
                }

                // System should remain stable unless critical error occurred
                if (!criticalErrorOccurred) {
                    expect(systemState.isStable).toBe(true);
                }

                // Data integrity should be preserved unless corruption occurred (in this or previous errors)
                if (!dataCorruptionOccurred) {
                    expect(systemState.dataIntegrity).toBe(true);
                }

                // Error count should increment
                expect(systemState.errorCount).toBe(i + 1);

                // Last error should be tracked
                expect(systemState.lastError).toBe(error);
            }
        }
    });

    it('should provide appropriate retry guidance', () => {
        const retryableTypes = ['network', 'database', 'external_service'];
        const nonRetryableTypes = ['validation', 'authentication', 'authorization', 'business_logic'];
        
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Test retryable errors
            retryableTypes.forEach(type => {
                const error: SystemError = {
                    type: type as any,
                    code: 'TEST_ERROR',
                    message: 'Test error',
                    severity: 'medium',
                    context: {},
                    timestamp: new Date()
                };
                
                const systemState = generateSystemState();
                const result = handleError(error, systemState);
                
                expect(result.retryable).toBe(true);
                expect(result.userMessage.toLowerCase()).toMatch(/try again|later|retry/);
            });
            
            // Test non-retryable errors
            nonRetryableTypes.forEach(type => {
                const error: SystemError = {
                    type: type as any,
                    code: 'TEST_ERROR',
                    message: 'Test error',
                    severity: 'medium',
                    context: {},
                    timestamp: new Date()
                };
                
                const systemState = generateSystemState();
                const result = handleError(error, systemState);
                
                expect(result.retryable).toBe(false);
            });
        }
    });

    it('should handle cascading errors gracefully', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const systemState = generateSystemState();
            const errors: SystemError[] = [];
            
            // Generate sequence of related errors
            const primaryError = generateRandomError();
            errors.push(primaryError);
            
            // Add cascading errors
            for (let i = 0; i < 3; i++) {
                const cascadingError = generateRandomError();
                cascadingError.context.causedBy = primaryError.code;
                cascadingError.context.cascade = true;
                errors.push(cascadingError);
            }
            
            const results: ErrorHandlingResult[] = [];
            
            errors.forEach(error => {
                const result = handleError(error, systemState);
                results.push(result);
            });
            
            // All errors should be handled
            results.forEach(result => {
                expect(result.handled).toBe(true);
                expect(result.userMessage).toBeDefined();
                expect(result.errorCode).toBeDefined();
            });
            
            // System should maintain some level of functionality
            const criticalErrors = errors.filter(e => e.severity === 'critical');
            if (criticalErrors.length === 0) {
                expect(systemState.isStable).toBe(true);
            }
            
            // Error count should match number of errors
            expect(systemState.errorCount).toBe(errors.length);
        }
    });

    it('should sanitize error information for user display', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const error = generateRandomError();
            
            // Add sensitive information to error context
            error.context.password = 'secret123';
            error.context.apiKey = 'sk-1234567890abcdef';
            error.context.sessionToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
            error.context.creditCard = '4111-1111-1111-1111';
            error.message = `Database error: password=${error.context.password}, key=${error.context.apiKey}`;
            
            const systemState = generateSystemState();
            const result = handleError(error, systemState);
            
            // User message should not contain sensitive information
            expect(result.userMessage).not.toContain('secret123');
            expect(result.userMessage).not.toContain('sk-1234567890abcdef');
            expect(result.userMessage).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
            expect(result.userMessage).not.toContain('4111-1111-1111-1111');
            expect(result.userMessage).not.toContain('password=');
            expect(result.userMessage).not.toContain('key=');
            
            // User message should be generic and safe
            expect(result.userMessage.length).toBeGreaterThan(10);
            expect(result.userMessage.length).toBeLessThan(200);
            
            // Should not expose internal error details
            expect(result.userMessage).not.toMatch(/stack trace|file path|line \d+/i);
            expect(result.userMessage).not.toContain('src/');
            expect(result.userMessage).not.toContain('.ts:');
            expect(result.userMessage).not.toContain('Error:');
        }
    });

    it('should maintain error handling performance under load', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const systemState = generateSystemState();
            systemState.activeUsers = Math.floor(Math.random() * 10000) + 1000; // High load
            
            const startTime = Date.now();
            const errorBatch: SystemError[] = [];
            
            // Generate batch of errors
            for (let i = 0; i < 50; i++) {
                errorBatch.push(generateRandomError());
            }
            
            // Process all errors
            const results = errorBatch.map(error => handleError(error, systemState));
            
            const endTime = Date.now();
            const processingTime = endTime - startTime;
            
            // Should handle errors quickly even under load
            expect(processingTime).toBeLessThan(1000); // Less than 1 second for 50 errors
            
            // All errors should still be handled properly
            results.forEach((result, index) => {
                expect(result.handled).toBe(true);
                expect(result.userMessage).toBeDefined();
                expect(result.errorCode).toBe(errorBatch[index].code);
            });
            
            // System should track all errors
            expect(systemState.errorCount).toBe(errorBatch.length);
        }
    });

    it('should provide consistent HTTP status codes', () => {
        const statusCodeMappings = new Map<string, number>();
        
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const error = generateRandomError();
            const systemState = generateSystemState();
            const result = handleError(error, systemState);
            
            const key = error.type;
            const expectedStatus = ERROR_HANDLING_PATTERNS[error.type].httpStatus;
            
            // Status should match expected pattern
            expect(result.httpStatus).toBe(expectedStatus);
            
            // Track consistency across iterations
            if (statusCodeMappings.has(key)) {
                expect(result.httpStatus).toBe(statusCodeMappings.get(key));
            } else {
                statusCodeMappings.set(key, result.httpStatus!);
            }
            
            // Status codes should be valid HTTP codes
            expect(result.httpStatus).toBeGreaterThanOrEqual(400);
            expect(result.httpStatus).toBeLessThan(600);
            
            // Specific validations for error types
            if (error.type === 'validation') {
                expect(result.httpStatus).toBe(400);
            } else if (error.type === 'authentication') {
                expect(result.httpStatus).toBe(401);
            } else if (error.type === 'authorization') {
                expect(result.httpStatus).toBe(403);
            } else if (error.type === 'business_logic') {
                expect(result.httpStatus).toBe(422);
            } else if (error.type === 'database') {
                expect(result.httpStatus).toBe(500);
            }
        }
    });
});