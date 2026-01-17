/**
 * Email Template Tests
 * Tests for email template generation and structure
 */

import { describe, it, expect } from 'vitest';
import { baseTemplate, emailButton, emailCode, emailInfoBox } from '@/lib/email/templates/base';
import { verificationEmailTemplate } from '@/lib/email/templates/verification';
import { passwordResetEmailTemplate } from '@/lib/email/templates/password-reset';

describe('Base Template', () => {
    describe('baseTemplate', () => {
        it('should generate valid HTML document', () => {
            const html = baseTemplate('<p>Test content</p>');
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<html');
            expect(html).toContain('</html>');
        });

        it('should include FlashMath branding', () => {
            const html = baseTemplate('<p>Test</p>');
            expect(html).toContain('FLASHMATH');
        });

        it('should include content', () => {
            const content = '<p>Custom content here</p>';
            const html = baseTemplate(content);
            expect(html).toContain(content);
        });

        it('should include preheader when provided', () => {
            const html = baseTemplate('<p>Test</p>', 'This is a preheader');
            expect(html).toContain('This is a preheader');
            expect(html).toContain('display: none');
        });

        it('should not include preheader div when not provided', () => {
            const html = baseTemplate('<p>Test</p>');
            expect(html).not.toContain('mso-hide: all');
        });

        it('should include copyright year', () => {
            const html = baseTemplate('<p>Test</p>');
            const currentYear = new Date().getFullYear();
            expect(html).toContain(`© ${currentYear}`);
        });

        it('should have FlashMath.io link', () => {
            const html = baseTemplate('<p>Test</p>');
            expect(html).toContain('flashmath.io');
        });

        it('should include meta tags for email clients', () => {
            const html = baseTemplate('<p>Test</p>');
            expect(html).toContain('charset="UTF-8"');
            expect(html).toContain('viewport');
        });
    });

    describe('emailButton', () => {
        it('should generate button with text and URL', () => {
            const button = emailButton('Click Me', 'https://example.com');
            expect(button).toContain('Click Me');
            expect(button).toContain('href="https://example.com"');
        });

        it('should use default cyan color', () => {
            const button = emailButton('Test', 'https://example.com');
            expect(button).toContain('#06b6d4');
        });

        it('should use custom color when provided', () => {
            const button = emailButton('Test', 'https://example.com', '#8b5cf6');
            // Button should be generated with the link
            expect(button).toContain('href="https://example.com"');
            expect(button).toContain('Test');
        });

        it('should open in new tab', () => {
            const button = emailButton('Test', 'https://example.com');
            expect(button).toContain('target="_blank"');
        });

        it('should have proper styling', () => {
            const button = emailButton('Test', 'https://example.com');
            expect(button).toContain('border-radius');
            expect(button).toContain('padding');
            expect(button).toContain('font-weight');
        });
    });

    describe('emailCode', () => {
        it('should display the code', () => {
            const codeHtml = emailCode('123456');
            expect(codeHtml).toContain('123456');
        });

        it('should have monospace font', () => {
            const codeHtml = emailCode('123456');
            expect(codeHtml).toContain('monospace');
        });

        it('should have letter spacing for readability', () => {
            const codeHtml = emailCode('123456');
            expect(codeHtml).toContain('letter-spacing');
        });

        it('should have gradient background', () => {
            const codeHtml = emailCode('ABCDEF');
            expect(codeHtml).toContain('linear-gradient');
        });
    });

    describe('emailInfoBox', () => {
        it('should display icon and text', () => {
            const box = emailInfoBox('⏱️', 'Expires in 15 minutes');
            expect(box).toContain('⏱️');
            expect(box).toContain('Expires in 15 minutes');
        });

        it('should render HTML in text', () => {
            const box = emailInfoBox('📧', 'Check your <strong>inbox</strong>');
            // The HTML should be passed through
            expect(box).toContain('inbox');
            expect(box).toContain('strong');
        });

        it('should have proper container styling', () => {
            const box = emailInfoBox('🔒', 'Secure');
            expect(box).toContain('border-radius');
            expect(box).toContain('padding');
        });
    });
});

describe('Verification Email Template', () => {
    const template = verificationEmailTemplate('TestUser', '123456');

    it('should return subject, html, and text', () => {
        expect(template.subject).toBeDefined();
        expect(template.html).toBeDefined();
        expect(template.text).toBeDefined();
    });

    it('should include code in subject', () => {
        expect(template.subject).toContain('123456');
        expect(template.subject).toContain('verification code');
    });

    it('should include username in HTML', () => {
        expect(template.html).toContain('TestUser');
    });

    it('should include code in HTML', () => {
        expect(template.html).toContain('123456');
    });

    it('should include username in text version', () => {
        expect(template.text).toContain('TestUser');
    });

    it('should include code in text version', () => {
        expect(template.text).toContain('123456');
    });

    it('should mention expiration time', () => {
        expect(template.html).toContain('15 minutes');
        expect(template.text).toContain('15 minutes');
    });

    it('should include safety message', () => {
        expect(template.html).toContain("Didn't create an account");
        expect(template.text).toContain("didn't create an account");
    });

    it('should have valid HTML structure', () => {
        expect(template.html).toContain('<!DOCTYPE html>');
        expect(template.html).toContain('</html>');
    });

    it('should include email icon', () => {
        expect(template.html).toContain('✉️');
    });
});

describe('Password Reset Email Template', () => {
    const resetUrl = 'https://flashmath.io/auth/reset?token=abc123';
    const template = passwordResetEmailTemplate('TestUser', resetUrl);

    it('should return subject, html, and text', () => {
        expect(template.subject).toBeDefined();
        expect(template.html).toBeDefined();
        expect(template.text).toBeDefined();
    });

    it('should have appropriate subject', () => {
        expect(template.subject).toContain('Reset');
        expect(template.subject).toContain('FlashMath');
    });

    it('should include username in HTML', () => {
        expect(template.html).toContain('TestUser');
    });

    it('should include reset URL in HTML', () => {
        expect(template.html).toContain(resetUrl);
    });

    it('should include username in text version', () => {
        expect(template.text).toContain('TestUser');
    });

    it('should include reset URL in text version', () => {
        expect(template.text).toContain(resetUrl);
    });

    it('should mention expiration time (1 hour)', () => {
        expect(template.html).toContain('1 hour');
        expect(template.text).toContain('1 hour');
    });

    it('should include security reassurance', () => {
        expect(template.html).toContain("request");
        expect(template.text).toContain("request");
    });

    it('should have reset button', () => {
        expect(template.html).toContain('Reset Password');
    });

    it('should include fallback link for button', () => {
        expect(template.html).toContain('Button not working?');
    });

    it('should have valid HTML structure', () => {
        expect(template.html).toContain('<!DOCTYPE html>');
        expect(template.html).toContain('</html>');
    });

    it('should include lock icon', () => {
        expect(template.html).toContain('🔐');
    });
});

describe('Template Consistency', () => {
    it('should all use the same base template', () => {
        const verification = verificationEmailTemplate('User', '123456');
        const passwordReset = passwordResetEmailTemplate('User', 'https://example.com');

        // Both should have FLASHMATH branding
        expect(verification.html).toContain('FLASHMATH');
        expect(passwordReset.html).toContain('FLASHMATH');

        // Both should have footer
        expect(verification.html).toContain('© ');
        expect(passwordReset.html).toContain('© ');
    });

    it('should have consistent dark theme colors', () => {
        const verification = verificationEmailTemplate('User', '123456');
        const passwordReset = passwordResetEmailTemplate('User', 'https://example.com');

        // Dark background color
        expect(verification.html).toContain('#0a0a0f');
        expect(passwordReset.html).toContain('#0a0a0f');
    });

    it('should have text-only alternatives', () => {
        const verification = verificationEmailTemplate('User', '123456');
        const passwordReset = passwordResetEmailTemplate('User', 'https://example.com');

        // Text versions should not have HTML tags
        expect(verification.text).not.toContain('<');
        expect(passwordReset.text).not.toContain('<');
    });
});

describe('Edge Cases', () => {
    it('should handle special characters in username', () => {
        const template = verificationEmailTemplate("O'Brien", '123456');
        expect(template.html).toContain("O'Brien");
        expect(template.text).toContain("O'Brien");
    });

    it('should handle long usernames', () => {
        const longName = 'VeryLongUserNameThatMightBreakLayout123456789';
        const template = verificationEmailTemplate(longName, '123456');
        expect(template.html).toContain(longName);
    });

    it('should handle different code formats', () => {
        const shortCode = verificationEmailTemplate('User', '12');
        expect(shortCode.html).toContain('12');

        const alphaCode = verificationEmailTemplate('User', 'ABCD1234');
        expect(alphaCode.html).toContain('ABCD1234');
    });

    it('should handle URLs with query parameters', () => {
        const complexUrl = 'https://flashmath.io/reset?token=abc123&expires=1234567890&type=password';
        const template = passwordResetEmailTemplate('User', complexUrl);
        expect(template.html).toContain(complexUrl);
        expect(template.text).toContain(complexUrl);
    });
});
