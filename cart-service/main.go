package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

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

// Cart represents a user's shopping cart
type Cart struct {
	ID        string     `json:"id"`
	SessionID string     `json:"sessionId"`
	Items     []CartItem `json:"items"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
	ExpiresAt time.Time  `json:"expiresAt"`
}

// PaymentDetails represents credit card information (mock)
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

// Order represents a completed order
type Order struct {
	ID              string     `json:"id"`
	SessionID       string     `json:"sessionId"`
	Items           []CartItem `json:"items"`
	Total           float64    `json:"total"`
	Status          string     `json:"status"`
	PaymentStatus   string     `json:"paymentStatus"`
	TransactionID   string     `json:"transactionId"`
	Email           string     `json:"email"`
	CreatedAt       time.Time  `json:"createdAt"`
	ShippingAddress string     `json:"shippingAddress,omitempty"`
}

// ============================================================================
// Cart Store with Concurrency Control
// ============================================================================

// CartStore manages carts with proper locking
type CartStore struct {
	carts      map[string]*Cart
	orders     map[string]*Order
	cartLocks  map[string]*sync.RWMutex
	orderLocks map[string]*sync.RWMutex
	globalLock sync.RWMutex
}

// NewCartStore creates a new cart store
func NewCartStore() *CartStore {
	store := &CartStore{
		carts:      make(map[string]*Cart),
		orders:     make(map[string]*Order),
		cartLocks:  make(map[string]*sync.RWMutex),
		orderLocks: make(map[string]*sync.RWMutex),
	}

	// Start cleanup goroutine for expired carts
	go store.cleanupExpiredCarts()

	return store
}

// getCartLock returns the lock for a specific cart, creating one if needed
func (s *CartStore) getCartLock(sessionID string) *sync.RWMutex {
	s.globalLock.Lock()
	defer s.globalLock.Unlock()

	if lock, exists := s.cartLocks[sessionID]; exists {
		return lock
	}

	lock := &sync.RWMutex{}
	s.cartLocks[sessionID] = lock
	return lock
}

// GetCart retrieves a cart by session ID
func (s *CartStore) GetCart(sessionID string) (*Cart, bool) {
	lock := s.getCartLock(sessionID)
	lock.RLock()
	defer lock.RUnlock()

	cart, exists := s.carts[sessionID]
	if !exists {
		return nil, false
	}

	// Check if cart has expired
	if time.Now().After(cart.ExpiresAt) {
		return nil, false
	}

	return cart, true
}

// CreateOrUpdateCart creates or updates a cart
func (s *CartStore) CreateOrUpdateCart(sessionID string, items []CartItem) *Cart {
	lock := s.getCartLock(sessionID)
	lock.Lock()
	defer lock.Unlock()

	now := time.Now()
	expiresAt := now.Add(30 * time.Minute) // Cart expires in 30 minutes

	if cart, exists := s.carts[sessionID]; exists {
		cart.Items = items
		cart.UpdatedAt = now
		cart.ExpiresAt = expiresAt
		log.Printf("📝 Updated cart for session %s with %d items", sessionID, len(items))
		return cart
	}

	cart := &Cart{
		ID:        uuid.New().String(),
		SessionID: sessionID,
		Items:     items,
		CreatedAt: now,
		UpdatedAt: now,
		ExpiresAt: expiresAt,
	}

	s.carts[sessionID] = cart
	log.Printf("🆕 Created cart for session %s with %d items", sessionID, len(items))
	return cart
}

// AddItemToCart adds an item to the cart with locking
func (s *CartStore) AddItemToCart(sessionID string, item CartItem) *Cart {
	lock := s.getCartLock(sessionID)
	lock.Lock()
	defer lock.Unlock()

	now := time.Now()
	expiresAt := now.Add(30 * time.Minute)

	cart, exists := s.carts[sessionID]
	if !exists {
		cart = &Cart{
			ID:        uuid.New().String(),
			SessionID: sessionID,
			Items:     []CartItem{},
			CreatedAt: now,
			UpdatedAt: now,
			ExpiresAt: expiresAt,
		}
		s.carts[sessionID] = cart
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

	return cart
}

// UpdateItemQuantity updates the quantity of an item
func (s *CartStore) UpdateItemQuantity(sessionID, itemID, size string, quantity int) (*Cart, error) {
	lock := s.getCartLock(sessionID)
	lock.Lock()
	defer lock.Unlock()

	cart, exists := s.carts[sessionID]
	if !exists {
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
	cart.ExpiresAt = time.Now().Add(30 * time.Minute)

	return cart, nil
}

// RemoveItemFromCart removes an item from the cart
func (s *CartStore) RemoveItemFromCart(sessionID, itemID, size string) (*Cart, error) {
	return s.UpdateItemQuantity(sessionID, itemID, size, 0)
}

// ClearCart clears all items from a cart
func (s *CartStore) ClearCart(sessionID string) {
	lock := s.getCartLock(sessionID)
	lock.Lock()
	defer lock.Unlock()

	delete(s.carts, sessionID)
	log.Printf("🧹 Cleared cart for session %s", sessionID)
}

// cleanupExpiredCarts periodically removes expired carts
func (s *CartStore) cleanupExpiredCarts() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		s.globalLock.Lock()
		now := time.Now()
		expiredCount := 0

		for sessionID, cart := range s.carts {
			if now.After(cart.ExpiresAt) {
				delete(s.carts, sessionID)
				delete(s.cartLocks, sessionID)
				expiredCount++
			}
		}

		if expiredCount > 0 {
			log.Printf("🧹 Cleaned up %d expired carts", expiredCount)
		}
		s.globalLock.Unlock()
	}
}

// ============================================================================
// Checkout & Payment Processing (Mock)
// ============================================================================

// ProcessPayment simulates payment processing
func ProcessPayment(payment PaymentDetails, amount float64) (string, error) {
	// Simulate payment processing delay
	time.Sleep(1500 * time.Millisecond)

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

// Checkout processes the checkout with proper locking
func (s *CartStore) Checkout(sessionID string, payment PaymentDetails, email string) (*Order, error) {
	lock := s.getCartLock(sessionID)
	lock.Lock()
	defer lock.Unlock()

	cart, exists := s.carts[sessionID]
	if !exists {
		return nil, fmt.Errorf("cart not found or expired")
	}

	if len(cart.Items) == 0 {
		return nil, fmt.Errorf("cart is empty")
	}

	// Calculate total
	var total float64
	for _, item := range cart.Items {
		total += item.Price * float64(item.Quantity)
	}

	log.Printf("🛍️ Processing checkout for session %s: $%.2f", sessionID, total)

	// Process payment
	transactionID, err := ProcessPayment(payment, total)
	if err != nil {
		return nil, fmt.Errorf("payment failed: %v", err)
	}

	// Create order
	order := &Order{
		ID:            uuid.New().String(),
		SessionID:     sessionID,
		Items:         cart.Items,
		Total:         total,
		Status:        "completed",
		PaymentStatus: "paid",
		TransactionID: transactionID,
		Email:         email,
		CreatedAt:     time.Now(),
	}

	// Store order
	s.globalLock.Lock()
	s.orders[order.ID] = order
	s.globalLock.Unlock()

	// Clear the cart after successful checkout
	delete(s.carts, sessionID)

	log.Printf("✅ Order created: %s for session %s", order.ID, sessionID)

	return order, nil
}

// GetOrder retrieves an order by ID
func (s *CartStore) GetOrder(orderID string) (*Order, bool) {
	s.globalLock.RLock()
	defer s.globalLock.RUnlock()

	order, exists := s.orders[orderID]
	return order, exists
}

// ============================================================================
// HTTP Handlers
// ============================================================================

type Server struct {
	store  *CartStore
	router *mux.Router
}

func NewServer() *Server {
	s := &Server{
		store:  NewCartStore(),
		router: mux.NewRouter(),
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

// Health check handler
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "healthy",
		"service": "cart-service",
		"time":    time.Now().Format(time.RFC3339),
	})
}

// Get cart handler
func (s *Server) handleGetCart(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	cart, exists := s.store.GetCart(sessionID)
	if !exists {
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
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	var items []CartItem
	if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	cart := s.store.CreateOrUpdateCart(sessionID, items)
	respondJSON(w, http.StatusOK, cart)
}

// Add item handler
func (s *Server) handleAddItem(w http.ResponseWriter, r *http.Request) {
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

	cart := s.store.AddItemToCart(sessionID, item)
	respondJSON(w, http.StatusOK, cart)
}

// Update item quantity handler
func (s *Server) handleUpdateItem(w http.ResponseWriter, r *http.Request) {
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

	cart, err := s.store.UpdateItemQuantity(sessionID, itemID, size, body.Quantity)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, cart)
}

// Remove item handler
func (s *Server) handleRemoveItem(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]
	itemID := vars["itemId"]
	size := vars["size"]

	cart, err := s.store.RemoveItemFromCart(sessionID, itemID, size)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, cart)
}

// Clear cart handler
func (s *Server) handleClearCart(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	s.store.ClearCart(sessionID)
	respondJSON(w, http.StatusOK, map[string]string{"message": "cart cleared"})
}

// Checkout handler
func (s *Server) handleCheckout(w http.ResponseWriter, r *http.Request) {
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

	order, err := s.store.Checkout(req.SessionID, req.Payment, req.Email)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, order)
}

// Get order handler
func (s *Server) handleGetOrder(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	orderID := vars["orderId"]

	order, exists := s.store.GetOrder(orderID)
	if !exists {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}

	respondJSON(w, http.StatusOK, order)
}

// ============================================================================
// Main
// ============================================================================

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := NewServer()

	// Setup CORS
	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := corsHandler.Handler(server.router)

	log.Printf("🚀 Cart Service starting on port %s", port)
	log.Printf("📦 Endpoints:")
	log.Printf("   GET    /health")
	log.Printf("   GET    /api/cart/{sessionId}")
	log.Printf("   PUT    /api/cart/{sessionId}")
	log.Printf("   POST   /api/cart/{sessionId}/item")
	log.Printf("   PATCH  /api/cart/{sessionId}/item/{itemId}/{size}")
	log.Printf("   DELETE /api/cart/{sessionId}/item/{itemId}/{size}")
	log.Printf("   DELETE /api/cart/{sessionId}")
	log.Printf("   POST   /api/checkout")
	log.Printf("   GET    /api/order/{orderId}")

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
