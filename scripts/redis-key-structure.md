# ============================================================================

# FlashDrop Redis Key Structure

# ElastiCache Endpoint: flashdrop-dev-redis.yhhwe0.0001.use1.cache.amazonaws.com

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
DECR flashdrop:inventory:1:9 # When item is reserved

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
INCR flashdrop:flashsale:1:sold # When item is purchased

## Reservation Locks (SINGLE SOURCE OF TRUTH for active reservations)

# Temporary locks during checkout process

# NOTE: PostgreSQL does NOT store active reservations - Redis handles all ephemeral data

# PostgreSQL only logs completed inventory changes via inventory_audit_log table

KEY: flashdrop:reservation:{sessionId}:{productId}:{size}
TYPE: STRING
VALUE: Quantity reserved
TTL: 600 seconds (10 minutes)

EXAMPLE:
SET flashdrop:reservation:abc123:1:9 1
EXPIRE flashdrop:reservation:abc123:1:9 600

# When checkout completes:

# 1. Delete reservation key from Redis

# 2. Decrement inventory counter in Redis

# 3. Log change to PostgreSQL inventory_audit_log table

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
