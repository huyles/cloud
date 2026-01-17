# FlashDrop Cart Service

A Go-based microservice for cart management and checkout processing with concurrency control.

## Features

- **Cart Management**: Add, update, remove items with session-based carts
- **Concurrency Control**: Uses read-write locks to ensure thread-safe operations
- **Mock Payment Processing**: Simulates payment gateway with validation
- **Cart Expiration**: Automatic cleanup of expired carts (30-minute TTL)
- **RESTful API**: Clean HTTP endpoints for all operations

## API Endpoints

| Method | Endpoint                                     | Description              |
| ------ | -------------------------------------------- | ------------------------ |
| GET    | `/health`                                    | Health check             |
| GET    | `/api/cart/{sessionId}`                      | Get cart by session      |
| PUT    | `/api/cart/{sessionId}`                      | Save/replace entire cart |
| POST   | `/api/cart/{sessionId}/item`                 | Add item to cart         |
| PATCH  | `/api/cart/{sessionId}/item/{itemId}/{size}` | Update item quantity     |
| DELETE | `/api/cart/{sessionId}/item/{itemId}/{size}` | Remove item from cart    |
| DELETE | `/api/cart/{sessionId}`                      | Clear entire cart        |
| POST   | `/api/checkout`                              | Process checkout         |
| GET    | `/api/order/{orderId}`                       | Get order details        |

## Running Locally

### With Docker (Recommended)

```bash
# Build and run
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

### Without Docker

```bash
# Download dependencies
go mod download

# Run the service
go run main.go

# Or build and run
go build -o cart-service .
./cart-service
```

## Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT`   | `8080`  | Server port |

## API Usage Examples

### Add Item to Cart

```bash
curl -X POST http://localhost:8080/api/cart/session123/item \
  -H "Content-Type: application/json" \
  -d '{
    "id": "1",
    "name": "Air Jordan 1",
    "price": 170,
    "size": "10",
    "quantity": 1,
    "image": "/jordan1.jpg"
  }'
```

### Get Cart

```bash
curl http://localhost:8080/api/cart/session123
```

### Checkout

```bash
curl -X POST http://localhost:8080/api/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session123",
    "email": "customer@example.com",
    "payment": {
      "cardNumber": "4111111111111111",
      "cardHolder": "John Doe",
      "expiryMonth": "12",
      "expiryYear": "2025",
      "cvv": "123",
      "billingAddress": "123 Main St"
    }
  }'
```

## Testing Card Numbers

| Card Number        | Result   |
| ------------------ | -------- |
| `4111111111111111` | Success  |
| `4000000000000002` | Declined |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cart Service                          │
├─────────────────────────────────────────────────────────┤
│  HTTP Layer (gorilla/mux + cors)                        │
├─────────────────────────────────────────────────────────┤
│  Handlers (Cart, Checkout, Order)                       │
├─────────────────────────────────────────────────────────┤
│  Cart Store (In-Memory with RWMutex Locks)              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Cart Locks  │  │   Carts     │  │   Orders    │     │
│  │ (per-session)│  │ (map)      │  │   (map)     │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
├─────────────────────────────────────────────────────────┤
│  Background Jobs (Cart Cleanup)                         │
└─────────────────────────────────────────────────────────┘
```

## Concurrency Model

The service uses a multi-level locking strategy:

1. **Global Lock**: For accessing/creating per-cart locks
2. **Per-Cart Lock**: RWMutex for each session's cart operations
3. **Order Storage Lock**: Separate lock for order storage

This ensures:

- Multiple readers can access a cart simultaneously
- Only one writer can modify a cart at a time
- No race conditions during checkout
- Cart expiration cleanup runs safely in background
