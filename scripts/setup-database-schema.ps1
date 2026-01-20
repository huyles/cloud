# FlashDrop Database Schema Setup Script
# This script sets up PostgreSQL tables and initializes Redis keys
# Run from project root with: pwsh -File scripts/setup-database-schema.ps1

param(
    [string]$Region = "us-east-1",
    [string]$StackName = "flashdrop",
    # Allow direct endpoint specification if AWS access is unavailable
    [string]$RdsEndpoint = "",
    [string]$RdsPort = "5432",
    [string]$RedisEndpoint = ""
)

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "FlashDrop Database Schema Setup Script" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Try to get stack outputs, or use provided/default values
Write-Host "[1/5] Fetching CloudFormation stack outputs..." -ForegroundColor Yellow
$env:AWS_PAGER = ""

$rdsEndpointValue = $RdsEndpoint
$rdsPortValue = $RdsPort
$redisEndpointValue = $RedisEndpoint

if ([string]::IsNullOrEmpty($RdsEndpoint)) {
    try {
        $outputs = aws cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].Outputs" --region $Region 2>$null | ConvertFrom-Json
        
        if ($outputs) {
            $rdsEndpointValue = ($outputs | Where-Object { $_.OutputKey -eq "RDSEndpoint" }).OutputValue
            $rdsPortValue = ($outputs | Where-Object { $_.OutputKey -eq "RDSPort" }).OutputValue
            $redisEndpointValue = ($outputs | Where-Object { $_.OutputKey -eq "ElastiCacheEndpoint" }).OutputValue
        }
    } catch {
        Write-Host "  AWS access unavailable - using known values from previous deployment" -ForegroundColor Yellow
    }
}

# Fallback to known values from the cloudformation-stack-output.txt
if ([string]::IsNullOrEmpty($rdsEndpointValue)) {
    $rdsEndpointValue = "flashdrop-dev-postgres.cw9sqcgrwzrr.us-east-1.rds.amazonaws.com"
}
if ([string]::IsNullOrEmpty($redisEndpointValue)) {
    $redisEndpointValue = "flashdrop-dev-redis.yhhwe0.0001.use1.cache.amazonaws.com"
}

# Assign to variables used in the rest of the script
$rdsEndpoint = $rdsEndpointValue
$rdsPort = $rdsPortValue
$redisEndpoint = $redisEndpointValue

Write-Host "  RDS Endpoint: $rdsEndpoint" -ForegroundColor Green
Write-Host "  RDS Port: $rdsPort" -ForegroundColor Green
Write-Host "  Redis Endpoint: $redisEndpoint" -ForegroundColor Green
Write-Host ""

# ============================================================================
# PostgreSQL Schema
# ============================================================================

Write-Host "[2/5] Generating PostgreSQL schema..." -ForegroundColor Yellow

$postgresSchema = @"
-- ============================================================================
-- FlashDrop E-Commerce PostgreSQL Schema
-- Generated for: flashdrop-dev-postgres
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- Stores user account information
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cognito_sub VARCHAR(255) UNIQUE,  -- Cognito user pool sub
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_cognito_sub ON users(cognito_sub);

-- ============================================================================
-- ADDRESSES TABLE
-- Stores user shipping/billing addresses
-- ============================================================================
CREATE TABLE IF NOT EXISTS addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    address_type VARCHAR(20) NOT NULL CHECK (address_type IN ('shipping', 'billing')),
    street_address1 VARCHAR(255) NOT NULL,
    street_address2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'United States',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- ============================================================================
-- ORDERS TABLE
-- Stores completed order information (transactional ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,  -- Human-readable order number
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255),  -- For guest checkouts
    email VARCHAR(255) NOT NULL,
    
    -- Order totals
    subtotal DECIMAL(10, 2) NOT NULL,
    tax DECIMAL(10, 2) DEFAULT 0.00,
    shipping_cost DECIMAL(10, 2) DEFAULT 0.00,
    discount DECIMAL(10, 2) DEFAULT 0.00,
    total DECIMAL(10, 2) NOT NULL,
    
    -- Order status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
    ),
    
    -- Payment information
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (
        payment_status IN ('pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded')
    ),
    payment_method VARCHAR(50),  -- 'credit_card', 'paypal', etc.
    transaction_id VARCHAR(255),
    
    -- Addresses (stored as JSON for historical records)
    shipping_address JSONB,
    billing_address JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE,
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    customer_notes TEXT,
    internal_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- ============================================================================
-- ORDER ITEMS TABLE
-- Stores individual items within an order
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id VARCHAR(50) NOT NULL,  -- References DynamoDB product
    product_name VARCHAR(255) NOT NULL,
    product_image VARCHAR(500),
    size VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    
    -- Flash sale tracking
    was_flash_sale BOOLEAN DEFAULT FALSE,
    original_price DECIMAL(10, 2),
    discount_applied DECIMAL(10, 2) DEFAULT 0.00,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- ============================================================================
-- PAYMENT TRANSACTIONS TABLE
-- Stores payment transaction history for audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    transaction_id VARCHAR(255) UNIQUE NOT NULL,
    transaction_type VARCHAR(50) NOT NULL CHECK (
        transaction_type IN ('authorization', 'capture', 'refund', 'void', 'chargeback')
    ),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL CHECK (
        status IN ('pending', 'success', 'failed', 'cancelled')
    ),
    
    -- Payment details (masked/tokenized)
    payment_method VARCHAR(50),
    card_last_four VARCHAR(4),
    card_brand VARCHAR(20),  -- 'visa', 'mastercard', 'amex', etc.
    
    -- Gateway response
    gateway_response JSONB,
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_transaction_id ON payment_transactions(transaction_id);

-- ============================================================================
-- INVENTORY RESERVATIONS TABLE
-- Tracks temporary inventory reservations during checkout
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    size VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (
        status IN ('active', 'converted', 'expired', 'cancelled')
    ),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,  -- Set when converted to order
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_session_id ON inventory_reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_product_id ON inventory_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_expires_at ON inventory_reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_status ON inventory_reservations(status);

-- ============================================================================
-- FLASH SALES TABLE
-- Stores flash sale history and configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS flash_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id VARCHAR(50) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    original_price DECIMAL(10, 2) NOT NULL,
    sale_price DECIMAL(10, 2) NOT NULL,
    max_quantity INTEGER NOT NULL,
    sold_quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT flash_sales_valid_dates CHECK (end_time > start_time),
    CONSTRAINT flash_sales_valid_prices CHECK (sale_price < original_price)
);

CREATE INDEX IF NOT EXISTS idx_flash_sales_product_id ON flash_sales(product_id);
CREATE INDEX IF NOT EXISTS idx_flash_sales_is_active ON flash_sales(is_active);
CREATE INDEX IF NOT EXISTS idx_flash_sales_dates ON flash_sales(start_time, end_time);

-- ============================================================================
-- ORDER SEQUENCE
-- For generating human-readable order numbers
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 10001;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(50) AS `$`$
BEGIN
    RETURN 'FD-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
END;
`$`$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS `$`$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
`$`$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_addresses_updated_at ON addresses;
CREATE TRIGGER update_addresses_updated_at
    BEFORE UPDATE ON addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_flash_sales_updated_at ON flash_sales;
CREATE TRIGGER update_flash_sales_updated_at
    BEFORE UPDATE ON flash_sales
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================

-- Insert sample flash sale data
INSERT INTO flash_sales (product_id, start_time, end_time, original_price, sale_price, max_quantity, sold_quantity, is_active)
VALUES 
    ('1', NOW() - INTERVAL '10 minutes', NOW() + INTERVAL '45 minutes', 170.00, 129.00, 100, 75, TRUE),
    ('3', NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '25 minutes', 220.00, 179.00, 50, 40, TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VIEWS (Optional - for reporting)
-- ============================================================================

-- View for order summary
CREATE OR REPLACE VIEW order_summary AS
SELECT 
    o.id,
    o.order_number,
    o.email,
    o.total,
    o.status,
    o.payment_status,
    o.created_at,
    COUNT(oi.id) as item_count,
    SUM(oi.quantity) as total_items
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, o.order_number, o.email, o.total, o.status, o.payment_status, o.created_at;

-- ============================================================================
-- GRANTS (Adjust as needed for your application user)
-- ============================================================================
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO flashdrop_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO flashdrop_app;

COMMIT;

-- Output success message
SELECT 'FlashDrop PostgreSQL schema created successfully!' AS result;
"@

# Save the schema to a file
$schemaFile = Join-Path $PSScriptRoot "postgres-schema.sql"
$postgresSchema | Out-File -FilePath $schemaFile -Encoding utf8
Write-Host "  Schema saved to: $schemaFile" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Redis Key Structure Document
# ============================================================================

Write-Host "[3/5] Generating Redis key structure documentation..." -ForegroundColor Yellow

$redisKeyStructure = @"
# ============================================================================
# FlashDrop Redis Key Structure
# ElastiCache Endpoint: $redisEndpoint
# ============================================================================

## Key Naming Convention
All keys follow the pattern: flashdrop:{entity}:{identifier}

## Cart Session Data
# Cart storage for user sessions (expires in 30 minutes)
KEY: flashdrop:cart:{sessionId}
TYPE: HASH
FIELDS:
  - id: UUID of the cart
  - session_id: Session identifier
  - items: JSON array of cart items
  - created_at: ISO timestamp
  - updated_at: ISO timestamp
TTL: 1800 seconds (30 minutes)

EXAMPLE:
HSET flashdrop:cart:abc123 id "uuid-123" session_id "abc123" items '[{"id":"1","name":"Air Jordan 1","price":170,"size":"9","quantity":1}]'
EXPIRE flashdrop:cart:abc123 1800

## Inventory Counters
# Real-time inventory tracking per product/size
KEY: flashdrop:inventory:{productId}:{size}
TYPE: STRING (integer)
VALUE: Current available quantity
TTL: None (persistent)

EXAMPLE:
SET flashdrop:inventory:1:9 25
DECR flashdrop:inventory:1:9  # When item is reserved

## Flash Sale Data
# Flash sale information cached from DynamoDB
KEY: flashdrop:flashsale:{productId}
TYPE: HASH
FIELDS:
  - id: Flash sale ID
  - start_time: ISO timestamp
  - end_time: ISO timestamp
  - original_price: Original price
  - sale_price: Discounted price
  - max_quantity: Maximum items available
  - sold_quantity: Items sold so far
  - is_active: Boolean (1 or 0)
TTL: Matches end_time of the sale

EXAMPLE:
HSET flashdrop:flashsale:1 id "flash-1" start_time "2026-01-19T08:00:00Z" end_time "2026-01-19T09:00:00Z" original_price "170" sale_price "129" max_quantity "100" sold_quantity "75" is_active "1"

## Flash Sale Sold Counter
# Real-time sold counter for flash sales
KEY: flashdrop:flashsale:{productId}:sold
TYPE: STRING (integer)
VALUE: Number of items sold
TTL: Matches end_time of the sale

EXAMPLE:
SET flashdrop:flashsale:1:sold 75
INCR flashdrop:flashsale:1:sold  # When item is purchased

## Reservation Locks
# Temporary locks during checkout process
KEY: flashdrop:reservation:{sessionId}:{productId}:{size}
TYPE: STRING
VALUE: Quantity reserved
TTL: 600 seconds (10 minutes)

EXAMPLE:
SET flashdrop:reservation:abc123:1:9 1
EXPIRE flashdrop:reservation:abc123:1:9 600

## Rate Limiting
# API rate limiting per IP/session
KEY: flashdrop:ratelimit:{ip}
TYPE: STRING (integer)
VALUE: Request count
TTL: 60 seconds

EXAMPLE:
INCR flashdrop:ratelimit:192.168.1.1
EXPIRE flashdrop:ratelimit:192.168.1.1 60

## Session Tracking
# Active session tracking for analytics
KEY: flashdrop:session:{sessionId}
TYPE: HASH
FIELDS:
  - user_id: User ID if authenticated
  - started_at: Session start time
  - last_activity: Last activity timestamp
  - page_views: Number of pages viewed
TTL: 3600 seconds (1 hour of inactivity)
"@

# Save the Redis key structure to a file
$redisFile = Join-Path $PSScriptRoot "redis-key-structure.md"
$redisKeyStructure | Out-File -FilePath $redisFile -Encoding utf8
Write-Host "  Key structure saved to: $redisFile" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Generate Redis Initialization Script
# ============================================================================

Write-Host "[4/5] Generating Redis initialization commands..." -ForegroundColor Yellow

$redisInitCommands = @"
# ============================================================================
# FlashDrop Redis Initialization Commands
# Run these commands to initialize Redis with sample data
# ============================================================================

# Connect to Redis:
# redis-cli -h $redisEndpoint -p 6379

# Initialize inventory counters for all products
SET flashdrop:inventory:1:7 10
SET flashdrop:inventory:1:7.5 8
SET flashdrop:inventory:1:8 12
SET flashdrop:inventory:1:8.5 15
SET flashdrop:inventory:1:9 25
SET flashdrop:inventory:1:9.5 20
SET flashdrop:inventory:1:10 18
SET flashdrop:inventory:1:10.5 10
SET flashdrop:inventory:1:11 5

SET flashdrop:inventory:2:7 15
SET flashdrop:inventory:2:7.5 12
SET flashdrop:inventory:2:8 20
SET flashdrop:inventory:2:8.5 25
SET flashdrop:inventory:2:9 50
SET flashdrop:inventory:2:9.5 40
SET flashdrop:inventory:2:10 35
SET flashdrop:inventory:2:10.5 20
SET flashdrop:inventory:2:11 10

SET flashdrop:inventory:3:7 3
SET flashdrop:inventory:3:7.5 2
SET flashdrop:inventory:3:8 5
SET flashdrop:inventory:3:8.5 4
SET flashdrop:inventory:3:9 10
SET flashdrop:inventory:3:9.5 8
SET flashdrop:inventory:3:10 6
SET flashdrop:inventory:3:10.5 3
SET flashdrop:inventory:3:11 2

SET flashdrop:inventory:4:7 10
SET flashdrop:inventory:4:7.5 8
SET flashdrop:inventory:4:8 12
SET flashdrop:inventory:4:8.5 15
SET flashdrop:inventory:4:9 30
SET flashdrop:inventory:4:9.5 25
SET flashdrop:inventory:4:10 20
SET flashdrop:inventory:4:10.5 12
SET flashdrop:inventory:4:11 8

# Initialize flash sale counters
SET flashdrop:flashsale:1:sold 75
SET flashdrop:flashsale:3:sold 40

# Initialize flash sale hash data
HSET flashdrop:flashsale:1 id "flash-1" product_id "1" original_price "170" sale_price "129" max_quantity "100" is_active "1"
HSET flashdrop:flashsale:3 id "flash-3" product_id "3" original_price "220" sale_price "179" max_quantity "50" is_active "1"

# Verify initialization
KEYS flashdrop:*
"@

$redisInitFile = Join-Path $PSScriptRoot "redis-init-commands.txt"
$redisInitCommands | Out-File -FilePath $redisInitFile -Encoding utf8
Write-Host "  Init commands saved to: $redisInitFile" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Connection Instructions
# ============================================================================

Write-Host "[5/5] Setup Complete!" -ForegroundColor Yellow
Write-Host ""

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "DATABASE SCHEMA FILES GENERATED" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "PostgreSQL Schema:" -ForegroundColor White
Write-Host "  File: scripts/postgres-schema.sql" -ForegroundColor Gray
Write-Host "  Endpoint: $rdsEndpoint`:$rdsPort" -ForegroundColor Gray
Write-Host ""

Write-Host "Redis Key Structure:" -ForegroundColor White
Write-Host "  Documentation: scripts/redis-key-structure.md" -ForegroundColor Gray
Write-Host "  Init Commands: scripts/redis-init-commands.txt" -ForegroundColor Gray
Write-Host "  Endpoint: $redisEndpoint`:6379" -ForegroundColor Gray
Write-Host ""

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "NEXT STEPS" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. CONNECT TO RDS (requires VPC access or bastion host):" -ForegroundColor Yellow
Write-Host @"
   
   # Option A: From an EC2 instance in the same VPC
   psql -h $rdsEndpoint -p $rdsPort -U flashdropadmin -d flashdrop
   
   # Option B: Using AWS Session Manager (if available)
   # Option C: Set up an SSH tunnel through a bastion host
   
   # Then run the schema:
   \i scripts/postgres-schema.sql
"@ -ForegroundColor Gray

Write-Host ""
Write-Host "2. INITIALIZE REDIS (requires VPC access):" -ForegroundColor Yellow
Write-Host @"
   
   # From an EC2 instance in the same VPC
   redis-cli -h $redisEndpoint -p 6379
   
   # Then paste commands from: scripts/redis-init-commands.txt
"@ -ForegroundColor Gray

Write-Host ""
Write-Host "NOTE: Both RDS and ElastiCache are in private subnets for security." -ForegroundColor Magenta
Write-Host "You need VPC access (EC2, VPN, or bastion) to connect directly." -ForegroundColor Magenta
Write-Host "The ECS cart-service has VPC access and can connect automatically." -ForegroundColor Magenta
