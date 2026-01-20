package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"github.com/rs/cors"
)

// ============================================================================
// Configuration
// ============================================================================

type Config struct {
	Port            string
	RedisURL        string
	PostgresURL     string
	CartTTL         time.Duration // 30 minutes for cart sessions
	ReservationTTL  time.Duration // 10 minutes for reservations
	RateLimitWindow time.Duration // 60 seconds for rate limiting
	RateLimitMax    int           // Max requests per window
}

func LoadConfig() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "localhost:6379"
	}

	postgresURL := os.Getenv("POSTGRES_URL")
	if postgresURL == "" {
		postgresURL = "postgres://postgres:postgres@localhost:5432/flashdrop?sslmode=disable"
	}

	return &Config{
		Port:            port,
		RedisURL:        redisURL,
		PostgresURL:     postgresURL,
		CartTTL:         30 * time.Minute,
		ReservationTTL:  10 * time.Minute,
		RateLimitWindow: 60 * time.Second,
		RateLimitMax:    100,
	}
}

// ============================================================================
// Data Models
// ============================================================================

// CartItem represents an item in the cart
type CartItem struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Price    float64 `json:"price"`
	Size     string  `json:"size"`
	Quantity int     `json:"quantity"`
	Image    string  `json:"image"`
}

// Cart represents a user's shopping cart (stored in Redis)
type Cart struct {
	ID        string     `json:"id"`
	SessionID string     `json:"sessionId"`
	Items     []CartItem `json:"items"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
	ExpiresAt time.Time  `json:"expiresAt"`
}

// PaymentDetails represents credit card information
type PaymentDetails struct {
	CardNumber     string `json:"cardNumber"`
	CardHolder     string `json:"cardHolder"`
	ExpiryMonth    string `json:"expiryMonth"`
	ExpiryYear     string `json:"expiryYear"`
	CVV            string `json:"cvv"`
	BillingAddress string `json:"billingAddress"`
}

// CheckoutRequest represents the checkout request body
type CheckoutRequest struct {
	SessionID string         `json:"sessionId"`
	Payment   PaymentDetails `json:"payment"`
	Email     string         `json:"email"`
}

// Order represents a completed order (stored in PostgreSQL)
type Order struct {
	ID              string     `json:"id"`
	OrderNumber     string     `json:"orderNumber"`
	SessionID       string     `json:"sessionId"`
	Items           []CartItem `json:"items"`
	Subtotal        float64    `json:"subtotal"`
	Tax             float64    `json:"tax"`
	Total           float64    `json:"total"`
	Status          string     `json:"status"`
	PaymentStatus   string     `json:"paymentStatus"`
	TransactionID   string     `json:"transactionId"`
	Email           string     `json:"email"`
	CreatedAt       time.Time  `json:"createdAt"`
	ShippingAddress string     `json:"shippingAddress,omitempty"`
}

// FlashSale represents flash sale configuration
type FlashSale struct {
	ID            string  `json:"id"`
	ProductID     string  `json:"productId"`
	OriginalPrice float64 `json:"originalPrice"`
	SalePrice     float64 `json:"salePrice"`
	MaxQuantity   int     `json:"maxQuantity"`
	SoldQuantity  int     `json:"soldQuantity"`
	IsActive      bool    `json:"isActive"`
}

// InventoryInfo represents inventory status
type InventoryInfo struct {
	ProductID string `json:"productId"`
	Size      string `json:"size"`
	Available int    `json:"available"`
	Reserved  int    `json:"reserved"`
}

// ============================================================================
// Redis Keys
// ============================================================================

const (
	RedisKeyPrefixCart        = "flashdrop:cart:"
	RedisKeyPrefixReservation = "flashdrop:reservation:"
	RedisKeyPrefixInventory   = "flashdrop:inventory:"
	RedisKeyPrefixFlashSale   = "flashdrop:flashsale:"
	RedisKeyPrefixRateLimit   = "flashdrop:ratelimit:"
)

func cartKey(sessionID string) string {
	return RedisKeyPrefixCart + sessionID
}

func reservationKey(sessionID, productID, size string) string {
	return fmt.Sprintf("%s%s:%s:%s", RedisKeyPrefixReservation, sessionID, productID, size)
}

func inventoryKey(productID, size string) string {
	return fmt.Sprintf("%s%s:%s", RedisKeyPrefixInventory, productID, size)
}

func flashSaleConfigKey(productID string) string {
	return RedisKeyPrefixFlashSale + productID
}

func flashSaleSoldKey(productID string) string {
	return fmt.Sprintf("%s%s:sold", RedisKeyPrefixFlashSale, productID)
}

func rateLimitKey(ip string) string {
	return RedisKeyPrefixRateLimit + ip
}

// ============================================================================
// Database Connections
// ============================================================================

type DBConnections struct {
	Redis    *redis.Client
	Postgres *sql.DB
	Config   *Config
}

func NewDBConnections(config *Config) (*DBConnections, error) {
	// Connect to Redis
	redisClient := redis.NewClient(&redis.Options{
		Addr:         config.RedisURL,
		Password:     os.Getenv("REDIS_PASSWORD"),
		DB:           0,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %v", err)
	}
	log.Printf("✅ Connected to Redis at %s", config.RedisURL)

	// Connect to PostgreSQL
	db, err := sql.Open("postgres", config.PostgresURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open PostgreSQL connection: %v", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping PostgreSQL: %v", err)
	}
	log.Printf("✅ Connected to PostgreSQL")

	return &DBConnections{
		Redis:    redisClient,
		Postgres: db,
		Config:   config,
	}, nil
}

func (db *DBConnections) Close() {
	if db.Redis != nil {
		db.Redis.Close()
	}
	if db.Postgres != nil {
		db.Postgres.Close()
	}
}

// ============================================================================
// Cart Store (Redis-backed)
// ============================================================================

type CartStore struct {
	db *DBConnections
}

func NewCartStore(db *DBConnections) *CartStore {
	return &CartStore{db: db}
}

// GetCart retrieves a cart from Redis
func (s *CartStore) GetCart(ctx context.Context, sessionID string) (*Cart, error) {
	key := cartKey(sessionID)
	data, err := s.db.Redis.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil // Cart doesn't exist
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get cart from Redis: %v", err)
	}

	var cart Cart
	if err := json.Unmarshal(data, &cart); err != nil {
		return nil, fmt.Errorf("failed to unmarshal cart: %v", err)
	}

	return &cart, nil
}

// SaveCart saves a cart to Redis with TTL
func (s *CartStore) SaveCart(ctx context.Context, cart *Cart) error {
	key := cartKey(cart.SessionID)
	data, err := json.Marshal(cart)
	if err != nil {
		return fmt.Errorf("failed to marshal cart: %v", err)
	}

	if err := s.db.Redis.Set(ctx, key, data, s.db.Config.CartTTL).Err(); err != nil {
		return fmt.Errorf("failed to save cart to Redis: %v", err)
	}

	return nil
}

// CreateOrUpdateCart creates or updates a cart with new items
func (s *CartStore) CreateOrUpdateCart(ctx context.Context, sessionID string, items []CartItem) (*Cart, error) {
	now := time.Now()
	expiresAt := now.Add(s.db.Config.CartTTL)

	existingCart, err := s.GetCart(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	var cart *Cart
	if existingCart != nil {
		cart = existingCart
		cart.Items = items
		cart.UpdatedAt = now
		cart.ExpiresAt = expiresAt
		log.Printf("📝 Updated cart for session %s with %d items", sessionID, len(items))
	} else {
		cart = &Cart{
			ID:        uuid.New().String(),
			SessionID: sessionID,
			Items:     items,
			CreatedAt: now,
			UpdatedAt: now,
			ExpiresAt: expiresAt,
		}
		log.Printf("🆕 Created cart for session %s with %d items", sessionID, len(items))
	}

	if err := s.SaveCart(ctx, cart); err != nil {
		return nil, err
	}

	return cart, nil
}

// AddItemToCart adds an item to a cart
func (s *CartStore) AddItemToCart(ctx context.Context, sessionID string, item CartItem) (*Cart, error) {
	now := time.Now()
	expiresAt := now.Add(s.db.Config.CartTTL)

	cart, err := s.GetCart(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	if cart == nil {
		cart = &Cart{
			ID:        uuid.New().String(),
			SessionID: sessionID,
			Items:     []CartItem{},
			CreatedAt: now,
			UpdatedAt: now,
			ExpiresAt: expiresAt,
		}
	}

	// Check if item with same ID and size exists
	found := false
	for i, existingItem := range cart.Items {
		if existingItem.ID == item.ID && existingItem.Size == item.Size {
			cart.Items[i].Quantity += item.Quantity
			found = true
			log.Printf("➕ Updated quantity for item %s (size %s) in session %s", item.ID, item.Size, sessionID)
			break
		}
	}

	if !found {
		cart.Items = append(cart.Items, item)
		log.Printf("🛒 Added new item %s (size %s) to session %s", item.ID, item.Size, sessionID)
	}

	cart.UpdatedAt = now
	cart.ExpiresAt = expiresAt

	if err := s.SaveCart(ctx, cart); err != nil {
		return nil, err
	}

	return cart, nil
}

// UpdateItemQuantity updates the quantity of an item in the cart
func (s *CartStore) UpdateItemQuantity(ctx context.Context, sessionID, itemID, size string, quantity int) (*Cart, error) {
	cart, err := s.GetCart(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	if cart == nil {
		return nil, fmt.Errorf("cart not found")
	}

	found := false
	newItems := []CartItem{}

	for _, item := range cart.Items {
		if item.ID == itemID && item.Size == size {
			found = true
			if quantity > 0 {
				item.Quantity = quantity
				newItems = append(newItems, item)
				log.Printf("📊 Updated quantity for item %s (size %s) to %d", itemID, size, quantity)
			} else {
				log.Printf("🗑️ Removed item %s (size %s) from cart", itemID, size)
			}
		} else {
			newItems = append(newItems, item)
		}
	}

	if !found {
		return nil, fmt.Errorf("item not found in cart")
	}

	cart.Items = newItems
	cart.UpdatedAt = time.Now()
	cart.ExpiresAt = time.Now().Add(s.db.Config.CartTTL)

	if err := s.SaveCart(ctx, cart); err != nil {
		return nil, err
	}

	return cart, nil
}

// RemoveItemFromCart removes an item from the cart
func (s *CartStore) RemoveItemFromCart(ctx context.Context, sessionID, itemID, size string) (*Cart, error) {
	return s.UpdateItemQuantity(ctx, sessionID, itemID, size, 0)
}

// ClearCart removes a cart from Redis
func (s *CartStore) ClearCart(ctx context.Context, sessionID string) error {
	key := cartKey(sessionID)
	if err := s.db.Redis.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("failed to delete cart from Redis: %v", err)
	}
	log.Printf("🧹 Cleared cart for session %s", sessionID)
	return nil
}

// ============================================================================
// Inventory Management (Redis-backed)
// ============================================================================

type InventoryManager struct {
	db *DBConnections
}

func NewInventoryManager(db *DBConnections) *InventoryManager {
	return &InventoryManager{db: db}
}

// GetInventory gets the current inventory count for a product/size
func (im *InventoryManager) GetInventory(ctx context.Context, productID, size string) (int, error) {
	key := inventoryKey(productID, size)
	val, err := im.db.Redis.Get(ctx, key).Int()
	if err == redis.Nil {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("failed to get inventory: %v", err)
	}
	return val, nil
}

// DecrementInventory atomically decrements inventory and creates a reservation
func (im *InventoryManager) DecrementInventory(ctx context.Context, sessionID, productID, size string, quantity int) error {
	invKey := inventoryKey(productID, size)
	resKey := reservationKey(sessionID, productID, size)

	// Use Lua script for atomic check-and-decrement
	script := redis.NewScript(`
		local current = tonumber(redis.call('GET', KEYS[1]) or 0)
		local decrement = tonumber(ARGV[1])
		if current >= decrement then
			redis.call('DECRBY', KEYS[1], decrement)
			redis.call('SET', KEYS[2], decrement)
			redis.call('EXPIRE', KEYS[2], ARGV[2])
			return 1
		end
		return 0
	`)

	result, err := script.Run(ctx, im.db.Redis, []string{invKey, resKey}, quantity, int(im.db.Config.ReservationTTL.Seconds())).Int()
	if err != nil {
		return fmt.Errorf("failed to decrement inventory: %v", err)
	}

	if result == 0 {
		return fmt.Errorf("insufficient inventory for product %s size %s", productID, size)
	}

	log.Printf("📉 Reserved %d of product %s size %s for session %s", quantity, productID, size, sessionID)
	return nil
}

// ReleaseReservation releases a reservation and restores inventory
func (im *InventoryManager) ReleaseReservation(ctx context.Context, sessionID, productID, size string) error {
	resKey := reservationKey(sessionID, productID, size)
	invKey := inventoryKey(productID, size)

	// Use Lua script for atomic release
	script := redis.NewScript(`
		local reserved = tonumber(redis.call('GET', KEYS[1]) or 0)
		if reserved > 0 then
			redis.call('INCRBY', KEYS[2], reserved)
			redis.call('DEL', KEYS[1])
			return reserved
		end
		return 0
	`)

	result, err := script.Run(ctx, im.db.Redis, []string{resKey, invKey}).Int()
	if err != nil {
		return fmt.Errorf("failed to release reservation: %v", err)
	}

	if result > 0 {
		log.Printf("📈 Released reservation of %d for product %s size %s from session %s", result, productID, size, sessionID)
	}
	return nil
}

// CommitReservation commits a reservation (remove reservation key without restoring inventory)
func (im *InventoryManager) CommitReservation(ctx context.Context, sessionID, productID, size string) error {
	resKey := reservationKey(sessionID, productID, size)
	if err := im.db.Redis.Del(ctx, resKey).Err(); err != nil {
		return fmt.Errorf("failed to commit reservation: %v", err)
	}
	log.Printf("✅ Committed reservation for product %s size %s from session %s", productID, size, sessionID)
	return nil
}

// ============================================================================
// Flash Sale Management (Redis counters + PostgreSQL config)
// ============================================================================

type FlashSaleManager struct {
	db *DBConnections
}

func NewFlashSaleManager(db *DBConnections) *FlashSaleManager {
	return &FlashSaleManager{db: db}
}

// GetFlashSale gets flash sale info from Redis cache
func (fm *FlashSaleManager) GetFlashSale(ctx context.Context, productID string) (*FlashSale, error) {
	configKey := flashSaleConfigKey(productID)
	soldKey := flashSaleSoldKey(productID)

	// Get config from hash
	config, err := fm.db.Redis.HGetAll(ctx, configKey).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get flash sale config: %v", err)
	}

	if len(config) == 0 {
		return nil, nil // No flash sale for this product
	}

	// Get sold count
	soldCount, _ := fm.db.Redis.Get(ctx, soldKey).Int()

	isActive := config["is_active"] == "1"
	originalPrice, _ := strconv.ParseFloat(config["original_price"], 64)
	salePrice, _ := strconv.ParseFloat(config["sale_price"], 64)
	maxQuantity, _ := strconv.Atoi(config["max_quantity"])

	return &FlashSale{
		ID:            config["id"],
		ProductID:     config["product_id"],
		OriginalPrice: originalPrice,
		SalePrice:     salePrice,
		MaxQuantity:   maxQuantity,
		SoldQuantity:  soldCount,
		IsActive:      isActive,
	}, nil
}

// IncrementSoldCount atomically increments the sold count
func (fm *FlashSaleManager) IncrementSoldCount(ctx context.Context, productID string, quantity int) error {
	soldKey := flashSaleSoldKey(productID)
	if err := fm.db.Redis.IncrBy(ctx, soldKey, int64(quantity)).Err(); err != nil {
		return fmt.Errorf("failed to increment sold count: %v", err)
	}
	log.Printf("🔥 Flash sale for product %s: sold +%d", productID, quantity)
	return nil
}

// ============================================================================
// Order Management (PostgreSQL-backed)
// ============================================================================

type OrderManager struct {
	db *DBConnections
}

func NewOrderManager(db *DBConnections) *OrderManager {
	return &OrderManager{db: db}
}

// CreateOrder creates a new order in PostgreSQL
func (om *OrderManager) CreateOrder(ctx context.Context, order *Order, items []CartItem) error {
	tx, err := om.db.Postgres.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %v", err)
	}
	defer tx.Rollback()

	// Generate order number
	var orderNumber string
	err = tx.QueryRowContext(ctx, "SELECT generate_order_number()").Scan(&orderNumber)
	if err != nil {
		return fmt.Errorf("failed to generate order number: %v", err)
	}
	order.OrderNumber = orderNumber

	// Insert order
	_, err = tx.ExecContext(ctx, `
		INSERT INTO orders (
			id, order_number, session_id, email, subtotal, tax, total, 
			status, payment_status, payment_method, transaction_id, 
			created_at, paid_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`,
		order.ID, order.OrderNumber, order.SessionID, order.Email,
		order.Subtotal, order.Tax, order.Total,
		order.Status, order.PaymentStatus, "credit_card", order.TransactionID,
		order.CreatedAt, order.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to insert order: %v", err)
	}

	// Insert order items
	for _, item := range items {
		subtotal := item.Price * float64(item.Quantity)
		_, err = tx.ExecContext(ctx, `
			INSERT INTO order_items (
				id, order_id, product_id, product_name, product_image, 
				size, quantity, unit_price, subtotal
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`,
			uuid.New().String(), order.ID, item.ID, item.Name, item.Image,
			item.Size, item.Quantity, item.Price, subtotal,
		)
		if err != nil {
			return fmt.Errorf("failed to insert order item: %v", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %v", err)
	}

	log.Printf("✅ Order %s created in PostgreSQL", order.OrderNumber)
	return nil
}

// GetOrder retrieves an order by ID
func (om *OrderManager) GetOrder(ctx context.Context, orderID string) (*Order, error) {
	var order Order
	var shippingAddr sql.NullString

	err := om.db.Postgres.QueryRowContext(ctx, `
		SELECT id, order_number, session_id, email, subtotal, tax, total, 
			   status, payment_status, transaction_id, created_at, 
			   shipping_address::text
		FROM orders WHERE id = $1
	`, orderID).Scan(
		&order.ID, &order.OrderNumber, &order.SessionID, &order.Email,
		&order.Subtotal, &order.Tax, &order.Total,
		&order.Status, &order.PaymentStatus, &order.TransactionID,
		&order.CreatedAt, &shippingAddr,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get order: %v", err)
	}

	if shippingAddr.Valid {
		order.ShippingAddress = shippingAddr.String
	}

	// Get order items
	rows, err := om.db.Postgres.QueryContext(ctx, `
		SELECT product_id, product_name, product_image, size, quantity, unit_price
		FROM order_items WHERE order_id = $1
	`, orderID)
	if err != nil {
		return nil, fmt.Errorf("failed to get order items: %v", err)
	}
	defer rows.Close()

	order.Items = []CartItem{}
	for rows.Next() {
		var item CartItem
		if err := rows.Scan(&item.ID, &item.Name, &item.Image, &item.Size, &item.Quantity, &item.Price); err != nil {
			return nil, fmt.Errorf("failed to scan order item: %v", err)
		}
		order.Items = append(order.Items, item)
	}

	return &order, nil
}

// ============================================================================
// Payment Transaction Management (PostgreSQL-backed)
// ============================================================================

type PaymentManager struct {
	db *DBConnections
}

func NewPaymentManager(db *DBConnections) *PaymentManager {
	return &PaymentManager{db: db}
}

// RecordTransaction records a payment transaction
func (pm *PaymentManager) RecordTransaction(ctx context.Context, orderID, transactionID, transactionType string, amount float64, status string, payment PaymentDetails) error {
	cardLastFour := ""
	if len(payment.CardNumber) >= 4 {
		cardLastFour = payment.CardNumber[len(payment.CardNumber)-4:]
	}

	cardBrand := detectCardBrand(payment.CardNumber)

	_, err := pm.db.Postgres.ExecContext(ctx, `
		INSERT INTO payment_transactions (
			id, order_id, transaction_id, transaction_type, amount, 
			currency, status, payment_method, card_last_four, card_brand, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`,
		uuid.New().String(), orderID, transactionID, transactionType,
		amount, "USD", status, "credit_card", cardLastFour, cardBrand, time.Now(),
	)
	if err != nil {
		return fmt.Errorf("failed to record payment transaction: %v", err)
	}

	log.Printf("💳 Payment transaction %s recorded for order %s", transactionID, orderID)
	return nil
}

func detectCardBrand(cardNumber string) string {
	if len(cardNumber) == 0 {
		return "unknown"
	}
	switch {
	case strings.HasPrefix(cardNumber, "4"):
		return "visa"
	case strings.HasPrefix(cardNumber, "5"):
		return "mastercard"
	case strings.HasPrefix(cardNumber, "34") || strings.HasPrefix(cardNumber, "37"):
		return "amex"
	case strings.HasPrefix(cardNumber, "6"):
		return "discover"
	default:
		return "unknown"
	}
}

// ============================================================================
// Inventory Audit Log (PostgreSQL-backed)
// ============================================================================

type AuditLogger struct {
	db *DBConnections
}

func NewAuditLogger(db *DBConnections) *AuditLogger {
	return &AuditLogger{db: db}
}

// LogInventoryChange logs an inventory change
func (al *AuditLogger) LogInventoryChange(ctx context.Context, productID, size, changeType string, quantityChange int, orderID, sessionID, notes string) error {
	var orderIDPtr *string
	if orderID != "" {
		orderIDPtr = &orderID
	}

	_, err := al.db.Postgres.ExecContext(ctx, `
		INSERT INTO inventory_audit_log (
			id, product_id, size, change_type, quantity_change, 
			order_id, session_id, notes, created_at, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`,
		uuid.New().String(), productID, size, changeType, quantityChange,
		orderIDPtr, sessionID, notes, time.Now(), "cart-service",
	)
	if err != nil {
		return fmt.Errorf("failed to log inventory change: %v", err)
	}

	log.Printf("📋 Audit log: %s %d of product %s size %s", changeType, quantityChange, productID, size)
	return nil
}

// ============================================================================
// Rate Limiter (Redis-backed)
// ============================================================================

type RateLimiter struct {
	db *DBConnections
}

func NewRateLimiter(db *DBConnections) *RateLimiter {
	return &RateLimiter{db: db}
}

// CheckRateLimit checks if the request should be rate limited
func (rl *RateLimiter) CheckRateLimit(ctx context.Context, ip string) (bool, error) {
	key := rateLimitKey(ip)

	// Use Lua script for atomic increment with expiry
	script := redis.NewScript(`
		local current = redis.call('INCR', KEYS[1])
		if current == 1 then
			redis.call('EXPIRE', KEYS[1], ARGV[1])
		end
		return current
	`)

	count, err := script.Run(ctx, rl.db.Redis, []string{key}, int(rl.db.Config.RateLimitWindow.Seconds())).Int()
	if err != nil {
		return false, fmt.Errorf("failed to check rate limit: %v", err)
	}

	if count > rl.db.Config.RateLimitMax {
		log.Printf("⚠️ Rate limit exceeded for IP %s: %d requests", ip, count)
		return true, nil
	}

	return false, nil
}

// ============================================================================
// Payment Processing (Mock)
// ============================================================================

func ProcessPayment(payment PaymentDetails, amount float64) (string, error) {
	// Simulate payment processing delay
	time.Sleep(500 * time.Millisecond)

	// Mock validation
	if len(payment.CardNumber) < 13 || len(payment.CardNumber) > 19 {
		return "", fmt.Errorf("invalid card number")
	}

	if len(payment.CVV) < 3 || len(payment.CVV) > 4 {
		return "", fmt.Errorf("invalid CVV")
	}

	// Simulate declined cards (for testing)
	if payment.CardNumber == "4000000000000002" {
		return "", fmt.Errorf("card declined")
	}

	// Generate transaction ID
	transactionID := fmt.Sprintf("TXN-%s", uuid.New().String()[:8])

	log.Printf("💳 Payment processed successfully: $%.2f, Transaction: %s", amount, transactionID)
	return transactionID, nil
}

// ============================================================================
// HTTP Server
// ============================================================================

type Server struct {
	db               *DBConnections
	cartStore        *CartStore
	inventoryManager *InventoryManager
	flashSaleManager *FlashSaleManager
	orderManager     *OrderManager
	paymentManager   *PaymentManager
	auditLogger      *AuditLogger
	rateLimiter      *RateLimiter
	router           *mux.Router
}

func NewServer(db *DBConnections) *Server {
	s := &Server{
		db:               db,
		cartStore:        NewCartStore(db),
		inventoryManager: NewInventoryManager(db),
		flashSaleManager: NewFlashSaleManager(db),
		orderManager:     NewOrderManager(db),
		paymentManager:   NewPaymentManager(db),
		auditLogger:      NewAuditLogger(db),
		rateLimiter:      NewRateLimiter(db),
		router:           mux.NewRouter(),
	}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	// Health check
	s.router.HandleFunc("/health", s.handleHealth).Methods("GET")

	// Cart endpoints
	s.router.HandleFunc("/api/cart/{sessionId}", s.handleGetCart).Methods("GET")
	s.router.HandleFunc("/api/cart/{sessionId}", s.handleSaveCart).Methods("PUT")
	s.router.HandleFunc("/api/cart/{sessionId}/item", s.handleAddItem).Methods("POST")
	s.router.HandleFunc("/api/cart/{sessionId}/item/{itemId}/{size}", s.handleUpdateItem).Methods("PATCH")
	s.router.HandleFunc("/api/cart/{sessionId}/item/{itemId}/{size}", s.handleRemoveItem).Methods("DELETE")
	s.router.HandleFunc("/api/cart/{sessionId}", s.handleClearCart).Methods("DELETE")

	// Inventory endpoints
	s.router.HandleFunc("/api/inventory/{productId}/{size}", s.handleGetInventory).Methods("GET")

	// Flash sale endpoints
	s.router.HandleFunc("/api/flashsale/{productId}", s.handleGetFlashSale).Methods("GET")

	// Checkout endpoints
	s.router.HandleFunc("/api/checkout", s.handleCheckout).Methods("POST")
	s.router.HandleFunc("/api/order/{orderId}", s.handleGetOrder).Methods("GET")
}

// Response helpers
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// Get client IP from request
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header first (for load balancers)
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		ips := strings.Split(xff, ",")
		return strings.TrimSpace(ips[0])
	}
	// Fall back to RemoteAddr
	ip := r.RemoteAddr
	if colonIndex := strings.LastIndex(ip, ":"); colonIndex != -1 {
		ip = ip[:colonIndex]
	}
	return ip
}

// Health check handler
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Check Redis connection
	redisStatus := "healthy"
	if err := s.db.Redis.Ping(ctx).Err(); err != nil {
		redisStatus = "unhealthy: " + err.Error()
	}

	// Check PostgreSQL connection
	postgresStatus := "healthy"
	if err := s.db.Postgres.PingContext(ctx); err != nil {
		postgresStatus = "unhealthy: " + err.Error()
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"status":   "healthy",
		"service":  "cart-service",
		"time":     time.Now().Format(time.RFC3339),
		"redis":    redisStatus,
		"postgres": postgresStatus,
	})
}

// Get cart handler
func (s *Server) handleGetCart(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	cart, err := s.cartStore.GetCart(ctx, sessionID)
	if err != nil {
		log.Printf("❌ Error getting cart: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to get cart")
		return
	}

	if cart == nil {
		// Return empty cart if not found
		respondJSON(w, http.StatusOK, Cart{
			ID:        "",
			SessionID: sessionID,
			Items:     []CartItem{},
		})
		return
	}

	respondJSON(w, http.StatusOK, cart)
}

// Save cart handler (full replace)
func (s *Server) handleSaveCart(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	var items []CartItem
	if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	cart, err := s.cartStore.CreateOrUpdateCart(ctx, sessionID, items)
	if err != nil {
		log.Printf("❌ Error saving cart: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to save cart")
		return
	}

	respondJSON(w, http.StatusOK, cart)
}

// Add item handler
func (s *Server) handleAddItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	var item CartItem
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if item.Quantity <= 0 {
		item.Quantity = 1
	}

	cart, err := s.cartStore.AddItemToCart(ctx, sessionID, item)
	if err != nil {
		log.Printf("❌ Error adding item to cart: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to add item to cart")
		return
	}

	respondJSON(w, http.StatusOK, cart)
}

// Update item quantity handler
func (s *Server) handleUpdateItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]
	itemID := vars["itemId"]
	size := vars["size"]

	var body struct {
		Quantity int `json:"quantity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	cart, err := s.cartStore.UpdateItemQuantity(ctx, sessionID, itemID, size, body.Quantity)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, cart)
}

// Remove item handler
func (s *Server) handleRemoveItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]
	itemID := vars["itemId"]
	size := vars["size"]

	cart, err := s.cartStore.RemoveItemFromCart(ctx, sessionID, itemID, size)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, cart)
}

// Clear cart handler
func (s *Server) handleClearCart(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	if err := s.cartStore.ClearCart(ctx, sessionID); err != nil {
		log.Printf("❌ Error clearing cart: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to clear cart")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "cart cleared"})
}

// Get inventory handler
func (s *Server) handleGetInventory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	productID := vars["productId"]
	size := vars["size"]

	available, err := s.inventoryManager.GetInventory(ctx, productID, size)
	if err != nil {
		log.Printf("❌ Error getting inventory: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to get inventory")
		return
	}

	respondJSON(w, http.StatusOK, InventoryInfo{
		ProductID: productID,
		Size:      size,
		Available: available,
	})
}

// Get flash sale handler
func (s *Server) handleGetFlashSale(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	productID := vars["productId"]

	flashSale, err := s.flashSaleManager.GetFlashSale(ctx, productID)
	if err != nil {
		log.Printf("❌ Error getting flash sale: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to get flash sale")
		return
	}

	if flashSale == nil {
		respondError(w, http.StatusNotFound, "no flash sale for this product")
		return
	}

	respondJSON(w, http.StatusOK, flashSale)
}

// Checkout handler
func (s *Server) handleCheckout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Rate limiting check
	clientIP := getClientIP(r)
	limited, err := s.rateLimiter.CheckRateLimit(ctx, clientIP)
	if err != nil {
		log.Printf("❌ Error checking rate limit: %v", err)
	}
	if limited {
		respondError(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}

	var req CheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.SessionID == "" {
		respondError(w, http.StatusBadRequest, "sessionId is required")
		return
	}

	if req.Email == "" {
		respondError(w, http.StatusBadRequest, "email is required")
		return
	}

	// Validate payment details
	if req.Payment.CardNumber == "" || req.Payment.CardHolder == "" ||
		req.Payment.ExpiryMonth == "" || req.Payment.ExpiryYear == "" ||
		req.Payment.CVV == "" {
		respondError(w, http.StatusBadRequest, "incomplete payment details")
		return
	}

	// Get cart
	cart, err := s.cartStore.GetCart(ctx, req.SessionID)
	if err != nil {
		log.Printf("❌ Error getting cart for checkout: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to get cart")
		return
	}

	if cart == nil || len(cart.Items) == 0 {
		respondError(w, http.StatusBadRequest, "cart is empty or expired")
		return
	}

	// Reserve inventory for all items
	reservedItems := []CartItem{}
	for _, item := range cart.Items {
		err := s.inventoryManager.DecrementInventory(ctx, req.SessionID, item.ID, item.Size, item.Quantity)
		if err != nil {
			// Release all previously reserved items
			for _, reserved := range reservedItems {
				s.inventoryManager.ReleaseReservation(ctx, req.SessionID, reserved.ID, reserved.Size)
			}
			respondError(w, http.StatusConflict, fmt.Sprintf("insufficient inventory for %s size %s", item.Name, item.Size))
			return
		}
		reservedItems = append(reservedItems, item)
	}

	// Calculate total
	var subtotal float64
	for _, item := range cart.Items {
		subtotal += item.Price * float64(item.Quantity)
	}
	tax := subtotal * 0.08 // 8% tax
	total := subtotal + tax

	log.Printf("🛍️ Processing checkout for session %s: $%.2f", req.SessionID, total)

	// Process payment
	transactionID, err := ProcessPayment(req.Payment, total)
	if err != nil {
		// Release all reservations if payment fails
		for _, item := range cart.Items {
			s.inventoryManager.ReleaseReservation(ctx, req.SessionID, item.ID, item.Size)
		}
		respondError(w, http.StatusBadRequest, fmt.Sprintf("payment failed: %v", err))
		return
	}

	// Create order
	order := &Order{
		ID:            uuid.New().String(),
		SessionID:     req.SessionID,
		Items:         cart.Items,
		Subtotal:      subtotal,
		Tax:           tax,
		Total:         total,
		Status:        "confirmed",
		PaymentStatus: "paid",
		TransactionID: transactionID,
		Email:         req.Email,
		CreatedAt:     time.Now(),
	}

	// Save order to PostgreSQL
	if err := s.orderManager.CreateOrder(ctx, order, cart.Items); err != nil {
		log.Printf("❌ Error creating order: %v", err)
		// Note: Payment already processed, would need to refund in production
		respondError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	// Record payment transaction
	if err := s.paymentManager.RecordTransaction(ctx, order.ID, transactionID, "capture", total, "success", req.Payment); err != nil {
		log.Printf("⚠️ Failed to record payment transaction: %v", err)
		// Non-fatal error, continue
	}

	// Commit reservations and log inventory changes
	for _, item := range cart.Items {
		s.inventoryManager.CommitReservation(ctx, req.SessionID, item.ID, item.Size)
		s.auditLogger.LogInventoryChange(ctx, item.ID, item.Size, "sale", -item.Quantity, order.ID, req.SessionID, fmt.Sprintf("Order %s", order.OrderNumber))

		// Update flash sale sold count if applicable
		flashSale, _ := s.flashSaleManager.GetFlashSale(ctx, item.ID)
		if flashSale != nil && flashSale.IsActive {
			s.flashSaleManager.IncrementSoldCount(ctx, item.ID, item.Quantity)
		}
	}

	// Clear the cart
	if err := s.cartStore.ClearCart(ctx, req.SessionID); err != nil {
		log.Printf("⚠️ Failed to clear cart after checkout: %v", err)
		// Non-fatal error
	}

	log.Printf("✅ Order %s created for session %s", order.OrderNumber, req.SessionID)

	respondJSON(w, http.StatusOK, order)
}

// Get order handler
func (s *Server) handleGetOrder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	orderID := vars["orderId"]

	order, err := s.orderManager.GetOrder(ctx, orderID)
	if err != nil {
		log.Printf("❌ Error getting order: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to get order")
		return
	}

	if order == nil {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}

	respondJSON(w, http.StatusOK, order)
}

// ============================================================================
// Main
// ============================================================================

func main() {
	config := LoadConfig()

	// Connect to databases
	db, err := NewDBConnections(config)
	if err != nil {
		log.Fatalf("Failed to connect to databases: %v", err)
	}
	defer db.Close()

	server := NewServer(db)

	// Setup CORS
	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := corsHandler.Handler(server.router)

	log.Printf("🚀 Cart Service starting on port %s", config.Port)
	log.Printf("📦 Endpoints:")
	log.Printf("   GET    /health")
	log.Printf("   GET    /api/cart/{sessionId}")
	log.Printf("   PUT    /api/cart/{sessionId}")
	log.Printf("   POST   /api/cart/{sessionId}/item")
	log.Printf("   PATCH  /api/cart/{sessionId}/item/{itemId}/{size}")
	log.Printf("   DELETE /api/cart/{sessionId}/item/{itemId}/{size}")
	log.Printf("   DELETE /api/cart/{sessionId}")
	log.Printf("   GET    /api/inventory/{productId}/{size}")
	log.Printf("   GET    /api/flashsale/{productId}")
	log.Printf("   POST   /api/checkout")
	log.Printf("   GET    /api/order/{orderId}")

	if err := http.ListenAndServe(":"+config.Port, handler); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
