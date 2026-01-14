#!/bin/bash
# Generate self-signed SSL certificates for FlashMath
# 
# Usage: ./generate-ssl.sh [domain]
# Default domain: dev.flashmath.io

DOMAIN="${1:-dev.flashmath.io}"
SSL_DIR="$(dirname "$0")/ssl"
DAYS_VALID=365

echo "🔐 Generating self-signed SSL certificate for: $DOMAIN"
echo "   Valid for: $DAYS_VALID days"
echo ""

# Create SSL directory if it doesn't exist
mkdir -p "$SSL_DIR"

# Generate private key and certificate
openssl req -x509 -nodes -days $DAYS_VALID -newkey rsa:2048 \
    -keyout "$SSL_DIR/flashmath.key" \
    -out "$SSL_DIR/flashmath.crt" \
    -subj "/C=US/ST=State/L=City/O=FlashMath/OU=Development/CN=$DOMAIN" \
    -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,DNS:*.flashmath.io,IP:127.0.0.1"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SSL certificate generated successfully!"
    echo ""
    echo "📁 Files created:"
    echo "   - $SSL_DIR/flashmath.crt (Certificate)"
    echo "   - $SSL_DIR/flashmath.key (Private Key)"
    echo ""
    echo "📋 Certificate details:"
    openssl x509 -in "$SSL_DIR/flashmath.crt" -noout -subject -dates
    echo ""
    echo "⚠️  Note: This is a self-signed certificate."
    echo "   Browsers will show a security warning."
    echo "   For production, use Let's Encrypt or a trusted CA."
else
    echo "❌ Failed to generate SSL certificate"
    exit 1
fi

