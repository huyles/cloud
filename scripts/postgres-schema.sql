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
-- INVENTORY AUDIT LOG TABLE
-- Tracks inventory changes for auditing and reconciliation
-- NOTE: Active reservations are handled by Redis for speed (flashdrop:reservation:*)
--       This table logs completed inventory transactions for audit purposes
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id VARCHAR(50) NOT NULL,
    size VARCHAR(20) NOT NULL,
    change_type VARCHAR(30) NOT NULL CHECK (
        change_type IN ('sale', 'restock', 'adjustment', 'return', 'reservation_expired')
    ),
    quantity_change INTEGER NOT NULL,  -- Negative for sales, positive for restocks
    previous_quantity INTEGER,
    new_quantity INTEGER,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)  -- User or system that made the change
);

CREATE INDEX IF NOT EXISTS idx_inventory_audit_product_id ON inventory_audit_log(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_created_at ON inventory_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_order_id ON inventory_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_change_type ON inventory_audit_log(change_type);

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
RETURNS VARCHAR(50) AS $$
BEGIN
    RETURN 'FD-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
