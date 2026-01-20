# FlashDrop Frontend - Limited Edition Sneaker Store

A React-based e-commerce frontend designed for flash sales and high-traffic scenarios. Built to connect seamlessly with AWS backend services.

## 🚀 Frontend Setup

### Prerequisites

- Node.js (v18+)
- npm or yarn

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

Visit: http://localhost:5173

**✅ Works immediately with mock data - no AWS setup required!**

## 🏗️ Frontend Architecture

```
flashdrop-frontend/
├── src/
│   ├── components/          # React components
│   │   ├── Header.tsx       # Navigation header
│   │   └── FlashSaleTimer.tsx # Flash sale countdown
│   ├── data/
│   │   └── products.ts      # Product data & API calls
│   ├── pages/               # Page components
│   │   ├── HomePage.tsx     # Product listing
│   │   ├── ProductPage.tsx  # Product details
│   │   ├── CartPage.tsx     # Shopping cart
│   │   ├── CheckoutPage.tsx # Payment & checkout
│   │   └── CheckoutSuccessPage.tsx # Order confirmation
│   ├── App.tsx              # Main app component
│   ├── main.tsx             # Entry point
│   └── index.css            # Global styles
├── cart-service/            # Go-based cart & checkout microservice
│   ├── main.go              # Cart service implementation
│   ├── Dockerfile           # Container configuration
│   ├── docker-compose.yml   # Docker orchestration
│   └── README.md            # Service documentation
├── public/                  # Static assets & product images
├── .env.example             # Environment variables template
├── .env                     # Local development config
└── package.json             # Dependencies
```

## ✨ Frontend Features

- ✅ **Product Catalog** - Browse sneakers with images
- ✅ **Flash Sale Indicators** - Special badges for limited-time offers
- ✅ **Product Details** - Individual product pages with size selection
- ✅ **Real-time Inventory** - Live stock counters
- ✅ **Reservation System** - Reserve items before checkout
- ✅ **Shopping Cart** - Full cart management with service sync
- ✅ **Checkout Flow** - Payment processing with mock gateway
- ✅ **Order Confirmation** - Success page with order details
- ✅ **Responsive Design** - Works on desktop and mobile
- ✅ **Loading States** - Smooth user experience
- ✅ **Error Handling** - Graceful fallbacks to mock data

## 🛒 Cart Service (Go Microservice)

The cart and checkout functionality runs as a separate containerized Go service with:

- **Concurrency Control**: Read-write locks for thread-safe cart operations
- **Session Management**: Cart persistence with 30-minute expiration
- **Mock Payment Processing**: Simulated payment gateway with validation
- **Order Management**: Complete order lifecycle handling

### Running the Cart Service

```bash
# Using Docker (recommended)
cd cart-service
docker-compose up --build

# Or run directly with Go
cd cart-service
go run main.go
```

The service runs on `http://localhost:8080` by default.

### Cart Service Endpoints

| Method | Endpoint                                 | Description      |
| ------ | ---------------------------------------- | ---------------- |
| GET    | `/health`                                | Health check     |
| GET    | `/api/cart/{sessionId}`                  | Get cart         |
| PUT    | `/api/cart/{sessionId}`                  | Save cart        |
| POST   | `/api/cart/{sessionId}/item`             | Add item         |
| PATCH  | `/api/cart/{sessionId}/item/{id}/{size}` | Update quantity  |
| DELETE | `/api/cart/{sessionId}/item/{id}/{size}` | Remove item      |
| POST   | `/api/checkout`                          | Process checkout |
| GET    | `/api/order/{orderId}`                   | Get order        |

## 🔗 AWS Integration

### How the Frontend Connects to AWS

The frontend is designed to work with this AWS architecture:

```
React Frontend → API Gateway → Lambda (Products) + ECS (Inventory) → DynamoDB + ElastiCache + RDS
```

### Environment Configuration

The frontend uses environment variables to connect to AWS services:

**Local Development (.env)**

```env
# Uses mock data - no AWS needed
VITE_BROWSE_API_URL=
VITE_INVENTORY_API_URL=
VITE_S3_BUCKET_URL=
# Cart service (runs locally via Docker)
VITE_CART_SERVICE_URL=http://localhost:8080
```

**AWS Production (.env)**

```env
# Connect to your AWS services
VITE_BROWSE_API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/prod
VITE_INVENTORY_API_URL=https://your-inventory-api.execute-api.us-east-1.amazonaws.com/prod
VITE_S3_BUCKET_URL=https://your-bucket.s3.amazonaws.com
# Cart service (deployed to ECS or any container service)
VITE_CART_SERVICE_URL=https://your-cart-service.amazonaws.com
```

## ☁️ AWS Backend Requirements

To connect this frontend to AWS, you need to create these backend services:

### 1. DynamoDB Table (Product Catalog)

Product Metadata: Stores product
details, descriptions, images links, and
user profiles. Its low-latency, high-
scale read capacity is perfect for the
browsing experience.

```bash
aws dynamodb create-table \
  --table-name FlashDrop-Products \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

### 2. Lambda Function (Product Browsing)

Product Browsing & Listing: Handles
API calls for fetching product lists and
details from DynamoDB. This scales
instantly during traffic spikes.

### 3. API Gateway (HTTP Endpoints)

Routes: Handles all requests
(/products, /checkout, /inventory). It
directs simple requests (browsing) to
Lambda and complex, stateful
requests (reserving inventory) to ECS.

### 4. ECS/ECR Service (Inventory Management)

Inventory Reservation Service: Runs
the critical logic that handles
cart/checkout. This service requires
sustained connections and strict
control over concurrency (using locks)
which is better suited for a container
than a stateless Lambda function.

### 5. S3 Bucket (Product Images)

Frontend Hosting & Assets: Hosts the
static single-page application
(React/Vue) and stores all high-
resolution product images and videos.

### 6. ElastiCache (Redis)

Inventory Counter & Leaderboard:
Stores the remaining inventory count.
Every time a user reserves an item, this
counter is instantly decremented,
providing real-time data to the
storefront with microsecond latency.

### 7. RDS (PostgreSQL/MySQL)

Transactional Ledger: Stores the final,
committed order data (financial
records, payment status, shipping).
RDS is chosen for its ACID compliance,
ensuring data integrity for financial
transactions.

## 🔧 Frontend API Integration

### Product Data Flow

```javascript
// Frontend calls AWS APIs
const products = await fetch(`${BROWSE_API}/products`);
const inventory = await fetch(`${INVENTORY_API}/inventory/${productId}`);
const reservation = await fetch(`${INVENTORY_API}/reserve`, { method: "POST" });
```

### Automatic Fallback

The frontend automatically falls back to mock data when AWS APIs are unavailable:

```javascript
// In src/data/products.ts
export const fetchProducts = async () => {
  if (!BROWSE_API) {
    return mockProducts; // Uses local mock data
  }

  try {
    const response = await fetch(`${BROWSE_API}/products`);
    return await response.json();
  } catch (error) {
    return mockProducts; // Fallback on error
  }
};
```

## 🚀 Deployment Options

### Option 1: Local Development

```bash
npm run dev  # Uses mock data
```

### Option 2: AWS Development

```bash
# Set your AWS API URLs
echo VITE_BROWSE_API_URL=https://your-api.amazonaws.com/prod > .env
npm run dev  # Now uses real AWS APIs
```

### Option 3: Docker Deployment

```bash
docker build -t flashdrop-frontend .
docker run -p 3000:80 flashdrop-frontend
```

### Option 4: AWS ECS Deployment

```bash
# Build with AWS environment variables
docker build \
  --build-arg VITE_BROWSE_API_URL=https://your-api.amazonaws.com/prod \
  --build-arg VITE_INVENTORY_API_URL=https://your-inventory.amazonaws.com/prod \
  -t flashdrop-frontend .

# Deploy to ECS (requires ECR push)
./deploy-aws.sh
```

## 🧪 Testing Frontend

### 1. Local Testing (Mock Data)

```bash
npm run dev
```

- Should show 4 products
- Flash sale badges visible
- Product pages work
- Reservation system simulated

### 2. AWS Integration Testing

```bash
# Set AWS environment variables
echo VITE_BROWSE_API_URL=https://your-api.amazonaws.com/prod > .env
npm run dev
```

- Products load from DynamoDB
- Real-time inventory updates
- Actual reservations processed

### 3. Console Debugging

Open browser DevTools (F12) and check:

- `🔧 Using mock data - no API configured` (local mode)
- `✅ Products loaded from AWS` (AWS mode)
- No JavaScript errors

## 🚨 Troubleshooting

### Frontend Issues

- **Blank page**: Check browser console for errors
- **Products not loading**: Verify API URLs in .env file
- **CORS errors**: Ensure API Gateway has CORS enabled

### AWS Connection Issues

- **API not found**: Verify API Gateway URL is correct
- **403 Forbidden**: Check API Gateway permissions and CORS
- **500 Errors**: Check Lambda function logs in CloudWatch

## 📊 Frontend Performance

### Optimizations Included

- **Code splitting** - Lazy loading of routes
- **Image optimization** - Proper sizing and formats
- **Caching** - API responses cached locally
- **Error boundaries** - Graceful error handling
- **Loading states** - Smooth user experience

### AWS Performance Benefits

- **Lambda auto-scaling** - Handles traffic spikes
- **ElastiCache** - Sub-millisecond inventory updates
- **CloudFront CDN** - Fast global image delivery
- **API Gateway caching** - Reduced backend load

## 🎯 Frontend-AWS Integration Checklist

### ✅ Frontend Ready

- [x] React components built
- [x] API integration layer ready
- [x] Environment variable configuration
- [x] Error handling and fallbacks
- [x] Docker containerization
- [x] Production build process

### ⏳ AWS Backend Needed

- [ ] DynamoDB table with product data
- [ ] Lambda function for product browsing
- [ ] API Gateway with CORS enabled
- [ ] ECS service for inventory management
- [ ] S3 bucket for product images
- [ ] ElastiCache for real-time updates

### 🔗 Connection Steps

1. Create AWS backend services
2. Get API Gateway URLs
3. Update `.env` file with real URLs
4. Test frontend with `npm run dev`
5. Deploy to production with Docker/ECS

---

**🎉 Your frontend is ready to connect to AWS! Create the backend services and update the .env file to go live.**
