import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { CartItem, fetchProductById, getCurrentPrice } from '../data/products'

// Cart Service API URL - Using Vite environment variables
const CART_SERVICE_URL = import.meta.env.VITE_CART_SERVICE_URL || 'http://localhost:8080'

// Get or create session ID
const getSessionId = (): string => {
  let sessionId = localStorage.getItem('flashdrop-session-id')
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem('flashdrop-session-id', sessionId)
  }
  return sessionId
}

// Sync cart to service
const syncCartToService = async (items: CartItem[]): Promise<void> => {
  try {
    const sessionId = getSessionId()
    await fetch(`${CART_SERVICE_URL}/api/cart/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items)
    })
    console.log('✅ Cart synced to cart-service')
  } catch (error) {
    console.log('Cart service not available:', error)
  }
}

// Check if cart service is available
const checkServiceHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${CART_SERVICE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    })
    const isHealthy = response.ok
    console.log('🏥 Cart service health check:', isHealthy ? 'healthy' : 'unhealthy')
    return isHealthy
  } catch (error) {
    console.log('🏥 Cart service health check failed:', error)
    return false
  }
}

// Load cart from localStorage
const loadCartFromStorage = (): CartItem[] => {
  try {
    const savedCart = localStorage.getItem('flashdrop-cart')
    if (savedCart) {
      const parsed = JSON.parse(savedCart)
      console.log('📦 Loaded cart from localStorage:', parsed)
      return Array.isArray(parsed) ? parsed : []
    }
  } catch (error) {
    console.error('Error loading cart from localStorage:', error)
  }
  return []
}

const CartPage: React.FC = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false) // Add flag to prevent race conditions

  // Load cart function - can be called to refresh
  const loadCart = useCallback(() => {
    console.log('🔄 Loading cart...')
    const items = loadCartFromStorage()
    setCartItems(items)
    setIsLoading(false)
    return items
  }, [])

  // Initial load and event listeners
  useEffect(() => {
    // Load cart immediately
    const items = loadCart()

    // Check service availability
    checkServiceHealth().then(available => {
      setServiceAvailable(available)
      if (available && items.length > 0) {
        syncCartToService(items)
      }
    })

    // Listen for cart updates from other tabs/windows only
    const handleStorageUpdate = () => {
      console.log('🔔 Storage update event received from another tab')
      if (!isUpdating) {
        loadCart()
      }
    }

    // Listen for storage events (from other tabs) but NOT cartUpdated events
    window.addEventListener('storage', handleStorageUpdate)

    return () => {
      window.removeEventListener('storage', handleStorageUpdate)
    }
  }, [loadCart]) // Remove isUpdating dependency

  // Update prices based on current flash sale status
  useEffect(() => {
    const updatePrices = async () => {
      if (cartItems.length === 0) return

      const updatedItems = await Promise.all(
        cartItems.map(async (cartItem) => {
          try {
            const currentProduct = await fetchProductById(cartItem.id)
            if (currentProduct) {
              const currentPrice = getCurrentPrice(currentProduct)
              if (currentPrice !== cartItem.price) {
                console.log(`💰 Price updated for ${cartItem.name}: $${cartItem.price} → $${currentPrice}`)
                return { ...cartItem, price: currentPrice }
              }
            }
            return cartItem
          } catch (error) {
            console.error('Error updating price for item:', cartItem.id, error)
            return cartItem
          }
        })
      )

      const pricesChanged = updatedItems.some((item, index) => 
        item.price !== cartItems[index]?.price
      )

      if (pricesChanged) {
        setCartItems(updatedItems)
      }
    }

    if (cartItems.length > 0) {
      updatePrices()
      const interval = setInterval(updatePrices, 30000)
      return () => clearInterval(interval)
    }
  }, [cartItems.length])

  // Save cart to localStorage whenever cartItems changes (but not on initial load)
  useEffect(() => {
    if (!isLoading && cartItems.length >= 0) {
      localStorage.setItem('flashdrop-cart', JSON.stringify(cartItems))
      console.log('💾 Saved cart to localStorage:', cartItems.length, 'items')
      
      // Sync with cart service
      if (serviceAvailable && cartItems.length > 0) {
        syncCartToService(cartItems)
      }
    }
  }, [cartItems, isLoading, serviceAvailable])

  // Remove item from cart
  const removeItem = async (id: string, size: string) => {
    console.log('🗑️ Removing item:', id, size)
    console.log('📦 Current cart items:', cartItems)
    
    setIsUpdating(true) // Prevent race condition
    
    const newItems = cartItems.filter(item => !(item.id === id && item.size === size))
    console.log('📦 New cart items after filter:', newItems)
    console.log('📦 Items removed?', cartItems.length !== newItems.length)
    setCartItems(newItems)
    
    // Trigger header update
    window.dispatchEvent(new Event('cartUpdated'))
    
    // Reset updating flag after a short delay
    setTimeout(() => setIsUpdating(false), 100)
    
    // Also remove from service (optional, don't block UI)
    // Disabled for local development to avoid 404 errors
    // if (serviceAvailable) {
    //   fetch(`${CART_SERVICE_URL}/api/cart/${getSessionId()}/item/${id}/${size}`, {
    //     method: 'DELETE'
    //   }).then(() => {
    //     console.log('✅ Item removed from cart service')
    //   }).catch((err) => {
    //     console.log('ℹ️ Cart service sync failed (UI still works):', err.message)
    //   })
    // }
  }

  // Update quantity
  const updateQuantity = async (id: string, size: string, newQuantity: number) => {
    console.log('🔢 Updating quantity:', id, size, 'to', newQuantity)
    
    setIsUpdating(true) // Prevent race condition
    
    if (newQuantity <= 0) {
      removeItem(id, size)
      return
    }
    
    const newItems = cartItems.map(item =>
      item.id === id && item.size === size
        ? { ...item, quantity: newQuantity }
        : item
    )
    console.log('📦 New cart items after quantity update:', newItems)
    setCartItems(newItems)
    
    // Trigger header update
    window.dispatchEvent(new Event('cartUpdated'))
    
    // Reset updating flag after a short delay
    setTimeout(() => setIsUpdating(false), 100)
    
    // Also update in service (optional, don't block UI)
    if (serviceAvailable) {
      fetch(`${CART_SERVICE_URL}/api/cart/${getSessionId()}/item/${id}/${size}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQuantity })
      }).then(() => {
        console.log('✅ Quantity updated in cart service')
      }).catch((err) => {
        console.log('ℹ️ Cart service sync failed (UI still works):', err.message)
      })
    }
  }

  const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '1.2rem', color: '#666' }}>Loading cart...</p>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>
        Shopping Cart ({cartItems.length} items)
      </h1>
      
      {/* Service status indicator */}
      {serviceAvailable !== null && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          borderRadius: '20px',
          fontSize: '0.85rem',
          marginBottom: '1rem',
          background: serviceAvailable ? '#d4edda' : '#fff3cd',
          color: serviceAvailable ? '#155724' : '#856404'
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: serviceAvailable ? '#28a745' : '#ffc107'
          }} />
          {serviceAvailable ? 'Connected to Cart Service' : 'Local Mode (Service Offline)'}
        </div>
      )}
      
      {cartItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.2rem', color: '#666', marginBottom: '2rem' }}>
            Your cart is empty
          </p>
          <Link to="/">
            <button className="btn btn-primary">
              Continue Shopping
            </button>
          </Link>
        </div>
      ) : (
        <div>
          {/* Price update notification */}
          <div style={{ 
            background: '#fff3cd', 
            border: '1px solid #ffeaa7',
            borderRadius: '6px',
            padding: '0.75rem',
            marginBottom: '1rem',
            fontSize: '0.9rem',
            color: '#856404'
          }}>
            💡 <strong>Dynamic Pricing:</strong> Cart prices update automatically when flash sales start or end
          </div>

          <div style={{ marginBottom: '2rem' }}>
            {cartItems.map(item => (
              <div 
                key={`${item.id}-${item.size}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem',
                  background: 'white',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <img 
                  src={item.image} 
                  alt={item.name}
                  style={{ 
                    width: '80px', 
                    height: '60px', 
                    objectFit: 'cover', 
                    borderRadius: '4px',
                    border: '1px solid #eee'
                  }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.src = 'https://via.placeholder.com/80x60?text=Product'
                  }}
                />
                
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {item.name}
                  </h3>
                  <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Size: {item.size}
                  </p>
                  
                  {/* Quantity controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      onClick={() => updateQuantity(item.id, item.size, item.quantity - 1)}
                      style={{
                        width: '30px',
                        height: '30px',
                        border: '1px solid #ccc',
                        background: 'white',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      -
                    </button>
                    <span style={{ 
                      minWidth: '40px', 
                      textAlign: 'center',
                      fontWeight: '600'
                    }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.size, item.quantity + 1)}
                      style={{
                        width: '30px',
                        height: '30px',
                        border: '1px solid #ccc',
                        background: 'white',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                    ${(item.price * item.quantity).toFixed(2)}
                  </p>
                  <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                    ${item.price} each
                  </p>
                  <button 
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: '#ff6b6b', 
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      textDecoration: 'underline'
                    }}
                    onClick={() => removeItem(item.id, item.size)}
                  >
                    🗑️ Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <div style={{ 
            background: 'white', 
            padding: '2rem', 
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              <div>
                <p style={{ fontSize: '1rem', color: '#666' }}>
                  Subtotal ({cartItems.reduce((sum, item) => sum + item.quantity, 0)} items)
                </p>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#000' }}>
                  ${total.toFixed(2)}
                </h2>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link to="/" style={{ flex: 1 }}>
                <button className="btn btn-secondary" style={{ width: '100%' }}>
                  Continue Shopping
                </button>
              </Link>
              <Link to="/checkout" style={{ flex: 1 }}>
                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%' }}
                >
                  Proceed to Checkout
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CartPage
