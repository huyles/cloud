import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CartItem, fetchProductById, getCurrentPrice } from '../data/products'

const CartPage: React.FC = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([])

  // Load cart from localStorage
  useEffect(() => {
    const savedCart = localStorage.getItem('flashdrop-cart')
    if (savedCart) {
      try {
        const items = JSON.parse(savedCart)
        setCartItems(items)
      } catch (error) {
        console.error('Error loading cart:', error)
        setCartItems([])
      }
    }
  }, [])

  // Update prices based on current flash sale status
  useEffect(() => {
    const updatePrices = async () => {
      if (cartItems.length === 0) return

      const updatedItems = await Promise.all(
        cartItems.map(async (cartItem) => {
          try {
            // Fetch current product data to get latest flash sale info
            const currentProduct = await fetchProductById(cartItem.id)
            if (currentProduct) {
              const currentPrice = getCurrentPrice(currentProduct)
              
              // Update cart item price if it has changed
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

      // Update cart if any prices changed
      const pricesChanged = updatedItems.some((item, index) => 
        item.price !== cartItems[index].price
      )

      if (pricesChanged) {
        setCartItems(updatedItems)
      }
    }

    // Update prices immediately
    updatePrices()

    // Update prices every 30 seconds to catch flash sale changes
    const interval = setInterval(updatePrices, 30000)
    
    return () => clearInterval(interval)
  }, [cartItems.length]) // Only depend on cart length to avoid infinite loops

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('flashdrop-cart', JSON.stringify(cartItems))
    // Trigger cart count update in header
    window.dispatchEvent(new Event('cartUpdated'))
  }, [cartItems])

  // Remove item from cart
  const removeItem = (id: string, size: string) => {
    setCartItems(prevItems => 
      prevItems.filter(item => !(item.id === id && item.size === size))
    )
  }

  // Update quantity
  const updateQuantity = (id: string, size: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItem(id, size)
      return
    }
    
    setCartItems(prevItems =>
      prevItems.map(item =>
        item.id === id && item.size === size
          ? { ...item, quantity: newQuantity }
          : item
      )
    )
  }

  const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>
        Shopping Cart ({cartItems.length} items)
      </h1>
      
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
                    // Fallback to a default image if the original fails
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
              <button 
                className="btn btn-primary" 
                style={{ flex: 1 }}
                onClick={() => alert('🚀 Checkout functionality - would integrate with payment processor')}
              >
                Proceed to Checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CartPage
